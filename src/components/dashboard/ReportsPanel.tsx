import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Calendar, ChevronDown, TrendingUp, TrendingDown,
  Clock, DollarSign, XCircle, CreditCard, Banknote, RefreshCw,
  Loader2, FileSpreadsheet, ShoppingCart, Ticket, PieChart, AlertTriangle,
} from "lucide-react";
import { format, parseISO, startOfMonth, endOfMonth } from "date-fns";
import { es } from "date-fns/locale";
import { formatCLP } from "@/lib/currency";
import { calculateCommission, STOCKIA_COMMISSION_RATE, STOCKIA_COMMISSION_LABEL } from "@/lib/commission";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { JornadaCloseSummaryDialog } from "./JornadaCloseSummaryDialog";
import { RedeemReportButton } from "./RedeemReportButton";
import { fetchJornadaLiveReport } from "@/lib/jornada-reporting";
import { JornadaDownloadMenu } from "./reports/JornadaDownloadMenu";
import { generateMonthlyExcelReport, type MonthlyJornadaRow } from "@/lib/reporting/monthly-excel-export";
import { toast } from "sonner";

/* ── types ─────────────────────────────────────────── */

interface FinancialSnap {
  gross_sales_total: number;
  net_sales_total: number;
  expenses_total: number;
  net_operational_result: number;
  cogs_total: number | null;
  gross_margin_pct: number | null;
  cash_difference: number | null;
  tokens_pending_count: number | null;
}

interface JornadaReport {
  id: string;
  numero_jornada: number;
  nombre: string | null;
  fecha: string;
  hora_apertura: string | null;
  hora_cierre: string | null;
  estado: string;
  totalSales: number;
  totalCancelled: number;
  salesCount: number;
  cancelledCount: number;
  alcoholSales: number;
  ticketSales: number;
  cashSales: number;
  cardSales: number;
  otherPayments: number;
  topSellers: { name: string; total: number; count: number }[];
  financial: FinancialSnap | null;
  sales?: SaleDetail[];
}

interface SaleDetail {
  id: string;
  sale_number: string;
  created_at: string;
  total_amount: number;
  point_of_sale: string;
  is_cancelled: boolean;
  sale_category: string;
  payment_method: string;
  seller_name: string;
}

const PAGE_SIZE = 50;

/* ── component ─────────────────────────────────────── */

