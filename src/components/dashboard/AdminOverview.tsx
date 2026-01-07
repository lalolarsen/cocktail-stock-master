import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Calendar, 
  DollarSign, 
  QrCode, 
  Store, 
  Package, 
  Play, 
  Square, 
  ClipboardList, 
  UtensilsCrossed,
  AlertTriangle,
  Warehouse,
  Clock,
  ExternalLink,
  Loader2
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { formatCLP } from "@/lib/currency";
import { toast } from "sonner";
import { CashReconciliationDialog } from "./CashReconciliationDialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Jornada {
  id: string;
  numero_jornada: number;
  fecha: string;
  hora_apertura: string | null;
  estado: string;
}

interface TodayStats {
  salesToday: number;
  transactionsToday: number;
  qrsRedeemed: number;
  grossIncome: number;
}

interface BarStatus {
  id: string;
  name: string;
  status: 'operational' | 'low';
  lowCount: number;
  totalProducts: number;
}

interface AlertItem {
  id: string;
  productName: string;
  location: string;
  current: number;
  minimum: number;
  type: 'warehouse' | 'bar';
  expiryDate?: string;
}

interface Props {
  isReadOnly?: boolean;
  onNavigate?: (view: string) => void;
}

export function AdminOverview({ isReadOnly = false, onNavigate }: Props) {
  const [loading, setLoading] = useState(true);
  const [jornada, setJornada] = useState<Jornada | null>(null);
  const [todayStats, setTodayStats] = useState<TodayStats>({ salesToday: 0, transactionsToday: 0, qrsRedeemed: 0, grossIncome: 0 });
  const [barStatuses, setBarStatuses] = useState<BarStatus[]>([]);
  const [warehouseAlerts, setWarehouseAlerts] = useState<AlertItem[]>([]);
  const [barAlerts, setBarAlerts] = useState<AlertItem[]>([]);
  const [expiryAlerts, setExpiryAlerts] = useState<AlertItem[]>([]);
  
  // Jornada actions state
  const [syncing, setSyncing] = useState(false);
  const [showOpeningDialog, setShowOpeningDialog] = useState(false);
  const [showReconciliation, setShowReconciliation] = useState(false);
  const [openingCash, setOpeningCash] = useState("");

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        fetchJornada(),
        fetchTodayStats(),
        fetchBarStatuses(),
        fetchAlerts()
      ]);
    } finally {
      setLoading(false);
    }
  };

  const fetchJornada = async () => {
    const today = new Date().toISOString().split("T")[0];
    const { data } = await supabase
      .from("jornadas")
      .select("id, numero_jornada, fecha, hora_apertura, estado")
      .or(`estado.eq.activa,fecha.eq.${today}`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setJornada(data);
  };

  const fetchTodayStats = async () => {
    const today = new Date().toISOString().split("T")[0];
    
    // Sales today
    const { data: salesData } = await supabase
      .from("sales")
      .select("total_amount")
      .gte("created_at", `${today}T00:00:00`)
      .eq("payment_status", "paid")
      .eq("is_cancelled", false);
    
    // Ticket sales today
    const { data: ticketData } = await supabase
      .from("ticket_sales")
      .select("total")
      .gte("created_at", `${today}T00:00:00`)
      .eq("payment_status", "paid");

    // QRs redeemed today
    const { count: qrCount } = await supabase
      .from("pickup_redemptions_log")
      .select("*", { count: "exact", head: true })
      .gte("redeemed_at", `${today}T00:00:00`)
      .eq("result", "success");

    // Gross income today
    const { data: incomeData } = await supabase
      .from("gross_income_entries")
      .select("amount")
      .gte("created_at", `${today}T00:00:00`);

    const barSalesTotal = salesData?.reduce((sum, s) => sum + Number(s.total_amount), 0) || 0;
    const ticketSalesTotal = ticketData?.reduce((sum, t) => sum + t.total, 0) || 0;
    const transactionsCount = (salesData?.length || 0) + (ticketData?.length || 0);
    const grossIncomeTotal = incomeData?.reduce((sum, i) => sum + i.amount, 0) || 0;

    setTodayStats({
      salesToday: barSalesTotal + ticketSalesTotal,
      transactionsToday: transactionsCount,
      qrsRedeemed: qrCount || 0,
      grossIncome: grossIncomeTotal
    });
  };

  const fetchBarStatuses = async () => {
    // Get bar locations
    const { data: bars } = await supabase
      .from("stock_locations")
      .select("id, name")
      .eq("type", "bar")
      .eq("is_active", true);

    if (!bars?.length) {
      setBarStatuses([]);
      return;
    }

    // Get products with minimum stock
    const { data: products } = await supabase
      .from("products")
      .select("id, minimum_stock");

    const productMinMap = new Map(products?.map(p => [p.id, p.minimum_stock]) || []);

    // Get stock balances for bars
    const { data: balances } = await supabase
      .from("stock_balances")
      .select("location_id, product_id, quantity")
      .in("location_id", bars.map(b => b.id));

    // Calculate bar statuses
    const statuses: BarStatus[] = bars.map(bar => {
      const barBalances = balances?.filter(b => b.location_id === bar.id) || [];
      const lowCount = barBalances.filter(b => {
        const minStock = productMinMap.get(b.product_id) || 0;
        return Number(b.quantity) < minStock * 0.5;
      }).length;
      
      return {
        id: bar.id,
        name: bar.name,
        status: lowCount > 3 ? 'low' : 'operational',
        lowCount,
        totalProducts: barBalances.length
      };
    });

    setBarStatuses(statuses);
  };

  const fetchAlerts = async () => {
    // Get products and locations
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

    const warehouse: AlertItem[] = [];
    const bars: AlertItem[] = [];

    balances.forEach(b => {
      const product = productMap.get(b.product_id);
      const location = locationMap.get(b.location_id);
      if (!product || !location) return;

      const qty = Number(b.quantity);
      const min = product.minimum_stock;

      if (location.type === 'warehouse' && qty <= min) {
        warehouse.push({
          id: b.product_id + b.location_id,
          productName: product.name,
          location: location.name,
          current: qty,
          minimum: min,
          type: 'warehouse'
        });
      } else if (location.type === 'bar' && qty < min * 0.5) {
        bars.push({
          id: b.product_id + b.location_id,
          productName: product.name,
          location: location.name,
          current: qty,
          minimum: min,
          type: 'bar'
        });
      }
    });

    setWarehouseAlerts(warehouse.slice(0, 5));
    setBarAlerts(bars.slice(0, 5));

    // Fetch expiring lots
    const sevenDaysLater = new Date();
    sevenDaysLater.setDate(sevenDaysLater.getDate() + 14);
    
    const { data: expiringLots } = await supabase
      .from("stock_lots")
      .select("id, product_id, location_id, quantity, expires_at")
      .lte("expires_at", sevenDaysLater.toISOString().split("T")[0])
      .gt("quantity", 0)
      .eq("is_depleted", false)
      .limit(5);

    if (expiringLots) {
      const expiryItems: AlertItem[] = expiringLots.map(lot => {
        const product = productMap.get(lot.product_id);
        const location = locationMap.get(lot.location_id);
        return {
          id: lot.id,
          productName: product?.name || 'Desconocido',
          location: location?.name || 'Desconocida',
          current: Number(lot.quantity),
          minimum: 0,
          type: 'warehouse',
          expiryDate: lot.expires_at
        };
      });
      setExpiryAlerts(expiryItems);
    }
  };

  // Jornada actions
  const handleOpenJornada = () => {
    setOpeningCash("");
    setShowOpeningDialog(true);
  };

  const confirmOpenJornada = async () => {
    const opening = parseFloat(openingCash) || 0;
    setSyncing(true);
    setShowOpeningDialog(false);
    
    try {
      const now = new Date();
      const currentTime = now.toTimeString().slice(0, 5);
      const today = now.toISOString().split("T")[0];

      const daysSinceMonday = now.getDay() === 0 ? 6 : now.getDay() - 1;
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - daysSinceMonday);
      const weekStartStr = weekStart.toISOString().split("T")[0];

      const { data: weekJornadas } = await supabase
        .from("jornadas")
        .select("numero_jornada")
        .eq("semana_inicio", weekStartStr)
        .order("numero_jornada", { ascending: false });

      const lastNum = weekJornadas?.[0]?.numero_jornada || 0;

      const { data: newJornada, error } = await supabase
        .from("jornadas")
        .insert({
          numero_jornada: lastNum + 1,
          semana_inicio: weekStartStr,
          fecha: today,
          hora_apertura: currentTime,
          estado: "activa",
        })
        .select()
        .single();

      if (error) throw error;

      await supabase.from("cash_registers").insert({
        jornada_id: newJornada.id,
        opening_cash: opening,
      });

      toast.success("Jornada abierta");
      fetchData();
    } catch (error) {
      console.error("Error:", error);
      toast.error("Error al abrir jornada");
    } finally {
      setSyncing(false);
    }
  };

  const handleCloseJornada = () => {
    if (!jornada) return;
    setShowReconciliation(true);
  };

  const handleReconciliationComplete = async () => {
    setShowReconciliation(false);
    setSyncing(true);
    
    try {
      const currentTime = new Date().toTimeString().slice(0, 5);
      await supabase
        .from("jornadas")
        .update({ estado: "cerrada", hora_cierre: currentTime })
        .eq("id", jornada!.id);
      
      toast.success("Jornada cerrada");
      fetchData();
    } catch (error) {
      toast.error("Error al cerrar jornada");
    } finally {
      setSyncing(false);
    }
  };

  const getJornadaStatus = () => {
    if (!jornada) return { label: "Sin jornada", variant: "outline" as const };
    if (jornada.estado === "activa") return { label: "Activa", variant: "default" as const };
    return { label: "Cerrada", variant: "secondary" as const };
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const jornadaStatus = getJornadaStatus();

  return (
    <div className="space-y-6">
      {/* A) Estado de hoy */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            Estado de hoy
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {/* Jornada Status */}
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Jornada</p>
              <div className="flex items-center gap-2">
                <Badge 
                  variant={jornadaStatus.variant}
                  className={jornada?.estado === "activa" ? "bg-green-500 hover:bg-green-600" : ""}
                >
                  {jornadaStatus.label}
                </Badge>
                {jornada?.estado === "activa" && jornada.hora_apertura && (
                  <span className="text-xs text-muted-foreground">desde {jornada.hora_apertura}</span>
                )}
              </div>
            </div>

            {/* Gross Income Today */}
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Ingresos brutos</p>
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-green-500" />
                <span className="text-xl font-bold">{formatCLP(todayStats.grossIncome)}</span>
              </div>
            </div>

            {/* Sales Today */}
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Ventas</p>
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold">{formatCLP(todayStats.salesToday)}</span>
              </div>
              <p className="text-xs text-muted-foreground">{todayStats.transactionsToday} txn</p>
            </div>

            {/* QRs Redeemed */}
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">QRs canjeados</p>
              <div className="flex items-center gap-2">
                <QrCode className="h-4 w-4 text-blue-500" />
                <span className="text-xl font-bold">{todayStats.qrsRedeemed}</span>
              </div>
            </div>

            {/* Bar Status */}
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Barras</p>
              <div className="flex flex-wrap gap-1">
                {barStatuses.length === 0 ? (
                  <span className="text-sm text-muted-foreground">Sin barras</span>
                ) : (
                  barStatuses.map(bar => (
                    <Badge 
                      key={bar.id} 
                      variant={bar.status === 'operational' ? 'default' : 'destructive'}
                      className={bar.status === 'operational' ? 'bg-green-500/10 text-green-600 border-green-500/20' : ''}
                    >
                      <Store className="h-3 w-3 mr-1" />
                      {bar.name.replace('Barra ', 'B')}: {bar.status === 'operational' ? 'OK' : 'Baja'}
                    </Badge>
                  ))
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* B) Acciones rápidas */}
      {!isReadOnly && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg font-semibold">Acciones rápidas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* A) Primary action - Jornada control */}
            {jornada?.estado === "activa" ? (
              <Button 
                size="lg" 
                variant="destructive"
                className="w-full h-12 gap-3 text-base font-medium"
                onClick={handleCloseJornada}
                disabled={syncing}
              >
                {syncing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Square className="h-5 w-5" />}
                Cerrar jornada
              </Button>
            ) : (
              <Button 
                size="lg" 
                className="w-full h-12 gap-3 text-base font-medium"
                onClick={handleOpenJornada}
                disabled={syncing}
              >
                {syncing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Play className="h-5 w-5" />}
                Abrir jornada
              </Button>
            )}

            {/* B) Secondary operational actions */}
            <div className="grid grid-cols-2 gap-3">
              <Button 
                size="lg" 
                variant="secondary"
                className="h-11 gap-2"
                onClick={() => onNavigate?.("replenishment")}
              >
                <ClipboardList className="h-4 w-4" />
                Preparar reposición
              </Button>

              <Button 
                size="lg" 
                variant="secondary"
                className="h-11 gap-2"
                onClick={() => window.location.href = "/admin/income"}
              >
                <DollarSign className="h-4 w-4" />
                Ingresos brutos
              </Button>
            </div>

            {/* C) Management shortcuts */}
            <div className="flex gap-3 pt-1">
              <Button 
                variant="ghost"
                className="h-9 gap-2 text-muted-foreground hover:text-foreground"
                onClick={() => onNavigate?.("products")}
              >
                <Package className="h-4 w-4" />
                Productos
              </Button>

              <Button 
                variant="ghost"
                className="h-9 gap-2 text-muted-foreground hover:text-foreground"
                onClick={() => onNavigate?.("menu")}
              >
                <UtensilsCrossed className="h-4 w-4" />
                Carta
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* C) Alertas */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Alertas
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="warehouse" className="w-full">
            <TabsList className="w-full grid grid-cols-3">
              <TabsTrigger value="warehouse" className="flex items-center gap-1">
                <Warehouse className="h-4 w-4" />
                Bodega ({warehouseAlerts.length})
              </TabsTrigger>
              <TabsTrigger value="bars" className="flex items-center gap-1">
                <Store className="h-4 w-4" />
                Barras ({barAlerts.length})
              </TabsTrigger>
              <TabsTrigger value="expiry" className="flex items-center gap-1">
                <Clock className="h-4 w-4" />
                Vencimientos ({expiryAlerts.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="warehouse" className="mt-4">
              <AlertList 
                items={warehouseAlerts} 
                emptyMessage="Sin alertas de bodega" 
                onNavigate={onNavigate}
              />
            </TabsContent>

            <TabsContent value="bars" className="mt-4">
              <AlertList 
                items={barAlerts} 
                emptyMessage="Sin alertas de barras" 
                onNavigate={onNavigate}
              />
            </TabsContent>

            <TabsContent value="expiry" className="mt-4">
              <AlertList 
                items={expiryAlerts} 
                emptyMessage="Sin productos por vencer" 
                showExpiry
                onNavigate={onNavigate}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Opening Cash Dialog */}
      <Dialog open={showOpeningDialog} onOpenChange={setShowOpeningDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Apertura de Caja</DialogTitle>
            <DialogDescription>Ingresa el efectivo inicial para esta jornada</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="opening-cash">Efectivo Inicial</Label>
              <Input
                id="opening-cash"
                type="number"
                placeholder="0"
                value={openingCash}
                onChange={(e) => setOpeningCash(e.target.value)}
                min="0"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowOpeningDialog(false)}>Cancelar</Button>
            <Button onClick={confirmOpenJornada} disabled={syncing}>
              {syncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Abrir Jornada
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cash Reconciliation Dialog */}
      {jornada && (
        <CashReconciliationDialog
          open={showReconciliation}
          onClose={() => setShowReconciliation(false)}
          onReconciled={handleReconciliationComplete}
          jornadaId={jornada.id}
        />
      )}
    </div>
  );
}

// Alert List Component
function AlertList({ 
  items, 
  emptyMessage, 
  showExpiry = false,
  onNavigate 
}: { 
  items: AlertItem[]; 
  emptyMessage: string;
  showExpiry?: boolean;
  onNavigate?: (view: string) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map(item => (
        <div 
          key={item.id} 
          className="flex items-center justify-between p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors"
        >
          <div className="flex-1 min-w-0">
            <p className="font-medium truncate">{item.productName}</p>
            <p className="text-sm text-muted-foreground">{item.location}</p>
          </div>
          <div className="flex items-center gap-3">
            {showExpiry && item.expiryDate ? (
              <Badge variant="destructive" className="whitespace-nowrap">
                Vence: {format(new Date(item.expiryDate), "dd/MM")}
              </Badge>
            ) : (
              <Badge variant="outline" className="whitespace-nowrap">
                {item.current} / {item.minimum}
              </Badge>
            )}
            <Button 
              size="sm" 
              variant="ghost"
              onClick={() => onNavigate?.("inventory")}
            >
              <ExternalLink className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
