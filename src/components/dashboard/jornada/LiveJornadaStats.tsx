import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  DollarSign, 
  TrendingUp, 
  ShoppingCart,
  Store,
  BarChart3,
  RefreshCw
} from "lucide-react";
import { formatCLP } from "@/lib/currency";
import { Button } from "@/components/ui/button";

interface LiveJornadaStatsProps {
  jornadaId: string;
}

interface SalesByPOS {
  pos_id: string;
  pos_name: string;
  pos_code: string | null;
  zone: string | null;
  business_type: string | null;
  total_sales: number;
  transaction_count: number;
  cash_sales: number;
  card_sales: number;
}

interface TopProduct {
  cocktail_id: string;
  cocktail_name: string;
  category: string;
  total_quantity: number;
  total_revenue: number;
}

export function LiveJornadaStats({ jornadaId }: LiveJornadaStatsProps) {
  // Fetch sales by POS
  const { 
    data: salesByPOS, 
    isLoading: loadingPOS,
    refetch: refetchPOS 
  } = useQuery({
    queryKey: ["live-jornada-pos-sales", jornadaId],
    queryFn: async () => {
      // First get all sales for this jornada
      const { data: sales, error } = await supabase
        .from("sales")
        .select(`
          id,
          total_amount,
          payment_method,
          pos_id,
          is_cancelled
        `)
        .eq("jornada_id", jornadaId)
        .eq("is_cancelled", false);

      if (error) throw error;

      // Get POS terminals info
      const { data: posTerminals } = await supabase
        .from("pos_terminals")
        .select("id, name, code, zone, business_type");

      // Aggregate by POS
      const posMap = new Map<string, SalesByPOS>();
      
      sales?.forEach((sale) => {
        const posId = sale.pos_id || "sin_pos";
        const pos = posTerminals?.find(p => p.id === posId);
        
        if (!posMap.has(posId)) {
          posMap.set(posId, {
            pos_id: posId,
            pos_name: pos?.name || "Sin POS asignado",
            pos_code: pos?.code || null,
            zone: pos?.zone || null,
            business_type: pos?.business_type || null,
            total_sales: 0,
            transaction_count: 0,
            cash_sales: 0,
            card_sales: 0,
          });
        }
        
        const current = posMap.get(posId)!;
        const amount = Number(sale.total_amount) || 0;
        current.total_sales += amount;
        current.transaction_count += 1;
        
        if (sale.payment_method === "cash") {
          current.cash_sales += amount;
        } else if (sale.payment_method === "card") {
          current.card_sales += amount;
        }
      });

      return Array.from(posMap.values()).sort((a, b) => b.total_sales - a.total_sales);
    },
    refetchInterval: 30000, // Refresh every 30 seconds
    enabled: !!jornadaId,
  });

  // Fetch top products
  const { 
    data: topProducts, 
    isLoading: loadingProducts,
    refetch: refetchProducts 
  } = useQuery({
    queryKey: ["live-jornada-top-products", jornadaId],
    queryFn: async () => {
      // Get sale items for this jornada
      const { data: saleItems, error } = await supabase
        .from("sale_items")
        .select(`
          cocktail_id,
          quantity,
          subtotal,
          sales!inner(jornada_id, is_cancelled)
        `)
        .eq("sales.jornada_id", jornadaId)
        .eq("sales.is_cancelled", false);

      if (error) throw error;

      // Get cocktails info
      const { data: cocktails } = await supabase
        .from("cocktails")
        .select("id, name, category");

      // Aggregate by product
      const productMap = new Map<string, TopProduct>();
      
      saleItems?.forEach((item) => {
        const cocktailId = item.cocktail_id;
        const cocktail = cocktails?.find(c => c.id === cocktailId);
        
        if (!productMap.has(cocktailId)) {
          productMap.set(cocktailId, {
            cocktail_id: cocktailId,
            cocktail_name: cocktail?.name || "Producto desconocido",
            category: cocktail?.category || "otros",
            total_quantity: 0,
            total_revenue: 0,
          });
        }
        
        const current = productMap.get(cocktailId)!;
        current.total_quantity += Number(item.quantity) || 0;
        current.total_revenue += Number(item.subtotal) || 0;
      });

      return Array.from(productMap.values())
        .sort((a, b) => b.total_quantity - a.total_quantity)
        .slice(0, 10);
    },
    refetchInterval: 30000,
    enabled: !!jornadaId,
  });

  const handleRefresh = () => {
    refetchPOS();
    refetchProducts();
  };

  const totalSales = salesByPOS?.reduce((sum, pos) => sum + pos.total_sales, 0) || 0;
  const totalTransactions = salesByPOS?.reduce((sum, pos) => sum + pos.transaction_count, 0) || 0;
  const totalCash = salesByPOS?.reduce((sum, pos) => sum + pos.cash_sales, 0) || 0;
  const totalCard = salesByPOS?.reduce((sum, pos) => sum + pos.card_sales, 0) || 0;

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <DollarSign className="w-4 h-4" />
              Ventas Totales
            </div>
            <div className="text-2xl font-bold text-primary">{formatCLP(totalSales)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <ShoppingCart className="w-4 h-4" />
              Transacciones
            </div>
            <div className="text-2xl font-bold">{totalTransactions}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              💵 Efectivo
            </div>
            <div className="text-xl font-bold">{formatCLP(totalCash)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              💳 Tarjeta
            </div>
            <div className="text-xl font-bold">{formatCLP(totalCard)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs for Sales by POS and Top Products */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Resultados en Vivo
            </CardTitle>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleRefresh}
              className="gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Actualizar
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="pos" className="space-y-4">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="pos" className="gap-2">
                <Store className="w-4 h-4" />
                Ventas por POS
              </TabsTrigger>
              <TabsTrigger value="products" className="gap-2">
                <TrendingUp className="w-4 h-4" />
                Más Vendidos
              </TabsTrigger>
            </TabsList>

            <TabsContent value="pos">
              {loadingPOS ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : salesByPOS && salesByPOS.length > 0 ? (
                <div className="space-y-2">
                  {salesByPOS.map((pos) => (
                    <div 
                      key={pos.pos_id} 
                      className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Store className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <div className="font-medium flex items-center gap-2">
                            {pos.pos_name}
                            {pos.pos_code && (
                              <Badge variant="outline" className="text-xs">
                                {pos.pos_code}
                              </Badge>
                            )}
                          </div>
                          <div className="text-sm text-muted-foreground flex items-center gap-2">
                            {pos.zone && <span>{pos.zone}</span>}
                            {pos.business_type && (
                              <Badge variant="secondary" className="text-xs capitalize">
                                {pos.business_type}
                              </Badge>
                            )}
                            <span className="text-muted-foreground/60">•</span>
                            <span>{pos.transaction_count} ventas</span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-lg">{formatCLP(pos.total_sales)}</div>
                        <div className="text-xs text-muted-foreground">
                          💵 {formatCLP(pos.cash_sales)} | 💳 {formatCLP(pos.card_sales)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Store className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>Sin ventas registradas aún</p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="products">
              {loadingProducts ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => (
                    <Skeleton key={i} className="h-14 w-full" />
                  ))}
                </div>
              ) : topProducts && topProducts.length > 0 ? (
                <div className="space-y-2">
                  {topProducts.map((product, index) => (
                    <div 
                      key={product.cocktail_id} 
                      className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                          index === 0 ? "bg-yellow-500/20 text-yellow-600" :
                          index === 1 ? "bg-gray-300/30 text-gray-600" :
                          index === 2 ? "bg-amber-600/20 text-amber-700" :
                          "bg-muted text-muted-foreground"
                        }`}>
                          {index + 1}
                        </div>
                        <div>
                          <div className="font-medium">{product.cocktail_name}</div>
                          <Badge variant="secondary" className="text-xs capitalize">
                            {product.category}
                          </Badge>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold">{product.total_quantity} unidades</div>
                        <div className="text-sm text-muted-foreground">
                          {formatCLP(product.total_revenue)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <TrendingUp className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>Sin productos vendidos aún</p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
