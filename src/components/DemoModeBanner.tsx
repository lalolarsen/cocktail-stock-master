import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Play, RefreshCw, Loader2, Sparkles, Copy, Check } from "lucide-react";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface DemoModeBannerProps {
  isAdmin?: boolean;
  onDemoActivated?: () => void;
}

interface DemoUser {
  rut: string;
  pin: string;
  role: string;
  name: string;
}

const DEMO_CREDENTIALS: DemoUser[] = [
  { rut: "DEMO-ADMIN", pin: "1234", role: "Admin", name: "Admin Demo" },
  { rut: "DEMO-GERENCIA", pin: "1234", role: "Gerencia", name: "Gerente Demo" },
  { rut: "DEMO-VENDEDOR", pin: "1234", role: "Vendedor", name: "Vendedor Demo" },
  { rut: "DEMO-BAR", pin: "1234", role: "Bartender", name: "Bartender Demo" },
];

export function DemoModeBanner({ isAdmin = false, onDemoActivated }: DemoModeBannerProps) {
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [showCredentials, setShowCredentials] = useState(false);
  const [copiedRut, setCopiedRut] = useState<string | null>(null);

  const activateDemo = async () => {
    setLoading(true);
    try {
      // First seed the demo data
      const { data: seedData, error: seedError } = await supabase.rpc("seed_demo_data");
      
      const seedResult = seedData as { success?: boolean; error?: string } | null;
      
      if (seedError && !seedError.message.includes("already exists")) {
        throw seedError;
      }

      // Then create demo users via edge function
      const { data: usersData, error: usersError } = await supabase.functions.invoke("setup-demo-users");
      
      if (usersError) {
        console.error("Error setting up demo users:", usersError);
        // Continue anyway - show credentials dialog
      }

      const usersResult = usersData as { success?: boolean; error?: string } | null;

      if (usersResult?.success || seedResult?.success || seedResult?.error === "Demo venue already exists") {
        toast.success("¡Modo demo listo!");
        setShowCredentials(true);
        onDemoActivated?.();
      } else {
        throw new Error(usersResult?.error || seedResult?.error || "Error activating demo");
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Error al activar el modo demo";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const resetDemo = async () => {
    setResetting(true);
    try {
      const { data, error } = await supabase.rpc("reset_demo_data");
      
      if (error) throw error;
      
      const result = data as { success: boolean; error?: string };
      
      if (result.success) {
        toast.success("Demo reiniciado correctamente");
        onDemoActivated?.();
      } else {
        throw new Error(result.error || "Error resetting demo");
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Error al reiniciar el demo";
      toast.error(message);
    } finally {
      setResetting(false);
    }
  };

  const copyToClipboard = (text: string, rut: string) => {
    navigator.clipboard.writeText(text);
    setCopiedRut(rut);
    setTimeout(() => setCopiedRut(null), 2000);
  };

  return (
    <>
      <Card className="p-6 bg-gradient-to-r from-primary/10 via-secondary/10 to-primary/10 border-primary/20">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/20 rounded-lg">
              <Sparkles className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-lg">Modo Demo</h3>
              <p className="text-sm text-muted-foreground">
                Prueba el sistema con datos de ejemplo: 2 barras, 2 cajas, 10 productos y 8 cócteles
              </p>
            </div>
          </div>
          
          <div className="flex gap-2">
            <Button onClick={activateDemo} disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Preparando...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  Entrar al Demo
                </>
              )}
            </Button>
            
            {isAdmin && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" disabled={resetting}>
                    {resetting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4" />
                    )}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>¿Reiniciar datos demo?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Esto eliminará todos los datos del demo y los recreará desde cero.
                      Esta acción no puede deshacerse.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={resetDemo}>
                      Reiniciar Demo
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>
      </Card>

      {/* Demo Credentials Dialog */}
      <Dialog open={showCredentials} onOpenChange={setShowCredentials}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              Credenciales Demo
            </DialogTitle>
            <DialogDescription>
              Usa cualquiera de estas cuentas para probar el sistema
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-3 mt-4">
            {DEMO_CREDENTIALS.map((user) => (
              <div
                key={user.rut}
                className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border"
              >
                <div>
                  <div className="font-medium text-sm">{user.role}</div>
                  <div className="text-xs text-muted-foreground">
                    RUT: <span className="font-mono">{user.rut}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    PIN: <span className="font-mono">{user.pin}</span>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyToClipboard(user.rut, user.rut)}
                >
                  {copiedRut === user.rut ? (
                    <Check className="w-4 h-4 text-green-500" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </Button>
              </div>
            ))}
          </div>

          <div className="mt-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <p className="text-xs text-amber-700 dark:text-amber-400">
              <strong>Nota:</strong> En modo demo, los emails y la facturación real están deshabilitados.
            </p>
          </div>

          <Button className="w-full mt-4" onClick={() => setShowCredentials(false)}>
            Entendido, ir a login
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
