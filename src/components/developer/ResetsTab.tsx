import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { VenueSelector } from "./VenueSelector";
import { toast } from "sonner";
import { Trash2, AlertTriangle, Loader2, RefreshCw, ShieldAlert, CheckCircle } from "lucide-react";

interface ResettableTable {
  key: string;
  table_name: string;
  description: string | null;
  is_enabled: boolean;
  danger_level: number;
  sort_order: number;
}

interface ResetAuditEntry {
  id: number;
  developer_user_id: string;
  venue_id: string;
  table_key: string;
  table_name: string;
  deleted_rows: number;
  executed_at: string;
}

interface ResetsTabProps {
  selectedVenueId: string | null;
  onSelectVenue: (venueId: string | null) => void;
}

export function ResetsTab({ selectedVenueId, onSelectVenue }: ResetsTabProps) {
  const queryClient = useQueryClient();
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    tableKey: string;
    tableName: string;
    description: string;
    count: number;
    type: "single" | "full";
  } | null>(null);
  const [confirmInput, setConfirmInput] = useState("");

  // Fetch resettable tables
  const { data: tables = [], isLoading: tablesLoading } = useQuery({
    queryKey: ["resettable-tables"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("resettable_tables")
        .select("*")
        .eq("is_enabled", true)
        .order("sort_order");
      if (error) throw error;
      return data as ResettableTable[];
    },
  });

  // Fetch table counts for selected venue
  const { data: tableCounts = {}, isLoading: countsLoading, refetch: refetchCounts } = useQuery({
    queryKey: ["table-counts", selectedVenueId],
    queryFn: async () => {
      if (!selectedVenueId) return {};
      const { data, error } = await supabase.rpc("developer_get_table_counts", {
        p_venue_id: selectedVenueId,
      });
      if (error) throw error;
      return data as Record<string, number>;
    },
    enabled: !!selectedVenueId,
  });

  // Fetch venue info for confirmation
  const { data: selectedVenue } = useQuery({
    queryKey: ["venue-info", selectedVenueId],
    queryFn: async () => {
      if (!selectedVenueId) return null;
      const { data, error } = await supabase
        .from("venues")
        .select("name, slug")
        .eq("id", selectedVenueId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!selectedVenueId,
  });

  // Fetch recent reset audit
  const { data: recentResets = [] } = useQuery({
    queryKey: ["reset-audit", selectedVenueId],
    queryFn: async () => {
      if (!selectedVenueId) return [];
      const { data, error } = await supabase
        .from("developer_reset_audit")
        .select("*")
        .eq("venue_id", selectedVenueId)
        .order("executed_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data as ResetAuditEntry[];
    },
    enabled: !!selectedVenueId,
  });

  // Reset single table mutation
  const resetTableMutation = useMutation({
    mutationFn: async ({ venueId, tableKey }: { venueId: string; tableKey: string }) => {
      const { data, error } = await supabase.rpc("developer_reset_table", {
        p_venue_id: venueId,
        p_table_key: tableKey,
      });
      if (error) throw error;
      return data as number;
    },
    onSuccess: (deletedRows, variables) => {
      toast.success(`Se borraron ${deletedRows} filas de ${variables.tableKey}`);
      queryClient.invalidateQueries({ queryKey: ["table-counts", selectedVenueId] });
      queryClient.invalidateQueries({ queryKey: ["reset-audit", selectedVenueId] });
      setConfirmDialog(null);
      setConfirmInput("");
    },
    onError: (error: Error) => {
      toast.error(`Error: ${error.message}`);
    },
  });

  // Reset full venue mutation
  const resetVenueMutation = useMutation({
    mutationFn: async (venueId: string) => {
      const { data, error } = await supabase.rpc("developer_reset_venue_operational", {
        p_venue_id: venueId,
      });
      if (error) throw error;
      return data as Array<{ table_key: string; deleted_rows?: number; error?: string }>;
    },
    onSuccess: (results) => {
      const totalDeleted = results.reduce((sum, r) => sum + (r.deleted_rows || 0), 0);
      const errors = results.filter((r) => r.error);
      
      if (errors.length > 0) {
        toast.warning(`Reset parcial: ${totalDeleted} filas borradas, ${errors.length} errores`);
      } else {
        toast.success(`Reset completo: ${totalDeleted} filas borradas`);
      }
      
      queryClient.invalidateQueries({ queryKey: ["table-counts", selectedVenueId] });
      queryClient.invalidateQueries({ queryKey: ["reset-audit", selectedVenueId] });
      setConfirmDialog(null);
      setConfirmInput("");
    },
    onError: (error: Error) => {
      toast.error(`Error: ${error.message}`);
    },
  });

  const handleResetClick = (table: ResettableTable) => {
    const count = tableCounts[table.key] ?? 0;
    setConfirmDialog({
      open: true,
      tableKey: table.key,
      tableName: table.table_name,
      description: table.description || "",
      count,
      type: "single",
    });
    setConfirmInput("");
  };

  const handleFullResetClick = () => {
    const totalCount = Object.values(tableCounts).reduce((sum, c) => sum + (c > 0 ? c : 0), 0);
    setConfirmDialog({
      open: true,
      tableKey: "FULL_RESET",
      tableName: "Todas las tablas operativas",
      description: "Esto borrará TODOS los datos operativos del venue",
      count: totalCount,
      type: "full",
    });
    setConfirmInput("");
  };

  const confirmReset = () => {
    if (!confirmDialog || !selectedVenueId) return;

    const expectedConfirm = confirmDialog.type === "full" 
      ? `RESET ${selectedVenue?.slug?.toUpperCase() || selectedVenue?.name?.toUpperCase() || "VENUE"}`
      : "RESET";

    if (confirmInput !== expectedConfirm) {
      toast.error(`Escribe "${expectedConfirm}" para confirmar`);
      return;
    }

    if (confirmDialog.type === "full") {
      resetVenueMutation.mutate(selectedVenueId);
    } else {
      resetTableMutation.mutate({ venueId: selectedVenueId, tableKey: confirmDialog.tableKey });
    }
  };

  const getDangerBadge = (level: number) => {
    switch (level) {
      case 1:
        return <Badge variant="outline" className="text-xs">Normal</Badge>;
        case 2:
          return <Badge variant="secondary" className="text-xs bg-warning/20 text-warning-foreground">Alto</Badge>;
        case 3:
          return <Badge variant="destructive" className="text-xs">Crítico</Badge>;
        default:
        return null;
    }
  };

  const totalRows = Object.values(tableCounts).reduce((sum, c) => sum + (c > 0 ? c : 0), 0);

  return (
    <div className="space-y-6">
      {/* Venue Selector */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-destructive" />
            Reset de Datos por Venue
          </CardTitle>
          <CardDescription>
            Herramienta de desarrollo para limpiar datos operativos de un venue específico.
            Solo accesible para desarrolladores.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-w-sm">
            <VenueSelector
              selectedVenueId={selectedVenueId}
              onSelectVenue={onSelectVenue}
            />
          </div>
          
          {selectedVenueId && (
            <div className="flex items-center gap-4">
              <div className="text-sm text-muted-foreground">
                Total filas: <span className="font-mono font-bold text-foreground">{totalRows.toLocaleString()}</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetchCounts()}
                disabled={countsLoading}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${countsLoading ? "animate-spin" : ""}`} />
                Refrescar
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleFullResetClick}
                disabled={totalRows === 0}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Reset Operación Completa
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tables List */}
      {selectedVenueId && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Tablas Reseteables</CardTitle>
            <CardDescription>
              Solo tablas operativas en whitelist. Venues, usuarios y flags están protegidos.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {tablesLoading ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tabla</TableHead>
                    <TableHead>Descripción</TableHead>
                    <TableHead className="text-center">Nivel</TableHead>
                    <TableHead className="text-right">Filas</TableHead>
                    <TableHead className="text-right">Acción</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tables.map((table) => {
                    const count = tableCounts[table.key] ?? 0;
                    const isLoading = countsLoading;
                    
                    return (
                      <TableRow key={table.key}>
                        <TableCell className="font-mono text-sm">{table.key}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {table.description}
                        </TableCell>
                        <TableCell className="text-center">
                          {getDangerBadge(table.danger_level)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {isLoading ? (
                            <Skeleton className="h-4 w-8 ml-auto" />
                          ) : count < 0 ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            count.toLocaleString()
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => handleResetClick(table)}
                            disabled={count <= 0 || isLoading}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Recent Resets Audit */}
      {selectedVenueId && recentResets.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Historial de Resets</CardTitle>
            <CardDescription>Últimos 10 resets en este venue</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Tabla</TableHead>
                  <TableHead className="text-right">Filas Borradas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentResets.map((reset) => (
                  <TableRow key={reset.id}>
                    <TableCell className="text-sm">
                      {new Date(reset.executed_at).toLocaleString("es-CL")}
                    </TableCell>
                    <TableCell className="font-mono text-sm">{reset.table_key}</TableCell>
                    <TableCell className="text-right font-mono">
                      {reset.deleted_rows.toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Confirmation Dialog */}
      <Dialog 
        open={confirmDialog?.open ?? false} 
        onOpenChange={(open) => !open && setConfirmDialog(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Confirmar Reset
            </DialogTitle>
            <DialogDescription className="space-y-3 pt-2">
              <div>
                <span className="font-medium">Venue:</span>{" "}
                <span className="font-mono">{selectedVenue?.name}</span>
              </div>
              <div>
                <span className="font-medium">Tabla(s):</span>{" "}
                <span className="font-mono">{confirmDialog?.tableName}</span>
              </div>
              <div>
                <span className="font-medium">Filas a borrar:</span>{" "}
                <span className="font-mono text-destructive font-bold">
                  {confirmDialog?.count?.toLocaleString()}
                </span>
              </div>
              {confirmDialog?.description && (
                <div className="text-sm">{confirmDialog.description}</div>
              )}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-2 py-4">
            <label className="text-sm font-medium">
              Escribe{" "}
              <span className="font-mono text-destructive">
                {confirmDialog?.type === "full"
                  ? `RESET ${selectedVenue?.slug?.toUpperCase() || selectedVenue?.name?.toUpperCase() || "VENUE"}`
                  : "RESET"}
              </span>{" "}
              para confirmar:
            </label>
            <Input
              value={confirmInput}
              onChange={(e) => setConfirmInput(e.target.value)}
              placeholder={confirmDialog?.type === "full" ? "RESET BERLIN" : "RESET"}
              className="font-mono"
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialog(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={confirmReset}
              disabled={
                resetTableMutation.isPending || 
                resetVenueMutation.isPending ||
                confirmInput !== (confirmDialog?.type === "full"
                  ? `RESET ${selectedVenue?.slug?.toUpperCase() || selectedVenue?.name?.toUpperCase() || "VENUE"}`
                  : "RESET")
              }
            >
              {(resetTableMutation.isPending || resetVenueMutation.isPending) ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Procesando...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Borrar Datos
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
