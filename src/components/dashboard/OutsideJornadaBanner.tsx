import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Calendar, Play } from "lucide-react";
import { useUserRole } from "@/hooks/useUserRole";

interface OutsideJornadaBannerProps {
  onOpenJornada?: () => void;
}

export function OutsideJornadaBanner({ onOpenJornada }: OutsideJornadaBannerProps) {
  const [hasActiveJornada, setHasActiveJornada] = useState<boolean | null>(null);
  const { hasRole } = useUserRole();
  const canManageJornada = hasRole("admin") || hasRole("gerencia");

  useEffect(() => {
    checkActiveJornada();
    
    // Subscribe to jornada changes
    const channel = supabase
      .channel("jornada-status")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "jornadas" },
        () => {
          checkActiveJornada();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const checkActiveJornada = async () => {
    const { data, error } = await supabase
      .from("jornadas")
      .select("id")
      .eq("estado", "activa")
      .maybeSingle();

    if (!error) {
      setHasActiveJornada(!!data);
    }
  };

  // Don't show anything while loading or if there's an active jornada
  if (hasActiveJornada === null || hasActiveJornada === true) {
    return null;
  }

  return (
    <Alert variant="destructive" className="border-amber-500/50 bg-amber-500/10 text-amber-900 dark:text-amber-200">
      <AlertTriangle className="h-5 w-5 text-amber-600" />
      <AlertTitle className="text-amber-800 dark:text-amber-100 font-semibold">
        Sin Jornada Activa
      </AlertTitle>
      <AlertDescription className="flex items-center justify-between">
        <span className="text-amber-700 dark:text-amber-200">
          Las ventas realizadas ahora quedarán marcadas como "fuera de jornada" y deberán asignarse antes del cierre final.
        </span>
        {canManageJornada && onOpenJornada && (
          <Button
            size="sm"
            variant="outline"
            className="ml-4 border-amber-600 text-amber-700 hover:bg-amber-600 hover:text-white"
            onClick={onOpenJornada}
          >
            <Play className="w-4 h-4 mr-1" />
            Abrir Jornada
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}

// Hook to check if jornada is active and get current jornada ID
export function useActiveJornada() {
  const [activeJornadaId, setActiveJornadaId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkJornada = async () => {
      const { data, error } = await supabase
        .from("jornadas")
        .select("id")
        .eq("estado", "activa")
        .maybeSingle();

      if (!error) {
        setActiveJornadaId(data?.id || null);
      }
      setLoading(false);
    };

    checkJornada();

    // Subscribe to jornada changes
    const channel = supabase
      .channel("active-jornada-check")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "jornadas" },
        () => {
          checkJornada();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return { activeJornadaId, hasActiveJornada: !!activeJornadaId, loading };
}
