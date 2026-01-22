import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Calendar, Clock, Play, Square, FileWarning, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { CashReconciliationDialog } from "./CashReconciliationDialog";
import { JornadaCashOpeningDialog } from "./JornadaCashOpeningDialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Alert,
  AlertDescription,
} from "@/components/ui/alert";

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
  const [actionLoading] = useState(false);
  const [showReconciliation, setShowReconciliation] = useState(false);
  const [showOpeningDialog, setShowOpeningDialog] = useState(false);
  const [showPendingReceiptsWarning, setShowPendingReceiptsWarning] = useState(false);
  const [pendingReceiptsCount, setPendingReceiptsCount] = useState(0);

  useEffect(() => {
    fetchActiveJornada();
    
    // Subscribe to jornada changes
    const channel = supabase
      .channel("jornada-status-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "jornadas" },
        () => fetchActiveJornada()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchActiveJornada = async () => {
    try {
      // Get OPEN jornada only (estado = 'activa')
      const { data, error } = await supabase
        .from("jornadas")
        .select("*")
        .eq("estado", "activa")
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

  const fetchPendingReceiptsCount = async () => {
    if (!activeJornada?.id) return 0;
    
    const { count, error } = await supabase
      .from("sales_documents")
      .select("*, sales!inner(jornada_id)", { count: "exact", head: true })
      .eq("sales.jornada_id", activeJornada.id)
      .in("status", ["pending", "failed"]);

    if (!error && count !== null) {
      setPendingReceiptsCount(count);
      return count;
    }
    return 0;
  };

  const handleOpenJornada = () => {
    setShowOpeningDialog(true);
  };

  const handleOpeningSuccess = () => {
    setShowOpeningDialog(false);
    toast.success("Jornada abierta exitosamente");
    fetchActiveJornada();
  };

  const handleCloseJornada = async () => {
    if (!activeJornada) {
      toast.error("No hay jornada abierta para cerrar");
      return;
    }
    
    // Check for pending receipts
    const pendingCount = await fetchPendingReceiptsCount();
    
    if (pendingCount > 0) {
      setShowPendingReceiptsWarning(true);
      return;
    }
    
    setShowReconciliation(true);
  };

  const confirmCloseWithPendingReceipts = () => {
    setShowPendingReceiptsWarning(false);
    setShowReconciliation(true);
  };

  const handleReconciliationComplete = async () => {
    setShowReconciliation(false);
    toast.success("Jornada cerrada exitosamente");
    fetchActiveJornada();
  };

  const getStatusBadge = (estado: string) => {
    switch (estado) {
      case "activa":
        return <Badge className="bg-green-500 hover:bg-green-600">Abierta</Badge>;
      case "cerrada":
        return <Badge variant="secondary">Cerrada</Badge>;
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
    <>
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
                      Abierta desde {activeJornada.hora_apertura}
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div>
                <span className="text-lg font-semibold text-muted-foreground">Sin jornada abierta</span>
                <p className="text-sm text-muted-foreground">Abre una jornada para comenzar a vender</p>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {!activeJornada && (
              <Button
                size="sm"
                onClick={handleOpenJornada}
                disabled={actionLoading}
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
                disabled={actionLoading}
              >
                <Square className="w-4 h-4 mr-1" />
                Cerrar Jornada
              </Button>
            )}
          </div>
        </div>

        {!activeJornada && (
          <Alert className="mt-4 border-amber-500/50 bg-amber-500/10">
            <AlertCircle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-700 dark:text-amber-200">
              Las ventas están bloqueadas hasta que se abra una jornada.
            </AlertDescription>
          </Alert>
        )}
      </Card>

      {/* Cash Opening Dialog */}
      <JornadaCashOpeningDialog
        open={showOpeningDialog}
        onClose={() => setShowOpeningDialog(false)}
        jornadaId={null}
        onSuccess={handleOpeningSuccess}
      />

      {/* Pending Receipts Warning Dialog */}
      <Dialog open={showPendingReceiptsWarning} onOpenChange={setShowPendingReceiptsWarning}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <FileWarning className="w-5 h-5" />
              Boletas Pendientes
            </DialogTitle>
            <DialogDescription>
              Hay {pendingReceiptsCount} boleta(s) pendiente(s) de emisión para esta jornada.
              Puedes cerrar la jornada de todas formas y emitir las boletas después desde Documentos.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
              <p className="text-sm text-amber-800 dark:text-amber-200">
                Las boletas pendientes seguirán visibles en la sección de Documentos y podrán ser reintentadas en cualquier momento.
              </p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowPendingReceiptsWarning(false)}>
              Cancelar
            </Button>
            <Button onClick={confirmCloseWithPendingReceipts} variant="default">
              Cerrar Jornada
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
    </>
  );
}
