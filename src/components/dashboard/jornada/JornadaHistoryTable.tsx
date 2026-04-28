import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  AlertTriangle,
  Eye,
  CheckCircle,
  FileText,
  Trash2,
  Square,
} from "lucide-react";
import { format, parseISO, differenceInHours } from "date-fns";
import { es } from "date-fns/locale";
import { formatCLP } from "@/lib/currency";

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
  forced_close?: boolean;
  requires_review?: boolean;
}

interface JornadaStats {
  total_ventas: number;
  cantidad_ventas: number;
  productos_vendidos: number;
  logins: number;
}

interface FinancialSummary {
  id: string;
  jornada_id: string;
  pos_id: string | null;
  gross_sales_total: number;
  transactions_count: number;
  net_sales_total: number;
}

interface JornadaHistoryTableProps {
  jornadas: Jornada[];
  jornadaStats: Record<string, JornadaStats>;
  financialSummaries: Record<string, FinancialSummary>;
  actionLoading: string | null;
  onCloseJornada: (id: string) => void;
  onDeleteJornada: (id: string) => void;
  onForceClose?: (jornada: Jornada) => void;
  onApproveReview?: (jornadaId: string) => void;
  onShowDetail: (jornadaId: string) => void;
  onExportCSV?: (jornada: Jornada) => void;
  staleThresholdHours?: number;
}

const STALE_JORNADA_THRESHOLD_HOURS = 24;

export function JornadaHistoryTable({
  jornadas,
  jornadaStats,
  financialSummaries,
  actionLoading,
  onCloseJornada,
  onDeleteJornada,
  onForceClose,
  onApproveReview,
  onShowDetail,
  onExportCSV,
  staleThresholdHours = STALE_JORNADA_THRESHOLD_HOURS,
}: JornadaHistoryTableProps) {
  const isStaleJornada = (jornada: Jornada): boolean => {
    if (jornada.estado !== "activa") return false;
    const openedAt = new Date(`${jornada.fecha}T${jornada.hora_apertura || "00:00:00"}`);
    return differenceInHours(new Date(), openedAt) >= staleThresholdHours;
  };

  if (jornadas.length === 0) {
    return (
      <Card className="p-8 text-center text-muted-foreground">
        <FileText className="w-10 h-10 mx-auto mb-3 opacity-40" />
        <p className="font-medium">No hay jornadas registradas</p>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {jornadas.map((jornada) => {
        const stats = jornadaStats[jornada.id];
        const summary = financialSummaries[jornada.id];
        const isActive = jornada.estado === "activa";
        const isStale = isStaleJornada(jornada);
        const isClosed = jornada.estado === "cerrada";
        const horario = `${jornada.hora_apertura?.slice(0, 5) || "--:--"} – ${jornada.hora_cierre?.slice(0, 5) || "--:--"}`;

        return (
          <Card
            key={jornada.id}
            className={`p-3 sm:p-4 ${isActive ? "border-green-500/30 bg-green-500/5" : ""} ${isStale ? "border-amber-500/30 bg-amber-500/5" : ""}`}
          >
            {/* Row: Info + Downloads */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              {/* Left: jornada info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-mono text-muted-foreground">#{jornada.numero_jornada}</span>
                  <span className="font-semibold text-sm truncate">
                    {jornada.nombre || `Jornada ${jornada.numero_jornada}`}
                  </span>
                  {isActive && !isStale && (
                    <Badge className="bg-green-500/20 text-green-700 dark:text-green-300 border-green-500/30 text-[10px]">Abierta</Badge>
                  )}
                  {isStale && (
                    <Badge className="bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/30 text-[10px]">
                      <AlertTriangle className="w-3 h-3 mr-0.5" />Obsoleta
                    </Badge>
                  )}
                  {jornada.forced_close && (
                    <Badge variant="destructive" className="text-[10px]">
                      {jornada.requires_review ? "Pendiente revisión" : "Forzado ✓"}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                  <span className="capitalize">{format(parseISO(jornada.fecha), "EEE d MMM", { locale: es })}</span>
                  <span>{horario}</span>
                  {(summary || stats) && (
                    <span className="font-medium text-foreground">
                      {summary && summary.gross_sales_total > 0 ? formatCLP(summary.gross_sales_total) : stats ? formatCLP(stats.total_ventas) : ""}
                    </span>
                  )}
                </div>
              </div>

              {/* Right: operational actions only — descargas viven en Reportes */}
              <div className="flex items-center gap-1 shrink-0">
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => onShowDetail(jornada.id)} title="Ver detalle">
                  <Eye className="w-4 h-4" />
                </Button>

                {jornada.forced_close && jornada.requires_review && onApproveReview && (
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-500/10"
                    onClick={() => onApproveReview(jornada.id)} disabled={actionLoading === jornada.id} title="Aprobar revisión">
                    <CheckCircle className="w-4 h-4" />
                  </Button>
                )}
                {isActive && onForceClose && (
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-amber-600 hover:text-amber-700 hover:bg-amber-500/10"
                    onClick={() => onForceClose(jornada)} disabled={actionLoading === jornada.id} title="Forzar cierre">
                    <AlertTriangle className="w-4 h-4" />
                  </Button>
                )}
                {isActive && (
                  <Button size="icon" variant="ghost" className="h-8 w-8"
                    onClick={() => onCloseJornada(jornada.id)} disabled={actionLoading === jornada.id} title="Cerrar jornada">
                    <Square className="w-4 h-4" />
                  </Button>
                )}
                {isClosed && (!stats || stats.cantidad_ventas === 0) && (
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => onDeleteJornada(jornada.id)} disabled={actionLoading === jornada.id} title="Eliminar">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

