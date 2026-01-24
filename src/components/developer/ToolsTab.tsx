import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { 
  RefreshCw, 
  Trash2, 
  Calculator, 
  Clock, 
  Loader2,
  AlertTriangle,
  CheckCircle2
} from "lucide-react";

interface ToolsTabProps {
  selectedVenueId: string | null;
}

export function ToolsTab({ selectedVenueId }: ToolsTabProps) {
  const [jornadaIdForRecalc, setJornadaIdForRecalc] = useState("");

  // Reset Demo Data
  const resetDemoMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("reset_demo_data");
      if (error) throw error;
      const result = data as { success: boolean; error?: string };
      if (!result.success) throw new Error(result.error || "Unknown error");
      return result;
    },
    onSuccess: () => {
      toast.success("Datos de demo reseteados correctamente");
      console.log("Demo data reset successful");
    },
    onError: (error: Error) => {
      console.error("Reset demo error:", error);
      toast.error(`Error: ${error.message}`);
    },
  });

  // Recalculate Jornada Summaries
  const recalcMutation = useMutation({
    mutationFn: async (jornadaId: string) => {
      const { data, error } = await supabase.rpc("dev_recalculate_jornada_summaries", {
        p_jornada_id: jornadaId,
      });
      if (error) throw error;
      const result = data as { success: boolean; error?: string; jornada_id?: string };
      if (!result.success) throw new Error(result.error || "Unknown error");
      return result;
    },
    onSuccess: (data) => {
      toast.success(`Sumarios recalculados para jornada ${data.jornada_id?.slice(0, 8)}...`);
      console.log("Recalculation successful:", data);
      setJornadaIdForRecalc("");
    },
    onError: (error: Error) => {
      console.error("Recalculation error:", error);
      toast.error(`Error: ${error.message}`);
    },
  });

  // Expire Old Tokens
  const expireTokensMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("dev_expire_old_tokens");
      if (error) throw error;
      const result = data as { success: boolean; error?: string; expired_count?: number };
      if (!result.success) throw new Error(result.error || "Unknown error");
      return result;
    },
    onSuccess: (data) => {
      toast.success(`${data.expired_count} tokens marcados como expirados`);
      console.log("Expire tokens successful:", data);
    },
    onError: (error: Error) => {
      console.error("Expire tokens error:", error);
      toast.error(`Error: ${error.message}`);
    },
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Developer Tools
          </CardTitle>
          <CardDescription>
            Herramientas de soporte y operaciones. Usar con precaución.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Reset Demo Data */}
          <div className="p-4 border rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium flex items-center gap-2">
                  <Trash2 className="h-4 w-4" />
                  Reset Demo Data
                </h3>
                <p className="text-sm text-muted-foreground">
                  Limpia datos de demo (ventas, jornadas, tokens) preservando usuarios y configuración.
                </p>
              </div>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" className="gap-2">
                  <Trash2 className="h-4 w-4" />
                  Reset Demo
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Resetear datos de demo?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Esta acción eliminará ventas, jornadas, tokens y otros datos transaccionales
                    del venue demo. Los usuarios y configuración se preservarán.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => resetDemoMutation.mutate()}
                    disabled={resetDemoMutation.isPending}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {resetDemoMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Confirmar Reset
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>

          {/* Recalculate Jornada Summaries */}
          <div className="p-4 border rounded-lg space-y-3">
            <div>
              <h3 className="font-medium flex items-center gap-2">
                <Calculator className="h-4 w-4" />
                Recalculate Jornada Summaries
              </h3>
              <p className="text-sm text-muted-foreground">
                Regenera los resúmenes financieros para una jornada específica.
              </p>
            </div>
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Label htmlFor="jornada-id" className="text-xs">Jornada ID (UUID)</Label>
                <Input
                  id="jornada-id"
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  value={jornadaIdForRecalc}
                  onChange={(e) => setJornadaIdForRecalc(e.target.value)}
                  className="font-mono text-sm"
                />
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    disabled={!jornadaIdForRecalc.trim()}
                    className="gap-2"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Recalcular
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>¿Recalcular sumarios?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Esto eliminará los sumarios existentes y los regenerará para la jornada:
                      <code className="block mt-2 p-2 bg-muted rounded text-xs break-all">
                        {jornadaIdForRecalc}
                      </code>
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => recalcMutation.mutate(jornadaIdForRecalc.trim())}
                      disabled={recalcMutation.isPending}
                    >
                      {recalcMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Confirmar
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>

          {/* Expire Old Tokens */}
          <div className="p-4 border rounded-lg space-y-3">
            <div>
              <h3 className="font-medium flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Expire Old Pending Tokens
              </h3>
              <p className="text-sm text-muted-foreground">
                Marca como expirados todos los tokens que pasaron su fecha de vencimiento
                y aún están en estado pending/issued.
              </p>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <Clock className="h-4 w-4" />
                  Expirar Tokens Viejos
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Expirar tokens viejos?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Esto marcará como "expired" todos los tokens cuya fecha de expiración
                    ya pasó y que aún están en estado "pending" o "issued".
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => expireTokensMutation.mutate()}
                    disabled={expireTokensMutation.isPending}
                  >
                    {expireTokensMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Confirmar
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>

      {/* Status indicators */}
      <Card>
        <CardContent className="p-4">
          <h4 className="text-sm font-medium mb-3">Estado de operaciones recientes</h4>
          <div className="space-y-2 text-sm">
            {resetDemoMutation.isSuccess && (
              <div className="flex items-center gap-2 text-primary">
                <CheckCircle2 className="h-4 w-4" />
                Demo reset completado
              </div>
            )}
            {recalcMutation.isSuccess && (
              <div className="flex items-center gap-2 text-primary">
                <CheckCircle2 className="h-4 w-4" />
                Recálculo de sumarios completado
              </div>
            )}
            {expireTokensMutation.isSuccess && (
              <div className="flex items-center gap-2 text-primary">
                <CheckCircle2 className="h-4 w-4" />
                Tokens expirados: {(expireTokensMutation.data as any)?.expired_count || 0}
              </div>
            )}
            {!resetDemoMutation.isSuccess && !recalcMutation.isSuccess && !expireTokensMutation.isSuccess && (
              <div className="text-muted-foreground">
                No hay operaciones recientes
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
