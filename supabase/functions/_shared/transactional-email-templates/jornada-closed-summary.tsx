import * as React from 'npm:react@18.3.1'
import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Preview,
  Row,
  Column,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const LOGO_URL = 'https://app.stockiachile.com/stockia-logo-full-white.png'

// =============================================================================
// STOCKIA · Cierre de Jornada — Carbon Pro dark theme
// =============================================================================

const SITE_NAME = 'STOCKIA'
const BRAND_GREEN = '#00E676'
const BG = '#0B0B0D'
const SURFACE = '#15161A'
const SURFACE_2 = '#1C1D22'
const BORDER = '#26272D'
const TEXT = '#F4F4F5'
const TEXT_MUTED = '#9CA3AF'
const TEXT_DIM = '#6B7280'
const RED = '#FF5252'
const AMBER = '#FFB74D'

interface POSChannel {
  cash?: number
  cash_count?: number
  card?: number
  card_count?: number
  other?: number
  other_count?: number
  total?: number
  tx?: number
}

interface POSBreakdown {
  pos_name: string
  alcohol?: POSChannel
  tickets?: POSChannel | null
  total?: number
  tx?: number
}

interface CourtesyIssuer {
  issuer_name: string
  qr_count: number
  total_uses: number
  redeemed_count: number
}

interface PaymentSummary {
  cash?: number
  cash_count?: number
  card?: number
  card_count?: number
  transfer?: number
  transfer_count?: number
  other?: number
  other_count?: number
  total?: number
  tx?: number
}

interface TopProduct {
  name: string
  kind: 'Carta' | 'Ticket' | string
  quantity: number
  total: number
}

interface WasteItem {
  product_name: string
  quantity: number
  unit_type: string
  estimated_cost: number
}

interface WasteSummary {
  count?: number
  total_cost?: number
  items?: WasteItem[]
}

interface IngredientUse {
  product_name: string
  quantity: number
  unit: string
}

interface JornadaClosedProps {
  recipient_name?: string
  venue_name?: string
  jornada_label?: string
  opened_at?: string
  closed_at?: string
  closed_by?: string
  forced_close?: boolean
  forced_reason?: string | null
  observacion_cierre?: string | null
  total_gross?: number
  pos_breakdown?: POSBreakdown[]
  courtesies_issued?: CourtesyIssuer[]
  payment_summary?: PaymentSummary
  top_products?: TopProduct[]
  ingredient_usage?: IngredientUse[]
  waste_summary?: WasteSummary
}

const fmtCLP = (n?: number) => '$' + Math.round(n ?? 0).toLocaleString('es-CL')

const fmtDate = (s?: string) => {
  if (!s) return '—'
  try {
    return new Date(s).toLocaleString('es-CL', {
      timeZone: 'America/Santiago',
      dateStyle: 'short',
      timeStyle: 'short',
    })
  } catch {
    return s
  }
}

const fmtQty = (n?: number, unit?: string) => {
  const v = Number(n ?? 0)
  const txt = Number.isInteger(v) ? v.toString() : v.toFixed(1)
  return unit ? `${txt} ${unit}` : txt
}

// ---------- Reusable bits ----------

const KpiTile: React.FC<{
  label: string
  value: string
  accent?: boolean
  danger?: boolean
}> = ({ label, value, accent, danger }) => (
  <Column style={kpiCol}>
    <Text style={kpiLabel}>{label}</Text>
    <Text
      style={{
        ...kpiValue,
        color: danger ? RED : accent ? BRAND_GREEN : TEXT,
      }}
    >
      {value}
    </Text>
  </Column>
)

const PaymentRow: React.FC<{
  label: string
  amount?: number
  count?: number
  total?: number
}> = ({ label, amount = 0, count = 0, total = 0 }) => {
  if (amount <= 0 && count <= 0) return null
  const pct = total > 0 ? Math.round((amount / total) * 100) : 0
  return (
    <Row style={paymentRow}>
      <Column style={{ width: '38%' }}>
        <Text style={paymentLabel}>{label}</Text>
      </Column>
      <Column style={{ width: '14%' }}>
        <Text style={paymentMeta}>{count} tx</Text>
      </Column>
      <Column style={{ width: '18%' }}>
        <Text style={paymentMeta}>{pct}%</Text>
      </Column>
      <Column>
        <Text style={paymentAmount}>{fmtCLP(amount)}</Text>
      </Column>
    </Row>
  )
}

