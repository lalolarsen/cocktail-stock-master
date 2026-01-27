import { ReactNode } from "react";
import { useActiveVenue } from "@/hooks/useActiveVenue";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";

interface VenueGuardProps {
  children: ReactNode;
}

export function VenueGuard({ children }: VenueGuardProps) {
  const { venue, isLoading, error } = useActiveVenue();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-secondary/5">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Cargando información del local...</p>
        </div>
      </div>
    );
  }

  if (error || !venue) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-destructive/5 via-background to-destructive/5">
        <div className="max-w-md mx-auto p-8 text-center space-y-6">
          <div className="w-16 h-16 mx-auto rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertTriangle className="w-8 h-8 text-destructive" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-foreground">Error Crítico</h1>
            <p className="text-muted-foreground">
              {error || "No se pudo cargar la información del local asignado."}
            </p>
          </div>
          <p className="text-sm text-muted-foreground">
            Contacta al administrador del sistema para que te asigne un local válido.
          </p>
          <Button variant="outline" onClick={handleLogout} className="mt-4">
            Cerrar sesión
          </Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
