import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

const IVA = 1.19
const TZ = 'America/Santiago'
const DEFAULT_RECIPIENTS = ['eduardolarsen101@gmail.com']

const ymd = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: TZ })

function isoWeek(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00Z')
  const target = new Date(d.valueOf())
  const dayNr = (d.getUTCDay() + 6) % 7
  target.setUTCDate(target.getUTCDate() - dayNr + 3)
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4))
  const week =
    1 +
    Math.round(
      ((target.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7,
    )
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

function lastWeekRange(): { start: string; end: string } {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: TZ }))
  const dow = (now.getDay() + 6) % 7 // 0 = monday
  const lastMonday = new Date(now)
  lastMonday.setDate(now.getDate() - dow - 7)
  const lastSunday = new Date(lastMonday)
  lastSunday.setDate(lastMonday.getDate() + 6)
  return { start: ymd(lastMonday), end: ymd(lastSunday) }
}

function shiftRange(start: string, end: string) {
  const s = new Date(start + 'T12:00:00Z')
  const e = new Date(end + 'T12:00:00Z')
  const days = Math.max(1, Math.round((e.getTime() - s.getTime()) / 86400000) + 1)
  const prevEnd = new Date(s)
  prevEnd.setUTCDate(prevEnd.getUTCDate() - 1)
  const prevStart = new Date(prevEnd)
  prevStart.setUTCDate(prevStart.getUTCDate() - (days - 1))
  return { start: prevStart.toISOString().slice(0, 10), end: prevEnd.toISOString().slice(0, 10) }
}

async function purchaseData(sb: any, venueId: string, start: string, end: string) {
  const { data: imports } = await sb
    .from('purchase_imports')
    .select('id, document_date, supplier_name, document_number, net_subtotal, vat_amount, total_amount')
    .eq('venue_id', venueId)
    .eq('status', 'CONFIRMED')
    .gte('document_date', start)
    .lte('document_date', end)

  const list = imports ?? []
  const ids = list.map((i: any) => i.id)
  let lines: any[] = []
  if (ids.length > 0) {
    const { data } = await sb
      .from('purchase_import_lines')
      .select('product_id, units_real, cost_unit_net, line_total_net, raw_text, purchase_import_id')
      .in('purchase_import_id', ids)
      .eq('classification', 'inventory')
    lines = data ?? []
  }
  const meta = new Map(list.map((i: any) => [i.id, i]))
  const enriched = lines.map((l: any) => ({
    product_id: l.product_id as string | null,
    units_real: Number(l.units_real) || 0,
    cost_unit_net: Number(l.cost_unit_net) || 0,
    amount: l.line_total_net != null ? Number(l.line_total_net) : (Number(l.units_real) || 0) * (Number(l.cost_unit_net) || 0),
    raw_text: l.raw_text,
    document_date: (meta.get(l.purchase_import_id) as any)?.document_date ?? '',
  }))
  return { invoices: list, lines: enriched }
}

async function salesNet(sb: any, venueId: string, start: string, end: string) {
  const startISO = new Date(start + 'T00:00:00-04:00').toISOString()
  const endISO = new Date(end + 'T23:59:59-04:00').toISOString()
  const { data } = await sb
    .from('sales')
    .select('id, created_at, total_amount')
    .eq('venue_id', venueId)
    .eq('is_cancelled', false)
    .gte('created_at', startISO)
    .lte('created_at', endISO)
  return data ?? []
}

