import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { AlertCircle, Flag, Loader2, RotateCcw, ShoppingCart, Ticket, QrCode, Package, ArrowRightLeft, FileUp, Calendar, Wallet, FileText, Calculator, Receipt, FileCheck } from "lucide-react";
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
import { Separator } from "@/components/ui/separator";

interface FlagsTabProps {
  selectedVenueId: string | null;
  onSelectVenue: (venueId: string | null) => void;
}

// Organized feature flags by category
const FLAG_CATEGORIES = [
  {
    name: "Ventas",
    icon: ShoppingCart,
    flags: [
      { key: "ventas_alcohol", name: "Ventas de Alcohol", description: "Venta de bebidas alcohólicas en barra", icon: ShoppingCart },
      { key: "ventas_tickets", name: "Ventas de Tickets", description: "Módulo de venta de entradas/covers", icon: Ticket },
      { key: "qr_cover", name: "QR Cover", description: "Tokens de retiro de cover en barra", icon: QrCode },
    ],
  },
  {
    name: "Inventario",
    icon: Package,
    flags: [
      { key: "inventario", name: "Inventario", description: "Gestión de inventario y stock", icon: Package },
      { key: "reposicion", name: "Reposición", description: "Control de reposición entre ubicaciones", icon: ArrowRightLeft },
      { key: "importacion_excel", name: "Importación Excel", description: "Importar facturas desde Excel", icon: FileUp },
    ],
  },
  {
    name: "Operaciones",
    icon: Calendar,
    flags: [
      { key: "jornadas", name: "Jornadas", description: "Gestión de jornadas laborales", icon: Calendar },
      { key: "arqueo", name: "Arqueo de Caja", description: "Control y cierre de caja", icon: Wallet },
      { key: "reportes", name: "Reportes", description: "Acceso a reportes y estadísticas", icon: FileText },
    ],
  },
  {
    name: "Contabilidad",
    icon: Calculator,
    flags: [
      { key: "contabilidad_basica", name: "Contabilidad Básica", description: "Ingresos, gastos y estado de resultados", icon: Calculator },
      { key: "contabilidad_avanzada", name: "Contabilidad Avanzada", description: "Facturación electrónica SII", icon: Receipt },
      { key: "lector_facturas", name: "Lector de Facturas", description: "OCR de documentos de compra", icon: FileCheck },
    ],
  },
];

interface VenueFlag {
  flag_key: string;
  flag_name: string;
  description: string;
  enabled: boolean;
}

export function FlagsTab({ selectedVenueId, onSelectVenue }: FlagsTabProps) {
  const queryClient = useQueryClient();
  const [updatingFlag, setUpdatingFlag] = useState<string | null>(null);

  // Fetch flags using the new RPC
  const { data: flags = [], isLoading, isError, error } = useQuery({
    queryKey: ["venue-flags", selectedVenueId],
    queryFn: async () => {
      if (!selectedVenueId) return [];
      const { data, error } = await supabase.rpc("get_venue_flags", {
        p_venue_id: selectedVenueId,
      });
      if (error) throw error;
      return data as VenueFlag[];
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
      queryClient.invalidateQueries({ queryKey: ["venue-flags", selectedVenueId] });
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
      queryClient.invalidateQueries({ queryKey: ["venue-flags", selectedVenueId] });
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
    const flag = flags.find(f => f.flag_key === key);
    return flag?.enabled ?? false;
  };

  const enabledCount = flags.filter(f => f.enabled).length;
  const totalCount = flags.length;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Flag className="h-5 w-5" />
            Feature Flags
          </CardTitle>
          <CardDescription>
            Gestiona funcionalidades habilitadas para cada venue
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <VenueSelector 
            selectedVenueId={selectedVenueId} 
            onSelectVenue={onSelectVenue} 
          />

          {selectedVenueId && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  {enabledCount}/{totalCount} activos
                </Badge>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2">
                    <RotateCcw className="h-4 w-4" />
                    Reset to Stable
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>¿Resetear flags?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Esto establecerá todos los flags a sus valores estables predeterminados.
                      Las funciones básicas (ventas, inventario, jornadas, arqueo, reportes, contabilidad básica) quedarán activas.
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
            </div>
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
        <div className="space-y-4">
          {FLAG_CATEGORIES.map((category) => (
            <Card key={category.name}>
              <CardHeader className="py-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <category.icon className="h-4 w-4 text-muted-foreground" />
                  {category.name}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-2">
                {category.flags.map((flagDef, index) => {
                  const isEnabled = getFlagEnabled(flagDef.key);
                  const isUpdating = updatingFlag === flagDef.key;

                  return (
                    <div key={flagDef.key}>
                      {index > 0 && <Separator className="my-2" />}
                      <div className="flex items-center justify-between py-2">
                        <div className="flex items-start gap-3 min-w-0">
                          <flagDef.icon className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-sm">{flagDef.name}</span>
                              <Badge 
                                variant={isEnabled ? "default" : "secondary"} 
                                className="text-xs"
                              >
                                {isEnabled ? "ON" : "OFF"}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {flagDef.description}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {isUpdating && <Loader2 className="h-4 w-4 animate-spin" />}
                          <Switch
                            checked={isEnabled}
                            disabled={isUpdating}
                            onCheckedChange={() => handleToggle(flagDef.key, isEnabled)}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
