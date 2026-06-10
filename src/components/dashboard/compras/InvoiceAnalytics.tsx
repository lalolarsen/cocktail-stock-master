import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/supabase-batch";
import { useActiveVenue } from "@/hooks/useActiveVenue";
import { formatCLP } from "@/lib/currency";
import { FileText, TrendingUp, CalendarDays, GitCompare, Trophy } from "lucide-react";

const TZ = "America/Santiago";
const IVA = 1.19;

function ymd(d: Date) {
  return d.toLocaleDateString("en-CA", { timeZone: TZ });
}
function defaultRange(): { start: string; end: string } {
  const now = new Date();
  const end = ymd(now);
  const startD = new Date(now);
  startD.setDate(startD.getDate() - 30);
  return { start: ymd(startD), end };
}
function isoWeek(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  const target = new Date(d.valueOf());
  const dayNr = (d.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const week =
    1 + Math.round(((target.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

interface PurchaseLine {
  product_id: string | null;
  units_real: number;
  cost_unit_net: number;
  line_total_net: number | null;
  raw_text: string | null;
  document_date: string;
  supplier_name: string | null;
  document_number: string | null;
}

interface InvoiceRow {
  id: string;
  document_date: string | null;
  supplier_name: string | null;
  document_number: string | null;
  net_subtotal: number;
  vat_amount: number;
  total_amount: number;
  lines_count: number;
}

interface SaleConsumption {
  product_id: string;
  qty: number;
}

interface WeeklySale {
  week: string;
  net: number;
}

export function InvoiceAnalytics() {
  const { venue } = useActiveVenue();
  const [{ start, end }, setRange] = useState(defaultRange);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lines, setLines] = useState<PurchaseLine[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [productMap, setProductMap] = useState<Map<string, string>>(new Map());
  const [consumption, setConsumption] = useState<SaleConsumption[]>([]);
  const [weeklySales, setWeeklySales] = useState<WeeklySale[]>([]);

  useEffect(() => {
    if (!venue?.id) return;
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);

        // 1. Confirmed imports in range (full row for totals)
        const imports = await fetchAllRows<any>(() =>
          supabase
            .from("purchase_imports")
            .select("id, document_date, supplier_name, document_number, net_subtotal, vat_amount, total_amount, status")
            .eq("venue_id", venue.id)
            .eq("status", "CONFIRMED")
            .gte("document_date", start)
            .lte("document_date", end)
        );
        const importIds = imports.map((i) => i.id);
        const importMeta = new Map(imports.map((i) => [i.id, i]));

        // 2. Lines for those imports
        const rawLines: any[] = [];
        for (let i = 0; i < importIds.length; i += 200) {
          const batch = importIds.slice(i, i + 200);
          if (batch.length === 0) continue;
          const part = await fetchAllRows<any>(() =>
            supabase
              .from("purchase_import_lines")
              .select("product_id, units_real, cost_unit_net, line_total_net, raw_text, purchase_import_id")
              .in("purchase_import_id", batch)
              .eq("classification", "inventory")
          );
          rawLines.push(...part);
        }
        const linesCount = new Map<string, number>();
        rawLines.forEach((l) => linesCount.set(l.purchase_import_id, (linesCount.get(l.purchase_import_id) || 0) + 1));

        const enriched: PurchaseLine[] = rawLines.map((l) => {
          const meta: any = importMeta.get(l.purchase_import_id) || {};
          return {
            product_id: l.product_id,
            units_real: Number(l.units_real) || 0,
            cost_unit_net: Number(l.cost_unit_net) || 0,
            line_total_net: l.line_total_net != null ? Number(l.line_total_net) : null,
            raw_text: l.raw_text,
            document_date: meta.document_date || "",
            supplier_name: meta.supplier_name || null,
            document_number: meta.document_number || null,
          };
        });

        const invs: InvoiceRow[] = imports
          .map((i: any) => ({
            id: i.id,
            document_date: i.document_date,
            supplier_name: i.supplier_name,
            document_number: i.document_number,
            net_subtotal: Number(i.net_subtotal) || 0,
            vat_amount: Number(i.vat_amount) || 0,
            total_amount: Number(i.total_amount) || 0,
            lines_count: linesCount.get(i.id) || 0,
          }))
          .sort((a, b) => (b.document_date || "").localeCompare(a.document_date || ""));

        // 3. Resolve product names
        const pids = [...new Set(enriched.map((l) => l.product_id).filter(Boolean))] as string[];
        const map = new Map<string, string>();
        for (let i = 0; i < pids.length; i += 200) {
          const batch = pids.slice(i, i + 200);
          const { data } = await supabase.from("products").select("id, name").in("id", batch);
          (data || []).forEach((p: any) => map.set(p.id, p.name));
        }

        // 4. Sales in range (for consumption + weekly net)
        const startISO = new Date(start + "T00:00:00-03:00").toISOString();
        const endISO = new Date(end + "T23:59:59-03:00").toISOString();
        const sales = await fetchAllRows<any>(() =>
          supabase
            .from("sales")
            .select("id, created_at, total_amount, is_cancelled")
            .eq("venue_id", venue.id)
            .eq("is_cancelled", false)
            .gte("created_at", startISO)
            .lte("created_at", endISO)
        );

        // Weekly sales net
        const wkMap = new Map<string, number>();
        for (const s of sales) {
          const day = new Date(s.created_at).toLocaleDateString("en-CA", { timeZone: TZ });
          const wk = isoWeek(day);
          const net = (Number(s.total_amount) || 0) / IVA;
          wkMap.set(wk, (wkMap.get(wk) || 0) + net);
        }
        const wkArr: WeeklySale[] = [...wkMap.entries()].map(([week, net]) => ({ week, net }));

        // Consumption (theoretical)
        const saleIds = sales.map((s) => s.id);
        const saleItems: any[] = [];
        for (let i = 0; i < saleIds.length; i += 200) {
          const batch = saleIds.slice(i, i + 200);
          if (batch.length === 0) continue;
          const part = await fetchAllRows<any>(() =>
            supabase.from("sale_items").select("cocktail_id, quantity").in("sale_id", batch)
          );
          saleItems.push(...part);
        }
        const cocktailQty = new Map<string, number>();
        for (const it of saleItems) {
          cocktailQty.set(it.cocktail_id, (cocktailQty.get(it.cocktail_id) || 0) + (Number(it.quantity) || 0));
        }
        const cocktailIds = [...cocktailQty.keys()];
        const ingMap = new Map<string, number>();
        if (cocktailIds.length > 0) {
          const ingredients: any[] = [];
          for (let i = 0; i < cocktailIds.length; i += 200) {
            const batch = cocktailIds.slice(i, i + 200);
            const part = await fetchAllRows<any>(() =>
              supabase
                .from("cocktail_ingredients")
                .select("cocktail_id, product_id, quantity")
                .in("cocktail_id", batch)
            );
            ingredients.push(...part);
          }
          for (const ing of ingredients) {
            if (!ing.product_id) continue;
            const salesQty = cocktailQty.get(ing.cocktail_id) || 0;
            const consumed = salesQty * (Number(ing.quantity) || 0);
            ingMap.set(ing.product_id, (ingMap.get(ing.product_id) || 0) + consumed);
          }
        }
        const cons: SaleConsumption[] = [...ingMap.entries()].map(([product_id, qty]) => ({ product_id, qty }));

        if (cancelled) return;
        setLines(enriched);
        setInvoices(invs);
        setProductMap(map);
        setConsumption(cons);
        setWeeklySales(wkArr);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Error cargando datos");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [venue?.id, start, end]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="text-[11px] text-muted-foreground block mb-1">Desde</label>
          <Input type="date" value={start} onChange={(e) => setRange((r) => ({ ...r, start: e.target.value }))} className="h-8 w-[150px]" />
        </div>
        <div>
          <label className="text-[11px] text-muted-foreground block mb-1">Hasta</label>
          <Input type="date" value={end} onChange={(e) => setRange((r) => ({ ...r, end: e.target.value }))} className="h-8 w-[150px]" />
        </div>
        <div className="text-xs text-muted-foreground ml-auto">
          {loading ? "Cargando..." : `${invoices.length} facturas · ${lines.length} líneas`}
        </div>
      </div>

      {error && <Card><CardContent className="py-4 text-sm text-destructive">{error}</CardContent></Card>}

      <Tabs defaultValue="invoices" className="w-full">
        <TabsList className="w-full justify-start flex-wrap h-auto">
          <TabsTrigger value="invoices"><FileText className="w-3.5 h-3.5 mr-1.5" />Facturas</TabsTrigger>
          <TabsTrigger value="price"><TrendingUp className="w-3.5 h-3.5 mr-1.5" />Precio por insumo</TabsTrigger>
          <TabsTrigger value="weekly"><CalendarDays className="w-3.5 h-3.5 mr-1.5" />Semanal compra/venta</TabsTrigger>
          <TabsTrigger value="vs"><GitCompare className="w-3.5 h-3.5 mr-1.5" />Venta vs Compra</TabsTrigger>
          <TabsTrigger value="top"><Trophy className="w-3.5 h-3.5 mr-1.5" />Top insumos</TabsTrigger>
        </TabsList>

        <TabsContent value="invoices" className="mt-4">
          <InvoicesListView invoices={invoices} loading={loading} />
        </TabsContent>
        <TabsContent value="price" className="mt-4">
          <PriceHistoryView lines={lines} productMap={productMap} loading={loading} />
        </TabsContent>
        <TabsContent value="weekly" className="mt-4">
          <WeeklyView lines={lines} weeklySales={weeklySales} loading={loading} />
        </TabsContent>
        <TabsContent value="vs" className="mt-4">
          <SalesVsPurchaseView lines={lines} productMap={productMap} consumption={consumption} loading={loading} />
        </TabsContent>
        <TabsContent value="top" className="mt-4">
          <TopInsumosView lines={lines} productMap={productMap} loading={loading} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function InvoicesListView({ invoices, loading }: { invoices: InvoiceRow[]; loading: boolean }) {
  const navigate = useNavigate();
  const kpis = useMemo(() => {
    const total = invoices.reduce((s, i) => s + i.total_amount, 0);
    const net = invoices.reduce((s, i) => s + i.net_subtotal, 0);
    const avg = invoices.length > 0 ? total / invoices.length : 0;
    return {
      total: Math.round(total),
      net: Math.round(net),
      avg: Math.round(avg),
      count: invoices.length,
    };
  }, [invoices]);

  if (loading) return <Skeleton className="h-60 w-full" />;
  if (invoices.length === 0) return <EmptyState text="Sin facturas confirmadas en el rango" />;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Facturas" value={String(kpis.count)} />
        <Kpi label="Total comprado" value={formatCLP(kpis.total)} />
        <Kpi label="Neto" value={formatCLP(kpis.net)} />
        <Kpi label="Ticket promedio" value={formatCLP(kpis.avg)} />
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Proveedor</TableHead>
                <TableHead>N° doc</TableHead>
                <TableHead className="text-right">Líneas</TableHead>
                <TableHead className="text-right">Neto</TableHead>
                <TableHead className="text-right">IVA</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((i) => (
                <TableRow
                  key={i.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => navigate(`/admin/proveedores/import/${i.id}`)}
                >
                  <TableCell className="text-sm">{i.document_date || "—"}</TableCell>
                  <TableCell className="text-sm font-medium">{i.supplier_name || "—"}</TableCell>
                  <TableCell className="text-sm">{i.document_number || "—"}</TableCell>
                  <TableCell className="text-right text-sm">{i.lines_count}</TableCell>
                  <TableCell className="text-right text-sm">{formatCLP(Math.round(i.net_subtotal))}</TableCell>
                  <TableCell className="text-right text-sm">{formatCLP(Math.round(i.vat_amount))}</TableCell>
                  <TableCell className="text-right text-sm font-semibold">{formatCLP(Math.round(i.total_amount))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function WeeklyView({
  lines,
  weeklySales,
  loading,
}: {
  lines: PurchaseLine[];
  weeklySales: WeeklySale[];
  loading: boolean;
}) {
  const rows = useMemo(() => {
    const map = new Map<string, { week: string; comprado: number; vendido: number; lines: number }>();
    for (const l of lines) {
      if (!l.document_date) continue;
      const w = isoWeek(l.document_date);
      const amount = l.line_total_net ?? l.units_real * l.cost_unit_net;
      const e = map.get(w) || { week: w, comprado: 0, vendido: 0, lines: 0 };
      e.comprado += amount;
      e.lines += 1;
      map.set(w, e);
    }
    for (const ws of weeklySales) {
      const e = map.get(ws.week) || { week: ws.week, comprado: 0, vendido: 0, lines: 0 };
      e.vendido += ws.net;
      map.set(ws.week, e);
    }
    return [...map.values()]
      .sort((a, b) => a.week.localeCompare(b.week))
      .map((r) => ({
        ...r,
        comprado: Math.round(r.comprado),
        vendido: Math.round(r.vendido),
      }));
  }, [lines, weeklySales]);

  if (loading) return <Skeleton className="h-60 w-full" />;
  if (rows.length === 0) return <EmptyState text="Sin compras ni ventas en el rango" />;

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Comprado (neto) vs Vendido (neto) por semana ISO</CardTitle>
        </CardHeader>
        <CardContent className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
              <XAxis dataKey="week" tick={{ fontSize: 11 }} />
              <YAxis
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)}
              />
              <Tooltip
                formatter={(v: any) => formatCLP(Number(v))}
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="comprado" fill="hsl(var(--primary))" name="Comprado" />
              <Bar dataKey="vendido" fill="hsl(var(--muted-foreground))" name="Vendido" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Semana ISO</TableHead>
                <TableHead className="text-right">Comprado (neto)</TableHead>
                <TableHead className="text-right">Vendido (neto)</TableHead>
                <TableHead className="text-right">Diferencia</TableHead>
                <TableHead className="text-right">Compra / Venta</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const dif = r.vendido - r.comprado;
                const ratio = r.vendido > 0 ? (r.comprado / r.vendido) * 100 : 0;
                return (
                  <TableRow key={r.week}>
                    <TableCell className="text-sm font-medium">{r.week}</TableCell>
                    <TableCell className="text-right text-sm">{formatCLP(r.comprado)}</TableCell>
                    <TableCell className="text-right text-sm">{formatCLP(r.vendido)}</TableCell>
                    <TableCell className={`text-right text-sm ${dif < 0 ? "text-destructive" : "text-emerald-500"}`}>
                      {formatCLP(dif)}
                    </TableCell>
                    <TableCell className={`text-right text-sm font-medium ${ratio > 50 ? "text-amber-500" : ""}`}>
                      {r.vendido > 0 ? `${ratio.toFixed(1)}%` : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <p className="text-[11px] text-muted-foreground">
        Vendido neto = ventas brutas / 1.19 (IVA 19%). Comprado neto = suma de líneas de inventario sin IVA.
      </p>
    </div>
  );
}

function PriceHistoryView({
  lines,
  productMap,
  loading,
}: {
  lines: PurchaseLine[];
  productMap: Map<string, string>;
  loading: boolean;
}) {
  const products = useMemo(() => {
    const set = new Set<string>();
    lines.forEach((l) => l.product_id && set.add(l.product_id));
    return [...set]
      .map((id) => ({ id, name: productMap.get(id) || "(sin nombre)" }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [lines, productMap]);

  const [selected, setSelected] = useState<string>("");
  useEffect(() => {
    if (!selected && products.length > 0) setSelected(products[0].id);
  }, [products, selected]);

  const history = useMemo(() => {
    if (!selected) return [];
    const sorted = lines
      .filter((l) => l.product_id === selected && l.cost_unit_net > 0)
      .sort((a, b) => a.document_date.localeCompare(b.document_date));
    return sorted.map((l, idx) => {
      const prev = idx > 0 ? sorted[idx - 1].cost_unit_net : null;
      const delta = prev != null ? l.cost_unit_net - prev : null;
      const pct = prev != null && prev > 0 ? ((l.cost_unit_net - prev) / prev) * 100 : null;
      return {
        date: l.document_date,
        supplier: l.supplier_name || "—",
        doc: l.document_number || "—",
        units: l.units_real,
        cost: Math.round(l.cost_unit_net),
        delta: delta != null ? Math.round(delta) : null,
        pct,
      };
    });
  }, [lines, selected]);

  const series = useMemo(() => history.map((h) => ({ date: h.date, cost: h.cost })), [history]);

  if (loading) return <Skeleton className="h-60 w-full" />;
  if (products.length === 0) return <EmptyState text="Sin insumos comprados en el rango" />;

  return (
    <div className="space-y-3">
      <Select value={selected} onValueChange={setSelected}>
        <SelectTrigger className="w-full md:w-[400px] h-9">
          <SelectValue placeholder="Elegí un insumo" />
        </SelectTrigger>
        <SelectContent>
          {products.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Evolución del costo unitario neto</CardTitle>
        </CardHeader>
        <CardContent className="h-[260px]">
          {series.length === 0 ? (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Sin datos</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatCLP(v)} />
                <Tooltip
                  formatter={(v: any) => formatCLP(Number(v))}
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }}
                />
                <Line type="monotone" dataKey="cost" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Proveedor</TableHead>
                <TableHead>N° doc</TableHead>
                <TableHead className="text-right">Unidades</TableHead>
                <TableHead className="text-right">Costo unit. neto</TableHead>
                <TableHead className="text-right">Δ vs anterior</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.map((h, idx) => (
                <TableRow key={`${h.date}-${idx}`}>
                  <TableCell className="text-sm">{h.date}</TableCell>
                  <TableCell className="text-sm">{h.supplier}</TableCell>
                  <TableCell className="text-sm">{h.doc}</TableCell>
                  <TableCell className="text-right text-sm">{h.units}</TableCell>
                  <TableCell className="text-right text-sm font-medium">{formatCLP(h.cost)}</TableCell>
                  <TableCell
                    className={`text-right text-sm ${
                      h.pct == null ? "text-muted-foreground" : h.pct > 0 ? "text-amber-500" : h.pct < 0 ? "text-emerald-500" : ""
                    }`}
                  >
                    {h.pct == null
                      ? "—"
                      : `${h.delta! > 0 ? "+" : ""}${formatCLP(h.delta!)} (${h.pct > 0 ? "+" : ""}${h.pct.toFixed(1)}%)`}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function SalesVsPurchaseView({
  lines,
  productMap,
  consumption,
  loading,
}: {
  lines: PurchaseLine[];
  productMap: Map<string, string>;
  consumption: SaleConsumption[];
  loading: boolean;
}) {
  const rows = useMemo(() => {
    const purchMap = new Map<string, number>();
    for (const l of lines) {
      if (!l.product_id) continue;
      purchMap.set(l.product_id, (purchMap.get(l.product_id) || 0) + l.units_real);
    }
    const consMap = new Map(consumption.map((c) => [c.product_id, c.qty]));
    const allIds = new Set<string>([...purchMap.keys(), ...consMap.keys()]);
    return [...allIds]
      .map((id) => {
        const compradas = purchMap.get(id) || 0;
        const consumidas = consMap.get(id) || 0;
        const dif = compradas - consumidas;
        const ratio = compradas > 0 ? (consumidas / compradas) * 100 : 0;
        return {
          id,
          name: productMap.get(id) || "(sin nombre)",
          compradas: Math.round(compradas * 100) / 100,
          consumidas: Math.round(consumidas * 100) / 100,
          dif: Math.round(dif * 100) / 100,
          ratio,
        };
      })
      .sort((a, b) => b.compradas - a.compradas);
  }, [lines, consumption, productMap]);

  if (loading) return <Skeleton className="h-40 w-full" />;
  if (rows.length === 0) return <EmptyState text="Sin datos en el rango" />;

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Insumo</TableHead>
              <TableHead className="text-right">Compradas</TableHead>
              <TableHead className="text-right">Consumidas (teórico)</TableHead>
              <TableHead className="text-right">Diferencia</TableHead>
              <TableHead className="text-right">Uso %</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="text-sm">{r.name}</TableCell>
                <TableCell className="text-right text-sm">{r.compradas}</TableCell>
                <TableCell className="text-right text-sm">{r.consumidas}</TableCell>
                <TableCell className={`text-right text-sm ${r.dif < 0 ? "text-destructive" : ""}`}>{r.dif}</TableCell>
                <TableCell className="text-right text-sm">{r.ratio.toFixed(1)}%</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function TopInsumosView({
  lines,
  productMap,
  loading,
}: {
  lines: PurchaseLine[];
  productMap: Map<string, string>;
  loading: boolean;
}) {
  const { byGasto, byVar } = useMemo(() => {
    const agg = new Map<string, { id: string; name: string; amount: number; units: number; costs: { date: string; cost: number }[] }>();
    for (const l of lines) {
      const id = l.product_id || `__raw__${l.raw_text || "?"}`;
      const name = l.product_id ? productMap.get(l.product_id) || "(sin nombre)" : (l.raw_text || "Sin identificar").slice(0, 60);
      const amount = l.line_total_net ?? l.units_real * l.cost_unit_net;
      const e = agg.get(id) || { id, name, amount: 0, units: 0, costs: [] };
      e.amount += amount;
      e.units += l.units_real;
      if (l.cost_unit_net > 0 && l.document_date) e.costs.push({ date: l.document_date, cost: l.cost_unit_net });
      agg.set(id, e);
    }
    const all = [...agg.values()];
    const byGasto = [...all]
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 15)
      .map((r) => ({ ...r, amount: Math.round(r.amount), units: Math.round(r.units * 100) / 100 }));
    const byVar = all
      .map((r) => {
        if (r.costs.length < 2) return null;
        const sorted = [...r.costs].sort((a, b) => a.date.localeCompare(b.date));
        const first = sorted[0].cost;
        const last = sorted[sorted.length - 1].cost;
        const pct = first > 0 ? ((last - first) / first) * 100 : 0;
        return { id: r.id, name: r.name, first: Math.round(first), last: Math.round(last), pct };
      })
      .filter(Boolean) as { id: string; name: string; first: number; last: number; pct: number }[];
    byVar.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));
    return { byGasto, byVar: byVar.slice(0, 15) };
  }, [lines, productMap]);

  if (loading) return <Skeleton className="h-40 w-full" />;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card>
        <CardHeader><CardTitle className="text-sm">Top por gasto</CardTitle></CardHeader>
        <CardContent className="p-0">
          {byGasto.length === 0 ? <EmptyState text="Sin datos" /> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Insumo</TableHead>
                  <TableHead className="text-right">Unidades</TableHead>
                  <TableHead className="text-right">Gasto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byGasto.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-sm">{r.name}</TableCell>
                    <TableCell className="text-right text-sm">{r.units}</TableCell>
                    <TableCell className="text-right text-sm font-medium">{formatCLP(r.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">Top por variación de precio</CardTitle></CardHeader>
        <CardContent className="p-0">
          {byVar.length === 0 ? <EmptyState text="Sin variaciones (requiere 2+ compras del mismo insumo)" /> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Insumo</TableHead>
                  <TableHead className="text-right">Inicial</TableHead>
                  <TableHead className="text-right">Actual</TableHead>
                  <TableHead className="text-right">Δ %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byVar.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-sm">{r.name}</TableCell>
                    <TableCell className="text-right text-sm">{formatCLP(r.first)}</TableCell>
                    <TableCell className="text-right text-sm">{formatCLP(r.last)}</TableCell>
                    <TableCell className={`text-right text-sm font-medium ${r.pct > 0 ? "text-amber-500" : r.pct < 0 ? "text-emerald-500" : ""}`}>
                      {r.pct > 0 ? "+" : ""}{r.pct.toFixed(1)}%
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="py-3">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="text-xl font-semibold tracking-tight mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="py-8 text-center text-sm text-muted-foreground">{text}</div>;
}
