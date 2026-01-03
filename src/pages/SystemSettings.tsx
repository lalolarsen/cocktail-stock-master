import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, AlertTriangle, Trash2, Loader2, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const CONFIRMATION_TEXT = "BORRAR";

export default function SystemSettings() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [confirmationInput, setConfirmationInput] = useState("");
  const [isResetting, setIsResetting] = useState(false);
  const [resetResult, setResetResult] = useState<{
    success: boolean;
    deletedCounts?: Record<string, number>;
  } | null>(null);

  const handleFactoryReset = async () => {
    if (confirmationInput !== CONFIRMATION_TEXT) {
      toast({
        title: "Confirmación incorrecta",
        description: `Debes escribir "${CONFIRMATION_TEXT}" para continuar.`,
        variant: "destructive",
      });
      return;
    }

    setIsResetting(true);
    setResetResult(null);

    try {
      const { data, error } = await supabase.rpc("factory_reset_non_demo");

      if (error) throw error;

      const result = data as {
        success: boolean;
        error?: string;
        message?: string;
        deleted_counts?: Record<string, number>;
      };

      if (!result.success) {
        throw new Error(result.error || "Error desconocido");
      }

      setResetResult({
        success: true,
        deletedCounts: result.deleted_counts,
      });

      toast({
        title: "Factory Reset completado",
        description: "Todos los datos no-demo han sido eliminados.",
      });
    } catch (error: any) {
      console.error("Factory reset error:", error);
      toast({
        title: "Error en Factory Reset",
        description: error.message,
        variant: "destructive",
      });
      setResetResult({ success: false });
    } finally {
      setIsResetting(false);
      setConfirmationInput("");
    }
  };

  const totalDeleted = resetResult?.deletedCounts
    ? Object.values(resetResult.deletedCounts).reduce((sum, count) => sum + count, 0)
    : 0;

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/admin")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Configuración del Sistema</h1>
            <p className="text-muted-foreground">Acciones administrativas avanzadas</p>
          </div>
        </div>

        {/* Danger Zone */}
        <Card className="border-destructive/50">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              <CardTitle className="text-destructive">Zona de Peligro</CardTitle>
            </div>
            <CardDescription>
              Estas acciones son irreversibles. Procede con precaución.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Factory Reset Section */}
            <div className="p-4 border border-destructive/30 rounded-lg bg-destructive/5 space-y-4">
              <div>
                <h3 className="font-semibold flex items-center gap-2">
                  <Trash2 className="w-4 h-4" />
                  Factory Reset (Borrar datos reales)
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Esto eliminará <strong>TODOS</strong> los datos NO-DEMO del sistema:
                </p>
                <ul className="text-sm text-muted-foreground mt-2 ml-4 list-disc space-y-1">
                  <li>Venues, productos, cocktails</li>
                  <li>Trabajadores y sus roles</li>
                  <li>POS, barras, ubicaciones de stock</li>
                  <li>Jornadas, ventas, gastos</li>
                  <li>Documentos, tokens de retiro, logs</li>
                  <li>Stock, alertas, predicciones, transferencias</li>
                </ul>
                <p className="text-sm font-medium text-primary mt-3">
                  ✓ El modo DEMO y sus credenciales NO serán afectados.
                </p>
              </div>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" className="w-full sm:w-auto">
                    <Trash2 className="w-4 h-4 mr-2" />
                    Factory Reset
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5 text-destructive" />
                      ¿Estás seguro?
                    </AlertDialogTitle>
                    <AlertDialogDescription asChild>
                      <div className="space-y-4">
                        <p>
                          Esta acción <strong>eliminará permanentemente</strong> todos los datos
                          reales del sistema. Solo se preservará el venue de demo y sus
                          credenciales.
                        </p>
                        <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-md">
                          <p className="text-sm font-medium text-destructive">
                            Esta acción NO se puede deshacer.
                          </p>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="confirmation">
                            Escribe <strong>"{CONFIRMATION_TEXT}"</strong> para confirmar:
                          </Label>
                          <Input
                            id="confirmation"
                            value={confirmationInput}
                            onChange={(e) => setConfirmationInput(e.target.value.toUpperCase())}
                            placeholder={CONFIRMATION_TEXT}
                            className="font-mono"
                            autoComplete="off"
                          />
                        </div>
                      </div>
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => setConfirmationInput("")}>
                      Cancelar
                    </AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleFactoryReset}
                      disabled={confirmationInput !== CONFIRMATION_TEXT || isResetting}
                      className="bg-destructive hover:bg-destructive/90"
                    >
                      {isResetting ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Procesando...
                        </>
                      ) : (
                        <>
                          <Trash2 className="w-4 h-4 mr-2" />
                          Ejecutar Factory Reset
                        </>
                      )}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              {/* Result display */}
              {resetResult?.success && (
                <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
                  <div className="flex items-center gap-2 text-green-600 font-medium mb-2">
                    <CheckCircle className="w-5 h-5" />
                    Factory Reset completado exitosamente
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Se eliminaron <strong>{totalDeleted}</strong> registros en total.
                  </p>
                  {resetResult.deletedCounts && (
                    <details className="mt-2">
                      <summary className="text-sm cursor-pointer text-muted-foreground hover:text-foreground">
                        Ver detalles
                      </summary>
                      <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                        {Object.entries(resetResult.deletedCounts)
                          .filter(([_, count]) => count > 0)
                          .map(([table, count]) => (
                            <div key={table} className="flex justify-between bg-muted/50 px-2 py-1 rounded">
                              <span className="font-mono">{table}</span>
                              <span className="font-bold">{count}</span>
                            </div>
                          ))}
                      </div>
                    </details>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
