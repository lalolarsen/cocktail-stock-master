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

interface WeeklySummary {
  semana_inicio: string;
  total_jornadas: number;
  jornadas: Jornada[];
}

export function JornadaManagement() {
  const [jornadas, setJornadas] = useState<Jornada[]>([]);
  const [jornadaStats, setJornadaStats] = useState<Record<string, JornadaStats>>({});
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
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
      
      // Fetch stats for each jornada
      if (data && data.length > 0) {
        await fetchJornadaStats(data.map(j => j.id));
      }
    } catch (error) {
      console.error("Error fetching jornadas:", error);
      toast.error("Error al cargar jornadas");
    } finally {
      setLoading(false);
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
      const { error } = await supabase
        .from("jornadas")
        .update({ estado: "cerrada", hora_cierre: format(new Date(), "HH:mm") })
        .eq("id", jornadaId);

      if (error) throw error;
      toast.success("Jornada cerrada");
      fetchJornadas();
    } catch (error) {
      console.error("Error closing jornada:", error);
      toast.error("Error al cerrar jornada");
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
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="summary" className="flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            Resumen
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
                                onClick={() => closeJornada(jornada.id)}
                                disabled={actionLoading === jornada.id}
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
                      {isExpanded && stats && (
                        <TableRow key={`${jornada.id}-stats`}>
                          <TableCell colSpan={7} className="bg-muted/30">
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
    </Card>
  );
}
