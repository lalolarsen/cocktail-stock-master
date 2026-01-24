import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { AlertCircle, Flag, Loader2, RotateCcw } from "lucide-react";
import { VenueSelector } from "./VenueSelector";
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

interface FlagsTabProps {
  selectedVenueId: string | null;
  onSelectVenue: (venueId: string | null) => void;
}

const KNOWN_FLAGS = [
  { key: "FEATURE_TICKETS", name: "Módulo de Tickets", description: "Ventas de entradas/covers" },
  { key: "FEATURE_QR_REDEMPTION", name: "Canje QR", description: "Tokens de retiro en barra" },
  { key: "FEATURE_MULTI_POS", name: "Multi POS", description: "Múltiples puntos de venta" },
  { key: "FEATURE_INVOICING", name: "Facturación Electrónica", description: "Boletas y facturas SII" },
  { key: "FEATURE_EXPIRES_TRACKING", name: "Tracking de Vencimientos", description: "Control de lotes y fechas" },
  { key: "FEATURE_INVOICE_STOCK_READER", name: "Lector de Facturas", description: "OCR de documentos de compra" },
];

interface DevFlag {
  id: string;
  venue_id: string;
  key: string;
  is_enabled: boolean;
  updated_at: string;
}

export function FlagsTab({ selectedVenueId, onSelectVenue }: FlagsTabProps) {
  const queryClient = useQueryClient();
  const [updatingFlag, setUpdatingFlag] = useState<string | null>(null);

  const { data: flags = [], isLoading, isError, error } = useQuery({
    queryKey: ["dev-flags", selectedVenueId],
    queryFn: async () => {
      if (!selectedVenueId) return [];
      const { data, error } = await supabase
        .from("developer_feature_flags")
        .select("*")
        .eq("venue_id", selectedVenueId);
      if (error) throw error;
      return data as DevFlag[];
    },
    enabled: !!selectedVenueId,
    retry: false,
  });

  const setFlagMutation = useMutation({
    mutationFn: async ({ key, isEnabled }: { key: string; isEnabled: boolean }) => {
      const { data, error } = await supabase.rpc("dev_set_feature_flag", {
        p_venue_id: selectedVenueId!,
        p_key: key,
        p_is_enabled: isEnabled,
      });
      if (error) throw error;
      const result = data as { success: boolean; error?: string };
      if (!result.success) throw new Error(result.error || "Unknown error");
      return result;
    },
    onSuccess: (_, { key, isEnabled }) => {
      queryClient.invalidateQueries({ queryKey: ["dev-flags", selectedVenueId] });
      queryClient.invalidateQueries({ queryKey: ["dev-flag-audit"] });
      toast.success(`${key} ${isEnabled ? "activado" : "desactivado"}`);
    },
    onError: (error: Error) => {
      console.error("Flag update error:", error);
      toast.error(`Error: ${error.message}`);
    },
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("dev_reset_flags_to_stable", {
        p_venue_id: selectedVenueId!,
      });
      if (error) throw error;
      const result = data as { success: boolean; error?: string };
      if (!result.success) throw new Error(result.error || "Unknown error");
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dev-flags", selectedVenueId] });
      queryClient.invalidateQueries({ queryKey: ["dev-flag-audit"] });
      toast.success("Flags reseteados a valores estables v1.0");
    },
    onError: (error: Error) => {
      console.error("Reset error:", error);
      toast.error(`Error: ${error.message}`);
    },
  });

  const handleToggle = async (key: string, currentEnabled: boolean) => {
    setUpdatingFlag(key);
    try {
      await setFlagMutation.mutateAsync({ key, isEnabled: !currentEnabled });
    } finally {
      setUpdatingFlag(null);
    }
  };

  const getFlagEnabled = (key: string): boolean => {
    const flag = flags.find(f => f.key === key);
    return flag?.is_enabled ?? false;
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Flag className="h-5 w-5" />
            Feature Flags
          </CardTitle>
          <CardDescription>
            Gestiona banderas de funcionalidades para el venue seleccionado
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <VenueSelector 
            selectedVenueId={selectedVenueId} 
            onSelectVenue={onSelectVenue} 
          />

          {selectedVenueId && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <RotateCcw className="h-4 w-4" />
                  Reset to Stable v1.0
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Resetear flags?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Esto establecerá todos los flags a sus valores estables predeterminados (v1.0).
                    Solo FEATURE_QR_REDEMPTION quedará activado.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction 
                    onClick={() => resetMutation.mutate()}
                    disabled={resetMutation.isPending}
                  >
                    {resetMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Confirmar Reset
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </CardContent>
      </Card>

      {!selectedVenueId && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <AlertCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
            Selecciona un venue para gestionar flags
          </CardContent>
        </Card>
      )}

      {selectedVenueId && isLoading && (
        <Card>
          <CardContent className="p-4 space-y-3">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                <div className="space-y-1">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-48" />
                </div>
                <Skeleton className="h-6 w-10" />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {selectedVenueId && isError && (
        <Card className="border-destructive/50">
          <CardContent className="py-6 text-center text-destructive">
            Error: {(error as Error).message}
          </CardContent>
        </Card>
      )}

      {selectedVenueId && !isLoading && !isError && (
        <Card>
          <CardContent className="p-4 space-y-2">
            {KNOWN_FLAGS.map(flagDef => {
              const isEnabled = getFlagEnabled(flagDef.key);
              const isUpdating = updatingFlag === flagDef.key;

              return (
                <div
                  key={flagDef.key}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/30"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{flagDef.name}</span>
                      <Badge 
                        variant={isEnabled ? "default" : "outline"} 
                        className="text-xs"
                      >
                        {isEnabled ? "ON" : "OFF"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {flagDef.description}
                    </p>
                    <code className="text-xs text-muted-foreground font-mono">
                      {flagDef.key}
                    </code>
                  </div>
                  <div className="flex items-center gap-2">
                    {isUpdating && <Loader2 className="h-4 w-4 animate-spin" />}
                    <Switch
                      checked={isEnabled}
                      disabled={isUpdating}
                      onCheckedChange={() => handleToggle(flagDef.key, isEnabled)}
                    />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
