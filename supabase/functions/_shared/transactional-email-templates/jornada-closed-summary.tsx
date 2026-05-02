import * as React from 'npm:react@18.3.1'
import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Row,
  Column,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'STOCKIA'
const BRAND_GREEN = '#00E676'

interface POSBreakdown {
  pos_name: string
  total: number
  cash: number
  card: number
  tickets?: number
  transactions: number
}

interface TopProduct {
  name: string
  quantity: number
  revenue: number
}

interface JornadaClosedProps {
  venue_name?: string
  jornada_label?: string
  opened_at?: string
  closed_at?: string
  closed_by?: string
  forced_close?: boolean
  forced_reason?: string | null
  total_gross?: number
  stockia_commission?: number
  total_net?: number
  cogs?: number
  gross_margin?: number
  pos_breakdown?: POSBreakdown[]
  top_products?: TopProduct[]
  qr_redeemed?: number
  qr_pending?: number
  courtesies_count?: number
  courtesies_cost?: number
  waste_cost?: number
  stock_alerts?: string[]
  observacion_cierre?: string | null
}

const fmtCLP = (n?: number) =>
  '$' + Math.round(n ?? 0).toLocaleString('es-CL')

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

const JornadaClosedSummaryEmail = (props: JornadaClosedProps) => {
  const {
    venue_name = 'Local',
    jornada_label = 'Jornada',
    opened_at,
    closed_at,
    closed_by = '—',
    forced_close = false,
    forced_reason,
    total_gross = 0,
    stockia_commission = 0,
    total_net = 0,
    cogs = 0,
    gross_margin = 0,
    pos_breakdown = [],
    top_products = [],
    qr_redeemed = 0,
    qr_pending = 0,
    courtesies_count = 0,
    courtesies_cost = 0,
    waste_cost = 0,
    stock_alerts = [],
    observacion_cierre = null,
  } = props

  return (
    <Html lang="es" dir="ltr">
      <Head />
      <Preview>
        Cierre de jornada · {venue_name} · {fmtCLP(total_gross)}
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Heading style={h1}>Cierre de Jornada</Heading>
            <Text style={subtitle}>
              {SITE_NAME} · {venue_name}
            </Text>
          </Section>

          {forced_close && (
            <Section style={alertBox}>
              <Text style={alertText}>
                ⚠️ <strong>Cierre forzado</strong>
                {forced_reason ? ` — ${forced_reason}` : ''}
              </Text>
            </Section>
          )}

          {observacion_cierre && observacion_cierre.trim().length > 0 && (
            <Section style={observationCard}>
              <Text style={observationLabel}>Observación del cuadre</Text>
              <Text style={observationText}>{observacion_cierre}</Text>
            </Section>
          )}

          <Section style={card}>
            <Heading as="h2" style={h2}>Información de la jornada</Heading>
            <Row>
              <Column style={labelCol}><Text style={label}>Jornada</Text></Column>
              <Column><Text style={value}>{jornada_label}</Text></Column>
            </Row>
            <Row>
              <Column style={labelCol}><Text style={label}>Apertura</Text></Column>
              <Column><Text style={value}>{fmtDate(opened_at)}</Text></Column>
            </Row>
            <Row>
              <Column style={labelCol}><Text style={label}>Cierre</Text></Column>
              <Column><Text style={value}>{fmtDate(closed_at)}</Text></Column>
            </Row>
            <Row>
              <Column style={labelCol}><Text style={label}>Cerrado por</Text></Column>
              <Column><Text style={value}>{closed_by}</Text></Column>
            </Row>
          </Section>

          <Section style={card}>
            <Heading as="h2" style={h2}>Resumen financiero</Heading>
            <Row style={kpiRow}>
              <Column style={kpiCol}>
                <Text style={kpiLabel}>Ventas brutas</Text>
                <Text style={kpiValue}>{fmtCLP(total_gross)}</Text>
              </Column>
              <Column style={kpiCol}>
                <Text style={kpiLabel}>Comisión STOCKIA (1%)</Text>
                <Text style={kpiValueAccent}>{fmtCLP(stockia_commission)}</Text>
              </Column>
            </Row>
            <Hr style={hr} />
            <Row>
              <Column style={labelCol}><Text style={label}>Ventas netas</Text></Column>
              <Column><Text style={valueRight}>{fmtCLP(total_net)}</Text></Column>
            </Row>
            <Row>
              <Column style={labelCol}><Text style={label}>COGS</Text></Column>
              <Column><Text style={valueRight}>{fmtCLP(cogs)}</Text></Column>
            </Row>
            <Row>
              <Column style={labelCol}><Text style={label}>Margen bruto</Text></Column>
              <Column><Text style={valueRightBold}>{fmtCLP(gross_margin)}</Text></Column>
            </Row>
            {courtesies_count > 0 && (
              <Row>
                <Column style={labelCol}>
                  <Text style={label}>Cortesías ({courtesies_count})</Text>
                </Column>
                <Column>
                  <Text style={valueRight}>{fmtCLP(courtesies_cost)} costo</Text>
                </Column>
              </Row>
            )}
            {waste_cost > 0 && (
              <Row>
                <Column style={labelCol}><Text style={label}>Mermas aprobadas</Text></Column>
                <Column><Text style={valueRight}>{fmtCLP(waste_cost)}</Text></Column>
              </Row>
            )}
          </Section>

          {pos_breakdown.length > 0 && (
            <Section style={card}>
              <Heading as="h2" style={h2}>Desglose por POS</Heading>
              {pos_breakdown.map((pos, idx) => (
                <Section key={idx} style={posBlock}>
                  <Text style={posName}>{pos.pos_name}</Text>
                  <Row>
                    <Column><Text style={posDetail}>Total: <strong>{fmtCLP(pos.total)}</strong></Text></Column>
                    <Column><Text style={posDetail}>Tx: {pos.transactions}</Text></Column>
                  </Row>
                  <Row>
                    <Column><Text style={posDetail}>Efectivo: {fmtCLP(pos.cash)}</Text></Column>
                    <Column><Text style={posDetail}>Tarjeta: {fmtCLP(pos.card)}</Text></Column>
                    {(pos.tickets ?? 0) > 0 && (
                      <Column><Text style={posDetail}>Tickets: {fmtCLP(pos.tickets)}</Text></Column>
                    )}
                  </Row>
                </Section>
              ))}
            </Section>
          )}

          <Section style={card}>
            <Heading as="h2" style={h2}>Operación QR</Heading>
            <Row>
              <Column style={labelCol}><Text style={label}>QRs canjeados</Text></Column>
              <Column><Text style={valueRight}>{qr_redeemed}</Text></Column>
            </Row>
            <Row>
              <Column style={labelCol}><Text style={label}>QRs pendientes</Text></Column>
              <Column><Text style={valueRight}>{qr_pending}</Text></Column>
            </Row>
          </Section>

          {top_products.length > 0 && (
            <Section style={card}>
              <Heading as="h2" style={h2}>Top 10 productos</Heading>
              {top_products.slice(0, 10).map((p, i) => (
                <Row key={i} style={productRow}>
                  <Column style={{ width: '24px' }}>
                    <Text style={productRank}>{i + 1}</Text>
                  </Column>
                  <Column>
                    <Text style={productName}>{p.name}</Text>
                  </Column>
                  <Column style={{ width: '60px' }}>
                    <Text style={productQty}>×{p.quantity}</Text>
                  </Column>
                  <Column style={{ width: '90px' }}>
                    <Text style={productRev}>{fmtCLP(p.revenue)}</Text>
                  </Column>
                </Row>
              ))}
            </Section>
          )}

          {stock_alerts.length > 0 && (
            <Section style={card}>
              <Heading as="h2" style={h2}>⚠️ Alertas de stock</Heading>
              {stock_alerts.map((a, i) => (
                <Text key={i} style={alertItem}>• {a}</Text>
              ))}
            </Section>
          )}

          <Hr style={hr} />
          <Text style={footer}>
            Reporte generado automáticamente por {SITE_NAME} al cierre de la jornada.
            Hora servidor: America/Santiago.
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
    venue_name: 'Bar Demo',
    jornada_label: 'Jornada 2026-05-02',
    opened_at: '2026-05-01T22:00:00Z',
    closed_at: '2026-05-02T06:30:00Z',
    closed_by: 'Admin Demo',
    forced_close: false,
    total_gross: 1250000,
    stockia_commission: 31250,
    total_net: 1050420,
    cogs: 420000,
    gross_margin: 630420,
    pos_breakdown: [
      { pos_name: 'Bar Principal', total: 850000, cash: 320000, card: 530000, transactions: 145 },
      { pos_name: 'Tickets Entrada', total: 400000, cash: 100000, card: 300000, tickets: 0, transactions: 80 },
    ],
    top_products: [
      { name: 'Jack Daniel\'s Copeo', quantity: 42, revenue: 210000 },
      { name: 'Cerveza Heineken', quantity: 78, revenue: 156000 },
    ],
    qr_redeemed: 188,
    qr_pending: 12,
    courtesies_count: 5,
    courtesies_cost: 18000,
    waste_cost: 4500,
    stock_alerts: ['Absolut 750ml bajo mínimo en Bar Principal'],
    observacion_cierre: 'Caja Principal cuadró exacto. Pista con sobrante de $5.000 sin justificar.',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif', margin: 0, padding: 0 }
const container = { maxWidth: '640px', margin: '0 auto', padding: '24px 16px' }
const header = { textAlign: 'center' as const, marginBottom: '16px' }
const h1 = { fontSize: '24px', fontWeight: 'bold' as const, color: '#000000', margin: '0 0 4px' }
const subtitle = { fontSize: '13px', color: '#666666', margin: 0 }
const h2 = { fontSize: '15px', fontWeight: 'bold' as const, color: '#000000', margin: '0 0 12px', borderBottom: `2px solid ${BRAND_GREEN}`, paddingBottom: '6px' }
const card = { backgroundColor: '#fafafa', border: '1px solid #ececec', borderRadius: '4px', padding: '16px', margin: '12px 0' }
const labelCol = { width: '50%' }
const label = { fontSize: '13px', color: '#666666', margin: '4px 0' }
const value = { fontSize: '13px', color: '#000000', margin: '4px 0' }
const valueRight = { fontSize: '13px', color: '#000000', margin: '4px 0', textAlign: 'right' as const }
const valueRightBold = { fontSize: '14px', color: '#000000', margin: '4px 0', textAlign: 'right' as const, fontWeight: 'bold' as const }
const kpiRow = { marginBottom: '8px' }
const kpiCol = { padding: '8px' }
const kpiLabel = { fontSize: '11px', color: '#666666', textTransform: 'uppercase' as const, margin: '0 0 4px' }
const kpiValue = { fontSize: '20px', color: '#000000', fontWeight: 'bold' as const, margin: 0 }
const kpiValueAccent = { fontSize: '20px', color: BRAND_GREEN, fontWeight: 'bold' as const, margin: 0 }
const hr = { borderColor: '#ececec', margin: '12px 0' }
const posBlock = { backgroundColor: '#ffffff', border: '1px solid #ececec', borderRadius: '4px', padding: '10px', margin: '8px 0' }
const posName = { fontSize: '13px', fontWeight: 'bold' as const, color: '#000000', margin: '0 0 6px' }
const posDetail = { fontSize: '12px', color: '#444444', margin: '2px 0' }
const productRow = { borderBottom: '1px solid #f0f0f0', padding: '4px 0' }
const productRank = { fontSize: '12px', color: '#999999', margin: 0 }
const productName = { fontSize: '13px', color: '#000000', margin: 0 }
const productQty = { fontSize: '12px', color: '#666666', margin: 0, textAlign: 'right' as const }
const productRev = { fontSize: '12px', color: '#000000', margin: 0, textAlign: 'right' as const, fontWeight: 'bold' as const }
const alertBox = { backgroundColor: '#fff8e1', border: '1px solid #ffd54f', borderRadius: '4px', padding: '12px', margin: '12px 0' }
const alertText = { fontSize: '13px', color: '#8a6d00', margin: 0 }
const alertItem = { fontSize: '13px', color: '#444444', margin: '4px 0' }
const footer = { fontSize: '11px', color: '#999999', textAlign: 'center' as const, margin: '24px 0 0' }
const observationCard = { backgroundColor: '#f5fff8', border: `1px solid ${BRAND_GREEN}`, borderLeft: `4px solid ${BRAND_GREEN}`, borderRadius: '4px', padding: '12px 14px', margin: '12px 0' }
const observationLabel = { fontSize: '11px', color: '#005c2e', textTransform: 'uppercase' as const, fontWeight: 'bold' as const, letterSpacing: '0.5px', margin: '0 0 6px' }
const observationText = { fontSize: '14px', color: '#000000', margin: 0, whiteSpace: 'pre-wrap' as const, lineHeight: '1.5' }
