import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Download, Calendar, ChevronDown, ChevronRight,
  TrendingUp, ShoppingCart, Ticket, Clock, DollarSign,
  XCircle, CreditCard, Banknote, RefreshCw, FileText,
  Loader2, PieChart, Printer
} from "lucide-react";
import { printPOSSalesReport, type POSSalesData } from "@/lib/printing/pos-sales-report";
import { format, parseISO, startOfMonth, endOfMonth } from "date-fns";
import { es } from "date-fns/locale";
import { formatCLP } from "@/lib/currency";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { JornadaCloseSummaryDialog } from "./JornadaCloseSummaryDialog";

/* ── types ─────────────────────────────────────────── */

interface JornadaSummary {
  id: string;
  fecha: string;
  numero_jornada: number;
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
        .select("id, fecha, numero_jornada, semana_inicio, hora_apertura, hora_cierre, estado")
        .gte("fecha", format(startDate, "yyyy-MM-dd"))
        .lte("fecha", format(endDate, "yyyy-MM-dd"))
        .order("fecha", { ascending: false });

      if (jornadasError) throw jornadasError;
      if (!jornadasData || jornadasData.length === 0) {
        setJornadas([]);
        return;
      }

      const jornadaIds = jornadasData.map((j) => j.id);

      // Parallel: sales + financial summaries
      const [salesRes, financialRes, profilesRes] = await Promise.all([
        supabase
          .from("sales")
          .select("id, jornada_id, total_amount, is_cancelled, sale_category, payment_method, seller_id")
          .in("jornada_id", jornadaIds),
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
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Reportes por Jornada</h2>
          <p className="text-muted-foreground text-xs">Ventas y resultados financieros por jornada operativa</p>
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

      {/* Month Summary – compact strip */}
      {!loading && jornadas.length > 0 && (
        <Card className="p-3">
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 text-center text-sm">
            <Metric icon={DollarSign} label="Ventas" value={formatCLP(monthTotals.totalSales)} color="text-primary" />
            <Metric icon={ShoppingCart} label="Alcohol" value={formatCLP(monthTotals.alcoholSales)} color="text-emerald-600" />
            <Metric icon={Ticket} label="Entradas" value={formatCLP(monthTotals.ticketSales)} color="text-amber-600" />
            <Metric icon={PieChart} label="COGS" value={formatCLP(monthTotals.cogsTotal)} color="text-muted-foreground" />
            <Metric icon={TrendingUp} label="Margen" value={`${avgMargin}%`} color={Number(avgMargin) >= 30 ? "text-primary" : "text-destructive"} />
            <Metric icon={XCircle} label="Cancel." value={formatCLP(monthTotals.totalCancelled)} color="text-destructive" />
          </div>
        </Card>
      )}

      {/* Jornadas List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
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
            <JornadaRow
              key={report.jornada.id}
              report={report}
              expanded={expandedJornada === report.jornada.id}
              onToggle={() => handleExpand(report.jornada.id)}
              loadingSales={loadingSales === report.jornada.id}
              onExport={() => handleExportJornada(report)}
              onOpenEERR={() =>
                setEerrOpen({
                  id: report.jornada.id,
                  num: report.jornada.numero_jornada,
                  date: report.jornada.fecha,
                })
              }
            />
          ))}
        </div>
      )}

      {/* EERR Dialog */}
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

/* ── small metric helper ── */

function Metric({ icon: Icon, label, value, color }: { icon: React.ElementType; label: string; value: string; color: string }) {
  return (
    <div>
      <div className="flex items-center justify-center gap-1 text-muted-foreground mb-0.5">
        <Icon className="h-3 w-3" />
        <span className="text-[10px] uppercase tracking-wide">{label}</span>
      </div>
      <p className={`font-semibold text-sm ${color}`}>{value}</p>
    </div>
  );
}

/* ── jornada row ── */

function JornadaRow({
  report,
  expanded,
  onToggle,
  loadingSales,
  onExport,
  onOpenEERR,
}: {
  report: JornadaReport;
  expanded: boolean;
  onToggle: () => void;
  loadingSales: boolean;
  onExport: () => void;
  onOpenEERR: () => void;
}) {
  const fin = report.financial;
  const isClosed = report.jornada.estado === "cerrada";
  const hasCashIssue = fin && Math.abs(fin.cash_difference || 0) > 0.01;
  const hasPendingTokens = (fin?.tokens_pending_count || 0) > 0;

  return (
    <Collapsible open={expanded} onOpenChange={onToggle}>
      <Card className="overflow-hidden">
        <CollapsibleTrigger asChild>
          <button className="w-full p-3 flex items-center gap-3 hover:bg-muted/50 transition-colors text-left">
            {/* Jornada badge */}
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex flex-col items-center justify-center shrink-0">
              <span className="text-[10px] text-muted-foreground leading-none">J</span>
              <span className="text-base font-bold text-primary leading-none">{report.jornada.numero_jornada}</span>
            </div>

            {/* Info */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-semibold text-sm">
                  {format(parseISO(report.jornada.fecha), "EEE d MMM", { locale: es })}
                </span>
                <Badge variant={isClosed ? "secondary" : "default"} className="text-[10px] px-1.5 py-0">
                  {isClosed ? "Cerrada" : "Abierta"}
                </Badge>
                {hasCashIssue && (
                  <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                    Δ caja
                  </Badge>
                )}
                {hasPendingTokens && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-500 text-amber-600">
                    {fin!.tokens_pending_count} pendientes
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                <span className="flex items-center gap-0.5">
                  <Clock className="h-3 w-3" />
                  {report.jornada.hora_apertura?.slice(0, 5) || "--:--"} – {report.jornada.hora_cierre?.slice(0, 5) || "--:--"}
                </span>
                <span>{report.salesCount} ventas</span>
              </div>
            </div>

            {/* Desktop: quick financial strip */}
            <div className="hidden md:flex items-center gap-4 text-right text-xs">
              <div>
                <p className="text-muted-foreground">Alcohol</p>
                <p className="font-medium text-emerald-600">{formatCLP(report.alcoholSales)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Entradas</p>
                <p className="font-medium text-amber-600">{formatCLP(report.ticketSales)}</p>
              </div>
              {fin && (
                <div>
                  <p className="text-muted-foreground">Margen</p>
                  <p className={`font-medium ${(fin.gross_margin_pct || 0) >= 30 ? "text-primary" : "text-destructive"}`}>
                    {fin.gross_margin_pct?.toFixed(1) || "—"}%
                  </p>
                </div>
              )}
              <div>
                <p className="text-muted-foreground">Total</p>
                <p className="font-bold text-sm">{formatCLP(report.totalSales)}</p>
              </div>
            </div>

            {/* Mobile total */}
            <div className="md:hidden text-right shrink-0">
              <p className="font-bold text-sm">{formatCLP(report.totalSales)}</p>
              {fin && (
                <p className={`text-[10px] ${(fin.gross_margin_pct || 0) >= 30 ? "text-primary" : "text-destructive"}`}>
                  {fin.gross_margin_pct?.toFixed(1)}% margen
                </p>
              )}
            </div>

            <div className="shrink-0">
              {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            </div>
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="border-t p-3 space-y-3 bg-muted/30">
            {/* KPI grid */}
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-xs">
              <KPICell icon={Banknote} label="Efectivo" value={formatCLP(report.cashSales)} />
              <KPICell icon={CreditCard} label="Tarjeta" value={formatCLP(report.cardSales)} />
              <KPICell icon={DollarSign} label="Otros" value={formatCLP(report.otherPayments)} />
              <KPICell icon={XCircle} label="Canceladas" value={`${formatCLP(report.totalCancelled)} (${report.cancelledCount})`} destructive />
              {fin && <KPICell icon={PieChart} label="COGS" value={formatCLP(fin.cogs_total || 0)} />}
              {fin && (
                <KPICell
                  icon={TrendingUp}
                  label="Resultado"
                  value={formatCLP(fin.net_operational_result)}
                  color={fin.net_operational_result >= 0 ? "text-primary" : "text-destructive"}
                />
              )}
            </div>

            {/* Action buttons */}
            <div className="flex gap-2">
              {isClosed && fin && (
                <Button variant="outline" size="sm" className="text-xs h-7" onClick={(e) => { e.stopPropagation(); onOpenEERR(); }}>
                  <FileText className="h-3 w-3 mr-1" />
                  Ver EERR
                </Button>
              )}
            </div>

            {/* Sales table */}
            {loadingSales ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : report.sales && report.sales.length > 0 ? (
              <>
                <div className="flex justify-between items-center">
                  <h4 className="font-medium text-sm">Detalle de Ventas</h4>
                  <Button variant="outline" size="sm" className="text-xs h-7" onClick={onExport}>
                    <Download className="h-3 w-3 mr-1" />
                    CSV
                  </Button>
                </div>
                <div className="border rounded-lg overflow-x-auto bg-background">
                  <Table>
                    <TableHeader>
                      <TableRow className="text-xs">
                        <TableHead>Nº</TableHead>
                        <TableHead>Hora</TableHead>
                        <TableHead>Vendedor</TableHead>
                        <TableHead>POS</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Pago</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead>Estado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {report.sales.map((sale) => (
                        <TableRow key={sale.id} className={`text-xs ${sale.is_cancelled ? "opacity-50" : ""}`}>
                          <TableCell className="font-mono">{sale.sale_number}</TableCell>
                          <TableCell>{format(new Date(sale.created_at), "HH:mm")}</TableCell>
                          <TableCell>{sale.seller_name}</TableCell>
                          <TableCell>{sale.point_of_sale}</TableCell>
                          <TableCell>
                            <Badge variant={sale.sale_category === "ticket" ? "secondary" : "outline"} className="text-[10px]">
                              {sale.sale_category === "ticket" ? "Ticket" : "Alcohol"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {sale.payment_method === "cash" ? "Efec." : sale.payment_method === "card" ? "Tarjeta" : sale.payment_method}
                          </TableCell>
                          <TableCell className="text-right font-medium">{formatCLP(sale.total_amount)}</TableCell>
                          <TableCell>
                            {sale.is_cancelled ? (
                              <Badge variant="destructive" className="text-[10px]">Cancel.</Badge>
                            ) : (
                              <Badge variant="default" className="text-[10px]">OK</Badge>
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
      </Card>
    </Collapsible>
  );
}

/* ── KPI cell helper ── */

function KPICell({
  icon: Icon,
  label,
  value,
  destructive = false,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  destructive?: boolean;
  color?: string;
}) {
  return (
    <div className="p-2 rounded-lg bg-background text-center">
      <div className={`flex items-center justify-center gap-1 mb-0.5 ${destructive ? "text-destructive/70" : "text-muted-foreground"}`}>
        <Icon className="h-3 w-3" />
        <span className="text-[10px]">{label}</span>
      </div>
      <p className={`font-semibold text-xs ${destructive ? "text-destructive" : color || ""}`}>{value}</p>
    </div>
  );
}
