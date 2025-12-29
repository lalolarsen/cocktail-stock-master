import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileWarning, AlertTriangle, Clock, ChevronRight } from "lucide-react";

interface InvoicingAlerts {
  failedCount: number;
  stalePendingCount: number;
}

export function InvoicingAlertsWidget() {
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState<InvoicingAlerts>({ failedCount: 0, stalePendingCount: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAlerts();

    // Set up realtime subscription for sales_documents changes
    const channel = supabase
      .channel('invoicing-alerts-widget')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'sales_documents',
        },
        () => {
          // Refetch counts on any change
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
      // Fetch failed documents count
      const { count: failedCount, error: failedError } = await supabase
        .from('sales_documents')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'failed');

      if (failedError) throw failedError;

      // Fetch pending documents older than 10 minutes
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const { count: stalePendingCount, error: pendingError } = await supabase
        .from('sales_documents')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending')
        .lt('created_at', tenMinutesAgo);

      if (pendingError) throw pendingError;

      setAlerts({
        failedCount: failedCount || 0,
        stalePendingCount: stalePendingCount || 0,
      });
    } catch (error) {
      console.error('Error fetching invoicing alerts:', error);
    } finally {
      setLoading(false);
    }
  };

  const totalAlerts = alerts.failedCount + alerts.stalePendingCount;

  if (loading) {
    return (
      <Card className="bg-card/50 backdrop-blur-sm border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <FileWarning className="w-4 h-4" />
            Facturación
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-16 flex items-center justify-center">
            <div className="animate-pulse bg-muted rounded h-8 w-24" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (totalAlerts === 0) {
    return (
      <Card className="bg-card/50 backdrop-blur-sm border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <FileWarning className="w-4 h-4" />
            Facturación
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Sin alertas de documentos
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card/50 backdrop-blur-sm border-destructive/30 border-2">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <FileWarning className="w-4 h-4 text-destructive" />
            Alertas de Facturación
          </CardTitle>
          <Badge variant="destructive" className="text-xs">
            {totalAlerts} {totalAlerts === 1 ? 'alerta' : 'alertas'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {alerts.failedCount > 0 && (
          <Button
            variant="ghost"
            className="w-full justify-between h-auto py-2 px-3 hover:bg-destructive/10"
            onClick={() => navigate('/admin/documents?tab=failed')}
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-destructive" />
              <span className="text-sm">Documentos fallidos</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="border-destructive/50 text-destructive">
                {alerts.failedCount}
              </Badge>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </div>
          </Button>
        )}

        {alerts.stalePendingCount > 0 && (
          <Button
            variant="ghost"
            className="w-full justify-between h-auto py-2 px-3 hover:bg-amber-500/10"
            onClick={() => navigate('/admin/documents?tab=pending')}
          >
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-500" />
              <span className="text-sm">Pendientes &gt;10 min</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="border-amber-500/50 text-amber-600">
                {alerts.stalePendingCount}
              </Badge>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </div>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
