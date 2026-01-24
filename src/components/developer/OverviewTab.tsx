import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { 
  Copy, 
  Calendar, 
  QrCode, 
  Package, 
  Ticket,
  CheckCircle2,
  XCircle,
  AlertCircle
} from "lucide-react";
import { VenueSelector } from "./VenueSelector";
import { format } from "date-fns";

interface OverviewTabProps {
  selectedVenueId: string | null;
  onSelectVenue: (venueId: string | null) => void;
}

export function OverviewTab({ selectedVenueId, onSelectVenue }: OverviewTabProps) {
  // Fetch health data for selected venue
  const { data: healthData, isLoading, isError, error } = useQuery({
    queryKey: ["dev-venue-health", selectedVenueId],
    queryFn: async () => {
      if (!selectedVenueId) return null;

      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      // Fetch active jornada
      const { data: activeJornada } = await supabase
        .from("jornadas")
        .select("id, estado, fecha, hora_apertura")
        .eq("venue_id", selectedVenueId)
        .eq("estado", "abierta")
        .maybeSingle();

      // Fetch last closed jornada
      const { data: lastClosedJornada } = await supabase
        .from("jornadas")
        .select("id, hora_cierre, fecha")
        .eq("venue_id", selectedVenueId)
        .eq("estado", "cerrada")
        .order("hora_cierre", { ascending: false })
        .limit(1)
        .maybeSingle();

      // QR redemptions last 24h
      const { data: redemptions } = await supabase
        .from("pickup_redemptions_log")
        .select("result")
        .gte("created_at", yesterday.toISOString());

      const successCount = redemptions?.filter(r => r.result === "success").length || 0;
      const failCount = redemptions?.filter(r => r.result !== "success").length || 0;

      // Stock movements last 24h
      const { count: stockMovementsCount } = await supabase
        .from("stock_movements")
        .select("id", { count: "exact", head: true })
        .gte("created_at", yesterday.toISOString());

      // Ticket sales last 24h (check if table exists)
      let ticketSalesCount: number | null = null;
      try {
        const { count } = await supabase
          .from("ticket_sales")
          .select("id", { count: "exact", head: true })
          .eq("venue_id", selectedVenueId)
          .gte("created_at", yesterday.toISOString());
        ticketSalesCount = count;
      } catch {
        ticketSalesCount = null;
      }

      return {
        activeJornada,
        lastClosedJornada,
        redemptions: { success: successCount, fail: failCount },
        stockMovementsCount: stockMovementsCount || 0,
        ticketSalesCount,
      };
    },
    enabled: !!selectedVenueId,
    retry: false,
    staleTime: 1000 * 30,
  });

  const copyDiagnostics = () => {
    if (!healthData) {
      toast.error("No hay datos para copiar");
      return;
    }

    const diagnostics = {
      venue_id: selectedVenueId,
      timestamp: new Date().toISOString(),
      active_jornada: healthData.activeJornada ? {
        id: healthData.activeJornada.id,
        fecha: healthData.activeJornada.fecha,
        estado: healthData.activeJornada.estado,
      } : null,
      last_closed_jornada: healthData.lastClosedJornada ? {
        id: healthData.lastClosedJornada.id,
        fecha: healthData.lastClosedJornada.fecha,
        hora_cierre: healthData.lastClosedJornada.hora_cierre,
      } : null,
      last_24h: {
        qr_redemptions_success: healthData.redemptions.success,
        qr_redemptions_fail: healthData.redemptions.fail,
        stock_movements: healthData.stockMovementsCount,
        ticket_sales: healthData.ticketSalesCount,
      },
    };

    navigator.clipboard.writeText(JSON.stringify(diagnostics, null, 2));
    toast.success("Diagnósticos copiados al portapapeles");
    console.log("Diagnostics:", diagnostics);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Seleccionar Venue</CardTitle>
          <CardDescription>
            Elige un venue para ver diagnósticos y gestionar configuración
          </CardDescription>
        </CardHeader>
        <CardContent>
          <VenueSelector 
            selectedVenueId={selectedVenueId} 
            onSelectVenue={onSelectVenue} 
          />
        </CardContent>
      </Card>

      {!selectedVenueId && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <AlertCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
            Selecciona un venue para ver diagnósticos
          </CardContent>
        </Card>
      )}

      {selectedVenueId && isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map(i => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-4 w-24 mb-2" />
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {selectedVenueId && isError && (
        <Card className="border-destructive/50">
          <CardContent className="py-6 text-center text-destructive">
            <XCircle className="h-8 w-8 mx-auto mb-2" />
            Error: {(error as Error).message}
          </CardContent>
        </Card>
      )}

      {selectedVenueId && healthData && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Active Jornada */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                  <Calendar className="h-4 w-4" />
                  Jornada Activa
                </div>
                {healthData.activeJornada ? (
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-primary" />
                    <span className="font-mono text-sm truncate">
                      {healthData.activeJornada.id.slice(0, 8)}...
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <XCircle className="h-5 w-5 text-muted-foreground" />
                    <span className="text-muted-foreground">Ninguna</span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Last Close */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                  <Calendar className="h-4 w-4" />
                  Último Cierre
                </div>
                {healthData.lastClosedJornada?.hora_cierre ? (
                  <span className="font-medium">
                    {healthData.lastClosedJornada.fecha} {healthData.lastClosedJornada.hora_cierre}
                  </span>
                ) : (
                  <span className="text-muted-foreground">N/A</span>
                )}
              </CardContent>
            </Card>

            {/* QR Redemptions */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                  <QrCode className="h-4 w-4" />
                  QR 24h
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="default">
                    {healthData.redemptions.success} ✓
                  </Badge>
                  <Badge variant="destructive">
                    {healthData.redemptions.fail} ✗
                  </Badge>
                </div>
              </CardContent>
            </Card>

            {/* Stock Movements */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                  <Package className="h-4 w-4" />
                  Stock Mov. 24h
                </div>
                <span className="text-2xl font-bold">{healthData.stockMovementsCount}</span>
              </CardContent>
            </Card>
          </div>

          {/* Ticket sales if available */}
          <Card>
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Ticket className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Ventas de tickets (24h)</span>
              </div>
              {healthData.ticketSalesCount !== null ? (
                <span className="text-xl font-bold">{healthData.ticketSalesCount}</span>
              ) : (
                <Badge variant="secondary">N/A</Badge>
              )}
            </CardContent>
          </Card>

          {/* Copy Diagnostics */}
          <Button onClick={copyDiagnostics} variant="outline" className="gap-2">
            <Copy className="h-4 w-4" />
            Copiar Diagnósticos (JSON)
          </Button>
        </>
      )}
    </div>
  );
}
