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
import { Loader2, Plus, Calendar, History, Settings, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { format, startOfWeek, parseISO, isToday } from "date-fns";
import { es } from "date-fns/locale";
import { JornadaConfig } from "./JornadaConfig";

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

interface WeeklySummary {
  semana_inicio: string;
  total_jornadas: number;
  jornadas: Jornada[];
}

export function JornadaManagement() {
  const [jornadas, setJornadas] = useState<Jornada[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [saving, setSaving] = useState(false);
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
    } catch (error) {
      console.error("Error fetching jornadas:", error);
      toast.error("Error al cargar jornadas");
    } finally {
      setLoading(false);
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

      // Get the next jornada number for this week
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
            Resumen Semanal
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
              <div className="text-sm text-muted-foreground">Semanas activas</div>
              <div className="text-3xl font-bold">{weeklySummaries.length}</div>
              <div className="text-sm text-muted-foreground">en el historial</div>
            </Card>
          </div>

          {weeklySummaries.slice(0, 4).map((week) => (
            <Card key={week.semana_inicio} className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-medium capitalize">{formatWeek(week.semana_inicio)}</h4>
                <Badge variant="outline">{week.total_jornadas} jornadas</Badge>
              </div>
              <div className="flex flex-wrap gap-2">
                {week.jornadas.map((jornada) => (
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
                    <div className="mt-1">{getStatusBadge(jornada.estado)}</div>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="history">
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Jornada</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Horario</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jornadas.map((jornada) => (
                  <TableRow key={jornada.id}>
                    <TableCell className="font-medium">
                      #{jornada.numero_jornada}
                    </TableCell>
                    <TableCell className="capitalize">
                      {formatDate(jornada.fecha)}
                    </TableCell>
                    <TableCell>
                      {jornada.hora_apertura || "--:--"} - {jornada.hora_cierre || "--:--"}
                    </TableCell>
                    <TableCell>{getStatusBadge(jornada.estado)}</TableCell>
                  </TableRow>
                ))}
                {jornadas.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
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
