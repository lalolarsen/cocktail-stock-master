import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useFinanceMTD } from "@/hooks/useFinanceMTD";
import { formatCLP } from "@/lib/currency";
import { DEFAULT_VENUE_ID } from "@/lib/venue";
import {
  TrendingUp, TrendingDown, DollarSign, Receipt,
  CalendarClock, AlertCircle, AlertTriangle,
  Scale, Landmark, Trash2, FileEdit, Gift, Monitor,
  CreditCard, Banknote, ShoppingBag,
} from "lucide-react";

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

/* ── Metric Card ── */
function MetricCard({ label, value, sub, icon: Icon, negative }: {
  label: string; value: string; sub?: string; icon: React.ElementType; negative?: boolean;
}) {
  return (
    <Card className="relative overflow-hidden">
      <CardContent className="p-5 flex items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">{label}</p>
          <p className={`text-2xl font-bold tabular-nums leading-tight ${negative ? "text-destructive" : "text-foreground"}`}>{value}</p>
          {sub && <p className={`text-sm font-medium ${negative ? "text-destructive" : "text-muted-foreground"}`}>{sub}</p>}
        </div>
        <Icon className={`w-5 h-5 shrink-0 mt-0.5 opacity-30 ${negative ? "text-destructive" : "text-muted-foreground"}`} />
      </CardContent>
    </Card>
  );
}

function StatementRow({ label, value, bold, negative, indent }: {
  label: string; value: number; bold?: boolean; negative?: boolean; indent?: boolean;
}) {
  return (
    <div className={`flex justify-between items-center py-1 ${indent ? "pl-4" : ""} ${bold ? "font-semibold" : "text-sm"}`}>
      <span className={negative ? "text-destructive" : "text-muted-foreground"}>{label}</span>
      <span className={`tabular-nums ${negative ? "text-destructive font-medium" : ""} ${bold ? "text-foreground" : ""}`}>
        {formatCLP(value)}
      </span>
    </div>
  );
}

/* ── Horizontal bar ── */
function HBar({ label, value, max, sub, color = "bg-primary" }: {
  label: string; value: number; max: number; sub?: string; color?: string;
}) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-28 sm:w-36 truncate text-muted-foreground text-xs">{label}</span>
      <div className="flex-1 h-6 bg-muted rounded overflow-hidden relative">
        <div className={`h-full ${color} rounded transition-all duration-300`} style={{ width: `${pct}%` }} />
        <span className="absolute inset-0 flex items-center justify-end pr-2 text-[11px] font-medium text-foreground tabular-nums">
          {sub || formatCLP(value)}
        </span>
      </div>
    </div>
  );
}

/* ── POS & Top Products types ── */
interface POSSales {
  posId: string;
  posName: string;
  cash: number;
  card: number;
  total: number;
  transactions: number;
}

interface TopProduct {
  id: string;
  name: string;
  quantity: number;
  revenue: number;
}

