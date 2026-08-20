/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface WeekRow {
  week: string
  comprado: number
  vendido: number
}
interface TopRow {
  name: string
  units: number
  amount: number
}
interface PriceRow {
  name: string
  first: number
  last: number
  pct: number
}
interface InvoiceRow {
  document_date: string | null
  supplier_name: string | null
  document_number: string | null
  net_subtotal: number
  total_amount: number
}

interface Props {
  venueName?: string
  start?: string
  end?: string
  kpis?: {
    invoices: number
    purchase_net: number
    purchase_total: number
    sales_net: number
    consumption_cost: number
    ratio: number
    prev_purchase_net: number
    prev_sales_net: number
  }
  weekly?: WeekRow[]
  top?: TopRow[]
  priceChanges?: PriceRow[]
  invoices?: InvoiceRow[]
}

const clp = (n: number) =>
  '$' + Math.round(Number(n) || 0).toLocaleString('es-CL')

const pctVar = (curr: number, prev: number) => {
  if (!prev) return '—'
  const p = ((curr - prev) / prev) * 100
  return `${p > 0 ? '+' : ''}${p.toFixed(1)}%`
}

const Email = ({
  venueName = 'STOCKIA',
  start = '',
  end = '',
  kpis,
  weekly = [],
  top = [],
  priceChanges = [],
  invoices = [],
}: Props) => {
  const k = kpis ?? {
    invoices: 0,
    purchase_net: 0,
    purchase_total: 0,
    sales_net: 0,
    consumption_cost: 0,
    ratio: 0,
    prev_purchase_net: 0,
    prev_sales_net: 0,
  }
  return (
    <Html lang="es" dir="ltr">
      <Head />
      <Preview>{`Informe de compras ${start} a ${end} · ${clp(k.purchase_total)} comprado`}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Text style={brand}>STOCKIA</Text>
          <Heading style={h1}>Informe de compras y gastos</Heading>
          <Text style={sub}>
            {venueName} · {start} a {end}
          </Text>

          <Section style={card}>
            <Row label="Facturas confirmadas" value={String(k.invoices)} />
            <Row label="Compras (neto)" value={`${clp(k.purchase_net)}  (${pctVar(k.purchase_net, k.prev_purchase_net)} vs período anterior)`} />
            <Row label="Compras (total con IVA)" value={clp(k.purchase_total)} />
            <Row label="Ventas (neto)" value={`${clp(k.sales_net)}  (${pctVar(k.sales_net, k.prev_sales_net)} vs período anterior)`} />
            <Row label="Costo de insumos vendidos" value={clp(k.consumption_cost)} />
            <Row label="Compra / Venta" value={k.sales_net > 0 ? `${k.ratio.toFixed(1)}%` : '—'} />
            <Row label="Margen bruto estimado" value={clp(k.sales_net - k.consumption_cost)} />
          </Section>

          {weekly.length > 0 && (
            <>
              <Heading style={h2}>Comparación semanal</Heading>
              <Section style={card}>
                {weekly.map((w) => (
                  <Row
                    key={w.week}
                    label={w.week}
                    value={`Compra ${clp(w.comprado)} · Venta ${clp(w.vendido)}`}
                  />
                ))}
              </Section>
            </>
          )}

          {top.length > 0 && (
            <>
              <Heading style={h2}>Top insumos por gasto</Heading>
              <Section style={card}>
                {top.map((t) => (
                  <Row key={t.name} label={t.name} value={`${t.units} u · ${clp(t.amount)}`} />
                ))}
              </Section>
            </>
          )}

          {priceChanges.length > 0 && (
            <>
              <Heading style={h2}>Variaciones de precio</Heading>
              <Section style={card}>
                {priceChanges.map((p) => (
                  <Row
                    key={p.name}
                    label={p.name}
                    value={`${clp(p.first)} → ${clp(p.last)} (${p.pct > 0 ? '+' : ''}${p.pct.toFixed(1)}%)`}
                  />
                ))}
              </Section>
            </>
          )}

          {invoices.length > 0 && (
            <>
              <Heading style={h2}>Facturas del período</Heading>
              <Section style={card}>
                {invoices.map((i, idx) => (
                  <Row
                    key={`${i.document_number}-${idx}`}
                    label={`${i.document_date || '—'} · ${i.supplier_name || 'Proveedor'} #${i.document_number || '—'}`}
                    value={`Neto ${clp(i.net_subtotal)} · Total ${clp(i.total_amount)}`}
                  />
                ))}
              </Section>
            </>
          )}

          <Hr style={hr} />
          <Text style={footer}>
            Informe generado automáticamente por STOCKIA. Ventas netas = ventas brutas / 1,19.
            Costo de insumos = ventas × receta.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

const Row = ({ label, value }: { label: string; value: string }) => (
  <table style={rowTable} cellPadding={0} cellSpacing={0}>
    <tbody>
      <tr>
        <td style={rowLabel}>{label}</td>
        <td style={rowValue}>{value}</td>
      </tr>
    </tbody>
  </table>
)

export const template = {
  component: Email,
  subject: (d: Record<string, any>) =>
    `Informe de compras ${d?.start ?? ''} — ${d?.end ?? ''}`,
  displayName: 'Informe de compras a gerencia',
  previewData: {
    venueName: 'Berlín Valdivia',
    start: '2026-08-11',
    end: '2026-08-17',
    kpis: {
      invoices: 4,
      purchase_net: 1850000,
      purchase_total: 2201500,
      sales_net: 5200000,
      consumption_cost: 1450000,
      ratio: 35.6,
      prev_purchase_net: 1620000,
      prev_sales_net: 4900000,
    },
    weekly: [{ week: '2026-W33', comprado: 1850000, vendido: 5200000 }],
    top: [{ name: 'Ron Havana 700ml', units: 24, amount: 380000 }],
    priceChanges: [{ name: 'Red Bull 250ml', first: 900, last: 1050, pct: 16.7 }],
    invoices: [
      {
        document_date: '2026-08-12',
        supplier_name: 'CCU',
        document_number: '558921',
        net_subtotal: 940000,
        total_amount: 1118600,
      },
    ],
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, Helvetica, sans-serif' }
const container = { padding: '24px 20px', maxWidth: '640px' }
const brand = { fontSize: '12px', letterSpacing: '2px', color: '#00A85A', fontWeight: 700, margin: '0 0 4px' }
const h1 = { fontSize: '22px', color: '#111111', margin: '0 0 4px' }
const h2 = { fontSize: '15px', color: '#111111', margin: '24px 0 8px' }
const sub = { fontSize: '13px', color: '#666666', margin: '0 0 16px' }
const card = {
  border: '1px solid #e6e6e6',
  borderRadius: '6px',
  padding: '8px 12px',
  backgroundColor: '#fafafa',
}
const rowTable = { width: '100%', borderCollapse: 'collapse' as const }
const rowLabel = { fontSize: '13px', color: '#444444', padding: '6px 0' }
const rowValue = { fontSize: '13px', color: '#111111', fontWeight: 600, textAlign: 'right' as const, padding: '6px 0' }
const hr = { borderColor: '#e6e6e6', margin: '24px 0 12px' }
const footer = { fontSize: '11px', color: '#888888', margin: 0 }
