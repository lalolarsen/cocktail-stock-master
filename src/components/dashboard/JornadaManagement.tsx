import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { 
  Loader2, Calendar, History, 
  DollarSign, ShoppingCart, Users, TrendingUp, ChevronDown, ChevronUp,
  Trash2, Square, Download, Play
} from "lucide-react";
import { toast } from "sonner";
import { format, parseISO, isToday } from "date-fns";
import { es } from "date-fns/locale";
import { OutsideJornadaSales } from "./OutsideJornadaSales";
import { JornadaCashOpeningDialog } from "./JornadaCashOpeningDialog";
import { JornadaCashSettingsCard } from "./JornadaCashSettingsCard";
import { CashReconciliationDialog } from "./CashReconciliationDialog";
import { JornadaCloseSummaryDialog } from "./JornadaCloseSummaryDialog";
import { formatCLP } from "@/lib/currency";

interface Jornada {
  id: string;
  numero_jornada: number;
  semana_inicio: string;
  fecha: string;
  hora_apertura: string | null;
  hora_cierre: string | null;
  estado: string;
  created_at: string;
}

interface JornadaStats {
  total_ventas: number;
  cantidad_ventas: number;
  productos_vendidos: number;
  logins: number;
}

interface FinancialSummary {
  id: string;
  jornada_id: string;
  pos_id: string | null;
  gross_sales_total: number;
  sales_by_payment: { cash?: number; card?: number; transfer?: number };
  transactions_count: number;
  cancelled_sales_total: number;
  net_sales_total: number;
  expenses_total: number;
  expenses_by_type: { operacional?: number; no_operacional?: number };
  opening_cash: number;
  cash_sales: number;
  cash_expenses: number;
  expected_cash: number;
  counted_cash: number;
  cash_difference: number;
  net_operational_result: number;
  closed_at: string;
  closed_by: string;
}

interface WeeklySummary {
  semana_inicio: string;
  total_jornadas: number;
  jornadas: Jornada[];
}

