import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { 
  Loader2, 
  ChevronDown, 
  ChevronUp, 
  Trash2, 
  Square, 
  Download,
  AlertTriangle,
  Eye
} from "lucide-react";
import { format, parseISO, differenceInHours } from "date-fns";
import { es } from "date-fns/locale";
import { formatCLP } from "@/lib/currency";

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
  sales_by_payment: { cash?: number; card?: number; transfer?: number };
  transactions_count: number;
  cancelled_sales_total: number;
  net_sales_total: number;
  expenses_total: number;
  expenses_by_type: { operacional?: number; no_operacional?: number };
  opening_cash: number;
  cash_sales: number;
  cash_expenses: number;
  expected_cash: number;
  counted_cash: number;
  cash_difference: number;
  net_operational_result: number;
  closed_at: string;
  closed_by: string;
}

interface JornadaHistoryTableProps {
  jornadas: Jornada[];
  jornadaStats: Record<string, JornadaStats>;
  financialSummaries: Record<string, FinancialSummary>;
  expandedJornada: string | null;
  actionLoading: string | null;
  onToggleExpand: (id: string) => void;
  onCloseJornada: (id: string) => void;
  onDeleteJornada: (id: string) => void;
  onForceClose: (jornada: Jornada) => void;
  onShowSummary: (jornadaId: string, numero: number, fecha: string) => void;
  onExportCSV: (jornada: Jornada) => void;
  staleThresholdHours?: number;
}

const STALE_JORNADA_THRESHOLD_HOURS = 24;

export function JornadaHistoryTable({
  jornadas,
  jornadaStats,
  financialSummaries,
  expandedJornada,
  actionLoading,
  onToggleExpand,
  onCloseJornada,
  onDeleteJornada,
  onForceClose,
  onShowSummary,
  onExportCSV,
  staleThresholdHours = STALE_JORNADA_THRESHOLD_HOURS,
}: JornadaHistoryTableProps) {
  const isStaleJornada = (jornada: Jornada): boolean => {
    if (jornada.estado !== "activa") return false;
    const openedAt = new Date(`${jornada.fecha}T${jornada.hora_apertura || "00:00:00"}`);
    const hoursOpen = differenceInHours(new Date(), openedAt);
    return hoursOpen >= staleThresholdHours;
  };

  const formatDate = (dateStr: string) => {
    return format(parseISO(dateStr), "EEE d MMM", { locale: es });
  };

  const getStatusBadge = (estado: string, jornada?: Jornada) => {
    if (jornada && isStaleJornada(jornada)) {
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

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8"></TableHead>
            <TableHead>#</TableHead>
            <TableHead>Fecha</TableHead>
            <TableHead>Horario</TableHead>
            <TableHead>Ventas</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {jornadas.map((jornada) => {
            const stats = jornadaStats[jornada.id];
            const summary = financialSummaries[jornada.id];
            const isExpanded = expandedJornada === jornada.id;
            
            return (
              <>
                <TableRow 
                  key={jornada.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => onToggleExpand(jornada.id)}
                >
                  <TableCell>
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </TableCell>
                  <TableCell className="font-medium">
                    {jornada.numero_jornada}
                  </TableCell>
                  <TableCell className="capitalize">
                    {formatDate(jornada.fecha)}
                  </TableCell>
                  <TableCell>
                    {jornada.hora_apertura?.slice(0, 5) || "--:--"} - {jornada.hora_cierre?.slice(0, 5) || "--:--"}
                  </TableCell>
                  <TableCell>
                    {summary 
                      ? formatCLP(summary.gross_sales_total)
                      : stats 
                        ? formatCLP(stats.total_ventas) 
                        : "-"
                    }
                  </TableCell>
                  <TableCell>{getStatusBadge(jornada.estado, jornada)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                      {jornada.estado === "cerrada" && summary && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onShowSummary(jornada.id, jornada.numero_jornada, jornada.fecha)}
                          title="Ver resumen"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                      )}
                      {jornada.estado === "cerrada" && summary && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onExportCSV(jornada)}
                          title="Exportar CSV"
                        >
                          <Download className="w-4 h-4" />
                        </Button>
                      )}
                      {jornada.estado === "activa" && isStaleJornada(jornada) && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-amber-600 hover:text-amber-700 hover:bg-amber-500/10"
                          onClick={() => onForceClose(jornada)}
                          disabled={actionLoading === jornada.id}
                          title="Forzar cierre"
                        >
                          <AlertTriangle className="w-4 h-4" />
                        </Button>
                      )}
                      {jornada.estado === "activa" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onCloseJornada(jornada.id)}
                          disabled={actionLoading === jornada.id}
                          title="Cerrar jornada"
                        >
                          {actionLoading === jornada.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </Button>
                      )}
                      {jornada.estado === "cerrada" && (!stats || stats.cantidad_ventas === 0) && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          onClick={() => onDeleteJornada(jornada.id)}
                          disabled={actionLoading === jornada.id}
                          title="Eliminar jornada"
                        >
                          {actionLoading === jornada.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
                {isExpanded && (
                  <TableRow key={`${jornada.id}-details`}>
                    <TableCell colSpan={7} className="bg-muted/30 p-4">
                      {summary ? (
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                          <div className="text-center p-3 rounded-lg bg-background">
                            <div className="text-lg font-bold text-primary">{formatCLP(summary.gross_sales_total)}</div>
                            <div className="text-xs text-muted-foreground">Ventas Brutas</div>
                          </div>
                          <div className="text-center p-3 rounded-lg bg-background">
                            <div className="text-lg font-bold">{summary.transactions_count}</div>
                            <div className="text-xs text-muted-foreground">Transacciones</div>
                          </div>
                          <div className="text-center p-3 rounded-lg bg-background">
                            <div className="text-lg font-bold">{formatCLP(summary.net_sales_total)}</div>
                            <div className="text-xs text-muted-foreground">Ventas Netas</div>
                          </div>
                          <div className="text-center p-3 rounded-lg bg-background">
                            <div className="text-lg font-bold text-destructive">{formatCLP(summary.expenses_total)}</div>
                            <div className="text-xs text-muted-foreground">Gastos</div>
                          </div>
                          <div className="text-center p-3 rounded-lg bg-background">
                            <div className={`text-lg font-bold ${summary.net_operational_result >= 0 ? "text-primary" : "text-destructive"}`}>
                              {formatCLP(summary.net_operational_result)}
                            </div>
                            <div className="text-xs text-muted-foreground">Resultado</div>
                          </div>
                        </div>
                      ) : stats ? (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div className="text-center p-3 rounded-lg bg-background">
                            <div className="text-xl font-bold">{formatCLP(stats.total_ventas)}</div>
                            <div className="text-xs text-muted-foreground">Ventas</div>
                          </div>
                          <div className="text-center p-3 rounded-lg bg-background">
                            <div className="text-xl font-bold">{stats.cantidad_ventas}</div>
                            <div className="text-xs text-muted-foreground">Transacciones</div>
                          </div>
                          <div className="text-center p-3 rounded-lg bg-background">
                            <div className="text-xl font-bold">{stats.productos_vendidos}</div>
                            <div className="text-xs text-muted-foreground">Productos</div>
                          </div>
                          <div className="text-center p-3 rounded-lg bg-background">
                            <div className="text-xl font-bold">{stats.logins}</div>
                            <div className="text-xs text-muted-foreground">Sesiones</div>
                          </div>
                        </div>
                      ) : (
                        <div className="text-center py-4 text-muted-foreground">
                          Sin datos registrados
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                )}
              </>
            );
          })}
          {jornadas.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                No hay jornadas registradas
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