export function ReportsPanel() {
  const [jornadas, setJornadas] = useState<JornadaReport[]>([]);
  const [prevMonthTotal, setPrevMonthTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedJornada, setExpandedJornada] = useState<string | null>(null);
  const [loadingSales, setLoadingSales] = useState<string | null>(null);
  const [exportingMonth, setExportingMonth] = useState(false);
  const [eerrOpen, setEerrOpen] = useState<{ id: string; num: number; date: string } | null>(null);
  const [monthFilter, setMonthFilter] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });

  const monthOptions = useMemo(() => Array.from({ length: 12 }, (_, i) => {
    const date = new Date();
    date.setMonth(date.getMonth() - i);
    return {
      value: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
      label: format(date, "MMMM yyyy", { locale: es }),
    };
  }), []);

  const monthLabel = monthOptions.find((o) => o.value === monthFilter)?.label || "";

  /* ── data fetch via RPC ── */

  const fetchMonth = useCallback(async () => {
    setLoading(true);
    try {
      const [year, month] = monthFilter.split("-").map(Number);

      const { data, error } = await supabase.rpc("get_monthly_jornadas_summary", {
        p_year: year,
        p_month: month,
      });
      if (error) throw error;

      const reports: JornadaReport[] = (data || []).map((row: any) => ({
        id: row.jornada_id,
        numero_jornada: row.numero_jornada,
        nombre: row.nombre,
        fecha: row.fecha,
        hora_apertura: row.hora_apertura,
        hora_cierre: row.hora_cierre,
        estado: row.estado,
        totalSales: Number(row.total_sales) || 0,
        totalCancelled: Number(row.cancelled_total) || 0,
        salesCount: Number(row.sales_count) || 0,
        cancelledCount: Number(row.cancelled_count) || 0,
        alcoholSales: Number(row.alcohol_sales) || 0,
        ticketSales: Number(row.ticket_sales) || 0,
        cashSales: Number(row.cash_sales) || 0,
        cardSales: Number(row.card_sales) || 0,
        otherPayments: Number(row.other_payments) || 0,
        topSellers: Array.isArray(row.top_sellers) ? row.top_sellers : [],
        financial: row.financial || null,
      }));
      setJornadas(reports);

      // Previous month total (single lightweight call)
      const prevDate = new Date(year, month - 2, 1);
      const { data: prev } = await supabase.rpc("get_monthly_jornadas_summary", {
        p_year: prevDate.getFullYear(),
        p_month: prevDate.getMonth() + 1,
      });
      const prevTotal = (prev || []).reduce((s: number, r: any) => s + Number(r.total_sales || 0), 0);
      setPrevMonthTotal(prevTotal);
    } catch (error) {
      console.error("Error fetching jornadas:", error);
      toast.error("Error al cargar reportes del mes");
    } finally {
      setLoading(false);
    }
  }, [monthFilter]);

  const fetchJornadaSales = async (jornadaId: string) => {
    setLoadingSales(jornadaId);
    try {
      const liveReport = await fetchJornadaLiveReport(jornadaId);
      const salesSlice = liveReport.combinedSales.slice(0, PAGE_SIZE);
      const sellerIds = [...new Set(salesSlice.map((s) => s.sellerId).filter(Boolean))] as string[];
      const { data: profilesData } = sellerIds.length
        ? await supabase.from("profiles").select("id, full_name, email").in("id", sellerIds)
        : { data: [] };
      const profilesMap = new Map((profilesData || []).map((p) => [p.id, p]));

      const salesWithNames: SaleDetail[] = salesSlice.map((sale) => ({
        id: sale.id,
        sale_number: sale.saleNumber,
        created_at: sale.createdAt,
        total_amount: sale.totalAmount,
        point_of_sale: sale.pointOfSale,
        is_cancelled: sale.isCancelled,
        sale_category: sale.saleCategory,
        payment_method: sale.paymentMethod,
        seller_name: profilesMap.get(sale.sellerId || "")?.full_name || profilesMap.get(sale.sellerId || "")?.email || "Desconocido",
      }));

      setJornadas((prev) => prev.map((j) => (j.id === jornadaId ? { ...j, sales: salesWithNames } : j)));
    } catch (error) {
      console.error("Error fetching sales:", error);
    } finally {
      setLoadingSales(null);
    }
  };

  const handleExpand = (jornadaId: string) => {
    if (expandedJornada === jornadaId) {
      setExpandedJornada(null);
    } else {
      setExpandedJornada(jornadaId);
      const j = jornadas.find((r) => r.id === jornadaId);
      if (!j?.sales) fetchJornadaSales(jornadaId);
    }
  };

  const handleExportJornadaCSV = (report: JornadaReport) => {
    if (!report.sales || report.sales.length === 0) {
      toast.info("Expande la jornada y espera la carga de ventas antes de exportar.");
      return;
    }
    const headers = ["Número", "Fecha", "Vendedor", "POS", "Categoría", "Método Pago", "Total", "Estado"];
    const rows = report.sales.map((sale) => [
      sale.sale_number,
      format(new Date(sale.created_at), "dd/MM/yyyy HH:mm"),
      sale.seller_name,
      sale.point_of_sale,
      sale.sale_category === "ticket" ? "Ticket" : "Alcohol",
      sale.payment_method === "cash" ? "Efectivo" : sale.payment_method === "card" ? "Tarjeta" : sale.payment_method,
      sale.total_amount.toString(),
      sale.is_cancelled ? "Cancelada" : "Activa",
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.map((c) => `"${c}"`).join(","))].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `jornada_${report.numero_jornada}_${report.fecha}.csv`;
    link.click();
  };

  const handleExportMonthExcel = async () => {
    if (jornadas.length === 0) return;
    setExportingMonth(true);
    try {
      const rows: MonthlyJornadaRow[] = jornadas.map((j) => ({
        jornada_id: j.id,
        numero_jornada: j.numero_jornada,
        nombre: j.nombre,
        fecha: j.fecha,
        hora_apertura: j.hora_apertura,
        hora_cierre: j.hora_cierre,
        estado: j.estado,
        total_sales: j.totalSales,
        sales_count: j.salesCount,
        cancelled_total: j.totalCancelled,
        cancelled_count: j.cancelledCount,
        alcohol_sales: j.alcoholSales,
        ticket_sales: j.ticketSales,
        cash_sales: j.cashSales,
        card_sales: j.cardSales,
        other_payments: j.otherPayments,
        cogs_total: j.financial?.cogs_total ?? null,
        margin_pct: j.financial?.gross_margin_pct ?? null,
      }));
      generateMonthlyExcelReport({ monthLabel, jornadas: rows });
      toast.success("Excel generado");
    } catch (e) {
      console.error(e);
      toast.error("Error al generar Excel mensual");
    } finally {
      setExportingMonth(false);
    }
  };

  useEffect(() => { fetchMonth(); }, [fetchMonth]);

  /* ── month totals (memoized) ── */

  const totals = useMemo(() => {
    return jornadas.reduce((acc, j) => ({
      totalSales: acc.totalSales + j.totalSales,
      totalCancelled: acc.totalCancelled + j.totalCancelled,
      salesCount: acc.salesCount + j.salesCount,
      cancelledCount: acc.cancelledCount + j.cancelledCount,
      cashSales: acc.cashSales + j.cashSales,
      cardSales: acc.cardSales + j.cardSales,
      cogsTotal: acc.cogsTotal + (j.financial?.cogs_total || 0),
    }), { totalSales: 0, totalCancelled: 0, salesCount: 0, cancelledCount: 0, cashSales: 0, cardSales: 0, cogsTotal: 0 });
  }, [jornadas]);

  const avgMarginPct = totals.totalSales > 0
    ? ((totals.totalSales - totals.cogsTotal) / totals.totalSales) * 100
    : 0;
  const commission = calculateCommission(totals.totalSales);

  const trendPct = useMemo(() => {
    if (prevMonthTotal == null || prevMonthTotal === 0) return null;
    return ((totals.totalSales - prevMonthTotal) / prevMonthTotal) * 100;
  }, [totals.totalSales, prevMonthTotal]);

  /* ── render ── */

  return (
    <div className="space-y-6">
      {/* Header sticky */}
      <div className="sticky top-0 z-10 -mx-3 sm:-mx-0 px-3 sm:px-0 py-3 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border/40">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <h1 className="text-2xl font-bold tracking-tight">Reportes</h1>
            <p className="text-xs text-muted-foreground">Auditoría operativa y descargas por jornada</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={monthFilter} onValueChange={setMonthFilter}>
              <SelectTrigger className="w-[170px] h-9 text-sm">
                <Calendar className="h-3.5 w-3.5 mr-1.5" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {monthOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value} className="capitalize">{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={handleExportMonthExcel} disabled={exportingMonth || loading || jornadas.length === 0}>
              {exportingMonth ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileSpreadsheet className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">Excel del mes</span>
            </Button>
            <Button variant="outline" size="icon" className="h-9 w-9" onClick={fetchMonth} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
      </div>

      {/* KPI Summary */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
        </div>
      ) : jornadas.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-16 flex flex-col items-center gap-3 text-center">
            <Calendar className="w-8 h-8 text-muted-foreground opacity-50" />
            <p className="text-sm text-muted-foreground">No hay jornadas registradas en {monthLabel}.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Resumen del mes</h2>
              <Badge variant="secondary" className="text-[10px] tabular-nums">{jornadas.length} jornadas</Badge>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <KPI
                label="Ventas totales"
                value={formatCLP(totals.totalSales)}
                sub={`${totals.salesCount} transacciones`}
                icon={DollarSign}
                trend={trendPct}
              />
              <KPI
                label="Efectivo"
                value={formatCLP(totals.cashSales)}
                sub={`${totals.totalSales > 0 ? ((totals.cashSales / totals.totalSales) * 100).toFixed(1) : "0"}% del total`}
                icon={Banknote}
              />
              <KPI
                label="Tarjeta"
                value={formatCLP(totals.cardSales)}
                sub={`${totals.totalSales > 0 ? ((totals.cardSales / totals.totalSales) * 100).toFixed(1) : "0"}% del total`}
                icon={CreditCard}
              />
              <KPI
                label={STOCKIA_COMMISSION_LABEL}
                value={formatCLP(commission)}
                sub={`${(STOCKIA_COMMISSION_RATE * 100).toFixed(STOCKIA_COMMISSION_RATE * 100 % 1 === 0 ? 0 : 1)}% sobre ventas brutas`}
                icon={DollarSign}
                accent
              />
            </div>
            {totals.totalCancelled > 0 && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-destructive/20 bg-destructive/5 text-xs">
                <XCircle className="h-3.5 w-3.5 text-destructive" />
                <span className="text-muted-foreground">Cancelaciones del mes:</span>
                <span className="font-semibold text-destructive tabular-nums">{formatCLP(totals.totalCancelled)}</span>
                <span className="text-muted-foreground">· {totals.cancelledCount} ventas</span>
              </div>
            )}
          </section>

          {/* Jornadas list */}
          <section className="space-y-2">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">Jornadas</h2>
            <div className="space-y-2">
              {jornadas.map((report) => (
                <JornadaRow
                  key={report.id}
                  report={report}
                  expanded={expandedJornada === report.id}
                  onToggle={() => handleExpand(report.id)}
                  loadingSales={loadingSales === report.id}
                  onCSV={() => handleExportJornadaCSV(report)}
                  onOpenEERR={() => setEerrOpen({ id: report.id, num: report.numero_jornada, date: report.fecha })}
                />
              ))}
            </div>
          </section>
        </>
      )}

      {eerrOpen && (
        <JornadaCloseSummaryDialog
          open
          onClose={() => setEerrOpen(null)}
          jornadaId={eerrOpen.id}
          jornadaNumber={eerrOpen.num}
          jornadaDate={eerrOpen.date}
        />
      )}
    </div>
  );
}

