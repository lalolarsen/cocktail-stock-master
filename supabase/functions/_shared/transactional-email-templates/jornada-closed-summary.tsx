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

interface JornadaClosedProps {
  venue_name?: string
  jornada_label?: string
  opened_at?: string
  closed_at?: string
  closed_by?: string
  forced_close?: boolean
  forced_reason?: string | null
  observacion_cierre?: string | null
  total_gross?: number
  stockia_commission?: number
  total_net?: number
  pos_breakdown?: POSBreakdown[]
  courtesies_issued?: CourtesyIssuer[]
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
        <Column style={labelCol}><Text style={label2}>Efectivo ({ch.cash_count ?? 0})</Text></Column>
        <Column><Text style={valueRight}>{fmtCLP(cash)}</Text></Column>
      </Row>
      <Row>
        <Column style={labelCol}><Text style={label2}>Tarjeta ({ch.card_count ?? 0})</Text></Column>
        <Column><Text style={valueRight}>{fmtCLP(card)}</Text></Column>
      </Row>
      {other > 0 && (
        <Row>
          <Column style={labelCol}><Text style={label2}>Otro ({ch.other_count ?? 0})</Text></Column>
          <Column><Text style={valueRight}>{fmtCLP(other)}</Text></Column>
        </Row>
      )}
    </Section>
  )
}

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
    stockia_commission = 0,
    total_net = 0,
    pos_breakdown = [],
    courtesies_issued = [],
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
              <Text style={observationLabel}>Observación del cierre</Text>
              <Text style={observationText}>{observacion_cierre}</Text>
            </Section>
          )}

          <Section style={card}>
            <Heading as="h2" style={h2}>Información de la jornada</Heading>
            <Row>
              <Column style={labelCol}><Text style={label2}>Jornada</Text></Column>
              <Column><Text style={value}>{jornada_label}</Text></Column>
            </Row>
            <Row>
              <Column style={labelCol}><Text style={label2}>Apertura</Text></Column>
              <Column><Text style={value}>{fmtDate(opened_at)}</Text></Column>
            </Row>
            <Row>
              <Column style={labelCol}><Text style={label2}>Cierre</Text></Column>
              <Column><Text style={value}>{fmtDate(closed_at)}</Text></Column>
            </Row>
            <Row>
              <Column style={labelCol}><Text style={label2}>Cerrado por</Text></Column>
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
            <Row>
              <Column style={labelCol}><Text style={label2}>Ventas netas</Text></Column>
              <Column><Text style={valueRightBold}>{fmtCLP(total_net)}</Text></Column>
            </Row>

            <Hr style={hr} />

            {pos_breakdown.length === 0 && (
              <Text style={muted}>Sin ventas registradas en esta jornada.</Text>
            )}

            {pos_breakdown.map((pos, idx) => {
              const hasTickets =
                !!pos.tickets &&
                ((pos.tickets.cash ?? 0) +
                  (pos.tickets.card ?? 0) +
                  (pos.tickets.other ?? 0) >
                  0)
              return (
                <Section key={idx} style={posBlock}>
                  <Text style={posName}>{pos.pos_name}</Text>
                  {renderChannel(hasTickets ? 'ALCOHOL / CARTA' : 'Ventas', pos.alcohol)}
                  {hasTickets && renderChannel('TICKETS (entrada)', pos.tickets!)}
                  <Hr style={hrLight} />
                  <Row>
                    <Column style={labelCol}>
                      <Text style={posTotalLabel}>Total POS ({pos.tx ?? 0} tx)</Text>
                    </Column>
                    <Column>
                      <Text style={posTotalValue}>{fmtCLP(pos.total)}</Text>
                    </Column>
                  </Row>
                </Section>
              )
            })}
          </Section>

          <Section style={card}>
            <Heading as="h2" style={h2}>QR de cortesía emitidos</Heading>
            {courtesies_issued.length === 0 ? (
              <Text style={muted}>No se emitieron cortesías en esta jornada.</Text>
            ) : (
              courtesies_issued.map((c, i) => (
                <Section key={i} style={courtesyRow}>
                  <Row>
                    <Column>
                      <Text style={courtesyName}>{c.issuer_name}</Text>
                    </Column>
                    <Column style={{ width: '170px' }}>
                      <Text style={courtesyMeta}>
                        {c.qr_count} código{c.qr_count === 1 ? '' : 's'} ·{' '}
                        {c.total_uses} uso{c.total_uses === 1 ? '' : 's'}
                      </Text>
                      <Text style={courtesyRedeemed}>
                        {c.redeemed_count} canjeado{c.redeemed_count === 1 ? '' : 's'}
                      </Text>
                    </Column>
                  </Row>
                </Section>
              ))
            )}
          </Section>

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
    jornada_label: 'Jornada N°12 · 2026-05-10',
    opened_at: '2026-05-10T22:00:00Z',
    closed_at: '2026-05-11T06:30:00Z',
    closed_by: 'Eduardo Larsen',
    forced_close: false,
    observacion_cierre: 'Caja Principal cuadró exacto. Pista con sobrante de $5.000 sin justificar.',
    total_gross: 1250000,
    stockia_commission: 12500,
    total_net: 1237500,
    pos_breakdown: [
      {
        pos_name: 'Bar Principal',
        alcohol: { cash: 320000, cash_count: 45, card: 530000, card_count: 80, other: 0, other_count: 0, total: 850000, tx: 125 },
        tickets: null,
        total: 850000,
        tx: 125,
      },
      {
        pos_name: 'Caja Entrada',
        alcohol: { cash: 0, cash_count: 0, card: 0, card_count: 0, other: 0, other_count: 0, total: 0, tx: 0 },
        tickets: { cash: 100000, cash_count: 20, card: 300000, card_count: 60, other: 0, other_count: 0, total: 400000, tx: 80 },
        total: 400000,
        tx: 80,
      },
    ],
    courtesies_issued: [
      { issuer_name: 'Admin Demo', qr_count: 4, total_uses: 8, redeemed_count: 5 },
      { issuer_name: 'Gerencia Demo', qr_count: 2, total_uses: 2, redeemed_count: 1 },
    ],
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif', margin: 0, padding: 0 }
const container = { maxWidth: '640px', margin: '0 auto', padding: '24px 16px' }
const header = { textAlign: 'center' as const, marginBottom: '16px' }
const h1 = { fontSize: '24px', fontWeight: 'bold' as const, color: '#000000', margin: '0 0 4px' }
const subtitle = { fontSize: '13px', color: '#666666', margin: 0 }
const h2 = { fontSize: '15px', fontWeight: 'bold' as const, color: '#000000', margin: '0 0 12px', borderBottom: `2px solid ${BRAND_GREEN}`, paddingBottom: '6px' }
const card = { backgroundColor: '#fafafa', border: '1px solid #ececec', borderRadius: '4px', padding: '16px', margin: '12px 0' }
const labelCol = { width: '55%' }
const label2 = { fontSize: '13px', color: '#666666', margin: '4px 0' }
const value = { fontSize: '13px', color: '#000000', margin: '4px 0' }
const valueRight = { fontSize: '13px', color: '#000000', margin: '4px 0', textAlign: 'right' as const }
const valueRightBold = { fontSize: '14px', color: '#000000', margin: '4px 0', textAlign: 'right' as const, fontWeight: 'bold' as const }
const muted = { fontSize: '13px', color: '#999999', margin: '8px 0', fontStyle: 'italic' as const }
const kpiRow = { marginBottom: '8px' }
const kpiCol = { padding: '8px' }
const kpiLabel = { fontSize: '11px', color: '#666666', textTransform: 'uppercase' as const, margin: '0 0 4px' }
const kpiValue = { fontSize: '20px', color: '#000000', fontWeight: 'bold' as const, margin: 0 }
const kpiValueAccent = { fontSize: '20px', color: BRAND_GREEN, fontWeight: 'bold' as const, margin: 0 }
const hr = { borderColor: '#ececec', margin: '12px 0' }
const hrLight = { borderColor: '#f0f0f0', margin: '6px 0' }
const posBlock = { backgroundColor: '#ffffff', border: '1px solid #ececec', borderRadius: '4px', padding: '12px', margin: '10px 0' }
const posName = { fontSize: '14px', fontWeight: 'bold' as const, color: '#000000', margin: '0 0 8px', borderBottom: '1px solid #ececec', paddingBottom: '4px' }
const channelBlock = { margin: '6px 0' }
const channelTitle = { fontSize: '11px', color: '#666666', fontWeight: 'bold' as const, textTransform: 'uppercase' as const, letterSpacing: '0.5px', margin: '4px 0 2px' }
const posTotalLabel = { fontSize: '13px', color: '#000000', fontWeight: 'bold' as const, margin: '4px 0' }
const posTotalValue = { fontSize: '14px', color: '#000000', fontWeight: 'bold' as const, margin: '4px 0', textAlign: 'right' as const }
const courtesyRow = { backgroundColor: '#ffffff', border: '1px solid #ececec', borderRadius: '4px', padding: '8px 12px', margin: '6px 0' }
const courtesyName = { fontSize: '13px', color: '#000000', fontWeight: 'bold' as const, margin: '4px 0' }
const courtesyMeta = { fontSize: '12px', color: '#444444', margin: '4px 0', textAlign: 'right' as const }
const courtesyRedeemed = { fontSize: '11px', color: BRAND_GREEN, margin: '0', textAlign: 'right' as const, fontWeight: 'bold' as const }
const alertBox = { backgroundColor: '#fff8e1', border: '1px solid #ffd54f', borderRadius: '4px', padding: '12px', margin: '12px 0' }
const alertText = { fontSize: '13px', color: '#8a6d00', margin: 0 }
const footer = { fontSize: '11px', color: '#999999', textAlign: 'center' as const, margin: '24px 0 0' }
const observationCard = { backgroundColor: '#f5fff8', border: `1px solid ${BRAND_GREEN}`, borderLeft: `4px solid ${BRAND_GREEN}`, borderRadius: '4px', padding: '12px 14px', margin: '12px 0' }
const observationLabel = { fontSize: '11px', color: '#005c2e', textTransform: 'uppercase' as const, fontWeight: 'bold' as const, letterSpacing: '0.5px', margin: '0 0 6px' }
const observationText = { fontSize: '14px', color: '#000000', margin: 0, whiteSpace: 'pre-wrap' as const, lineHeight: '1.5' }
