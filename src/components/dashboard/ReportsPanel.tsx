import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllByIds } from "@/lib/supabase-batch";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Download, Calendar, ChevronDown,
  TrendingUp, ShoppingCart, Ticket, Clock, DollarSign,
  XCircle, CreditCard, Banknote, RefreshCw, FileText,
  Loader2, PieChart, Printer
} from "lucide-react";
import { printPOSSalesReport, type POSSalesData } from "@/lib/printing/pos-sales-report";
import { generateProductSalesPDF, type POSProductBreakdown, type ProductSalesReportData } from "@/lib/reporting/product-sales-pdf";
import { format, parseISO, startOfMonth, endOfMonth } from "date-fns";
import { es } from "date-fns/locale";
import { formatCLP } from "@/lib/currency";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { JornadaCloseSummaryDialog } from "./JornadaCloseSummaryDialog";

/* ── types ─────────────────────────────────────────── */

interface JornadaSummary {
  id: string;
  fecha: string;
  numero_jornada: number;
  nombre?: string;
  semana_inicio: string;
  hora_apertura: string | null;
  hora_cierre: string | null;
  estado: string;
}

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
  jornada: JornadaSummary;
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
  financial?: FinancialSnap | null;
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
  const [loading, setLoading] = useState(true);
  const [expandedJornada, setExpandedJornada] = useState<string | null>(null);
  const [loadingSales, setLoadingSales] = useState<string | null>(null);
  const [eerrOpen, setEerrOpen] = useState<{ id: string; num: number; date: string } | null>(null);
  const [monthFilter, setMonthFilter] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });

  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const date = new Date();
    date.setMonth(date.getMonth() - i);
    return {
      value: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
      label: format(date, "MMMM yyyy", { locale: es }),
    };
  });

  /* ── data fetch ── */

  const fetchJornadasWithSales = useCallback(async () => {
    setLoading(true);
    try {
      const [year, month] = monthFilter.split("-").map(Number);
      const startDate = startOfMonth(new Date(year, month - 1));
      const endDate = endOfMonth(new Date(year, month - 1));

      const { data: jornadasData, error: jornadasError } = await supabase
        .from("jornadas")
        .select("id, fecha, numero_jornada, nombre, semana_inicio, hora_apertura, hora_cierre, estado")
        .gte("fecha", format(startDate, "yyyy-MM-dd"))
        .lte("fecha", format(endDate, "yyyy-MM-dd"))
        .order("fecha", { ascending: false });

      if (jornadasError) throw jornadasError;
      if (!jornadasData || jornadasData.length === 0) {
        setJornadas([]);
        return;
      }

      const jornadaIds = jornadasData.map((j) => j.id);

      const [allSalesData, financialRes, profilesRes] = await Promise.all([
        fetchAllByIds(
          "sales",
          "jornada_id",
          jornadaIds,
          "id, jornada_id, total_amount, is_cancelled, sale_category, payment_method, seller_id"
        ),
        supabase
          .from("jornada_financial_summary")
          .select("jornada_id, gross_sales_total, net_sales_total, expenses_total, net_operational_result, cogs_total, gross_margin_pct, cash_difference, tokens_pending_count")
          .in("jornada_id", jornadaIds)
          .is("pos_id", null),
        supabase
          .from("profiles")
          .select("id, full_name, email"),
      ]);

      if (salesRes.error) throw salesRes.error;

      const salesData = salesRes.data || [];
      const financialMap = new Map<string, FinancialSnap>();
      (financialRes.data || []).forEach((f: Record<string, unknown>) => {
        financialMap.set(f.jornada_id as string, f as unknown as FinancialSnap);
      });

      const profilesMap = new Map(
        (profilesRes.data || []).map((p) => [p.id, p])
      );

      const reports: JornadaReport[] = jornadasData.map((jornada) => {
        const jornadaSales = salesData.filter((s) => s.jornada_id === jornada.id);
        const activeSales = jornadaSales.filter((s) => !s.is_cancelled);
        const cancelledSales = jornadaSales.filter((s) => s.is_cancelled);

        const totalSales = activeSales.reduce((sum, s) => sum + Number(s.total_amount), 0);
        const totalCancelled = cancelledSales.reduce((sum, s) => sum + Number(s.total_amount), 0);
        const alcoholSales = activeSales.filter((s) => s.sale_category === "alcohol").reduce((sum, s) => sum + Number(s.total_amount), 0);
        const ticketSales = activeSales.filter((s) => s.sale_category === "ticket").reduce((sum, s) => sum + Number(s.total_amount), 0);
        const cashSales = activeSales.filter((s) => s.payment_method === "cash").reduce((sum, s) => sum + Number(s.total_amount), 0);
        const cardSales = activeSales.filter((s) => s.payment_method === "card").reduce((sum, s) => sum + Number(s.total_amount), 0);
        const otherPayments = totalSales - cashSales - cardSales;

        const sellerTotals = new Map<string, { total: number; count: number }>();
        activeSales.forEach((sale) => {
          const ex = sellerTotals.get(sale.seller_id) || { total: 0, count: 0 };
          sellerTotals.set(sale.seller_id, { total: ex.total + Number(sale.total_amount), count: ex.count + 1 });
        });
        const topSellers = Array.from(sellerTotals.entries())
          .map(([sid, d]) => ({
            name: profilesMap.get(sid)?.full_name || profilesMap.get(sid)?.email || "Desconocido",
            total: d.total,
            count: d.count,
          }))
          .sort((a, b) => b.total - a.total)
          .slice(0, 3);

        return {
          jornada,
          totalSales,
          totalCancelled,
          salesCount: activeSales.length,
          cancelledCount: cancelledSales.length,
          alcoholSales,
          ticketSales,
          cashSales,
          cardSales,
          otherPayments,
          topSellers,
          financial: financialMap.get(jornada.id) || null,
        };
      });

      setJornadas(reports);
    } catch (error) {
      console.error("Error fetching jornadas:", error);
    } finally {
      setLoading(false);
    }
  }, [monthFilter]);

  const fetchJornadaSales = async (jornadaId: string) => {
    setLoadingSales(jornadaId);
    try {
      const { data: salesData, error } = await supabase
        .from("sales")
        .select("id, sale_number, created_at, total_amount, point_of_sale, is_cancelled, sale_category, payment_method, seller_id")
        .eq("jornada_id", jornadaId)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);

      if (error) throw error;

      const sellerIds = [...new Set(salesData?.map((s) => s.seller_id) || [])];
      const { data: profilesData } = await supabase.from("profiles").select("id, full_name, email").in("id", sellerIds);
      const profilesMap = new Map((profilesData || []).map((p) => [p.id, p]));

      const salesWithNames: SaleDetail[] = (salesData || []).map((sale) => ({
        ...sale,
        seller_name: profilesMap.get(sale.seller_id)?.full_name || profilesMap.get(sale.seller_id)?.email || "Desconocido",
      }));

      setJornadas((prev) => prev.map((j) => (j.jornada.id === jornadaId ? { ...j, sales: salesWithNames } : j)));
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
      const j = jornadas.find((r) => r.jornada.id === jornadaId);
      if (!j?.sales) fetchJornadaSales(jornadaId);
    }
  };

  const handleExportJornada = (report: JornadaReport) => {
    if (!report.sales || report.sales.length === 0) return;
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
    const csvContent = [headers.join(","), ...rows.map((row) => row.map((cell) => `"${cell}"`).join(","))].join("\n");
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `jornada_${report.jornada.numero_jornada}_${report.jornada.fecha}.csv`;
    link.click();
  };

  useEffect(() => {
    fetchJornadasWithSales();
  }, [fetchJornadasWithSales]);

  /* ── month totals ── */

  const monthTotals = jornadas.reduce(
    (acc, j) => ({
      totalSales: acc.totalSales + j.totalSales,
      totalCancelled: acc.totalCancelled + j.totalCancelled,
      salesCount: acc.salesCount + j.salesCount,
      cancelledCount: acc.cancelledCount + j.cancelledCount,
      alcoholSales: acc.alcoholSales + j.alcoholSales,
      ticketSales: acc.ticketSales + j.ticketSales,
      cogsTotal: acc.cogsTotal + (j.financial?.cogs_total || 0),
      netResult: acc.netResult + (j.financial?.net_operational_result || 0),
    }),
    { totalSales: 0, totalCancelled: 0, salesCount: 0, cancelledCount: 0, alcoholSales: 0, ticketSales: 0, cogsTotal: 0, netResult: 0 }
  );

  const avgMargin = monthTotals.totalSales > 0
    ? (((monthTotals.totalSales - monthTotals.cogsTotal) / monthTotals.totalSales) * 100).toFixed(1)
    : "0";

  /* ── render ── */

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight">Reportes</h2>
          <p className="text-muted-foreground text-xs">Descarga reportes de auditoría por jornada</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={monthFilter} onValueChange={setMonthFilter}>
            <SelectTrigger className="w-[170px] h-9 text-sm">
              <Calendar className="h-3.5 w-3.5 mr-1.5" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {monthOptions.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" className="h-9 w-9" onClick={fetchJornadasWithSales} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Month Summary */}
      {!loading && jornadas.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <SummaryCard label="Ventas Brutas" value={formatCLP(monthTotals.totalSales)} sub={`${monthTotals.salesCount} transacciones`} icon={DollarSign} />
          <SummaryCard label="Efectivo / Tarjeta" value={`${formatCLP(jornadas.reduce((s, j) => s + j.cashSales, 0))} / ${formatCLP(jornadas.reduce((s, j) => s + j.cardSales, 0))}`} sub={`${jornadas.length} jornadas`} icon={CreditCard} />
          <SummaryCard label="Margen Bruto" value={`${avgMargin}%`} sub={`COGS ${formatCLP(monthTotals.cogsTotal)}`} icon={TrendingUp} accent={Number(avgMargin) >= 30} />
          <SummaryCard label="Cancelaciones" value={formatCLP(monthTotals.totalCancelled)} sub={`${monthTotals.cancelledCount} ventas`} icon={XCircle} destructive />
        </div>
      )}

      {/* Jornadas List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
        </div>
      ) : jornadas.length === 0 ? (
        <Card className="p-10 text-center">
          <Calendar className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
          <h3 className="font-medium mb-1">Sin jornadas registradas</h3>
          <p className="text-sm text-muted-foreground">No hay jornadas en el período seleccionado</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {jornadas.map((report) => (
            <JornadaReportRow
              key={report.jornada.id}
              report={report}
              expanded={expandedJornada === report.jornada.id}
              onToggle={() => handleExpand(report.jornada.id)}
              loadingSales={loadingSales === report.jornada.id}
              onExport={() => handleExportJornada(report)}
              onOpenEERR={() => setEerrOpen({ id: report.jornada.id, num: report.jornada.numero_jornada, date: report.jornada.fecha })}
            />
          ))}
        </div>
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

/* ── Summary Card ── */

function SummaryCard({ label, value, sub, icon: Icon, accent, destructive }: {
  label: string; value: string; sub: string; icon: React.ElementType; accent?: boolean; destructive?: boolean;
}) {
  return (
    <Card className="p-3">
      <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
        <Icon className="h-3.5 w-3.5" />
        <span className="text-[11px] font-medium uppercase tracking-wider">{label}</span>
      </div>
      <p className={`text-lg font-bold tabular-nums ${destructive ? "text-destructive" : accent ? "text-primary" : ""}`}>{value}</p>
      <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>
    </Card>
  );
}

/* ── Jornada Report Row ── */

function JornadaReportRow({
  report, expanded, onToggle, loadingSales, onExport, onOpenEERR,
}: {
  report: JornadaReport; expanded: boolean; onToggle: () => void;
  loadingSales: boolean; onExport: () => void; onOpenEERR: () => void;
}) {
  const fin = report.financial;
  const isClosed = report.jornada.estado === "cerrada";
  const horario = `${report.jornada.hora_apertura?.slice(0, 5) || "--:--"} – ${report.jornada.hora_cierre?.slice(0, 5) || "--:--"}`;
  const displayName = report.jornada.nombre || `Jornada ${report.jornada.numero_jornada}`;

  return (
    <Card className="overflow-hidden">
      {/* Main row: info + downloads */}
      <div className="p-3 sm:p-4">
        <div className="flex flex-col sm:flex-row sm:items-start gap-3">
          {/* Left: Session info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="text-xs font-mono text-muted-foreground">#{report.jornada.numero_jornada}</span>
              <span className="font-semibold text-sm truncate">{displayName}</span>
              <Badge variant={isClosed ? "secondary" : "default"} className="text-[10px] px-1.5 py-0">
                {isClosed ? "Cerrada" : "Abierta"}
              </Badge>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="capitalize">{format(parseISO(report.jornada.fecha), "EEE d MMM yyyy", { locale: es })}</span>
              <span className="flex items-center gap-0.5"><Clock className="h-3 w-3" />{horario}</span>
            </div>
            {/* Inline KPIs */}
            <div className="flex items-center gap-4 mt-2 text-xs">
              <span className="font-bold text-base tabular-nums">{formatCLP(report.totalSales)}</span>
              <span className="text-muted-foreground">{report.salesCount} ventas</span>
              {fin?.gross_margin_pct != null && (
                <span className={`font-medium ${fin.gross_margin_pct >= 30 ? "text-primary" : "text-destructive"}`}>
                  {fin.gross_margin_pct.toFixed(1)}% margen
                </span>
              )}
            </div>
          </div>

          {/* Right: Download buttons – hero placement */}
          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
            <POSReportButton jornadaId={report.jornada.id} jornadaNumber={report.jornada.numero_jornada} fecha={report.jornada.fecha} horario={horario} />
            <ProductSalesReportButton jornadaId={report.jornada.id} jornadaNumber={report.jornada.numero_jornada} fecha={report.jornada.fecha} horario={horario} />
            {isClosed && (
              <Button variant="outline" size="sm" className="text-xs h-8 gap-1" onClick={(e) => { e.stopPropagation(); onExport(); }}>
                <Download className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">CSV</span>
              </Button>
            )}
            {isClosed && fin && (
              <Button variant="outline" size="sm" className="text-xs h-8 gap-1" onClick={(e) => { e.stopPropagation(); onOpenEERR(); }}>
                <FileText className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">EERR</span>
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Expandable: detail breakdown */}
      <Collapsible open={expanded} onOpenChange={onToggle}>
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center justify-center gap-1 py-1.5 text-[11px] text-muted-foreground hover:bg-muted/50 transition-colors border-t border-border/50">
            <ChevronDown className={`h-3 w-3 transition-transform ${expanded ? "rotate-180" : ""}`} />
            {expanded ? "Ocultar detalle" : "Ver detalle de ventas"}
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="border-t p-3 space-y-3 bg-muted/20">
            {/* KPI grid */}
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-xs">
              <KPICell icon={Banknote} label="Efectivo" value={formatCLP(report.cashSales)} />
              <KPICell icon={CreditCard} label="Tarjeta" value={formatCLP(report.cardSales)} />
              <KPICell icon={ShoppingCart} label="Alcohol" value={formatCLP(report.alcoholSales)} />
              <KPICell icon={Ticket} label="Entradas" value={formatCLP(report.ticketSales)} />
              {fin && <KPICell icon={PieChart} label="COGS" value={formatCLP(fin.cogs_total || 0)} />}
              <KPICell icon={XCircle} label="Canceladas" value={`${formatCLP(report.totalCancelled)} (${report.cancelledCount})`} destructive />
            </div>

            {/* Sales table */}
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

/* ── KPI cell ── */

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

/* ── POS Report Button ── */

function POSReportButton({ jornadaId, jornadaNumber, fecha, horario }: { jornadaId: string; jornadaNumber: number; fecha: string; horario: string }) {
  const [loading, setLoading] = useState(false);

  const handlePrint = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setLoading(true);
    try {
      const { data: sales, error } = await supabase
        .from("sales")
        .select("total_amount, payment_method, point_of_sale, is_cancelled")
        .eq("jornada_id", jornadaId)
        .eq("is_cancelled", false);

      if (error) throw error;
      if (!sales || sales.length === 0) {
        const { toast } = await import("sonner");
        toast.info("No hay ventas en esta jornada");
        return;
      }

      const posMap = new Map<string, { cash: number; cashN: number; card: number; cardN: number; other: number; otherN: number }>();
      for (const s of sales) {
        const pos = s.point_of_sale || "Sin POS";
        const entry = posMap.get(pos) || { cash: 0, cashN: 0, card: 0, cardN: 0, other: 0, otherN: 0 };
        const amt = Number(s.total_amount);
        if (s.payment_method === "cash") { entry.cash += amt; entry.cashN++; }
        else if (s.payment_method === "card") { entry.card += amt; entry.cardN++; }
        else { entry.other += amt; entry.otherN++; }
        posMap.set(pos, entry);
      }

      const posSummary: POSSalesData["posSummary"] = Array.from(posMap.entries())
        .map(([posName, d]) => ({
          posName, cashTotal: d.cash, cashCount: d.cashN, cardTotal: d.card, cardCount: d.cardN,
          otherTotal: d.other, otherCount: d.otherN, total: d.cash + d.card + d.other, totalCount: d.cashN + d.cardN + d.otherN,
        }))
        .sort((a, b) => b.total - a.total);

      printPOSSalesReport({
        jornadaNumber, fecha, horario, posSummary,
        grandTotal: posSummary.reduce((s, p) => s + p.total, 0),
        grandCash: posSummary.reduce((s, p) => s + p.cashTotal, 0),
        grandCard: posSummary.reduce((s, p) => s + p.cardTotal, 0),
        grandOther: posSummary.reduce((s, p) => s + p.otherTotal, 0),
        grandCount: posSummary.reduce((s, p) => s + p.totalCount, 0),
      });
    } catch (err) {
      console.error("Error generating POS report:", err);
      const { toast } = await import("sonner");
      toast.error("Error al generar reporte");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button variant="outline" size="sm" className="text-xs h-8 gap-1" onClick={handlePrint} disabled={loading}>
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5" />}
      POS
    </Button>
  );
}

/* ── Product Count Report Button ── */

function ProductSalesReportButton({ jornadaId, jornadaNumber, fecha, horario }: { jornadaId: string; jornadaNumber: number; fecha: string; horario: string }) {
  const [loading, setLoading] = useState(false);

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setLoading(true);
    try {
      const { data: saleItems, error: itemsErr } = await supabase
        .from("sale_items")
        .select(`cocktail_id, quantity, subtotal, sales!sale_items_sale_id_fkey!inner(jornada_id, is_cancelled, point_of_sale)`)
        .eq("sales.jornada_id", jornadaId)
        .eq("sales.is_cancelled", false);

      if (itemsErr) throw itemsErr;
      if (!saleItems || saleItems.length === 0) {
        const { toast } = await import("sonner");
        toast.info("No hay productos vendidos en esta jornada");
        return;
      }

      const cocktailIds = [...new Set(saleItems.map((i) => i.cocktail_id))];
      const { data: cocktails } = await supabase.from("cocktails").select("id, name, category").in("id", cocktailIds);
      const cocktailMap = new Map((cocktails || []).map((c) => [c.id, c]));

      const posMap = new Map<string, Map<string, { name: string; category: string; qty: number }>>();
      for (const item of saleItems) {
        const sale = item.sales as unknown as { point_of_sale: string };
        const posName = sale.point_of_sale || "Sin POS";
        const cocktail = cocktailMap.get(item.cocktail_id);
        if (!posMap.has(posName)) posMap.set(posName, new Map());
        const prodMap = posMap.get(posName)!;
        const existing = prodMap.get(item.cocktail_id) || { name: cocktail?.name || "Desconocido", category: cocktail?.category || "otros", qty: 0 };
        existing.qty += Number(item.quantity) || 0;
        prodMap.set(item.cocktail_id, existing);
      }

      const posSections: POSProductBreakdown[] = Array.from(posMap.entries())
        .map(([posName, prodMap]) => {
          const products = Array.from(prodMap.values())
            .map((p) => ({ cocktailName: p.name, category: p.category, quantity: p.qty }))
            .sort((a, b) => b.quantity - a.quantity);
          return { posName, products, totalUnits: products.reduce((s, p) => s + p.quantity, 0) };
        })
        .sort((a, b) => b.totalUnits - a.totalUnits);

      generateProductSalesPDF({ jornadaNumber, fecha, horario, posSections, grandTotalUnits: posSections.reduce((s, p) => s + p.totalUnits, 0) });

      const { toast } = await import("sonner");
      toast.success("Reporte de conteo enviado a impresión");
    } catch (err) {
      console.error("Error generating product sales PDF:", err);
      const { toast } = await import("sonner");
      toast.error("Error al generar reporte");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button variant="outline" size="sm" className="text-xs h-8 gap-1" onClick={handleDownload} disabled={loading}>
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
      Conteo
    </Button>
  );
}
