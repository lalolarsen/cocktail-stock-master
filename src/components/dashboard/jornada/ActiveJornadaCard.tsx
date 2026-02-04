import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, AlertTriangle, Square, Play, Loader2 } from "lucide-react";
import { format, parseISO, differenceInHours } from "date-fns";
import { es } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useActiveVenue } from "@/hooks/useActiveVenue";
import { toast } from "sonner";

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

interface ActiveJornadaCardProps {
  jornada: Jornada | null;
  onOpenJornada: () => void;
  onCloseJornada: (id: string) => void;
  onForceClose: (jornada: Jornada) => void;
  staleThresholdHours?: number;
  onShiftOpened?: (shiftId: string) => void;
}

const STALE_JORNADA_THRESHOLD_HOURS = 24;

export function ActiveJornadaCard({ 
  jornada, 
  onOpenJornada, 
  onCloseJornada,
  onForceClose,
  staleThresholdHours = STALE_JORNADA_THRESHOLD_HOURS,
  onShiftOpened
}: ActiveJornadaCardProps) {
  const { venue } = useActiveVenue();
  const [currentShiftId, setCurrentShiftId] = useState<string | null>(null);
  const [openingShift, setOpeningShift] = useState(false);
  const [selectedPosLocationId, setSelectedPosLocationId] = useState<string | null>(null);

  // Fetch default POS terminal location on mount
  useEffect(() => {
    const fetchDefaultPOS = async () => {
      if (!venue?.id) return;
      
      const { data } = await supabase
        .from("pos_terminals")
        .select("id, location_id")
        .eq("venue_id", venue.id)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();
      
      if (data?.location_id) {
        setSelectedPosLocationId(data.location_id);
      }
    };
    
    fetchDefaultPOS();
  }, [venue?.id]);

  const isStaleJornada = (j: Jornada): boolean => {
    if (j.estado !== "activa") return false;
    const openedAt = new Date(`${j.fecha}T${j.hora_apertura || "00:00:00"}`);
    const hoursOpen = differenceInHours(new Date(), openedAt);
    return hoursOpen >= staleThresholdHours;
  };

  const formatDate = (dateStr: string) => {
    return format(parseISO(dateStr), "EEEE d 'de' MMMM", { locale: es });
  };

  const getStatusBadge = (estado: string, j?: Jornada) => {
    if (j && isStaleJornada(j)) {
      return (
        <Badge className="bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/30">
          <AlertTriangle className="w-3 h-3 mr-1" />
          Obsoleta
        </Badge>
      );
    }
    
    switch (estado) {
      case "activa":
        return <Badge className="bg-green-500/20 text-green-700 dark:text-green-300 border-green-500/30">Abierta</Badge>;
      case "cerrada":
        return <Badge variant="secondary">Cerrada</Badge>;
      default:
        return <Badge variant="outline">{estado}</Badge>;
    }
  };

  const handleOpenShift = async () => {
    if (!venue?.id) {
      toast.error("No hay venue activo");
      return;
    }

    if (!selectedPosLocationId) {
      toast.error("No hay ubicación de POS configurada");
      return;
    }

    setOpeningShift(true);
    try {
      const { data, error } = await supabase.rpc("open_shift" as any, {
        p_venue_id: venue.id,
        p_location_id: selectedPosLocationId,
        p_note: "Apertura desde UI"
      });

      if (error) {
        toast.error(error.message || "Error al abrir jornada");
        return;
      }

      const result = data as { shift_id?: string } | string;
      const shiftId = typeof result === "string" ? result : result?.shift_id;
      
      if (shiftId) {
        setCurrentShiftId(shiftId);
        onShiftOpened?.(shiftId);
        toast.success("Jornada abierta");
      } else {
        toast.success("Jornada abierta");
      }
    } catch (err: any) {
      toast.error(err.message || "Error al abrir jornada");
    } finally {
      setOpeningShift(false);
    }
  };

  if (!jornada) {
    return (
      <Card className="p-5 border-amber-500/30 bg-amber-500/5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center">
              <Calendar className="w-6 h-6 text-amber-600" />
            </div>
            <div>
              <span className="text-lg font-semibold text-amber-700 dark:text-amber-300">
                Sin jornada abierta
              </span>
              <p className="text-sm text-muted-foreground">
                Las ventas están bloqueadas. Abre una jornada para comenzar a vender.
              </p>
            </div>
          </div>
          <Button onClick={handleOpenShift} size="lg" className="gap-2" disabled={openingShift}>
            {openingShift ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            {openingShift ? "Abriendo..." : "Abrir Jornada"}
          </Button>
        </div>
      </Card>
    );
  }

  const isStale = isStaleJornada(jornada);

  return (
    <Card className={`p-5 ${isStale ? "border-amber-500/30 bg-amber-500/5" : "border-green-500/30 bg-green-500/5"}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center ${isStale ? "bg-amber-500/20" : "bg-green-500/20"}`}>
            {isStale ? (
              <AlertTriangle className="w-6 h-6 text-amber-600" />
            ) : (
              <Calendar className="w-6 h-6 text-green-600" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl font-semibold">
                Jornada {jornada.numero_jornada}
              </span>
              {getStatusBadge(jornada.estado, jornada)}
            </div>
            <p className="text-sm text-muted-foreground">
              {formatDate(jornada.fecha)} • Abierta desde {jornada.hora_apertura}
            </p>
            {isStale && (
              <p className="text-sm text-amber-600 dark:text-amber-400 mt-1">
                ⚠️ Esta jornada lleva más de {staleThresholdHours}h abierta. Considere forzar el cierre.
              </p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {isStale && (
            <Button
              variant="outline"
              className="border-amber-500/50 text-amber-700 dark:text-amber-300 hover:bg-amber-500/10"
              onClick={() => onForceClose(jornada)}
            >
              <AlertTriangle className="w-4 h-4 mr-2" />
              Forzar Cierre
            </Button>
          )}
          <Button
            variant="destructive"
            onClick={() => onCloseJornada(jornada.id)}
          >
            <Square className="w-4 h-4 mr-2" />
            Cerrar Jornada
          </Button>
        </div>
      </div>
    </Card>
  );
}