async function consumptionCost(sb: any, saleIds: string[]) {
  if (saleIds.length === 0) return { cost: 0, byProduct: new Map<string, number>() }
  const items: any[] = []
  for (let i = 0; i < saleIds.length; i += 300) {
    const { data } = await sb.from('sale_items').select('cocktail_id, quantity').in('sale_id', saleIds.slice(i, i + 300))
    items.push(...(data ?? []))
  }
  const cocktailQty = new Map<string, number>()
  for (const it of items) {
    if (!it.cocktail_id) continue
    cocktailQty.set(it.cocktail_id, (cocktailQty.get(it.cocktail_id) || 0) + (Number(it.quantity) || 0))
  }
  const cocktailIds = [...cocktailQty.keys()]
  const byProduct = new Map<string, number>()
  for (let i = 0; i < cocktailIds.length; i += 300) {
    const { data } = await sb
      .from('cocktail_ingredients')
      .select('cocktail_id, product_id, quantity')
      .in('cocktail_id', cocktailIds.slice(i, i + 300))
    for (const ing of data ?? []) {
      if (!ing.product_id) continue
      const qty = (cocktailQty.get(ing.cocktail_id) || 0) * (Number(ing.quantity) || 0)
      byProduct.set(ing.product_id, (byProduct.get(ing.product_id) || 0) + qty)
    }
  }
  const pids = [...byProduct.keys()]
  let cost = 0
  for (let i = 0; i < pids.length; i += 300) {
    const { data } = await sb.from('products').select('id, cost_per_unit').in('id', pids.slice(i, i + 300))
    for (const p of data ?? []) {
      cost += (byProduct.get(p.id) || 0) * (Number(p.cost_per_unit) || 0)
    }
  }
  return { cost, byProduct }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const url = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const sb = createClient(url, serviceKey)

  try {
    const token = (req.headers.get('Authorization') || '').replace('Bearer ', '')
    const isService = token === serviceKey
    if (!isService) {
      const { data: userData } = await sb.auth.getUser(token)
      const uid = userData?.user?.id
      if (!uid) {
        return new Response(JSON.stringify({ error: 'No autorizado' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const { data: roles } = await sb.from('user_roles').select('role').eq('user_id', uid)
      const allowed = (roles ?? []).some((r: any) => ['admin', 'gerencia', 'developer'].includes(r.role))
      if (!allowed) {
        return new Response(JSON.stringify({ error: 'Permiso insuficiente' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {}
    let venueId: string | undefined = body.venue_id
    if (!venueId) {
      const { data: v } = await sb.from('venues').select('id').limit(1).maybeSingle()
      venueId = v?.id
    }
    if (!venueId) throw new Error('No se encontró venue')

    const auto = lastWeekRange()
    const start: string = body.start || auto.start
    const end: string = body.end || auto.end
    const recipients: string[] =
      Array.isArray(body.recipients) && body.recipients.length > 0 ? body.recipients : DEFAULT_RECIPIENTS

    const { data: venueRow } = await sb.from('venues').select('name').eq('id', venueId).maybeSingle()

    const curr = await purchaseData(sb, venueId, start, end)
    const prevRange = shiftRange(start, end)
    const prev = await purchaseData(sb, venueId, prevRange.start, prevRange.end)

    const sales = await salesNet(sb, venueId, start, end)
    const prevSales = await salesNet(sb, venueId, prevRange.start, prevRange.end)
    const salesNetTotal = sales.reduce((s: number, x: any) => s + (Number(x.total_amount) || 0) / IVA, 0)
    const prevSalesNetTotal = prevSales.reduce((s: number, x: any) => s + (Number(x.total_amount) || 0) / IVA, 0)

    const { cost: consCost } = await consumptionCost(sb, sales.map((s: any) => s.id))

    const purchaseNet = curr.lines.reduce((s, l) => s + l.amount, 0)
    const prevPurchaseNet = prev.lines.reduce((s, l) => s + l.amount, 0)
    const purchaseTotal = curr.invoices.reduce((s: number, i: any) => s + (Number(i.total_amount) || 0), 0)

    // Weekly comparison
    const weekMap = new Map<string, { week: string; comprado: number; vendido: number }>()
    for (const l of curr.lines) {
      if (!l.document_date) continue
      const w = isoWeek(l.document_date)
      const e = weekMap.get(w) || { week: w, comprado: 0, vendido: 0 }
      e.comprado += l.amount
      weekMap.set(w, e)
    }
    for (const s of sales) {
      const day = new Date(s.created_at).toLocaleDateString('en-CA', { timeZone: TZ })
      const w = isoWeek(day)
      const e = weekMap.get(w) || { week: w, comprado: 0, vendido: 0 }
      e.vendido += (Number(s.total_amount) || 0) / IVA
      weekMap.set(w, e)
    }
    const weekly = [...weekMap.values()]
      .sort((a, b) => a.week.localeCompare(b.week))
      .map((w) => ({ week: w.week, comprado: Math.round(w.comprado), vendido: Math.round(w.vendido) }))

    // Product names
    const pids = [...new Set(curr.lines.map((l) => l.product_id).filter(Boolean))] as string[]
    const names = new Map<string, string>()
    for (let i = 0; i < pids.length; i += 300) {
      const { data } = await sb.from('products').select('id, name').in('id', pids.slice(i, i + 300))
      for (const p of data ?? []) names.set(p.id, p.name)
    }

    const agg = new Map<string, { name: string; units: number; amount: number; costs: { d: string; c: number }[] }>()
    for (const l of curr.lines) {
      const key = l.product_id || `raw:${(l.raw_text || '?').slice(0, 50)}`
      const name = l.product_id ? names.get(l.product_id) || 'Sin nombre' : (l.raw_text || 'Sin identificar').slice(0, 50)
      const e = agg.get(key) || { name, units: 0, amount: 0, costs: [] }
      e.units += l.units_real
      e.amount += l.amount
      if (l.cost_unit_net > 0 && l.document_date) e.costs.push({ d: l.document_date, c: l.cost_unit_net })
      agg.set(key, e)
    }
    const top = [...agg.values()]
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10)
      .map((r) => ({ name: r.name, units: Math.round(r.units * 100) / 100, amount: Math.round(r.amount) }))

    const priceChanges = [...agg.values()]
      .map((r) => {
        if (r.costs.length < 2) return null
        const sorted = [...r.costs].sort((a, b) => a.d.localeCompare(b.d))
        const first = sorted[0].c
        const last = sorted[sorted.length - 1].c
        if (first <= 0) return null
        return { name: r.name, first: Math.round(first), last: Math.round(last), pct: ((last - first) / first) * 100 }
      })
      .filter(Boolean)
      .sort((a: any, b: any) => Math.abs(b.pct) - Math.abs(a.pct))
      .slice(0, 8) as any[]

    const templateData = {
      venueName: venueRow?.name || 'STOCKIA',
      start,
      end,
      kpis: {
        invoices: curr.invoices.length,
        purchase_net: Math.round(purchaseNet),
        purchase_total: Math.round(purchaseTotal),
        sales_net: Math.round(salesNetTotal),
        consumption_cost: Math.round(consCost),
        ratio: salesNetTotal > 0 ? (purchaseNet / salesNetTotal) * 100 : 0,
        prev_purchase_net: Math.round(prevPurchaseNet),
        prev_sales_net: Math.round(prevSalesNetTotal),
      },
      weekly,
      top,
      priceChanges,
      invoices: curr.invoices
        .sort((a: any, b: any) => (b.document_date || '').localeCompare(a.document_date || ''))
        .slice(0, 25)
        .map((i: any) => ({
          document_date: i.document_date,
          supplier_name: i.supplier_name,
          document_number: i.document_number,
          net_subtotal: Math.round(Number(i.net_subtotal) || 0),
          total_amount: Math.round(Number(i.total_amount) || 0),
        })),
    }

    let sent = 0
    for (const recipient of recipients) {
      const { error } = await sb.functions.invoke('send-transactional-email', {
        body: {
          templateName: 'compras-summary',
          recipientEmail: recipient,
          idempotencyKey: `compras-${venueId}-${start}-${end}-${recipient}`,
          templateData,
        },
      })
      if (error) console.error('send error', recipient, error)
      else sent++
    }

    return new Response(JSON.stringify({ ok: true, sent, start, end }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    console.error(e)
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