export function FinancePanel() {
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());
  const [selectedYear] = useState(now.getFullYear());
  const [pendingReviewCount, setPendingReviewCount] = useState(0);

  // POS breakdown & top products
  const [posSales, setPosSales] = useState<POSSales[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [extraLoading, setExtraLoading] = useState(true);

  const mtd = useFinanceMTD(selectedYear, selectedMonth);

  useEffect(() => {
    supabase
      .from("jornadas")
      .select("*", { count: "exact", head: true })
      .eq("requires_review", true)
      .then(({ count }) => setPendingReviewCount(count || 0));
  }, []);

  // Fetch POS breakdown & top products for the selected month
  useEffect(() => {
    fetchPOSAndProducts();
  }, [selectedMonth, selectedYear]);

  const fetchPOSAndProducts = async () => {
    setExtraLoading(true);
    const venueId = DEFAULT_VENUE_ID;
    const startDate = `${selectedYear}-${String(selectedMonth + 1).padStart(2, "0")}-01`;
    const endDay = new Date(selectedYear, selectedMonth + 1, 0).getDate();
    const endDate = `${selectedYear}-${String(selectedMonth + 1).padStart(2, "0")}-${String(endDay).padStart(2, "0")}`;
    const fromISO = `${startDate}T00:00:00`;
    const toISO = `${endDate}T23:59:59`;

    try {
      const [posRes, salesRes] = await Promise.all([
        supabase.from("pos_terminals").select("id, name, pos_type").eq("venue_id", venueId).eq("is_active", true),
        supabase.from("sales").select("id, pos_id, total_amount, payment_method")
          .eq("venue_id", venueId).eq("payment_status", "paid").eq("is_cancelled", false)
          .gte("created_at", fromISO).lte("created_at", toISO),
      ]);

      // POS breakdown
      const posMap = new Map<string, POSSales>();
      posRes.data?.forEach(pos => {
        posMap.set(pos.id, { posId: pos.id, posName: pos.name, cash: 0, card: 0, total: 0, transactions: 0 });
      });
      salesRes.data?.forEach(s => {
        if (s.pos_id && posMap.has(s.pos_id)) {
          const p = posMap.get(s.pos_id)!;
          const amt = Number(s.total_amount || 0);
          p.total += amt;
          p.transactions += 1;
          if (s.payment_method === "cash") p.cash += amt;
          else p.card += amt;
        }
      });
      setPosSales(Array.from(posMap.values()).filter(p => p.transactions > 0).sort((a, b) => b.total - a.total));

      // Top products
      const saleIds = salesRes.data?.map(s => s.id) || [];
      if (saleIds.length > 0) {
        // Batch in chunks of 500 to avoid query limits
        const allItems: any[] = [];
        for (let i = 0; i < saleIds.length; i += 500) {
          const chunk = saleIds.slice(i, i + 500);
          const { data: items } = await supabase
            .from("sale_items")
            .select("quantity, subtotal, cocktail:cocktails(id, name)")
            .in("sale_id", chunk);
          if (items) allItems.push(...items);
        }

        const prodMap = new Map<string, TopProduct>();
        allItems.forEach(item => {
          if (!item.cocktail) return;
          const c = item.cocktail as { id: string; name: string };
          if (prodMap.has(c.id)) {
            const e = prodMap.get(c.id)!;
            e.quantity += item.quantity;
            e.revenue += Number(item.subtotal);
          } else {
            prodMap.set(c.id, { id: c.id, name: c.name, quantity: item.quantity, revenue: Number(item.subtotal) });
          }
        });
        setTopProducts(Array.from(prodMap.values()).sort((a, b) => b.quantity - a.quantity).slice(0, 10));
      } else {
        setTopProducts([]);
      }
    } catch (e) {
      console.error("Finance POS/Products fetch error:", e);
    } finally {
      setExtraLoading(false);
    }
  };

  const hasPassline = mtd.passlineSalesGross > 0;
  const hasAnyData = mtd.salesGross > 0 || mtd.cogsTotal > 0 || mtd.specificTaxTotal > 0 || mtd.wasteTotal > 0 || mtd.manualIncomeTotal > 0 || hasPassline;
  const noDataAtAll = !mtd.loading && !hasAnyData;
  const hasSales = mtd.salesGross > 0 || hasPassline;

  const displayCogs = hasSales ? mtd.cogsTotal : 0;
  const displayWaste = mtd.wasteTotal;
  const totalSalesNet = mtd.salesNet + mtd.passlineSalesNet;
  const totalCogs = displayCogs + mtd.passlineCogs;
  const displayGrossMargin = hasSales ? (totalSalesNet - totalCogs - displayWaste) : -displayWaste;
  const displayMarginPct = totalSalesNet > 0 ? (displayGrossMargin / totalSalesNet) * 100 : 0;
  const displayMarginPostTax = displayGrossMargin - mtd.specificTaxTotal;

  const maxPOS = posSales[0]?.total || 1;
  const maxQty = topProducts[0]?.quantity || 1;
  const totalPOSCash = posSales.reduce((s, p) => s + p.cash, 0);
  const totalPOSCard = posSales.reduce((s, p) => s + p.card, 0);

  return (
    <div className="space-y-10">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Finanzas</h1>
          <p className="text-sm text-muted-foreground">Estado de resultados mes a la fecha</p>
        </div>
        <Select value={String(selectedMonth)} onValueChange={(v) => setSelectedMonth(Number(v))}>
          <SelectTrigger className="w-[150px] h-9 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MONTHS.map((m, i) => (
              <SelectItem key={i} value={String(i)}>{m} {selectedYear}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {pendingReviewCount > 0 && (
        <Alert className="border-destructive/50 bg-destructive/10">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          <AlertDescription className="text-destructive">
            <strong>{pendingReviewCount} jornada{pendingReviewCount > 1 ? "s" : ""} pendiente{pendingReviewCount > 1 ? "s" : ""} de revisión.</strong>
          </AlertDescription>
        </Alert>
      )}

      {mtd.loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}><CardContent className="p-5 space-y-2"><Skeleton className="h-3 w-24" /><Skeleton className="h-7 w-32" /></CardContent></Card>
          ))}
        </div>
      ) : noDataAtAll ? (
        <Card className="border-dashed">
          <CardContent className="py-16 flex flex-col items-center gap-3 text-center">
            <AlertCircle className="w-8 h-8 text-muted-foreground opacity-50" />
            <p className="text-sm text-muted-foreground">Aún no hay datos en el periodo seleccionado.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* ── KPI Cards ── */}
          <section className="space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Estado de Resultados (MTD)
              </h2>
              <Badge variant="secondary" className="text-xs font-medium tabular-nums">
                Margen {displayMarginPct.toFixed(1)}%
              </Badge>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <MetricCard label="Ventas totales (con IVA)" value={formatCLP(mtd.salesGross)} icon={DollarSign} />
              <MetricCard label="IVA Débito Fiscal" value={formatCLP(mtd.ivaDebito)} icon={Scale} />
              <MetricCard label="Ventas netas (sin IVA)" value={formatCLP(mtd.salesNet)} icon={DollarSign} />
              <MetricCard label="COGS (neto)" value={formatCLP(displayCogs)} icon={Receipt} />
              {hasPassline && (
                <MetricCard
                  label="Ventas Totems Passline"
                  value={formatCLP(mtd.passlineSalesGross)}
                  sub={`COGS: ${formatCLP(mtd.passlineCogs)} | Margen: ${formatCLP(mtd.passlineMargin)}`}
                  icon={Monitor}
                />
              )}
              {displayWaste > 0 && (
                <MetricCard label="Merma" value={formatCLP(displayWaste)} icon={Trash2} negative />
              )}
              <MetricCard
                label="Margen Bruto"
                value={formatCLP(displayGrossMargin)}
                sub={`${displayMarginPct.toFixed(1)}%`}
                icon={TrendingUp}
                negative={displayGrossMargin < 0}
              />
              <MetricCard label="Imp. específicos" value={formatCLP(mtd.specificTaxTotal)} icon={Landmark} />
              <MetricCard
                label="Margen post impuestos"
                value={formatCLP(displayMarginPostTax)}
                icon={displayMarginPostTax >= 0 ? TrendingUp : TrendingDown}
                negative={displayMarginPostTax < 0}
              />
            </div>
          </section>

          {/* ── Detalle completo ── */}
          <section className="space-y-4">
            <Card>
              <CardContent className="p-5 space-y-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  Detalle completo
                </p>

                <StatementRow label="Ventas totales (con IVA)" value={mtd.salesGross} />
                <StatementRow label="IVA débito fiscal" value={-mtd.ivaDebito} indent />
                <StatementRow label="Ventas netas (sin IVA)" value={mtd.salesNet} bold />

                {mtd.manualIncomeTotal > 0 && (
                  <>
                    <div className="border-t my-2" />
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mt-2 mb-1 flex items-center gap-1.5">
                      <FileEdit className="h-3.5 w-3.5" /> Ingresos Brutos Declarados
                    </p>
                    {mtd.manualIncomeEntries.map((entry) => (
                      <div key={entry.id} className="flex justify-between items-center py-1 pl-4 text-sm">
                        <span className="text-muted-foreground truncate mr-2">{entry.entry_date} — {entry.description || "Sin motivo"}</span>
                        <span className="tabular-nums text-green-600 font-medium shrink-0">{formatCLP(entry.amount)}</span>
                      </div>
                    ))}
                    <StatementRow label="Total ingresos declarados" value={mtd.manualIncomeTotal} bold />
                  </>
                )}

                <div className="border-t my-2" />

                {!hasSales ? (
                  <p className="text-sm text-muted-foreground py-1 italic">Sin ventas en el período</p>
                ) : (
                  <>
                    <StatementRow label="Costo de ventas (COGS neto)" value={-displayCogs} negative />
                    {mtd.courtesyCogsTotal > 0 && (
                      <div className="flex justify-between items-center py-1 pl-4 text-sm">
                        <span className="text-muted-foreground flex items-center gap-1.5">
                          <Gift className="h-3.5 w-3.5 text-purple-500" /> COGS Cortesías (incluido)
                        </span>
                        <span className="tabular-nums text-muted-foreground font-medium">{formatCLP(mtd.courtesyCogsTotal)}</span>
                      </div>
                    )}
                  </>
                )}

                {displayWaste > 0 && (
                  <div className="flex justify-between items-center py-1 pl-4 text-sm">
                    <span className="text-destructive flex items-center gap-1.5">
                      <Trash2 className="h-3.5 w-3.5" /> Merma
                    </span>
                    <span className="tabular-nums text-destructive font-medium">{formatCLP(-displayWaste)}</span>
                  </div>
                )}

                {hasSales && <StatementRow label="Margen bruto" value={displayGrossMargin} bold negative={displayGrossMargin < 0} />}

                <div className="border-t my-2" />
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mt-2 mb-1">
                  Impuestos Específicos (ILA / IABA)
                </p>
                {mtd.specificTaxBreakdown.iaba_10 > 0 && <StatementRow label="IABA 10%" value={-mtd.specificTaxBreakdown.iaba_10} indent negative />}
                {mtd.specificTaxBreakdown.iaba_18 > 0 && <StatementRow label="IABA 18%" value={-mtd.specificTaxBreakdown.iaba_18} indent negative />}
                {mtd.specificTaxBreakdown.ila_vino > 0 && <StatementRow label="ILA Vino 20,5%" value={-mtd.specificTaxBreakdown.ila_vino} indent negative />}
                {mtd.specificTaxBreakdown.ila_cerveza > 0 && <StatementRow label="ILA Cerveza 20,5%" value={-mtd.specificTaxBreakdown.ila_cerveza} indent negative />}
                {mtd.specificTaxBreakdown.ila_destilados > 0 && <StatementRow label="ILA Destilados 31,5%" value={-mtd.specificTaxBreakdown.ila_destilados} indent negative />}
                <StatementRow label="Total impuestos específicos" value={-mtd.specificTaxTotal} bold negative />
                <StatementRow label="Margen post impuestos" value={displayMarginPostTax} bold negative={displayMarginPostTax < 0} />

                <div className="border-t border-dashed my-3" />
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Bloque Tributario</p>
                <StatementRow label="IVA débito fiscal (ventas)" value={mtd.ivaDebito} indent />
                <StatementRow label="IVA crédito (facturas legacy)" value={-mtd.ivaCreditoFacturas} indent />
                {mtd.ivaCreditoFromImports > 0 && <StatementRow label="IVA crédito (importaciones)" value={-mtd.ivaCreditoFromImports} indent />}
                <StatementRow label="IVA neto del periodo" value={mtd.ivaNeto} bold negative={mtd.ivaNeto > 0} />
              </CardContent>
            </Card>
          </section>

          {/* ── Ventas por POS ── */}
          <section className="space-y-4">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Desglose por Punto de Venta
            </h2>
            {extraLoading ? (
              <Skeleton className="h-40 rounded-lg" />
            ) : posSales.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-8 text-center text-muted-foreground text-sm">Sin ventas por POS</CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* POS bars */}
                <Card>
                  <CardContent className="p-5 space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                      Ventas totales por POS
                    </p>
                    {posSales.map(pos => (
                      <HBar key={pos.posId} label={pos.posName} value={pos.total} max={maxPOS} />
                    ))}
                  </CardContent>
                </Card>

                {/* Cash vs Card per POS */}
                <Card>
                  <CardContent className="p-5 space-y-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                      Efectivo vs Tarjeta por POS
                    </p>
                    {posSales.map(pos => (
                      <div key={pos.posId} className="space-y-1">
                        <p className="text-xs font-medium text-foreground">{pos.posName}</p>
                        <div className="flex gap-2">
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Banknote className="w-3.5 h-3.5" />
                            <span className="tabular-nums font-medium text-foreground">{formatCLP(pos.cash)}</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <CreditCard className="w-3.5 h-3.5" />
                            <span className="tabular-nums font-medium text-foreground">{formatCLP(pos.card)}</span>
                          </div>
                        </div>
                        {/* Mini stacked bar */}
                        <div className="flex h-3 rounded overflow-hidden bg-muted">
                          {pos.total > 0 && (
                            <>
                              <div className="bg-emerald-500 transition-all" style={{ width: `${(pos.cash / pos.total) * 100}%` }} />
                              <div className="bg-blue-500 transition-all" style={{ width: `${(pos.card / pos.total) * 100}%` }} />
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                    <div className="flex gap-4 pt-2 text-[10px] text-muted-foreground border-t mt-2">
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-500" /> Efectivo {formatCLP(totalPOSCash)}</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-blue-500" /> Tarjeta {formatCLP(totalPOSCard)}</span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </section>

          {/* ── Top Productos ── */}
          <section className="space-y-4">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <ShoppingBag className="w-4 h-4" />
              Productos más vendidos del mes
            </h2>
            {extraLoading ? (
              <Skeleton className="h-40 rounded-lg" />
            ) : topProducts.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-8 text-center text-muted-foreground text-sm">Sin productos vendidos</CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-5 space-y-2">
                  {topProducts.map((p, i) => (
                    <HBar
                      key={p.id}
                      label={`${i + 1}. ${p.name}`}
                      value={p.quantity}
                      max={maxQty}
                      sub={`${p.quantity} uds · ${formatCLP(p.revenue)}`}
                    />
                  ))}
                </CardContent>
              </Card>
            )}
          </section>

          {/* ── Proyección ── */}
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <CalendarClock className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Proyección al cierre del mes
              </h2>
            </div>
            <Card className="bg-muted/40 border-border/50">
              <CardContent className="p-6 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <MetricCard label="Ventas proyectadas" value={formatCLP(mtd.salesForecast)} icon={DollarSign} />
                  <MetricCard label="COGS proyectado" value={formatCLP(mtd.cogsForecast)} icon={Receipt} />
                  <MetricCard
                    label="Margen Bruto proyectado"
                    value={formatCLP(mtd.grossProfitForecast)}
                    sub={`${mtd.grossMarginPctForecast.toFixed(1)}%`}
                    icon={TrendingUp}
                    negative={mtd.grossProfitForecast < 0}
                  />
                  <MetricCard label="Imp. específicos proy." value={formatCLP(mtd.specificTaxForecast)} icon={Landmark} />
                </div>
                <p className="text-xs text-muted-foreground">
                  Promedio diario ({mtd.daysElapsed}/{mtd.daysInMonth} días).
                </p>
              </CardContent>
            </Card>
          </section>
        </>
      )}
    </div>
  );
}