export function JornadaManagement() {
  const [jornadas, setJornadas] = useState<Jornada[]>([]);
  const [jornadaStats, setJornadaStats] = useState<Record<string, JornadaStats>>({});
  const [financialSummaries, setFinancialSummaries] = useState<Record<string, FinancialSummary>>({});
  const [loading, setLoading] = useState(true);
  const [showCashOpening, setShowCashOpening] = useState(false);
  const [showReconciliation, setShowReconciliation] = useState<string | null>(null);
  const [showSummary, setShowSummary] = useState<{ jornadaId: string; numero: number; fecha: string } | null>(null);
  const [expandedJornada, setExpandedJornada] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [activeJornada, setActiveJornada] = useState<Jornada | null>(null);

  useEffect(() => {
    fetchJornadas();
    
    // Subscribe to jornada changes
    const channel = supabase
      .channel("jornada-management")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "jornadas" },
        () => fetchJornadas()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchJornadas = async () => {
    try {
      const { data, error } = await supabase
        .from("jornadas")
        .select("*")
        .order("fecha", { ascending: false })
        .limit(50);

      if (error) throw error;
      setJornadas(data || []);
      
      // Find active jornada
      const active = data?.find(j => j.estado === "activa") || null;
      setActiveJornada(active);
      
      // Fetch stats and financial summaries for each jornada
      if (data && data.length > 0) {
        const ids = data.map(j => j.id);
        await Promise.all([
          fetchJornadaStats(ids),
          fetchFinancialSummaries(ids),
        ]);
      }
    } catch (error) {
      console.error("Error fetching jornadas:", error);
      toast.error("Error al cargar jornadas");
    } finally {
      setLoading(false);
    }
  };

  const fetchFinancialSummaries = async (jornadaIds: string[]) => {
    try {
      // Only fetch the overall summaries (pos_id is null)
      const { data } = await supabase
        .from("jornada_financial_summary")
        .select("*")
        .in("jornada_id", jornadaIds)
        .is("pos_id", null);

      const summaries: Record<string, FinancialSummary> = {};
      (data || []).forEach((s) => {
        // Cast to our interface since types.ts may not be regenerated yet
        summaries[s.jornada_id] = s as unknown as FinancialSummary;
      });
      setFinancialSummaries(summaries);
    } catch (error) {
      console.error("Error fetching financial summaries:", error);
    }
  };

  const fetchJornadaStats = async (jornadaIds: string[]) => {
    try {
      // Fetch sales stats
      const { data: salesData } = await supabase
        .from("sales")
        .select(`
          id,
          jornada_id,
          total_amount,
          is_cancelled,
          sale_items(quantity)
        `)
        .in("jornada_id", jornadaIds)
        .eq("is_cancelled", false);

      // Fetch login stats
      const { data: loginData } = await supabase
        .from("login_history")
        .select("jornada_id")
        .in("jornada_id", jornadaIds);

      const stats: Record<string, JornadaStats> = {};
      
      jornadaIds.forEach(id => {
        const jornadaSales = salesData?.filter(s => s.jornada_id === id) || [];
        const jornadaLogins = loginData?.filter(l => l.jornada_id === id) || [];
        
        stats[id] = {
          total_ventas: jornadaSales.reduce((sum, s) => sum + Number(s.total_amount), 0),
          cantidad_ventas: jornadaSales.length,
          productos_vendidos: jornadaSales.reduce((sum, s) => 
            sum + (s.sale_items?.reduce((itemSum: number, item: { quantity: number }) => itemSum + item.quantity, 0) || 0), 0
          ),
          logins: jornadaLogins.length,
        };
      });

      setJornadaStats(stats);
    } catch (error) {
      console.error("Error fetching jornada stats:", error);
    }
  };

  const getWeeklySummaries = (): WeeklySummary[] => {
    const weekMap = new Map<string, Jornada[]>();

    jornadas.forEach((jornada) => {
      const weekStart = jornada.semana_inicio;
      if (!weekMap.has(weekStart)) {
        weekMap.set(weekStart, []);
      }
      weekMap.get(weekStart)!.push(jornada);
    });

    return Array.from(weekMap.entries())
      .map(([semana_inicio, jornadas]) => ({
        semana_inicio,
        total_jornadas: jornadas.length,
        jornadas: jornadas.sort((a, b) => a.numero_jornada - b.numero_jornada),
      }))
      .sort((a, b) => new Date(b.semana_inicio).getTime() - new Date(a.semana_inicio).getTime());
  };

  const handleOpenJornada = () => {
    if (activeJornada) {
      toast.error("Ya existe una jornada abierta. Ciérrela antes de abrir una nueva.");
      return;
    }
    setShowCashOpening(true);
  };

  const handleOpeningSuccess = () => {
    setShowCashOpening(false);
    toast.success("Jornada abierta exitosamente");
    fetchJornadas();
  };

  const handleCloseJornada = (jornadaId: string) => {
    setShowReconciliation(jornadaId);
  };

  const handleReconciliationComplete = () => {
    setShowReconciliation(null);
    toast.success("Jornada cerrada exitosamente");
    fetchJornadas();
  };

  const deleteJornada = async (jornadaId: string) => {
    const stats = jornadaStats[jornadaId];
    if (stats && stats.cantidad_ventas > 0) {
      toast.error("No se puede eliminar una jornada con ventas registradas");
      return;
    }

    const jornada = jornadas.find(j => j.id === jornadaId);
    if (jornada?.estado === "activa") {
      toast.error("No se puede eliminar una jornada abierta");
      return;
    }

    setActionLoading(jornadaId);
    try {
      const { error } = await supabase
        .from("jornadas")
        .delete()
        .eq("id", jornadaId);

      if (error) throw error;
      toast.success("Jornada eliminada");
      fetchJornadas();
    } catch (error) {
      console.error("Error deleting jornada:", error);
      toast.error("Error al eliminar jornada");
    } finally {
      setActionLoading(null);
    }
  };

  const exportJornadaCSV = (jornada: Jornada) => {
    const summary = financialSummaries[jornada.id];
    if (!summary) {
      toast.error("No hay resumen financiero disponible");
      return;
    }

    const rows = [
      ["Cierre de Jornada"],
      [`Jornada #${jornada.numero_jornada}`],
      [`Fecha: ${format(parseISO(jornada.fecha), "dd/MM/yyyy", { locale: es })}`],
      [`Cerrada: ${format(new Date(summary.closed_at), "dd/MM/yyyy HH:mm", { locale: es })}`],
      [""],
      ["Concepto", "Monto (CLP)"],
      ["Ventas Brutas", summary.gross_sales_total],
      ["Ventas Canceladas", -summary.cancelled_sales_total],
      ["Ventas Netas", summary.net_sales_total],
      ["Gastos Totales", -summary.expenses_total],
      ["Resultado Operacional", summary.net_operational_result],
    ];

    const csv = rows.map((row) => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `cierre_jornada_${jornada.id.slice(0, 8)}.csv`;
    link.click();
    toast.success("CSV exportado");
  };

  const getStatusBadge = (estado: string) => {
    switch (estado) {
      case "activa":
        return <Badge className="bg-green-500/20 text-green-700 border-green-500/30">Abierta</Badge>;
      case "cerrada":
        return <Badge variant="secondary">Cerrada</Badge>;
      default:
        return <Badge variant="outline">{estado}</Badge>;
    }
  };

  const formatDate = (dateStr: string) => {
    return format(parseISO(dateStr), "EEEE d 'de' MMMM", { locale: es });
  };

  const formatWeek = (dateStr: string) => {
    const date = parseISO(dateStr);
    return format(date, "'Semana del' d 'de' MMMM", { locale: es });
  };

  const getTotalStats = () => {
    return Object.values(jornadaStats).reduce(
      (acc, stats) => ({
        total_ventas: acc.total_ventas + stats.total_ventas,
        cantidad_ventas: acc.cantidad_ventas + stats.cantidad_ventas,
        productos_vendidos: acc.productos_vendidos + stats.productos_vendidos,
        logins: acc.logins + stats.logins,
      }),
      { total_ventas: 0, cantidad_ventas: 0, productos_vendidos: 0, logins: 0 }
    );
  };

  if (loading) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      </Card>
    );
  }

  const weeklySummaries = getWeeklySummaries();
  const currentWeekJornadas = weeklySummaries[0]?.total_jornadas || 0;
  const totalStats = getTotalStats();

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5" />
          <h3 className="text-lg font-semibold">Gestión de Jornadas</h3>
        </div>
        <Button onClick={handleOpenJornada} disabled={!!activeJornada}>
          <Play className="w-4 h-4 mr-2" />
          Abrir Jornada
        </Button>
      </div>

      {/* Current Jornada Status */}
      {activeJornada ? (
        <Card className="p-4 mb-6 border-green-500/30 bg-green-500/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
                <Calendar className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-semibold">
                    Jornada {activeJornada.numero_jornada}
                  </span>
                  {getStatusBadge(activeJornada.estado)}
                </div>
                <p className="text-sm text-muted-foreground">
                  {formatDate(activeJornada.fecha)} • Abierta desde {activeJornada.hora_apertura}
                </p>
              </div>
            </div>
            <Button
              variant="destructive"
              onClick={() => handleCloseJornada(activeJornada.id)}
            >
              <Square className="w-4 h-4 mr-2" />
              Cerrar Jornada
            </Button>
          </div>
        </Card>
      ) : (
        <Card className="p-4 mb-6 border-amber-500/30 bg-amber-500/5">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
              <Calendar className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <span className="text-lg font-semibold text-amber-700 dark:text-amber-300">Sin jornada abierta</span>
              <p className="text-sm text-muted-foreground">
                Las ventas están bloqueadas. Abre una jornada para comenzar a vender.
              </p>
            </div>
          </div>
        </Card>
      )}

      <Tabs defaultValue="summary" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="summary" className="flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            Resumen
          </TabsTrigger>
          <TabsTrigger value="pending" className="flex items-center gap-2">
            <ShoppingCart className="w-4 h-4" />
            Pendientes
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2">
            <History className="w-4 h-4" />
            Historial
          </TabsTrigger>
        </TabsList>

        {/* Pending / Outside Jornada Sales Tab */}
        <TabsContent value="pending" className="space-y-4">
          <OutsideJornadaSales />
          <Card className="p-6">
            <p className="text-muted-foreground text-center">
              Las ventas fuera de jornada deben asignarse a una jornada antes del cierre final.
            </p>
          </Card>
        </TabsContent>

        <TabsContent value="summary" className="space-y-4">
          {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="p-4 bg-primary/5 border-primary/20">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <DollarSign className="w-4 h-4" />
                Ventas Totales
              </div>
              <div className="text-2xl font-bold">{formatCLP(totalStats.total_ventas)}</div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <ShoppingCart className="w-4 h-4" />
                Transacciones
              </div>
              <div className="text-2xl font-bold">{totalStats.cantidad_ventas}</div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <TrendingUp className="w-4 h-4" />
                Productos
              </div>
              <div className="text-2xl font-bold">{totalStats.productos_vendidos}</div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Users className="w-4 h-4" />
                Sesiones
              </div>
              <div className="text-2xl font-bold">{totalStats.logins}</div>
            </Card>
          </div>

          {/* Weekly Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="p-4 bg-primary/5 border-primary/20">
              <div className="text-sm text-muted-foreground">Esta semana</div>
              <div className="text-3xl font-bold">{currentWeekJornadas}</div>
              <div className="text-sm text-muted-foreground">jornadas</div>
            </Card>
            <Card className="p-4">
              <div className="text-sm text-muted-foreground">Total histórico</div>
              <div className="text-3xl font-bold">{jornadas.length}</div>
              <div className="text-sm text-muted-foreground">jornadas registradas</div>
            </Card>
            <Card className="p-4">
              <div className="text-sm text-muted-foreground">Promedio por jornada</div>
              <div className="text-3xl font-bold">
                {jornadas.length > 0 
                  ? formatCLP(totalStats.total_ventas / jornadas.length)
                  : formatCLP(0)}
              </div>
              <div className="text-sm text-muted-foreground">en ventas</div>
            </Card>
          </div>

          {weeklySummaries.slice(0, 4).map((week) => (
            <Card key={week.semana_inicio} className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-medium capitalize">{formatWeek(week.semana_inicio)}</h4>
                <Badge variant="outline">{week.total_jornadas} jornadas</Badge>
              </div>
              <div className="flex flex-wrap gap-2">
                {week.jornadas.map((jornada) => {
                  const stats = jornadaStats[jornada.id];
                  return (
                    <div
                      key={jornada.id}
                      className={`px-3 py-2 rounded-lg border text-sm ${
                        isToday(parseISO(jornada.fecha))
                          ? "bg-primary/10 border-primary/30"
                          : "bg-muted/30"
                      }`}
                    >
                      <div className="font-medium">Jornada {jornada.numero_jornada}</div>
                      <div className="text-xs text-muted-foreground capitalize">
                        {format(parseISO(jornada.fecha), "EEEE", { locale: es })}
                      </div>
                      {stats && (
                        <div className="text-xs text-muted-foreground mt-1">
                          {formatCLP(stats.total_ventas)} • {stats.cantidad_ventas} ventas
                        </div>
                      )}
                      <div className="mt-1">{getStatusBadge(jornada.estado)}</div>
                    </div>
                  );
                })}
              </div>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="history">
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Jornada</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Horario</TableHead>
                  <TableHead>Ventas</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jornadas.map((jornada) => {
                  const stats = jornadaStats[jornada.id];
                  const isExpanded = expandedJornada === jornada.id;
                  
                  return (
                    <>
                      <TableRow 
                        key={jornada.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => setExpandedJornada(isExpanded ? null : jornada.id)}
                      >
                        <TableCell>
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                        </TableCell>
                        <TableCell className="font-medium">
                          #{jornada.numero_jornada}
                        </TableCell>
                        <TableCell className="capitalize">
                          {formatDate(jornada.fecha)}
                        </TableCell>
                        <TableCell>
                          {jornada.hora_apertura || "--:--"} - {jornada.hora_cierre || "--:--"}
                        </TableCell>
                        <TableCell>
                          {stats ? formatCLP(stats.total_ventas) : "-"}
                        </TableCell>
                        <TableCell>{getStatusBadge(jornada.estado)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                            {jornada.estado === "activa" && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleCloseJornada(jornada.id)}
                                disabled={actionLoading === jornada.id}
                                title="Cerrar jornada"
                              >
                                {actionLoading === jornada.id ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Square className="w-4 h-4" />
                                )}
                              </Button>
                            )}
                            {jornada.estado === "cerrada" && (!stats || stats.cantidad_ventas === 0) && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-destructive hover:text-destructive"
                                onClick={() => deleteJornada(jornada.id)}
                                disabled={actionLoading === jornada.id}
                                title="Eliminar jornada"
                              >
                                {actionLoading === jornada.id ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Trash2 className="w-4 h-4" />
                                )}
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <TableRow key={`${jornada.id}-stats`}>
                          <TableCell colSpan={7} className="bg-muted/30">
                            {financialSummaries[jornada.id] ? (
                              // Show frozen financial summary for closed jornadas
                              <div className="space-y-3 py-2">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <Badge variant="secondary">Resumen financiero congelado</Badge>
                                    <span>
                                      Cerrada el {format(new Date(financialSummaries[jornada.id].closed_at), "dd/MM/yyyy HH:mm", { locale: es })}
                                    </span>
                                  </div>
                                  <div className="flex gap-2">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setShowSummary({ 
                                          jornadaId: jornada.id, 
                                          numero: jornada.numero_jornada, 
                                          fecha: jornada.fecha 
                                        });
                                      }}
                                    >
                                      Ver Detalle
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        exportJornadaCSV(jornada);
                                      }}
                                      className="gap-2"
                                    >
                                      <Download className="h-4 w-4" />
                                      CSV
                                    </Button>
                                  </div>
                                </div>
                                <div className="grid grid-cols-3 md:grid-cols-5 gap-4">
                                  <div className="text-center">
                                    <div className="text-lg font-bold text-primary">{formatCLP(financialSummaries[jornada.id].gross_sales_total)}</div>
                                    <div className="text-xs text-muted-foreground">Ventas Brutas</div>
                                  </div>
                                  <div className="text-center">
                                    <div className="text-lg font-bold">{financialSummaries[jornada.id].transactions_count}</div>
                                    <div className="text-xs text-muted-foreground">Transacciones</div>
                                  </div>
                                  <div className="text-center">
                                    <div className="text-lg font-bold">{formatCLP(financialSummaries[jornada.id].net_sales_total)}</div>
                                    <div className="text-xs text-muted-foreground">Ventas Netas</div>
                                  </div>
                                  <div className="text-center">
                                    <div className="text-lg font-bold text-destructive">{formatCLP(financialSummaries[jornada.id].expenses_total)}</div>
                                    <div className="text-xs text-muted-foreground">Gastos</div>
                                  </div>
                                  <div className="text-center">
                                    <div className={`text-lg font-bold ${financialSummaries[jornada.id].net_operational_result >= 0 ? "text-primary" : "text-destructive"}`}>
                                      {formatCLP(financialSummaries[jornada.id].net_operational_result)}
                                    </div>
                                    <div className="text-xs text-muted-foreground">Resultado</div>
                                  </div>
                                </div>
                              </div>
                            ) : stats ? (
                              // Show live stats for active jornadas
                              <div className="grid grid-cols-4 gap-4 py-2">
                                <div className="text-center">
                                  <div className="text-2xl font-bold">{formatCLP(stats.total_ventas)}</div>
                                  <div className="text-xs text-muted-foreground">Total Ventas</div>
                                </div>
                                <div className="text-center">
                                  <div className="text-2xl font-bold">{stats.cantidad_ventas}</div>
                                  <div className="text-xs text-muted-foreground">Transacciones</div>
                                </div>
                                <div className="text-center">
                                  <div className="text-2xl font-bold">{stats.productos_vendidos}</div>
                                  <div className="text-xs text-muted-foreground">Productos Vendidos</div>
                                </div>
                                <div className="text-center">
                                  <div className="text-2xl font-bold">{stats.logins}</div>
                                  <div className="text-xs text-muted-foreground">Sesiones</div>
                                </div>
                              </div>
                            ) : (
                              <div className="text-center py-4 text-muted-foreground">
                                Sin datos registrados
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  );
                })}
                {jornadas.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No hay jornadas registradas
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          
          {/* Cash Settings */}
          <div className="mt-6">
            <JornadaCashSettingsCard />
          </div>
        </TabsContent>
      </Tabs>

      {/* Cash Opening Dialog */}
      <JornadaCashOpeningDialog
        open={showCashOpening}
        onClose={() => setShowCashOpening(false)}
        jornadaId={null}
        onSuccess={handleOpeningSuccess}
      />

      {/* Cash Reconciliation Dialog */}
      {showReconciliation && (
        <CashReconciliationDialog
          open={true}
          onClose={() => setShowReconciliation(null)}
          onReconciled={handleReconciliationComplete}
          jornadaId={showReconciliation}
        />
      )}

      {/* P&L Summary Dialog */}
      {showSummary && (
        <JornadaCloseSummaryDialog
          open={true}
          onClose={() => setShowSummary(null)}
          jornadaId={showSummary.jornadaId}
          jornadaNumber={showSummary.numero}
          jornadaDate={showSummary.fecha}
        />
      )}
    </Card>
  );
}
