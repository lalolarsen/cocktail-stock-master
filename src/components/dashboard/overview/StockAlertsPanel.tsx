import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
  const warehouseAlerts = alerts.filter(a => a.type === 'warehouse');
  const barAlerts = alerts.filter(a => a.type === 'bar');
  const expiryAlerts = alerts.filter(a => a.type === 'expiry');

  if (loading) {
    return (
      <Card>
        <CardContent className="p-4">
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (alerts.length === 0) {
    return (
      <Card>
        <CardContent className="p-4 flex items-center gap-3 text-muted-foreground">
          <Package className="h-5 w-5 opacity-50" />
          <div>
            <p className="text-sm font-medium">Sin alertas de stock</p>
            <p className="text-xs">Todo el inventario está en orden ✓</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const renderGroup = (title: string, icon: React.ReactNode, items: AlertItem[]) => {
    if (items.length === 0) return null;
    return (
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-1">
          {icon}
          <span>{title}</span>
          <Badge variant="secondary" className="h-4 text-[9px] px-1 ml-auto">{items.length}</Badge>
        </div>
        {items.map(alert => (
          <div
            key={alert.id}
            className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md text-sm ${
              alert.severity === 'critical'
                ? 'bg-destructive/8 text-destructive'
                : 'bg-muted/50'
            }`}
          >
            <span className="truncate text-xs font-medium">{alert.productName}</span>
            <div className="flex items-center gap-1.5 shrink-0">
              {alert.type !== 'expiry' && (
                <span className="text-[10px] tabular-nums text-muted-foreground">
                  {alert.current}/{alert.minimum}
                </span>
              )}
              {alert.type === 'expiry' && alert.expiryDate && (
                <span className="text-[10px] tabular-nums text-destructive font-medium">
                  {format(new Date(alert.expiryDate), "dd/MM")}
                </span>
              )}
              {alert.severity === 'critical' && (
                <span className="w-1.5 h-1.5 rounded-full bg-destructive" />
              )}
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <Card>
      <CardHeader className="pb-2 px-4 pt-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
            Alertas
            {criticalCount > 0 && (
              <Badge variant="destructive" className="h-4 text-[9px] px-1.5">
                {criticalCount}
              </Badge>
            )}
          </CardTitle>
          <span className="text-[10px] text-muted-foreground">{alerts.length} total</span>
        </div>
      </CardHeader>
      <CardContent className="px-3 pb-3 space-y-3">
        {renderGroup("Bodega", <Warehouse className="h-3 w-3" />, warehouseAlerts)}
        {renderGroup("Barras", <Store className="h-3 w-3" />, barAlerts)}
        {renderGroup("Vencimiento", <Clock className="h-3 w-3" />, expiryAlerts)}

        <Button
          variant="ghost"
          className="w-full text-xs h-7 text-muted-foreground"
          onClick={() => onNavigate?.("inventory")}
        >
          Ver inventario
          <ChevronRight className="h-3 w-3 ml-1" />
        </Button>
      </CardContent>
    </Card>
  );
}
