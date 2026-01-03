import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Calendar, Clock, Play, Square, RefreshCw, Banknote } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { CashReconciliationDialog } from "./CashReconciliationDialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

interface Jornada {
  id: string;
  numero_jornada: number;
  semana_inicio: string;
  fecha: string;
  hora_apertura: string | null;
  hora_cierre: string | null;
  estado: string;
}

export function JornadaStatus() {
  const [activeJornada, setActiveJornada] = useState<Jornada | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [showReconciliation, setShowReconciliation] = useState(false);
  const [showOpeningDialog, setShowOpeningDialog] = useState(false);
  const [openingCash, setOpeningCash] = useState("");

  useEffect(() => {
    fetchActiveJornada();
  }, []);

  const fetchActiveJornada = async () => {
    try {
      // Get active jornada or today's jornada
      const today = new Date().toISOString().split("T")[0];
      
      const { data, error } = await supabase
        .from("jornadas")
        .select("*")
        .or(`estado.eq.activa,fecha.eq.${today}`)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      setActiveJornada(data);
    } catch (error) {
      console.error("Error fetching jornada:", error);
    } finally {
      setLoading(false);
    }
  };

  const syncJornada = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-jornadas");
      
      if (error) throw error;
      
      toast.success(`Jornada ${data.action === "opened" ? "abierta" : data.action === "closed" ? "cerrada" : "sincronizada"}`);
      fetchActiveJornada();
    } catch (error) {
      console.error("Error syncing jornada:", error);
      toast.error("Error al sincronizar jornada");
    } finally {
      setSyncing(false);
    }
  };

  const handleOpenJornada = () => {
    setOpeningCash("");
    setShowOpeningDialog(true);
  };

  const confirmOpenJornada = async () => {
    const opening = parseFloat(openingCash) || 0;
    setSyncing(true);
    setShowOpeningDialog(false);
    
    try {
      const now = new Date();
      const currentTime = now.toTimeString().slice(0, 5);
      const today = now.toISOString().split("T")[0];

      // Get week start (Monday)
      const daysSinceMonday = now.getDay() === 0 ? 6 : now.getDay() - 1;
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - daysSinceMonday);
      const weekStartStr = weekStart.toISOString().split("T")[0];

      // Get last jornada number this week
      const { data: weekJornadas } = await supabase
        .from("jornadas")
        .select("numero_jornada")
        .eq("semana_inicio", weekStartStr)
        .order("numero_jornada", { ascending: false });

      const lastNum = weekJornadas?.[0]?.numero_jornada || 0;

      // Create jornada
      const { data: newJornada, error } = await supabase
        .from("jornadas")
        .insert({
          numero_jornada: lastNum + 1,
          semana_inicio: weekStartStr,
          fecha: today,
          hora_apertura: currentTime,
          estado: "activa",
        })
        .select()
        .single();

      if (error) throw error;

      // Create cash register record with opening cash
      const { error: cashError } = await supabase
        .from("cash_registers")
        .insert({
          jornada_id: newJornada.id,
          opening_cash: opening,
        });

      if (cashError) throw cashError;

      toast.success("Jornada abierta con caja inicial: $" + opening.toLocaleString());
      fetchActiveJornada();
    } catch (error) {
      console.error("Error:", error);
      toast.error("Error al abrir jornada");
    } finally {
      setSyncing(false);
    }
  };

  const handleCloseJornada = () => {
    if (!activeJornada) {
      toast.error("No hay jornada activa para cerrar");
      return;
    }
    setShowReconciliation(true);
  };

  const handleReconciliationComplete = async () => {
    setShowReconciliation(false);
    setSyncing(true);
    
    try {
      const currentTime = new Date().toTimeString().slice(0, 5);
      
      const { error } = await supabase
        .from("jornadas")
        .update({ estado: "cerrada", hora_cierre: currentTime })
        .eq("id", activeJornada!.id);

      if (error) throw error;
      
      // Queue email notifications for jornada close
      try {
        await supabase.rpc("enqueue_jornada_closed_notifications", {
          p_jornada_id: activeJornada!.id,
        });
        
        // Trigger sending the notifications
        await supabase.functions.invoke("send-jornada-summary", {
          body: { jornada_id: activeJornada!.id },
        });
      } catch (notifError) {
        console.error("Error sending notifications:", notifError);
        // Don't fail the jornada close if notifications fail
      }
      
      toast.success("Jornada cerrada exitosamente");
      fetchActiveJornada();
    } catch (error) {
      console.error("Error:", error);
      toast.error("Error al cerrar jornada");
    } finally {
      setSyncing(false);
    }
  };

  const getStatusBadge = (estado: string) => {
    switch (estado) {
      case "activa":
        return <Badge className="bg-green-500 hover:bg-green-600">Activa</Badge>;
      case "cerrada":
        return <Badge variant="secondary">Cerrada</Badge>;
      case "pendiente":
        return <Badge variant="outline">Pendiente</Badge>;
      default:
        return <Badge variant="outline">{estado}</Badge>;
    }
  };

  if (loading) {
    return (
      <Card className="p-4">
        <div className="flex items-center justify-center py-4">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Calendar className="w-5 h-5 text-primary" />
          </div>
          
          {activeJornada ? (
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-semibold">
                  Jornada {activeJornada.numero_jornada}
                </span>
                {getStatusBadge(activeJornada.estado)}
              </div>
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <span>{format(new Date(activeJornada.fecha), "EEEE d 'de' MMMM", { locale: es })}</span>
                {activeJornada.hora_apertura && (
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {activeJornada.hora_apertura}
                    {activeJornada.hora_cierre && ` - ${activeJornada.hora_cierre}`}
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div>
              <span className="text-lg font-semibold text-muted-foreground">Sin jornada activa</span>
              <p className="text-sm text-muted-foreground">Configura los horarios o abre manualmente</p>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={syncJornada}
            disabled={syncing}
          >
            <RefreshCw className={`w-4 h-4 mr-1 ${syncing ? "animate-spin" : ""}`} />
            Sincronizar
          </Button>
          
          {(!activeJornada || activeJornada.estado !== "activa") && (
            <Button
              size="sm"
              onClick={handleOpenJornada}
              disabled={syncing}
            >
              <Play className="w-4 h-4 mr-1" />
              Abrir Jornada
            </Button>
          )}
          
          {activeJornada?.estado === "activa" && (
            <Button
              size="sm"
              variant="destructive"
              onClick={handleCloseJornada}
              disabled={syncing}
            >
              <Square className="w-4 h-4 mr-1" />
              Cerrar Jornada
            </Button>
          )}
        </div>
      </div>

      {/* Opening Cash Dialog */}
      <Dialog open={showOpeningDialog} onOpenChange={setShowOpeningDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Banknote className="w-5 h-5" />
              Apertura de Caja
            </DialogTitle>
            <DialogDescription>
              Ingresa el efectivo inicial para esta jornada
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="opening-cash">Efectivo Inicial</Label>
              <Input
                id="opening-cash"
                type="number"
                placeholder="0"
                value={openingCash}
                onChange={(e) => setOpeningCash(e.target.value)}
                min="0"
                step="1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowOpeningDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={confirmOpenJornada} disabled={syncing}>
              {syncing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Abriendo...
                </>
              ) : (
                "Abrir Jornada"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cash Reconciliation Dialog */}
      {activeJornada && (
        <CashReconciliationDialog
          open={showReconciliation}
          onClose={() => setShowReconciliation(false)}
          onReconciled={handleReconciliationComplete}
          jornadaId={activeJornada.id}
        />
      )}
    </Card>
  );
}
