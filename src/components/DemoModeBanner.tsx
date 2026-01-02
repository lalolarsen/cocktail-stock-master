import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Play, RefreshCw, Loader2, Sparkles } from "lucide-react";
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

interface DemoModeBannerProps {
  isAdmin?: boolean;
  onDemoActivated?: () => void;
}

export function DemoModeBanner({ isAdmin = false, onDemoActivated }: DemoModeBannerProps) {
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);

  const activateDemo = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("seed_demo_data");
      
      if (error) throw error;
      
      const result = data as { success: boolean; error?: string; venue_id?: string };
      
      if (result.success) {
        toast.success("¡Modo demo activado! Explora el sistema con datos de ejemplo.");
        onDemoActivated?.();
      } else if (result.error === "Demo venue already exists") {
        toast.info("El modo demo ya está activo");
        onDemoActivated?.();
      } else {
        throw new Error(result.error || "Error activating demo");
      }
    } catch (error: any) {
      toast.error(error.message || "Error al activar el modo demo");
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
    } catch (error: any) {
      toast.error(error.message || "Error al reiniciar el demo");
    } finally {
      setResetting(false);
    }
  };

  return (
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
                Activando...
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
  );
}