/* ── KPI Card ── */

function KPI({ label, value, sub, icon: Icon, accent, negative, trend }: {
  label: string; value: string; sub?: string; icon: React.ElementType;
  accent?: boolean; negative?: boolean; trend?: number | null;
}) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4 space-y-1.5">
        <div className="flex items-center justify-between text-muted-foreground">
          <span className="text-[10px] font-medium uppercase tracking-wider">{label}</span>
          <Icon className="h-3.5 w-3.5 opacity-40" />
        </div>
        <p className={`text-xl font-bold tabular-nums leading-tight ${negative ? "text-destructive" : accent ? "text-primary" : "text-foreground"}`}>
          {value}
        </p>
        <div className="flex items-center justify-between gap-2">
          {sub && <p className="text-[11px] text-muted-foreground truncate">{sub}</p>}
          {trend != null && (
            <span className={`flex items-center gap-0.5 text-[10px] font-medium tabular-nums shrink-0 ${trend >= 0 ? "text-primary" : "text-destructive"}`}>
              {trend >= 0 ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
              {Math.abs(trend).toFixed(0)}%
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/* ── Jornada Row ── */

function JornadaRow({
  report, expanded, onToggle, loadingSales, onCSV, onOpenEERR,
}: {
  report: JornadaReport; expanded: boolean; onToggle: () => void;
  loadingSales: boolean; onCSV: () => void; onOpenEERR: () => void;
}) {
  const fin = report.financial;
  const isClosed = report.estado === "cerrada";
  const horario = `${report.hora_apertura?.slice(0, 5) || "--:--"} – ${report.hora_cierre?.slice(0, 5) || "--:--"}`;
  const displayName = report.nombre || `Jornada ${report.numero_jornada}`;

  return (
    <Card className="overflow-hidden">
      <div className="p-3 sm:p-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="text-[11px] font-mono text-muted-foreground">#{report.numero_jornada}</span>
              <span className="font-semibold text-sm truncate">{displayName}</span>
              <Badge variant={isClosed ? "secondary" : "default"} className="text-[10px] px-1.5 py-0 h-4">
                {isClosed ? "Cerrada" : "Abierta"}
              </Badge>
              {fin && (fin as any).requires_review && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-amber-500/40 text-amber-500">
                  <AlertTriangle className="h-2.5 w-2.5 mr-0.5" /> Revisar
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
              <span className="capitalize">{format(parseISO(report.fecha), "EEE d MMM", { locale: es })}</span>
              <span className="flex items-center gap-0.5"><Clock className="h-3 w-3" />{horario}</span>
            </div>
            <div className="flex items-center gap-4 mt-2 text-xs flex-wrap">
              <span className="font-bold text-base tabular-nums">{formatCLP(report.totalSales)}</span>
              <span className="text-muted-foreground">{report.salesCount} ventas</span>
              {report.cancelledCount > 0 && (
                <span className="text-destructive text-[11px]">{report.cancelledCount} canc.</span>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1.5 shrink-0">
            <RedeemReportButton jornadaId={report.id} jornadaNumber={report.numero_jornada} fecha={report.fecha} />
            <JornadaDownloadMenu
              jornadaId={report.id}
              jornadaNumber={report.numero_jornada}
              fecha={report.fecha}
              horario={horario}
              isClosed={isClosed}
              hasFinancial={!!fin}
              onCSV={onCSV}
              onEERR={onOpenEERR}
            />
          </div>
        </div>
      </div>

      <Collapsible open={expanded} onOpenChange={onToggle}>
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center justify-center gap-1 py-1.5 text-[11px] text-muted-foreground hover:bg-muted/50 transition-colors border-t border-border/50">
            <ChevronDown className={`h-3 w-3 transition-transform ${expanded ? "rotate-180" : ""}`} />
            {expanded ? "Ocultar detalle" : "Ver detalle de ventas"}
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="border-t p-3 space-y-3 bg-muted/20">
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 text-xs">
              <KPICell icon={Banknote} label="Efectivo" value={formatCLP(report.cashSales)} />
              <KPICell icon={CreditCard} label="Tarjeta" value={formatCLP(report.cardSales)} />
              <KPICell icon={ShoppingCart} label="Alcohol" value={formatCLP(report.alcoholSales)} />
              <KPICell icon={Ticket} label="Entradas" value={formatCLP(report.ticketSales)} />
              {fin && <KPICell icon={PieChart} label="COGS" value={formatCLP(fin.cogs_total || 0)} />}
              <KPICell icon={XCircle} label="Canceladas" value={`${formatCLP(report.totalCancelled)} (${report.cancelledCount})`} destructive />
            </div>

            {report.topSellers.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap text-[11px]">
                <span className="text-muted-foreground">Top vendedores:</span>
                {report.topSellers.map((s, i) => (
                  <Badge key={i} variant="outline" className="text-[10px] gap-1">
                    {s.name} · <span className="tabular-nums">{formatCLP(s.total)}</span>
                  </Badge>
                ))}
              </div>
            )}

            {loadingSales ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : report.sales && report.sales.length > 0 ? (
              <>
                <div className="border rounded-lg overflow-x-auto bg-background">
                  <Table>
                    <TableHeader>
                      <TableRow className="text-xs">
                        <TableHead className="w-16">Nº</TableHead>
                        <TableHead className="w-16">Hora</TableHead>
                        <TableHead>Vendedor</TableHead>
                        <TableHead>POS</TableHead>
                        <TableHead>Pago</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="w-16">Estado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {report.sales.map((sale) => (
                        <TableRow key={sale.id} className={`text-xs ${sale.is_cancelled ? "opacity-40" : ""}`}>
                          <TableCell className="font-mono text-muted-foreground">{sale.sale_number}</TableCell>
                          <TableCell>{format(new Date(sale.created_at), "HH:mm")}</TableCell>
                          <TableCell className="truncate max-w-[120px]">{sale.seller_name}</TableCell>
                          <TableCell>{sale.point_of_sale}</TableCell>
                          <TableCell>
                            {sale.payment_method === "cash" ? "Efec." : sale.payment_method === "card" ? "Tarjeta" : sale.payment_method}
                          </TableCell>
                          <TableCell className="text-right font-medium tabular-nums">{formatCLP(sale.total_amount)}</TableCell>
                          <TableCell>
                            {sale.is_cancelled ? (
                              <Badge variant="destructive" className="text-[10px]">Cancel.</Badge>
                            ) : (
                              <span className="text-primary text-[10px] font-medium">OK</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {report.sales.length >= PAGE_SIZE && (
                  <p className="text-[10px] text-muted-foreground text-center">Mostrando las primeras {PAGE_SIZE} ventas</p>
                )}
              </>
            ) : (
              <p className="text-center text-muted-foreground py-3 text-sm">No hay ventas registradas</p>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

function KPICell({ icon: Icon, label, value, destructive }: {
  icon: React.ElementType; label: string; value: string; destructive?: boolean;
}) {
  return (
    <div className="p-2 rounded-lg bg-background text-center">
      <div className={`flex items-center justify-center gap-1 mb-0.5 ${destructive ? "text-destructive/70" : "text-muted-foreground"}`}>
        <Icon className="h-3 w-3" />
        <span className="text-[10px]">{label}</span>
      </div>
      <p className={`font-semibold text-xs tabular-nums ${destructive ? "text-destructive" : ""}`}>{value}</p>
    </div>
  );
}
