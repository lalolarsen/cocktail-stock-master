import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, AlertTriangle, Square, Play, Ban } from "lucide-react";
import { useAppSession } from "@/contexts/AppSessionContext";
import { format, parseISO, differenceInHours } from "date-fns";
import { es } from "date-fns/locale";

interface Jornada {
  id: string;
  numero_jornada: number;
  nombre?: string;
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
}

const STALE_JORNADA_THRESHOLD_HOURS = 24;

export function ActiveJornadaCard({ 
  jornada, 
  onOpenJornada, 
  onCloseJornada,
  onForceClose,
  staleThresholdHours = STALE_JORNADA_THRESHOLD_HOURS 
}: ActiveJornadaCardProps) {
  const { hasActiveJornada } = useAppSession();
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
                {hasActiveJornada
                  ? "Ya existe una jornada activa."
                  : "Las ventas están bloqueadas. Abre una jornada para comenzar a vender."}
              </p>
            </div>
          </div>
          <Button
            onClick={onOpenJornada}
            size="lg"
            className="gap-2"
            disabled={hasActiveJornada}
          >
            {hasActiveJornada ? (
              <>
                <Ban className="w-4 h-4" />
                Jornada activa
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                Abrir Jornada
              </>
            )}
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
                {jornada.nombre || `Jornada ${jornada.numero_jornada}`}
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
