import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Download, Loader2, Calendar, ChevronDown, ChevronRight,
  TrendingUp, ShoppingCart, Ticket, Clock, Users, DollarSign,
  XCircle, CreditCard, Banknote, RefreshCw
} from "lucide-react";
import { format, parseISO, startOfMonth, endOfMonth } from "date-fns";
import { es } from "date-fns/locale";
import { formatCLP } from "@/lib/currency";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

interface JornadaSummary {
  id: string;
  fecha: string;
  numero_jornada: number;
  semana_inicio: string;
  hora_apertura: string | null;
  hora_cierre: string | null;
  estado: string;
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

export function ReportsPanel() {
  const [jornadas, setJornadas] = useState<JornadaReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedJornada, setExpandedJornada] = useState<string | null>(null);
  const [loadingSales, setLoadingSales] = useState<string | null>(null);
  const [monthFilter, setMonthFilter] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  // Generate last 12 months for filter
  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const date = new Date();
    date.setMonth(date.getMonth() - i);
    return {
      value: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
      label: format(date, "MMMM yyyy", { locale: es }),
    };
  });

  const fetchJornadasWithSales = async () => {
    setLoading(true);
    try {
      const [year, month] = monthFilter.split("-").map(Number);
      const startDate = startOfMonth(new Date(year, month - 1));
      const endDate = endOfMonth(new Date(year, month - 1));

      // Fetch jornadas for the month
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

      // Fetch all sales for these jornadas
      const jornadaIds = jornadasData.map(j => j.id);
      
      const { data: salesData, error: salesError } = await supabase
        .from("sales")
        .select("id, jornada_id, total_amount, is_cancelled, sale_category, payment_method, seller_id")
        .in("jornada_id", jornadaIds);

      if (salesError) throw salesError;

      // Fetch seller profiles
      const sellerIds = [...new Set(salesData?.map(s => s.seller_id) || [])];
      const { data: profilesData } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", sellerIds);

      const profilesMap = new Map(profilesData?.map(p => [p.id, p]) || []);

      // Build reports for each jornada
      const reports: JornadaReport[] = jornadasData.map(jornada => {
        const jornadaSales = salesData?.filter(s => s.jornada_id === jornada.id) || [];
        const activeSales = jornadaSales.filter(s => !s.is_cancelled);
        const cancelledSales = jornadaSales.filter(s => s.is_cancelled);

        const totalSales = activeSales.reduce((sum, s) => sum + Number(s.total_amount), 0);
        const totalCancelled = cancelledSales.reduce((sum, s) => sum + Number(s.total_amount), 0);
        
        const alcoholSales = activeSales
          .filter(s => s.sale_category === "alcohol")
          .reduce((sum, s) => sum + Number(s.total_amount), 0);
        
        const ticketSales = activeSales
          .filter(s => s.sale_category === "ticket")
          .reduce((sum, s) => sum + Number(s.total_amount), 0);

        const cashSales = activeSales
          .filter(s => s.payment_method === "cash")
          .reduce((sum, s) => sum + Number(s.total_amount), 0);
        
        const cardSales = activeSales
          .filter(s => s.payment_method === "card")
          .reduce((sum, s) => sum + Number(s.total_amount), 0);

        const otherPayments = totalSales - cashSales - cardSales;

        // Top sellers calculation
        const sellerTotals = new Map<string, { total: number; count: number }>();
        activeSales.forEach(sale => {
          const existing = sellerTotals.get(sale.seller_id) || { total: 0, count: 0 };
          sellerTotals.set(sale.seller_id, {
            total: existing.total + Number(sale.total_amount),
            count: existing.count + 1,
          });
        });

        const topSellers = Array.from(sellerTotals.entries())
          .map(([sellerId, data]) => {
            const profile = profilesMap.get(sellerId);
            return {
              name: profile?.full_name || profile?.email || "Desconocido",
              total: data.total,
              count: data.count,
            };
          })
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
        };
      });

      setJornadas(reports);
    } catch (error) {
      console.error("Error fetching jornadas:", error);
    } finally {
      setLoading(false);
    }
  };

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

      // Fetch seller profiles
      const sellerIds = [...new Set(salesData?.map(s => s.seller_id) || [])];
      const { data: profilesData } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", sellerIds);

      const profilesMap = new Map(profilesData?.map(p => [p.id, p]) || []);

      const salesWithNames: SaleDetail[] = (salesData || []).map(sale => ({
        ...sale,
        seller_name: profilesMap.get(sale.seller_id)?.full_name || 
                     profilesMap.get(sale.seller_id)?.email || 
                     "Desconocido",
      }));

      // Update the jornada with sales
      setJornadas(prev => prev.map(j => 
        j.jornada.id === jornadaId ? { ...j, sales: salesWithNames } : j
      ));
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
      const jornada = jornadas.find(j => j.jornada.id === jornadaId);
      if (!jornada?.sales) {
        fetchJornadaSales(jornadaId);
      }
    }
  };

  const handleExportJornada = (report: JornadaReport) => {
    if (!report.sales || report.sales.length === 0) return;

    const headers = ["Número", "Fecha", "Vendedor", "POS", "Categoría", "Método Pago", "Total", "Estado"];
    const rows = report.sales.map(sale => [
      sale.sale_number,
      format(new Date(sale.created_at), "dd/MM/yyyy HH:mm"),
      sale.seller_name,
      sale.point_of_sale,
      sale.sale_category === "ticket" ? "Ticket" : "Alcohol",
      sale.payment_method === "cash" ? "Efectivo" : sale.payment_method === "card" ? "Tarjeta" : sale.payment_method,
      sale.total_amount.toString(),
      sale.is_cancelled ? "Cancelada" : "Activa"
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(","))
    ].join("\n");

    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `jornada_${report.jornada.numero_jornada}_${report.jornada.fecha}.csv`;
    link.click();
  };

  useEffect(() => {
    fetchJornadasWithSales();
  }, [monthFilter]);

  // Calculate month totals
  const monthTotals = jornadas.reduce((acc, j) => ({
    totalSales: acc.totalSales + j.totalSales,
    totalCancelled: acc.totalCancelled + j.totalCancelled,
    salesCount: acc.salesCount + j.salesCount,
    cancelledCount: acc.cancelledCount + j.cancelledCount,
    alcoholSales: acc.alcoholSales + j.alcoholSales,
    ticketSales: acc.ticketSales + j.ticketSales,
  }), { totalSales: 0, totalCancelled: 0, salesCount: 0, cancelledCount: 0, alcoholSales: 0, ticketSales: 0 });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Reportes por Jornada</h2>
          <p className="text-muted-foreground text-sm">
            Ventas completas organizadas por cada jornada operativa
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={monthFilter} onValueChange={setMonthFilter}>
            <SelectTrigger className="w-[180px]">
              <Calendar className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {monthOptions.map(option => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={fetchJornadasWithSales} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Month Summary */}
      {!loading && jornadas.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <DollarSign className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Ventas Totales</p>
                <p className="text-xl font-bold">{formatCLP(monthTotals.totalSales)}</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/10">
                <ShoppingCart className="h-5 w-5 text-emerald-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Alcohol</p>
                <p className="text-xl font-bold">{formatCLP(monthTotals.alcoholSales)}</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10">
                <Ticket className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Entradas</p>
                <p className="text-xl font-bold">{formatCLP(monthTotals.ticketSales)}</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-destructive/10">
                <XCircle className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Canceladas</p>
                <p className="text-xl font-bold">{formatCLP(monthTotals.totalCancelled)}</p>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Jornadas List */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <Card key={i} className="p-6">
              <div className="flex items-center gap-4">
                <Skeleton className="h-12 w-12 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-4 w-24" />
                </div>
                <Skeleton className="h-8 w-32" />
              </div>
            </Card>
          ))}
        </div>
      ) : jornadas.length === 0 ? (
        <Card className="p-12 text-center">
          <Calendar className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
          <h3 className="font-medium mb-1">Sin jornadas registradas</h3>
          <p className="text-sm text-muted-foreground">
            No hay jornadas en el período seleccionado
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {jornadas.map(report => (
            <Collapsible 
              key={report.jornada.id} 
              open={expandedJornada === report.jornada.id}
              onOpenChange={() => handleExpand(report.jornada.id)}
            >
              <Card className="overflow-hidden">
                <CollapsibleTrigger asChild>
                  <button className="w-full p-4 flex items-center gap-4 hover:bg-muted/50 transition-colors text-left">
                    {/* Jornada Info */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-12 h-12 rounded-lg bg-primary/10 flex flex-col items-center justify-center shrink-0">
                        <span className="text-xs text-muted-foreground">J</span>
                        <span className="text-lg font-bold text-primary leading-none">
                          {report.jornada.numero_jornada}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">
                            {format(parseISO(report.jornada.fecha), "EEEE d", { locale: es })}
                          </span>
                          <Badge 
                            variant={report.jornada.estado === "abierta" ? "default" : "secondary"}
                            className="text-xs"
                          >
                            {report.jornada.estado === "abierta" ? "Abierta" : "Cerrada"}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {report.jornada.hora_apertura?.slice(0, 5) || "--:--"} - {report.jornada.hora_cierre?.slice(0, 5) || "--:--"}
                          </span>
                          <span className="flex items-center gap-1">
                            <TrendingUp className="h-3 w-3" />
                            {report.salesCount} ventas
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="hidden md:flex items-center gap-6 ml-auto">
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Alcohol</p>
                        <p className="font-medium text-emerald-600">{formatCLP(report.alcoholSales)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Tickets</p>
                        <p className="font-medium text-amber-600">{formatCLP(report.ticketSales)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Total</p>
                        <p className="font-bold text-lg">{formatCLP(report.totalSales)}</p>
                      </div>
                    </div>

                    {/* Mobile Total */}
                    <div className="md:hidden ml-auto text-right">
                      <p className="font-bold text-lg">{formatCLP(report.totalSales)}</p>
                      <p className="text-xs text-muted-foreground">{report.salesCount} ventas</p>
                    </div>

                    {/* Expand Icon */}
                    <div className="shrink-0">
                      {expandedJornada === report.jornada.id ? (
                        <ChevronDown className="h-5 w-5 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                  </button>
                </CollapsibleTrigger>

                <CollapsibleContent>
                  <div className="border-t p-4 space-y-4 bg-muted/30">
                    {/* Detailed Stats */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                      <div className="p-3 rounded-lg bg-background">
                        <div className="flex items-center gap-2 text-muted-foreground mb-1">
                          <Banknote className="h-4 w-4" />
                          <span className="text-xs">Efectivo</span>
                        </div>
                        <p className="font-semibold">{formatCLP(report.cashSales)}</p>
                      </div>
                      <div className="p-3 rounded-lg bg-background">
                        <div className="flex items-center gap-2 text-muted-foreground mb-1">
                          <CreditCard className="h-4 w-4" />
                          <span className="text-xs">Tarjeta</span>
                        </div>
                        <p className="font-semibold">{formatCLP(report.cardSales)}</p>
                      </div>
                      <div className="p-3 rounded-lg bg-background">
                        <div className="flex items-center gap-2 text-muted-foreground mb-1">
                          <DollarSign className="h-4 w-4" />
                          <span className="text-xs">Otros</span>
                        </div>
                        <p className="font-semibold">{formatCLP(report.otherPayments)}</p>
                      </div>
                      <div className="p-3 rounded-lg bg-background">
                        <div className="flex items-center gap-2 text-destructive/70 mb-1">
                          <XCircle className="h-4 w-4" />
                          <span className="text-xs">Canceladas</span>
                        </div>
                        <p className="font-semibold text-destructive">
                          {formatCLP(report.totalCancelled)} ({report.cancelledCount})
                        </p>
                      </div>
                      <div className="p-3 rounded-lg bg-background">
                        <div className="flex items-center gap-2 text-muted-foreground mb-1">
                          <Users className="h-4 w-4" />
                          <span className="text-xs">Top Vendedor</span>
                        </div>
                        <p className="font-semibold text-sm truncate">
                          {report.topSellers[0]?.name || "—"}
                        </p>
                      </div>
                    </div>

                    {/* Sales Table */}
                    {loadingSales === report.jornada.id ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      </div>
                    ) : report.sales && report.sales.length > 0 ? (
                      <>
                        <div className="flex justify-between items-center">
                          <h4 className="font-medium">Detalle de Ventas</h4>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={() => handleExportJornada(report)}
                          >
                            <Download className="h-4 w-4 mr-2" />
                            Exportar CSV
                          </Button>
                        </div>
                        <div className="border rounded-lg overflow-x-auto bg-background">
                          <Table>
                            <TableHeader>
                              <TableRow>
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
                              {report.sales.map(sale => (
                                <TableRow key={sale.id} className={sale.is_cancelled ? "opacity-50" : ""}>
                                  <TableCell className="font-mono text-sm">{sale.sale_number}</TableCell>
                                  <TableCell className="text-sm">
                                    {format(new Date(sale.created_at), "HH:mm")}
                                  </TableCell>
                                  <TableCell className="text-sm">{sale.seller_name}</TableCell>
                                  <TableCell className="text-sm">{sale.point_of_sale}</TableCell>
                                  <TableCell>
                                    <Badge variant={sale.sale_category === "ticket" ? "secondary" : "outline"} className="text-xs">
                                      {sale.sale_category === "ticket" ? "Ticket" : "Alcohol"}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="text-sm">
                                    {sale.payment_method === "cash" ? "Efectivo" : 
                                     sale.payment_method === "card" ? "Tarjeta" : sale.payment_method}
                                  </TableCell>
                                  <TableCell className="text-right font-medium">
                                    {formatCLP(sale.total_amount)}
                                  </TableCell>
                                  <TableCell>
                                    {sale.is_cancelled ? (
                                      <Badge variant="destructive" className="text-xs">Cancelada</Badge>
                                    ) : (
                                      <Badge variant="default" className="text-xs">OK</Badge>
                                    )}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                        {report.sales.length >= PAGE_SIZE && (
                          <p className="text-xs text-muted-foreground text-center">
                            Mostrando las primeras {PAGE_SIZE} ventas
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="text-center text-muted-foreground py-4">
                        No hay ventas registradas en esta jornada
                      </p>
                    )}
                  </div>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          ))}
        </div>
      )}
    </div>
  );
}
