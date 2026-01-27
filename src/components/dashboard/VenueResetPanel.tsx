import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
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
import { toast } from "sonner";
import { AlertTriangle, Loader2, Trash2, Shield } from "lucide-react";

const BERLIN_VENUE_ID = "4e128e76-980d-4233-a438-92aa02cfb50b";
const CONFIRMATION_TEXT = "RESET BERLÍN";

interface DeletedCounts {
  [key: string]: number | boolean;
}

export function VenueResetPanel() {
  const { hasRole } = useUserRole();
  const [loading, setLoading] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [showDialog, setShowDialog] = useState(false);
  const [result, setResult] = useState<DeletedCounts | null>(null);

  // Only show for developers
  if (!hasRole("developer")) {
    return null;
  }

  const handleReset = async () => {
    if (confirmText !== CONFIRMATION_TEXT) {
      toast.error(`Debes escribir "${CONFIRMATION_TEXT}" para confirmar`);
      return;
    }

    setLoading(true);
    try {
      // Get current user ID to preserve
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error("No authenticated user");
      }

      const { data, error } = await supabase.rpc("reset_venue_data", {
        p_venue_id: BERLIN_VENUE_ID,
        p_keep_user_ids: [user.id]
      });

      if (error) throw error;

      const response = data as { success: boolean; deleted_counts: DeletedCounts };
      
      if (response.success) {
        setResult(response.deleted_counts);
        toast.success("Venue reseteado correctamente");
        setShowDialog(false);
        setConfirmText("");
      }
    } catch (error) {
      console.error("Reset error:", error);
      toast.error(error instanceof Error ? error.message : "Error al resetear venue");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-destructive/50 bg-destructive/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-destructive">
          <Shield className="w-5 h-5" />
          Reset de Venue (Developer)
        </CardTitle>
        <CardDescription>
          Elimina todos los datos operativos del venue Berlín y lo deja listo para producción.
          Esta acción es irreversible.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/30">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-amber-700 dark:text-amber-400">
                Esta acción eliminará:
              </p>
              <ul className="mt-2 space-y-1 text-muted-foreground">
                <li>• Todas las jornadas, ventas y tickets</li>
                <li>• Tokens de pickup y arqueos</li>
                <li>• Movimientos de stock e inventario</li>
                <li>• Productos, menú y recetas</li>
                <li>• POS y ubicaciones de stock</li>
                <li>• Gastos y reportes</li>
                <li>• Logs y configuraciones</li>
              </ul>
              <p className="mt-2 font-medium text-amber-700 dark:text-amber-400">
                Se mantiene: el venue, tu usuario admin, y se reinician los feature flags a v1.0
              </p>
            </div>
          </div>
        </div>

        {result && (
          <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/30">
            <p className="font-medium text-green-700 dark:text-green-400 mb-2">
              Reset completado exitosamente:
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm text-muted-foreground">
              {Object.entries(result).map(([key, value]) => (
                <div key={key} className="flex justify-between">
                  <span className="truncate">{key}:</span>
                  <span className="font-mono">{typeof value === 'boolean' ? (value ? '✓' : '✗') : value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <AlertDialog open={showDialog} onOpenChange={setShowDialog}>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" className="gap-2">
              <Trash2 className="w-4 h-4" />
              Resetear Venue Berlín
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="w-5 h-5" />
                Confirmar Reset Total
              </AlertDialogTitle>
              <AlertDialogDescription className="space-y-4">
                <p>
                  Esta acción eliminará <strong>TODOS</strong> los datos operativos del venue
                  Berlín y no puede deshacerse.
                </p>
                <div className="space-y-2">
                  <Label htmlFor="confirm">
                    Escribe <code className="px-2 py-1 bg-muted rounded font-mono">{CONFIRMATION_TEXT}</code> para confirmar:
                  </Label>
                  <Input
                    id="confirm"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder={CONFIRMATION_TEXT}
                    className="font-mono"
                  />
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setConfirmText("")}>
                Cancelar
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleReset}
                disabled={loading || confirmText !== CONFIRMATION_TEXT}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Reseteando...
                  </>
                ) : (
                  "Confirmar Reset"
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
