import { createClient } from 'npm:@supabase/supabase-js@2'
import { sendTemplateEmail } from '../_shared/transactional-email-templates/send-email.ts'

const TEMPLATE_NAME = 'jornada-closed-summary'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

function json(data: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function parseJwtClaims(token: string): Record<string, unknown> | null {
  const parts = token.split('.')
  if (parts.length < 2) return null
  try {
    const payload = parts[1]
      .replaceAll('-', '+')
      .replaceAll('_', '/')
      .padEnd(Math.ceil(parts[1].length / 4) * 4, '=')
    return JSON.parse(atob(payload)) as Record<string, unknown>
  } catch {
    return null
  }
}

// deno-lint-ignore no-explicit-any
async function enrichTemplateData(supabase: any, jornadaId: string, data: Record<string, unknown>) {
  const out: Record<string, unknown> = { ...data }
  const openedAt = (data.opened_at as string) || null
  const closedAt = (data.closed_at as string) || new Date().toISOString()

  const [ccRes, tsRes] = await Promise.all([
    supabase.from('coatcheck_tickets')
      .select('ticket_number, garment_count, amount, payment_method, item_type, status')
      .eq('jornada_id', jornadaId).neq('status', 'cancelled'),
    supabase.from('ticket_sales').select('id').eq('jornada_id', jornadaId).eq('payment_status', 'paid'),
  ])
  const cc = (ccRes.data || []) as Array<{ ticket_number: number; garment_count: number; amount: number; payment_method: string; item_type: string | null }>
  const kind = (t: { item_type: string | null }) => (t.item_type === 'backpack' ? 'backpack' : 'garment')
  const part = (k: string) => {
    const rows = cc.filter((t) => kind(t) === k)
    const nums = rows.map((r) => r.ticket_number)
    return {
      qty: rows.reduce((s, r) => s + (r.garment_count || 0), 0),
      amount: rows.reduce((s, r) => s + Number(r.amount || 0), 0),
      first: nums.length ? Math.min(...nums) : null,
      last: nums.length ? Math.max(...nums) : null,
    }
  }
  const b = part('backpack'), g = part('garment')
  const ccTotal = cc.reduce((s, r) => s + Number(r.amount || 0), 0)
  const ccCash = cc.filter((r) => r.payment_method === 'cash').reduce((s, r) => s + Number(r.amount || 0), 0)
  out.coatcheck = {
    total: ccTotal, cash: ccCash, card: ccTotal - ccCash, tickets: cc.length,
    garments: b.qty + g.qty,
    backpack_qty: b.qty, backpack_amount: b.amount, backpack_first: b.first, backpack_last: b.last,
    garment_qty: g.qty, garment_amount: g.amount, garment_first: g.first, garment_last: g.last,
  }

  // Sumar guardarropía al total y a métodos de pago (el cálculo base no la incluye)
  const alreadyIncluded = Number((data.coatcheck as { total?: number } | undefined)?.total || 0) > 0 &&
    Boolean((data as { coatcheck_in_totals?: boolean }).coatcheck_in_totals)
  if (!alreadyIncluded && ccTotal > 0) {
    out.total_gross = Number(data.total_gross || 0) + ccTotal
    const ps = { ...((data.payment_summary as Record<string, number>) || {}) }
    ps.cash = (ps.cash || 0) + ccCash
    ps.cash_count = (ps.cash_count || 0) + cc.filter((r) => r.payment_method === 'cash').length
    ps.card = (ps.card || 0) + (ccTotal - ccCash)
    ps.card_count = (ps.card_count || 0) + cc.filter((r) => r.payment_method !== 'cash').length
    ps.total = (ps.total || 0) + ccTotal
    ps.tx = (ps.tx || 0) + cc.length
    out.payment_summary = ps
  }

  // Entradas por tipo + covers por opción
  const saleIds = ((tsRes.data || []) as Array<{ id: string }>).map((r) => r.id)
  if (saleIds.length) {
    const [itemsRes, tokRes] = await Promise.all([
      supabase.from('ticket_sale_items').select('quantity, line_total, ticket_types(name)').in('ticket_sale_id', saleIds),
      supabase.from('pickup_tokens').select('status, cocktails:cover_cocktail_id(name)').in('ticket_sale_id', saleIds),
    ])
    const tmap = new Map<string, { name: string; quantity: number; total: number }>()
    for (const it of (itemsRes.data || []) as Array<{ quantity: number; line_total: number; ticket_types: { name: string } | null }>) {
      const n = it.ticket_types?.name || 'Entrada'
      const cur = tmap.get(n) || { name: n, quantity: 0, total: 0 }
      cur.quantity += it.quantity || 0
      cur.total += Number(it.line_total || 0)
      tmap.set(n, cur)
    }
    out.ticket_detail = [...tmap.values()].sort((a, b) => b.quantity - a.quantity)
    const cmap = new Map<string, number>()
    for (const t of (tokRes.data || []) as Array<{ status: string; cocktails: { name: string } | null }>) {
      if (t.status === 'cancelled') continue
      const n = t.cocktails?.name || 'Cover'
      cmap.set(n, (cmap.get(n) || 0) + 1)
    }
    out.cover_detail = [...cmap.entries()].map(([name, quantity]) => ({ name, quantity })).sort((a, b) => b.quantity - a.quantity)
  }

  // Cortesías por producto
  if (openedAt) {
    const { data: cq } = await supabase.from('courtesy_qr')
      .select('product_name, qty, max_uses, used_count')
      .gte('created_at', openedAt).lte('created_at', closedAt)
    const pmap = new Map<string, { product_name: string; issued: number; redeemed: number }>()
    for (const r of (cq || []) as Array<{ product_name: string | null; qty: number | null; max_uses: number | null; used_count: number | null }>) {
      const n = r.product_name || 'Cortesía'
      const q = r.qty || 1
      const cur = pmap.get(n) || { product_name: n, issued: 0, redeemed: 0 }
      cur.issued += (r.max_uses || 1) * q
      cur.redeemed += (r.used_count || 0) * q
      pmap.set(n, cur)
    }
    out.courtesy_products = [...pmap.values()].sort((a, b) => b.issued - a.issued)
  }
  return out
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) {
    console.error('Missing required environment variables')
    return json({ error: 'Server configuration error' }, 500)
  }

  // Only the database dispatcher (service_role) may trigger this send.
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ error: 'Unauthorized' }, 401)
  }
  const claims = parseJwtClaims(authHeader.slice('Bearer '.length).trim())
  if (claims?.role !== 'service_role') {
    return json({ error: 'Forbidden' }, 403)
  }

  let recipientEmail: string
  let idempotencyKey: string | undefined
  let templateData: Record<string, unknown> = {}
  try {
    const body = await req.json()
    recipientEmail = body.recipientEmail || body.recipient_email
    idempotencyKey = body.idempotencyKey || body.idempotency_key
    if (body.templateData && typeof body.templateData === 'object') {
      templateData = body.templateData
    }
  } catch {
    return json({ error: 'Invalid JSON in request body' }, 400)
  }

  if (!recipientEmail || typeof recipientEmail !== 'string') {
    return json({ error: 'recipientEmail is required' }, 400)
  }

  const supabase = createClient(supabaseUrl, serviceKey)

  const logSend = async (
    status: 'sent' | 'suppressed' | 'failed',
    errorMessage?: string
  ) => {
    const { error } = await supabase.from('email_send_log').insert({
      message_id: null,
      template_name: TEMPLATE_NAME,
      recipient_email: recipientEmail,
      status,
      error_message: errorMessage ?? null,
    })
    if (error) {
      console.error('Failed to write email_send_log', { status, error })
    }
  }

  // Enriquecer con guardarropía, cortesías por producto, entradas y covers
  try {
    const m = /jornada-([0-9a-f-]{36})/i.exec(idempotencyKey || '')
    if (m) templateData = await enrichTemplateData(supabase, m[1], templateData)
  } catch (e) {
    console.error('enrich failed', e)
  }

  try {
    const result = await sendTemplateEmail(TEMPLATE_NAME, recipientEmail, {
      templateData,
      idempotencyKey,
    })

    if (!result.sent) {
      await logSend('suppressed', 'Recipient suppressed')
      return json({ success: false, reason: result.reason })
    }

    await logSend('sent')
    return json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('Jornada summary email failed', { message })
    await logSend('failed', message.slice(0, 1000))
    return json({ error: 'Failed to send email' }, 500)
  }
})
