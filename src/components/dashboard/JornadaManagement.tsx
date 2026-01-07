import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
  Loader2, Plus, Calendar, History, Settings, Sparkles, 
  DollarSign, ShoppingCart, Users, TrendingUp, ChevronDown, ChevronUp,
  Trash2, Play, Square
} from "lucide-react";
import { toast } from "sonner";
import { format, startOfWeek, parseISO, isToday } from "date-fns";
import { es } from "date-fns/locale";
import { JornadaConfig } from "./JornadaConfig";
import { OutsideJornadaSales } from "./OutsideJornadaSales";
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
  ingresos_brutos: number;
  costo_ventas: number;
  utilidad_bruta: number;
  margen_bruto: number;
  gastos_operacionales: number;
  resultado_periodo: number;
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
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [expandedJornada, setExpandedJornada] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [newJornada, setNewJornada] = useState({
    fecha: format(new Date(), "yyyy-MM-dd"),
    hora_apertura: "18:00",
    hora_cierre: "02:00",
    motivo: "",
  });

  useEffect(() => {
    fetchJornadas();
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
      const { data } = await supabase
        .from("jornada_financial_summary")
        .select("*")
        .in("jornada_id", jornadaIds);

      const summaries: Record<string, FinancialSummary> = {};
      (data || []).forEach((s) => {
        summaries[s.jornada_id] = s as FinancialSummary;
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

  const addSpecialJornada = async () => {
    setSaving(true);
    try {
      const fecha = new Date(newJornada.fecha);
      const weekStart = startOfWeek(fecha, { weekStartsOn: 1 });
      const weekStartStr = format(weekStart, "yyyy-MM-dd");

      const { data: existingJornadas } = await supabase
        .from("jornadas")
        .select("numero_jornada")
        .eq("semana_inicio", weekStartStr)
        .order("numero_jornada", { ascending: false })
        .limit(1);

      const nextNumber = existingJornadas && existingJornadas.length > 0
        ? existingJornadas[0].numero_jornada + 1
        : 1;

      const { error } = await supabase.from("jornadas").insert({
        fecha: newJornada.fecha,
        semana_inicio: weekStartStr,
        numero_jornada: nextNumber,
        hora_apertura: newJornada.hora_apertura,
        hora_cierre: null,
        estado: "pendiente",
      });

      if (error) throw error;

      toast.success("Jornada especial creada correctamente");
      setShowAddDialog(false);
      setNewJornada({
        fecha: format(new Date(), "yyyy-MM-dd"),
        hora_apertura: "18:00",
        hora_cierre: "02:00",
        motivo: "",
      });
      fetchJornadas();
    } catch (error) {
      console.error("Error adding special jornada:", error);
      toast.error("Error al crear jornada especial");
    } finally {
      setSaving(false);
    }
  };

  const startJornada = async (jornadaId: string) => {
    setActionLoading(jornadaId);
    try {
      // First close any active jornada
      await supabase
        .from("jornadas")
        .update({ estado: "cerrada", hora_cierre: format(new Date(), "HH:mm") })
        .eq("estado", "activa");

      // Then activate this jornada
      const { error } = await supabase
        .from("jornadas")
        .update({ estado: "activa", hora_apertura: format(new Date(), "HH:mm") })
        .eq("id", jornadaId);

      if (error) throw error;
      toast.success("Jornada iniciada");
      fetchJornadas();
    } catch (error) {
      console.error("Error starting jornada:", error);
      toast.error("Error al iniciar jornada");
    } finally {
      setActionLoading(null);
    }
  };

  const closeJornada = async (jornadaId: string) => {
    setActionLoading(jornadaId);
    try {
      // Use the new close_jornada_with_summary function
      const { data, error } = await supabase.rpc("close_jornada_with_summary", {
        p_jornada_id: jornadaId,
      });

      if (error) throw error;

      const result = data as { success: boolean; error?: string; resultado_periodo?: number };
      
      if (!result.success) {
        throw new Error(result.error || "Error desconocido");
      }

      toast.success(
        `Jornada cerrada con resultado: ${formatCLP(result.resultado_periodo || 0)}`
      );
      setShowCloseConfirm(null);
      fetchJornadas();

      // Trigger financial summary email (non-blocking)
      supabase.functions
        .invoke("send-financial-summary")
        .then(({ error: emailError }) => {
          if (emailError) {
            console.warn("Financial summary email trigger failed:", emailError);
          } else {
            console.log("Financial summary emails queued");
          }
        })
        .catch((err) => console.warn("Email trigger error:", err));
    } catch (error: any) {
      console.error("Error closing jornada:", error);
      toast.error(error.message || "Error al cerrar jornada");
    } finally {
      setActionLoading(null);
    }
  };

  const deleteJornada = async (jornadaId: string) => {
    const stats = jornadaStats[jornadaId];
    if (stats && stats.cantidad_ventas > 0) {
      toast.error("No se puede eliminar una jornada con ventas registradas");
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

  const getStatusBadge = (estado: string) => {
    switch (estado) {
      case "activa":
        return <Badge className="bg-green-500/20 text-green-700 border-green-500/30">Activa</Badge>;
      case "cerrada":
        return <Badge variant="secondary">Cerrada</Badge>;
      case "pendiente":
        return <Badge className="bg-yellow-500/20 text-yellow-700 border-yellow-500/30">Pendiente</Badge>;
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
        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Jornada Especial
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="w-5 h-5" />
                Agregar Jornada Especial
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <p className="text-sm text-muted-foreground">
                Crea una jornada adicional para eventos especiales fuera del horario regular.
              </p>
              <div className="space-y-2">
                <Label>Fecha del evento</Label>
                <Input
                  type="date"
                  value={newJornada.fecha}
                  onChange={(e) => setNewJornada({ ...newJornada, fecha: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Hora de apertura</Label>
                  <Input
                    type="time"
                    value={newJornada.hora_apertura}
                    onChange={(e) => setNewJornada({ ...newJornada, hora_apertura: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Hora de cierre (estimada)</Label>
                  <Input
                    type="time"
                    value={newJornada.hora_cierre}
                    onChange={(e) => setNewJornada({ ...newJornada, hora_cierre: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Motivo (opcional)</Label>
                <Input
                  placeholder="Ej: Evento privado, Fiesta de año nuevo..."
                  value={newJornada.motivo}
                  onChange={(e) => setNewJornada({ ...newJornada, motivo: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAddDialog(false)}>
                Cancelar
              </Button>
              <Button onClick={addSpecialJornada} disabled={saving}>
                {saving ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4 mr-2" />
                )}
                Crear Jornada
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs defaultValue="summary" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
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
          <TabsTrigger value="config" className="flex items-center gap-2">
            <Settings className="w-4 h-4" />
            Configuración
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
                            {jornada.estado === "pendiente" && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => startJornada(jornada.id)}
                                disabled={actionLoading === jornada.id}
                              >
                                {actionLoading === jornada.id ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Play className="w-4 h-4" />
                                )}
                              </Button>
                            )}
                            {jornada.estado === "activa" && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setShowCloseConfirm(jornada.id)}
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
                            {jornada.estado === "pendiente" && (!stats || stats.cantidad_ventas === 0) && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-destructive hover:text-destructive"
                                onClick={() => deleteJornada(jornada.id)}
                                disabled={actionLoading === jornada.id}
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
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                  <Badge variant="secondary">Resumen financiero congelado</Badge>
                                  <span>
                                    Cerrada el {format(new Date(financialSummaries[jornada.id].closed_at), "dd/MM/yyyy HH:mm", { locale: es })}
                                  </span>
                                </div>
                                <div className="grid grid-cols-3 md:grid-cols-6 gap-4">
                                  <div className="text-center">
                                    <div className="text-lg font-bold text-primary">{formatCLP(financialSummaries[jornada.id].ingresos_brutos)}</div>
                                    <div className="text-xs text-muted-foreground">Ingresos Brutos</div>
                                  </div>
                                  <div className="text-center">
                                    <div className="text-lg font-bold text-destructive">{formatCLP(financialSummaries[jornada.id].costo_ventas)}</div>
                                    <div className="text-xs text-muted-foreground">Costo Ventas</div>
                                  </div>
                                  <div className="text-center">
                                    <div className="text-lg font-bold">{formatCLP(financialSummaries[jornada.id].utilidad_bruta)}</div>
                                    <div className="text-xs text-muted-foreground">Utilidad Bruta</div>
                                  </div>
                                  <div className="text-center">
                                    <div className="text-lg font-bold">{financialSummaries[jornada.id].margen_bruto}%</div>
                                    <div className="text-xs text-muted-foreground">Margen</div>
                                  </div>
                                  <div className="text-center">
                                    <div className="text-lg font-bold text-destructive">{formatCLP(financialSummaries[jornada.id].gastos_operacionales)}</div>
                                    <div className="text-xs text-muted-foreground">Gastos</div>
                                  </div>
                                  <div className="text-center">
                                    <div className={`text-lg font-bold ${financialSummaries[jornada.id].resultado_periodo >= 0 ? "text-primary" : "text-destructive"}`}>
                                      {formatCLP(financialSummaries[jornada.id].resultado_periodo)}
                                    </div>
                                    <div className="text-xs text-muted-foreground">Resultado</div>
                                  </div>
                                </div>
                              </div>
                            ) : stats ? (
                              // Show live stats for active/pending jornadas
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
        </TabsContent>

        <TabsContent value="config">
          <JornadaConfig />
        </TabsContent>
      </Tabs>

      {/* Close Jornada Confirmation Dialog */}
      <Dialog open={!!showCloseConfirm} onOpenChange={() => setShowCloseConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Square className="w-5 h-5" />
              Cerrar Jornada
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Al cerrar la jornada se creará un <strong>resumen financiero inmutable</strong> con los siguientes datos:
            </p>
            <ul className="text-sm space-y-1 list-disc list-inside text-muted-foreground">
              <li>Ingresos brutos (ventas, entradas, manuales)</li>
              <li>Costo de ventas (consumo de inventario)</li>
              <li>Gastos operacionales</li>
              <li>Resultado del período</li>
            </ul>
            <p className="text-sm font-medium text-destructive">
              Una vez cerrada, no se podrán agregar más registros a esta jornada.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCloseConfirm(null)}>
              Cancelar
            </Button>
            <Button 
              onClick={() => showCloseConfirm && closeJornada(showCloseConfirm)} 
              disabled={actionLoading === showCloseConfirm}
            >
              {actionLoading === showCloseConfirm ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Square className="w-4 h-4 mr-2" />
              )}
              Cerrar Jornada
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
