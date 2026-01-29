import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertTriangle, Warehouse, Store, Clock, ChevronRight, Package } from "lucide-react";
import { format } from "date-fns";

interface AlertItem {
  id: string;
  productName: string;
  location: string;
  current: number;
  minimum: number;
  type: 'warehouse' | 'bar' | 'expiry';
  expiryDate?: string;
  severity: 'critical' | 'warning';
}

interface Props {
  onNavigate?: (view: string) => void;
}

export function StockAlertsPanel({ onNavigate }: Props) {
  const [loading, setLoading] = useState(true);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);

  useEffect(() => {
    fetchAlerts();
  }, []);

  const fetchAlerts = async () => {
    try {
      const { data: products } = await supabase
        .from("products")
        .select("id, name, minimum_stock");

      const { data: locations } = await supabase
        .from("stock_locations")
        .select("id, name, type")
        .eq("is_active", true);

      const { data: balances } = await supabase
        .from("stock_balances")
        .select("product_id, location_id, quantity");

      if (!products || !locations || !balances) return;

      const productMap = new Map(products.map(p => [p.id, p]));
      const locationMap = new Map(locations.map(l => [l.id, l]));

      const allAlerts: AlertItem[] = [];

      balances.forEach(b => {
        const product = productMap.get(b.product_id);
        const location = locationMap.get(b.location_id);
        if (!product || !location) return;

        const qty = Number(b.quantity);
        const min = product.minimum_stock;

        if (location.type === 'warehouse' && qty <= min) {
          allAlerts.push({
            id: `${b.product_id}-${b.location_id}`,
            productName: product.name,
            location: location.name,
            current: qty,
            minimum: min,
            type: 'warehouse',
            severity: qty === 0 ? 'critical' : 'warning'
          });
        } else if (location.type === 'bar' && qty < min * 0.5) {
          allAlerts.push({
            id: `${b.product_id}-${b.location_id}`,
            productName: product.name,
            location: location.name,
            current: qty,
            minimum: min,
            type: 'bar',
            severity: qty === 0 ? 'critical' : 'warning'
          });
        }
      });

      // Expiring lots
      const sevenDaysLater = new Date();
      sevenDaysLater.setDate(sevenDaysLater.getDate() + 14);

      const { data: expiringLots } = await supabase
        .from("stock_lots")
        .select("id, product_id, location_id, quantity, expires_at")
        .lte("expires_at", sevenDaysLater.toISOString().split("T")[0])
        .gt("quantity", 0)
        .eq("is_depleted", false)
        .limit(10);

      expiringLots?.forEach(lot => {
        const product = productMap.get(lot.product_id);
        const location = locationMap.get(lot.location_id);
        
        const daysUntilExpiry = Math.ceil(
          (new Date(lot.expires_at).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
        );

        allAlerts.push({
          id: lot.id,
          productName: product?.name || 'Desconocido',
          location: location?.name || 'Desconocida',
          current: Number(lot.quantity),
          minimum: 0,
          type: 'expiry',
          expiryDate: lot.expires_at,
          severity: daysUntilExpiry <= 3 ? 'critical' : 'warning'
        });
      });

      // Sort: critical first, then by type
      allAlerts.sort((a, b) => {
        if (a.severity !== b.severity) return a.severity === 'critical' ? -1 : 1;
        return 0;
      });

      setAlerts(allAlerts.slice(0, 12));
    } catch (error) {
      console.error("Error fetching alerts:", error);
    } finally {
      setLoading(false);
    }
  };

  const criticalCount = alerts.filter(a => a.severity === 'critical').length;
  const warehouseCount = alerts.filter(a => a.type === 'warehouse').length;
  const barCount = alerts.filter(a => a.type === 'bar').length;
  const expiryCount = alerts.filter(a => a.type === 'expiry').length;

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning" />
            Alertas de Stock
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-48 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning" />
            Alertas de Stock
          </CardTitle>
          {alerts.length > 0 && (
            <Badge variant={criticalCount > 0 ? "destructive" : "secondary"}>
              {alerts.length} {criticalCount > 0 && `(${criticalCount} críticas)`}
            </Badge>
          )}
        </div>
        {alerts.length > 0 && (
          <div className="flex gap-3 text-xs text-muted-foreground mt-1">
            {warehouseCount > 0 && (
              <span className="flex items-center gap-1">
                <Warehouse className="h-3 w-3" /> {warehouseCount}
              </span>
            )}
            {barCount > 0 && (
              <span className="flex items-center gap-1">
                <Store className="h-3 w-3" /> {barCount}
              </span>
            )}
            {expiryCount > 0 && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" /> {expiryCount}
              </span>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent>
        {alerts.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Sin alertas de stock</p>
            <p className="text-xs">Todo el inventario está en orden</p>
          </div>
        ) : (
          <>
            <ScrollArea className="h-52">
              <div className="space-y-2 pr-3">
                {alerts.map(alert => (
                  <div
                    key={alert.id}
                    className={`flex items-center gap-3 p-2.5 rounded-lg transition-colors ${
                      alert.severity === 'critical' 
                        ? 'bg-destructive/10 border border-destructive/20' 
                        : 'bg-muted/50 hover:bg-muted'
                    }`}
                  >
                    <div className={`p-1.5 rounded ${
                      alert.type === 'warehouse' ? 'bg-amber-500/10 text-amber-600' :
                      alert.type === 'bar' ? 'bg-emerald-500/10 text-emerald-600' :
                      'bg-red-500/10 text-red-600'
                    }`}>
                      {alert.type === 'warehouse' && <Warehouse className="h-3.5 w-3.5" />}
                      {alert.type === 'bar' && <Store className="h-3.5 w-3.5" />}
                      {alert.type === 'expiry' && <Clock className="h-3.5 w-3.5" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{alert.productName}</p>
                      <p className="text-xs text-muted-foreground">{alert.location}</p>
                    </div>
                    <div className="text-right shrink-0">
                      {alert.type === 'expiry' && alert.expiryDate ? (
                        <Badge variant="destructive" className="text-xs">
                          {format(new Date(alert.expiryDate), "dd/MM")}
                        </Badge>
                      ) : (
                        <Badge variant={alert.severity === 'critical' ? 'destructive' : 'outline'} className="text-xs">
                          {alert.current} / {alert.minimum}
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
            <Button 
              variant="ghost" 
              className="w-full mt-3 text-xs h-8"
              onClick={() => onNavigate?.("inventory")}
            >
              Ver inventario completo
              <ChevronRight className="h-3 w-3 ml-1" />
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
