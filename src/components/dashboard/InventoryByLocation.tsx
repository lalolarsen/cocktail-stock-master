import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Store, Package, AlertTriangle } from "lucide-react";
import { formatCLP } from "@/lib/currency";
import { WarehouseStockIntake } from "./WarehouseStockIntake";

interface StockLocation {
  id: string;
  name: string;
  type: "warehouse" | "bar";
  is_active: boolean;
}

interface Product {
  id: string;
  name: string;
  code: string;
  category: string;
  minimum_stock: number;
  unit: string;
  cost_per_unit: number | null;
}

interface StockBalance {
  product_id: string;
  location_id: string;
  quantity: number;
  product?: Product;
}

const getUnitDisplay = (category: string, unit: string) => {
  if (category === "unidades") return "unidades";
  if (category === "gramos") return "g";
  return unit;
};

export function InventoryByLocation() {
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [balances, setBalances] = useState<StockBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [locResult, prodResult, balResult] = await Promise.all([
        supabase.from("stock_locations").select("*").eq("is_active", true).order("type", { ascending: false }).order("name"),
        supabase.from("products").select("*").order("name"),
        supabase.from("stock_balances").select("*")
      ]);
      
      if (locResult.error) throw locResult.error;
      if (prodResult.error) throw prodResult.error;
      if (balResult.error) throw balResult.error;
      
      setLocations(locResult.data as StockLocation[] || []);
      setProducts(prodResult.data as Product[] || []);
      setBalances(balResult.data || []);
      
      // Default to warehouse
      const warehouse = (locResult.data as StockLocation[])?.find(l => l.type === "warehouse");
      if (warehouse) {
        setSelectedLocationId(warehouse.id);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const getBalanceForProduct = (productId: string, locationId: string): number => {
    const balance = balances.find(b => b.product_id === productId && b.location_id === locationId);
    return balance?.quantity || 0;
  };

  const getStockStatus = (current: number, minimum: number) => {
    const percentage = minimum > 0 ? (current / minimum) * 100 : 100;
    if (percentage <= 50) return { color: "destructive", label: "Crítico" };
    if (percentage <= 100) return { color: "warning", label: "Bajo" };
    return { color: "default", label: "Normal" };
  };

  const selectedLocation = locations.find(l => l.id === selectedLocationId);
  const warehouse = locations.find(l => l.type === "warehouse");
  const hasWarehouse = !!warehouse;
  
  const locationProducts = products.map(product => {
    const quantity = getBalanceForProduct(product.id, selectedLocationId || "");
    return { ...product, quantity };
  }).filter(p => p.quantity > 0 || selectedLocation?.type === "warehouse");

  const lowStockCount = locationProducts.filter(p => p.quantity <= p.minimum_stock).length;
  const totalValue = locationProducts.reduce((sum, p) => sum + (p.quantity * (p.cost_per_unit || 0)), 0);

  if (loading) {
    return (
      <Card className="glass-effect">
        <CardHeader>
          <CardTitle>Inventario por Ubicación</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stock Intake Section - Only for Warehouse */}
      {warehouse && (
        <WarehouseStockIntake
          warehouseId={warehouse.id}
          products={products.map(p => ({ ...p, code: p.code || "" }))}
          onStockUpdated={fetchData}
        />
      )}

      <Card className="glass-effect shadow-elegant">
        <CardHeader>
          <CardTitle className="text-2xl bg-gradient-to-r from-primary to-primary-glow bg-clip-text text-transparent">
            Inventario por Ubicación
          </CardTitle>
        </CardHeader>
        
        <CardContent>
        <Tabs value={selectedLocationId || ""} onValueChange={setSelectedLocationId} className="w-full">
          <TabsList className="w-full flex flex-wrap gap-1 h-auto mb-6">
            {locations.map((location) => (
              <TabsTrigger key={location.id} value={location.id} className="flex items-center gap-2">
                <Store className="w-4 h-4" />
                {location.name}
                {location.type === "warehouse" && (
                  <Badge variant="outline" className="ml-1 text-xs">Bodega</Badge>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
          
          {locations.map((location) => (
            <TabsContent key={location.id} value={location.id} className="space-y-4">
              {/* Stats summary */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="glass-effect p-4 rounded-lg">
                  <div className="text-sm text-muted-foreground">Total Productos</div>
                  <div className="text-2xl font-bold">{locationProducts.length}</div>
                </div>
                <div className="glass-effect p-4 rounded-lg">
                  <div className="text-sm text-muted-foreground flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3 text-amber-500" />
                    Stock Bajo
                  </div>
                  <div className="text-2xl font-bold text-amber-500">{lowStockCount}</div>
                </div>
                <div className="glass-effect p-4 rounded-lg">
                  <div className="text-sm text-muted-foreground">Valor Total</div>
                  <div className="text-2xl font-bold">{formatCLP(totalValue)}</div>
                </div>
              </div>
              
              {/* Products list */}
              <div className="space-y-3">
                {locationProducts.map((product) => {
                  const status = getStockStatus(product.quantity, product.minimum_stock);
                  const stockPercentage = product.minimum_stock > 0 ? (product.quantity / product.minimum_stock) * 100 : 100;
                  
                  return (
                    <div
                      key={product.id}
                      className="glass-effect p-4 rounded-lg hover-lift"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="p-2 primary-gradient rounded-lg">
                            <Package className="h-4 w-4 text-primary-foreground" />
                          </div>
                          <div>
                            <h3 className="font-semibold">{product.name}</h3>
                          </div>
                        </div>
                        <Badge variant={status.color as any}>{status.label}</Badge>
                      </div>
                      
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Stock actual</span>
                          <span className="font-semibold">
                            {product.quantity} {getUnitDisplay(product.category, product.unit)}
                          </span>
                        </div>
                        <Progress value={Math.min(stockPercentage, 100)} className="h-2" />
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Mínimo: {product.minimum_stock} {getUnitDisplay(product.category, product.unit)}</span>
                          <span>Valor: {formatCLP(product.quantity * (product.cost_per_unit || 0))}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
                
                {locationProducts.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>No hay productos en esta ubicación</p>
                  </div>
                )}
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
    </div>
  );
}