const renderChannel = (label: string, ch?: POSChannel | null) => {
  if (!ch) return null
  const cash = ch.cash ?? 0
  const card = ch.card ?? 0
  const other = ch.other ?? 0
  if (cash + card + other <= 0) return null
  return (
    <Section style={channelBlock}>
      <Text style={channelTitle}>{label}</Text>
      <Row>
        <Column style={labelCol}>
          <Text style={label2}>Efectivo ({ch.cash_count ?? 0})</Text>
        </Column>
        <Column>
          <Text style={valueRight}>{fmtCLP(cash)}</Text>
        </Column>
      </Row>
      <Row>
        <Column style={labelCol}>
          <Text style={label2}>Tarjeta ({ch.card_count ?? 0})</Text>
        </Column>
        <Column>
          <Text style={valueRight}>{fmtCLP(card)}</Text>
        </Column>
      </Row>
      {other > 0 && (
        <Row>
          <Column style={labelCol}>
            <Text style={label2}>Otro ({ch.other_count ?? 0})</Text>
          </Column>
          <Column>
            <Text style={valueRight}>{fmtCLP(other)}</Text>
          </Column>
        </Row>
      )}
    </Section>
  )
}

// ---------- Template ----------

const JornadaClosedSummaryEmail = (props: JornadaClosedProps) => {
  const {
    venue_name = 'Local',
    jornada_label = 'Jornada',
    opened_at,
    closed_at,
    closed_by = 'Sistema',
    forced_close = false,
    forced_reason,
    total_gross = 0,
    pos_breakdown = [],
    courtesies_issued = [],
    payment_summary = {},
    top_products = [],
    ingredient_usage = [],
    waste_summary = {},
    observacion_cierre = null,
  } = props

  const wasteCount = waste_summary?.count ?? 0
  const wasteCost = waste_summary?.total_cost ?? 0
  const wasteItems = waste_summary?.items ?? []
  const paymentTotal = payment_summary?.total ?? total_gross
  const totalTx = payment_summary?.tx ?? 0
  const avgTicket = totalTx > 0 ? Math.round(total_gross / totalTx) : 0

  return (
    <Html lang="es" dir="ltr">
      <Head />
      <Preview>
        Cierre de jornada · {venue_name} · {fmtCLP(total_gross)} · {totalTx} tx
      </Preview>
      <Body style={main}>
        <Container style={container}>
          {/* HEADER */}
          <Section style={header}>
            <Img
              src={LOGO_URL}
              alt="STOCKIA"
              height="32"
              style={{ margin: '0 auto 12px', display: 'block' }}
            />
            <Heading style={h1}>Cierre de Jornada</Heading>
            <Text style={subtitle}>
              {venue_name} · {jornada_label}
            </Text>
          </Section>

          {forced_close && (
            <Section style={alertBox}>
              <Text style={alertText}>
                <strong style={{ color: AMBER }}>⚠ Cierre forzado</strong>
                {forced_reason ? ` — ${forced_reason}` : ''}
              </Text>
            </Section>
          )}

          {observacion_cierre && observacion_cierre.trim().length > 0 && (
            <Section style={observationCard}>
              <Text style={observationLabel}>Observación del cierre</Text>
              <Text style={observationText}>{observacion_cierre}</Text>
            </Section>
          )}

          {/* KPIs HERO */}
          <Section style={heroCard}>
            <Row>
              <KpiTile label="Ventas brutas" value={fmtCLP(total_gross)} accent />
              <KpiTile label="Transacciones" value={totalTx.toString()} />
              <KpiTile label="Ticket promedio" value={fmtCLP(avgTicket)} />
            </Row>
            <Hr style={hrDark} />
            <Row>
              <Column>
                <Text style={metaLine}>
                  {fmtDate(opened_at)} → {fmtDate(closed_at)}
                </Text>
                <Text style={metaLineDim}>Cerrado por {closed_by}</Text>
              </Column>
            </Row>
          </Section>

          {/* PAYMENT SUMMARY */}
          <Section style={card}>
            <Heading as="h2" style={h2}>
              Métodos de pago
            </Heading>
            {paymentTotal <= 0 ? (
              <Text style={muted}>Sin ventas registradas.</Text>
            ) : (
              <>
                <PaymentRow
                  label="💵 Efectivo"
                  amount={payment_summary.cash}
                  count={payment_summary.cash_count}
                  total={paymentTotal}
                />
                <PaymentRow
                  label="💳 Tarjeta"
                  amount={payment_summary.card}
                  count={payment_summary.card_count}
                  total={paymentTotal}
                />
                <PaymentRow
                  label="🔁 Transferencia"
                  amount={payment_summary.transfer}
                  count={payment_summary.transfer_count}
                  total={paymentTotal}
                />
                <PaymentRow
                  label="• Otro"
                  amount={payment_summary.other}
                  count={payment_summary.other_count}
                  total={paymentTotal}
                />
                <Hr style={hrDark} />
                <Row>
                  <Column style={labelCol}>
                    <Text style={posTotalLabel}>Total recaudado</Text>
                  </Column>
                  <Column>
                    <Text style={posTotalValue}>{fmtCLP(paymentTotal)}</Text>
                  </Column>
                </Row>
              </>
            )}
          </Section>

          {/* TOP PRODUCTS */}
          <Section style={card}>
            <Heading as="h2" style={h2}>
              Top productos vendidos
            </Heading>
            {top_products.length === 0 ? (
              <Text style={muted}>Sin productos vendidos en esta jornada.</Text>
            ) : (
              top_products.map((p, i) => (
                <Section key={i} style={topRow}>
                  <Row>
                    <Column style={{ width: '32px' }}>
                      <Text style={topRank}>{i + 1}</Text>
                    </Column>
                    <Column>
                      <Text style={topName}>{p.name}</Text>
                      <Text style={topKind}>{p.kind}</Text>
                    </Column>
                    <Column style={{ width: '90px', textAlign: 'right' as const }}>
                      <Text style={topQty}>×{p.quantity}</Text>
                    </Column>
                    <Column style={{ width: '110px', textAlign: 'right' as const }}>
                      <Text style={topTotal}>{fmtCLP(p.total)}</Text>
                    </Column>
                  </Row>
                </Section>
              ))
            )}
          </Section>

          {/* INGREDIENT USAGE — consumo teórico basado en ventas × receta */}
          <Section style={card}>
            <Heading as="h2" style={h2}>
              Consumo teórico de insumos
            </Heading>
            <Text style={muted}>
              Calculado a partir de ventas × receta de cada producto de carta.
            </Text>
            {ingredient_usage.length === 0 ? (
              <Text style={muted}>Sin consumo registrado.</Text>
            ) : (
              ingredient_usage.map((ing, i) => (
                <Row key={i} style={ingredientRow}>
                  <Column>
                    <Text style={ingredientName}>{ing.product_name}</Text>
                  </Column>
                  <Column style={{ width: '120px', textAlign: 'right' as const }}>
                    <Text style={ingredientQty}>
                      {ing.quantity} {ing.unit}
                    </Text>
                  </Column>
                </Row>
              ))
            )}
          </Section>


          {/* POS BREAKDOWN */}
          <Section style={card}>
            <Heading as="h2" style={h2}>
              Desglose por POS
            </Heading>
            {pos_breakdown.length === 0 ? (
              <Text style={muted}>Sin ventas por POS.</Text>
            ) : (
              pos_breakdown.map((pos, idx) => {
                const hasTickets =
                  !!pos.tickets &&
                  (pos.tickets.cash ?? 0) +
                    (pos.tickets.card ?? 0) +
                    (pos.tickets.other ?? 0) >
                    0
                return (
                  <Section key={idx} style={posBlock}>
                    <Text style={posName}>{pos.pos_name}</Text>
                    {renderChannel(
                      hasTickets ? 'ALCOHOL / CARTA' : 'Ventas',
                      pos.alcohol,
                    )}
                    {hasTickets && renderChannel('TICKETS', pos.tickets!)}
                    <Hr style={hrLight} />
                    <Row>
                      <Column style={labelCol}>
                        <Text style={posTotalLabel}>
                          Total POS ({pos.tx ?? 0} tx)
                        </Text>
                      </Column>
                      <Column>
                        <Text style={posTotalValue}>{fmtCLP(pos.total)}</Text>
                      </Column>
                    </Row>
                  </Section>
                )
              })
            )}
          </Section>

          {/* COURTESIES */}
          <Section style={card}>
            <Heading as="h2" style={h2}>
              QR de cortesía emitidos
            </Heading>
            {courtesies_issued.length === 0 ? (
              <Text style={muted}>
                No se emitieron cortesías en esta jornada.
              </Text>
            ) : (
              courtesies_issued.map((c, i) => (
                <Section key={i} style={courtesyRow}>
                  <Row>
                    <Column>
                      <Text style={courtesyName}>{c.issuer_name}</Text>
                      <Text style={courtesyMeta}>
                        {c.qr_count} código{c.qr_count === 1 ? '' : 's'} ·{' '}
                        {c.total_uses} uso{c.total_uses === 1 ? '' : 's'}
                      </Text>
                    </Column>
                    <Column style={{ width: '130px', textAlign: 'right' as const }}>
                      <Text style={courtesyRedeemed}>
                        {c.redeemed_count} canjeado
                        {c.redeemed_count === 1 ? '' : 's'}
                      </Text>
                    </Column>
                  </Row>
                </Section>
              ))
            )}
          </Section>

          {/* WASTE */}
          <Section style={card}>
            <Heading as="h2" style={h2}>
              Mermas aprobadas
            </Heading>
            {wasteCount === 0 ? (
              <Text style={muted}>Sin mermas aprobadas en esta jornada.</Text>
            ) : (
              <>
                <Row style={{ marginBottom: '8px' }}>
                  <KpiTile
                    label="Registros"
                    value={wasteCount.toString()}
                  />
                  <KpiTile
                    label="Costo total"
                    value={fmtCLP(wasteCost)}
                    danger
                  />
                </Row>
                <Hr style={hrDark} />
                {wasteItems.map((w, i) => (
                  <Row key={i} style={wasteItemRow}>
                    <Column>
                      <Text style={wasteName}>{w.product_name}</Text>
                      <Text style={wasteMeta}>
                        {fmtQty(w.quantity, w.unit_type)}
                      </Text>
                    </Column>
                    <Column
                      style={{ width: '110px', textAlign: 'right' as const }}
                    >
                      <Text style={wasteCostText}>
                        −{fmtCLP(w.estimated_cost)}
                      </Text>
                    </Column>
                  </Row>
                ))}
              </>
            )}
          </Section>

          <Hr style={hrDark} />
          <Text style={footer}>
            Reporte generado automáticamente por {SITE_NAME} al cierre de la
            jornada. Hora servidor: America/Santiago.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: JornadaClosedSummaryEmail,
  subject: (data: Record<string, any>) =>
    `Cierre de jornada · ${data?.venue_name ?? 'Local'} · ${
      data?.jornada_label ?? ''
    }`.trim(),
  displayName: 'Cierre de jornada — Resumen gerencial',
  previewData: {
    venue_name: 'Berlín Valdivia',
    jornada_label: 'Jornada N°12 · 2026-05-10',
    opened_at: '2026-05-10T22:00:00Z',
    closed_at: '2026-05-11T06:30:00Z',
    closed_by: 'Eduardo Larsen',
    forced_close: false,
    observacion_cierre:
      'Caja Principal cuadró exacto. Pista con sobrante de $5.000 sin justificar.',
    total_gross: 1250000,
    stockia_commission: 12500,
    total_net: 1237500,
    payment_summary: {
      cash: 420000,
      cash_count: 65,
      card: 730000,
      card_count: 130,
      transfer: 50000,
      transfer_count: 4,
      other: 50000,
      other_count: 2,
      total: 1250000,
      tx: 201,
    },
    top_products: [
      { name: 'Piscola', kind: 'Carta', quantity: 64, total: 320000 },
      { name: 'Entrada General', kind: 'Ticket', quantity: 80, total: 400000 },
      { name: 'Heineken 330ml', kind: 'Carta', quantity: 42, total: 168000 },
      { name: 'Mojito', kind: 'Carta', quantity: 30, total: 210000 },
      { name: 'Jägerbomb', kind: 'Carta', quantity: 22, total: 154000 },
    ],
    pos_breakdown: [
      {
        pos_name: 'Bar Principal',
        alcohol: {
          cash: 320000,
          cash_count: 45,
          card: 530000,
          card_count: 80,
          other: 0,
          other_count: 0,
          total: 850000,
          tx: 125,
        },
        tickets: null,
        total: 850000,
        tx: 125,
      },
      {
        pos_name: 'Caja Entrada',
        alcohol: {
          cash: 0,
          cash_count: 0,
          card: 0,
          card_count: 0,
          other: 0,
          other_count: 0,
          total: 0,
          tx: 0,
        },
        tickets: {
          cash: 100000,
          cash_count: 20,
          card: 300000,
          card_count: 60,
          other: 0,
          other_count: 0,
          total: 400000,
          tx: 80,
        },
        total: 400000,
        tx: 80,
      },
    ],
    courtesies_issued: [
      { issuer_name: 'Admin Demo', qr_count: 4, total_uses: 8, redeemed_count: 5 },
      { issuer_name: 'Gerencia Demo', qr_count: 2, total_uses: 2, redeemed_count: 1 },
    ],
    waste_summary: {
      count: 3,
      total_cost: 24500,
      items: [
        { product_name: 'Absolut 750ml', quantity: 250, unit_type: 'ml', estimated_cost: 18000 },
        { product_name: 'Heineken 330ml', quantity: 2, unit_type: 'unit', estimated_cost: 4500 },
        { product_name: 'Hielo bolsa', quantity: 1, unit_type: 'unit', estimated_cost: 2000 },
      ],
    },
  },
} satisfies TemplateEntry

// =============================================================================
// Styles — Carbon Pro dark
// =============================================================================

const main = {
  backgroundColor: BG,
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Inter, Arial, sans-serif",
  margin: 0,
  padding: 0,
  color: TEXT,
}
const container = {
  maxWidth: '640px',
  margin: '0 auto',
  padding: '32px 16px 48px',
}
const header = {
  textAlign: 'center' as const,
  marginBottom: '20px',
  padding: '8px 0',
}
const brandMark = {
  fontSize: '11px',
  letterSpacing: '3px',
  color: BRAND_GREEN,
  fontWeight: 'bold' as const,
  margin: '0 0 8px',
  textTransform: 'uppercase' as const,
}
const h1 = {
  fontSize: '26px',
  fontWeight: 'bold' as const,
  color: TEXT,
  margin: '0 0 6px',
  letterSpacing: '-0.5px',
}
const subtitle = { fontSize: '13px', color: TEXT_MUTED, margin: 0 }
const h2 = {
  fontSize: '13px',
  fontWeight: 'bold' as const,
  color: TEXT,
  margin: '0 0 14px',
  textTransform: 'uppercase' as const,
  letterSpacing: '1px',
  borderLeft: `3px solid ${BRAND_GREEN}`,
  paddingLeft: '10px',
}

const card = {
  backgroundColor: SURFACE,
  border: `1px solid ${BORDER}`,
  borderRadius: '10px',
  padding: '20px',
  margin: '14px 0',
}
const heroCard = {
  backgroundColor: SURFACE,
  border: `1px solid ${BORDER}`,
  borderRadius: '10px',
  padding: '22px 18px',
  margin: '14px 0',
  borderTop: `2px solid ${BRAND_GREEN}`,
}

const labelCol = { width: '55%' }
const label2 = { fontSize: '13px', color: TEXT_MUTED, margin: '4px 0' }
const valueRight = {
  fontSize: '13px',
  color: TEXT,
  margin: '4px 0',
  textAlign: 'right' as const,
}
const muted = {
  fontSize: '13px',
  color: TEXT_DIM,
  margin: '8px 0',
  fontStyle: 'italic' as const,
}

const kpiCol = { padding: '4px 8px', verticalAlign: 'top' as const }
const kpiLabel = {
  fontSize: '10px',
  color: TEXT_MUTED,
  textTransform: 'uppercase' as const,
  letterSpacing: '1px',
  margin: '0 0 4px',
}
const kpiValue = {
  fontSize: '22px',
  fontWeight: 'bold' as const,
  color: TEXT,
  margin: 0,
  letterSpacing: '-0.5px',
}
const metaLine = { fontSize: '12px', color: TEXT_MUTED, margin: '6px 0 2px' }
const metaLineDim = { fontSize: '12px', color: TEXT_DIM, margin: 0 }

const hrDark = { borderColor: BORDER, margin: '14px 0' }
const hrLight = { borderColor: BORDER, margin: '8px 0', opacity: 0.6 }

// Payments
const paymentRow = {
  padding: '6px 0',
  borderBottom: `1px solid ${BORDER}`,
}
const paymentLabel = { fontSize: '13px', color: TEXT, margin: '4px 0' }
const paymentMeta = { fontSize: '12px', color: TEXT_MUTED, margin: '4px 0' }
const paymentAmount = {
  fontSize: '14px',
  color: TEXT,
  fontWeight: 'bold' as const,
  margin: '4px 0',
  textAlign: 'right' as const,
}

// Top products
const topRow = {
  padding: '10px 0',
  borderBottom: `1px solid ${BORDER}`,
}
const topRank = {
  fontSize: '14px',
  fontWeight: 'bold' as const,
  color: BRAND_GREEN,
  margin: 0,
}
const topName = {
  fontSize: '14px',
  fontWeight: 'bold' as const,
  color: TEXT,
  margin: '0 0 2px',
}
const topKind = { fontSize: '11px', color: TEXT_MUTED, margin: 0 }
const topQty = {
  fontSize: '13px',
  color: TEXT_MUTED,
  margin: '4px 0',
}
const topTotal = {
  fontSize: '14px',
  color: TEXT,
  fontWeight: 'bold' as const,
  margin: '4px 0',
}

// POS blocks
const posBlock = {
  backgroundColor: SURFACE_2,
  border: `1px solid ${BORDER}`,
  borderRadius: '8px',
  padding: '14px',
  margin: '10px 0',
}
const posName = {
  fontSize: '14px',
  fontWeight: 'bold' as const,
  color: TEXT,
  margin: '0 0 10px',
  borderBottom: `1px solid ${BORDER}`,
  paddingBottom: '6px',
}
const channelBlock = { margin: '8px 0' }
const channelTitle = {
  fontSize: '10px',
  color: BRAND_GREEN,
  fontWeight: 'bold' as const,
  textTransform: 'uppercase' as const,
  letterSpacing: '1px',
  margin: '6px 0 4px',
}
const posTotalLabel = {
  fontSize: '13px',
  color: TEXT,
  fontWeight: 'bold' as const,
  margin: '4px 0',
}
const posTotalValue = {
  fontSize: '15px',
  color: BRAND_GREEN,
  fontWeight: 'bold' as const,
  margin: '4px 0',
  textAlign: 'right' as const,
}

// Courtesy
const courtesyRow = {
  backgroundColor: SURFACE_2,
  border: `1px solid ${BORDER}`,
  borderRadius: '8px',
  padding: '10px 12px',
  margin: '8px 0',
}
const courtesyName = {
  fontSize: '13px',
  color: TEXT,
  fontWeight: 'bold' as const,
  margin: '2px 0',
}
const courtesyMeta = { fontSize: '12px', color: TEXT_MUTED, margin: '2px 0' }
const courtesyRedeemed = {
  fontSize: '12px',
  color: BRAND_GREEN,
  margin: '4px 0',
  textAlign: 'right' as const,
  fontWeight: 'bold' as const,
}

// Waste
const wasteItemRow = {
  padding: '8px 0',
  borderBottom: `1px solid ${BORDER}`,
}
const wasteName = {
  fontSize: '13px',
  color: TEXT,
  fontWeight: 'bold' as const,
  margin: '2px 0',
}
const wasteMeta = { fontSize: '12px', color: TEXT_MUTED, margin: '2px 0' }
const wasteCostText = {
  fontSize: '13px',
  color: RED,
  fontWeight: 'bold' as const,
  margin: '4px 0',
}

// Alerts / observations
const alertBox = {
  backgroundColor: '#1F1A0A',
  border: `1px solid ${AMBER}`,
  borderLeft: `4px solid ${AMBER}`,
  borderRadius: '8px',
  padding: '12px 14px',
  margin: '14px 0',
}
const alertText = { fontSize: '13px', color: TEXT, margin: 0 }
const observationCard = {
  backgroundColor: '#0E1F15',
  border: `1px solid ${BRAND_GREEN}`,
  borderLeft: `4px solid ${BRAND_GREEN}`,
  borderRadius: '8px',
  padding: '12px 14px',
  margin: '14px 0',
}
const observationLabel = {
  fontSize: '10px',
  color: BRAND_GREEN,
  textTransform: 'uppercase' as const,
  fontWeight: 'bold' as const,
  letterSpacing: '1px',
  margin: '0 0 6px',
}
const observationText = {
  fontSize: '14px',
  color: TEXT,
  margin: 0,
  whiteSpace: 'pre-wrap' as const,
  lineHeight: '1.5',
}

const footer = {
  fontSize: '11px',
  color: TEXT_DIM,
  textAlign: 'center' as const,
  margin: '24px 0 0',
}
