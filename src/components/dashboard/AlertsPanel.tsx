import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, X, Warehouse, Wine } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

interface Alert {
  id: string;
  product_id: string;
  message: string;
  created_at: string;
  is_read: boolean;
  alert_type: string;
}

// Helper to parse alert type and determine if it's bodega or bar related
const getAlertInfo = (alertType: string, message: string) => {
  const isBodega = alertType.includes('bodega') || alertType.includes('warehouse') || message.toLowerCase().includes('bodega');
  const isBar = alertType.includes('bar') || alertType.includes('barra') || message.toLowerCase().includes('barra');
  
  if (isBar) {
    return { icon: Wine, label: "Barra", color: "bg-orange-500" };
  }
  if (isBodega) {
    return { icon: Warehouse, label: "Bodega", color: "bg-amber-500" };
  }
  // Default to warehouse since that's the primary source
  return { icon: Warehouse, label: "Bodega", color: "bg-amber-500" };
};

export const AlertsPanel = () => {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAlerts();

    const channel = supabase
      .channel("alerts-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "stock_alerts" },
        () => {
          fetchAlerts();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchAlerts = async () => {
    try {
      const { data, error } = await supabase
        .from("stock_alerts")
        .select("*")
        .eq("is_read", false)
        .order("created_at", { ascending: false })
        .limit(5);

      if (error) throw error;
      setAlerts(data || []);
    } catch (error) {
      console.error("Error fetching alerts:", error);
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (id: string) => {
    try {
      const { error } = await supabase
        .from("stock_alerts")
        .update({ is_read: true })
        .eq("id", id);

      if (error) throw error;
      toast.success("Alerta marcada como leída");
      fetchAlerts();
    } catch (error) {
      console.error("Error marking alert as read:", error);
      toast.error("Error al marcar la alerta");
    }
  };

  if (loading) {
    return (
      <Card className="glass-effect">
        <CardHeader>
          <CardTitle>Alertas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-effect shadow-elegant">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-destructive" />
          <span className="text-xl">Alertas Activas</span>
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          Las alertas indican si el stock bajo es en Bodega (para reposición) o en Barras (para servicio)
        </p>
      </CardHeader>
      <CardContent>
        {alerts.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-muted-foreground">No hay alertas activas</p>
            <p className="text-sm text-muted-foreground mt-1">
              ¡Todo está bajo control! 🎉
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {alerts.map((alert) => {
              const alertInfo = getAlertInfo(alert.alert_type, alert.message);
              const AlertIcon = alertInfo.icon;
              
              return (
                <div
                  key={alert.id}
                  className="alert-gradient p-4 rounded-lg text-white relative overflow-hidden hover-lift"
                >
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute top-2 right-2 h-6 w-6 text-white hover:bg-white/20"
                    onClick={() => markAsRead(alert.id)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                  <div className="pr-8">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="secondary" className={`${alertInfo.color} text-white text-xs`}>
                        <AlertIcon className="h-3 w-3 mr-1" />
                        {alertInfo.label}
                      </Badge>
                    </div>
                    <p className="text-sm font-medium">{alert.message}</p>
                    <p className="text-xs opacity-75 mt-1">
                      {new Date(alert.created_at).toLocaleString("es-ES")}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
