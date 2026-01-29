import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useActiveVenue } from "@/hooks/useActiveVenue";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { 
  Warehouse, 
  Package, 
  AlertTriangle, 
  Search,
  TrendingDown,
  DollarSign,
  Boxes,
  ArrowRight
} from "lucide-react";
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
}

const getUnitDisplay = (category: string, unit: string) => {
  if (category === "unidades") return "uds";
  if (category === "gramos") return "g";
  return unit;
};

export function WarehouseInventory() {
  const { venue } = useActiveVenue();
  const [warehouse, setWarehouse] = useState<StockLocation | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [balances, setBalances] = useState<StockBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    if (venue?.id) {
      fetchData();
    }
  }, [venue?.id]);

  const fetchData = async () => {
    if (!venue?.id) return;
    
    try {
      setLoading(true);
      const [locResult, prodResult, balResult] = await Promise.all([
        supabase
          .from("stock_locations")
          .select("*")
          .eq("type", "warehouse")
          .eq("is_active", true)
          .eq("venue_id", venue.id)
          .limit(1)
          .maybeSingle(),
        supabase.from("products").select("*").eq("venue_id", venue.id).order("name"),
        supabase.from("stock_balances").select("*").eq("venue_id", venue.id)
      ]);
      
      if (locResult.error) throw locResult.error;
      if (prodResult.error) throw prodResult.error;
      if (balResult.error) throw balResult.error;
      
      setWarehouse(locResult.data as StockLocation | null);
      setProducts(prodResult.data as Product[] || []);
      setBalances(balResult.data || []);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const getBalanceForProduct = (productId: string): number => {
    if (!warehouse) return 0;
    const balance = balances.find(b => b.product_id === productId && b.location_id === warehouse.id);
    return balance?.quantity || 0;
  };

  const warehouseProducts = useMemo(() => {
    return products.map(product => {
      const quantity = getBalanceForProduct(product.id);
      const status = getStockStatus(quantity, product.minimum_stock);
      return { ...product, quantity, status };
    });
  }, [products, balances, warehouse]);

  const filteredProducts = useMemo(() => {
    if (!searchTerm.trim()) return warehouseProducts;
    const term = searchTerm.toLowerCase();
    return warehouseProducts.filter(p => 
      p.name.toLowerCase().includes(term) || 
      p.code.toLowerCase().includes(term)
    );
  }, [warehouseProducts, searchTerm]);

  // Stats
  const stats = useMemo(() => {
    const totalProducts = warehouseProducts.length;
    const productsWithStock = warehouseProducts.filter(p => p.quantity > 0).length;
    const lowStockCount = warehouseProducts.filter(p => p.quantity <= p.minimum_stock && p.quantity > 0).length;
    const outOfStockCount = warehouseProducts.filter(p => p.quantity === 0).length;
    const totalValue = warehouseProducts.reduce((sum, p) => sum + (p.quantity * (p.cost_per_unit || 0)), 0);
    
    return { totalProducts, productsWithStock, lowStockCount, outOfStockCount, totalValue };
  }, [warehouseProducts]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!warehouse) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Warehouse className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-lg font-semibold mb-2">No hay bodega configurada</h3>
          <p className="text-muted-foreground">
            Configure una ubicación de tipo "warehouse" en Barras y POS
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with context */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Warehouse className="h-6 w-6 text-primary" />
            </div>
            Inventario de Bodega
          </h2>
          <p className="text-muted-foreground mt-1">
            Stock central • Todo ingreso de mercadería se registra aquí
          </p>
        </div>
        <Badge variant="outline" className="text-sm px-3 py-1">
          {warehouse.name}
        </Badge>
      </div>

      {/* Flow indicator */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
        <span className="font-medium text-foreground">Flujo:</span>
        <span>Proveedor</span>
        <ArrowRight className="h-4 w-4" />
        <span className="font-medium text-primary">Bodega Principal</span>
        <ArrowRight className="h-4 w-4" />
        <span>Reposición a Barras</span>
      </div>

      {/* Stock Intake Section */}
      <WarehouseStockIntake
        warehouseId={warehouse.id}
        products={products.map(p => ({ ...p, code: p.code || "" }))}
        onStockUpdated={fetchData}
      />

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Boxes className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.productsWithStock}</p>
                <p className="text-xs text-muted-foreground">Productos con stock</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-warning/10 rounded-lg">
                <TrendingDown className="h-5 w-5 text-warning" />
              </div>
              <div>
                <p className="text-2xl font-bold text-warning">{stats.lowStockCount}</p>
                <p className="text-xs text-muted-foreground">Stock bajo</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-destructive/10 rounded-lg">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <p className="text-2xl font-bold text-destructive">{stats.outOfStockCount}</p>
                <p className="text-xs text-muted-foreground">Sin stock</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-accent/50 rounded-lg">
                <DollarSign className="h-5 w-5 text-accent-foreground" />
              </div>
              <div>
                <p className="text-2xl font-bold">{formatCLP(stats.totalValue)}</p>
                <p className="text-xs text-muted-foreground">Valor total</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Products List */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Stock Actual</CardTitle>
              <CardDescription>
                {stats.totalProducts} productos en catálogo
              </CardDescription>
            </div>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar producto..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>
        
        <CardContent>
          <div className="space-y-2">
            {filteredProducts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>{searchTerm ? "No se encontraron productos" : "No hay productos en el catálogo"}</p>
              </div>
            ) : (
              filteredProducts.map((product) => {
                const stockPercentage = product.minimum_stock > 0 
                  ? Math.min((product.quantity / product.minimum_stock) * 100, 100) 
                  : 100;
                
                return (
                  <div
                    key={product.id}
                    className={`flex items-center gap-4 p-3 rounded-lg border transition-colors ${
                      product.quantity === 0 
                        ? "bg-destructive/5 border-destructive/20" 
                        : product.status.color === "warning"
                        ? "bg-warning/5 border-warning/20"
                        : "bg-card border-border hover:bg-muted/50"
                    }`}
                  >
                    {/* Product info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium truncate">{product.name}</h4>
                        <Badge variant="outline" className="text-xs shrink-0">
                          {product.code}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4 mt-1">
                        <Progress value={stockPercentage} className="h-1.5 w-24" />
                        <span className="text-xs text-muted-foreground">
                          Mín: {product.minimum_stock} {getUnitDisplay(product.category, product.unit)}
                        </span>
                      </div>
                    </div>

                    {/* Stock quantity */}
                    <div className="text-right shrink-0">
                      <p className={`text-lg font-bold tabular-nums ${
                        product.quantity === 0 
                          ? "text-destructive" 
                          : product.status.color === "warning" 
                          ? "text-warning" 
                          : "text-foreground"
                      }`}>
                        {product.quantity.toLocaleString()}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {getUnitDisplay(product.category, product.unit)}
                      </p>
                    </div>

                    {/* Value */}
                    <div className="text-right shrink-0 w-24">
                      <p className="text-sm font-medium">
                        {formatCLP(product.quantity * (product.cost_per_unit || 0))}
                      </p>
                      <p className="text-xs text-muted-foreground">valor</p>
                    </div>

                    {/* Status badge */}
                    <Badge 
                      variant={product.status.color as any}
                      className="shrink-0 w-16 justify-center"
                    >
                      {product.status.label}
                    </Badge>
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function getStockStatus(current: number, minimum: number): { color: string; label: string } {
  if (current === 0) return { color: "destructive", label: "Agotado" };
  const percentage = minimum > 0 ? (current / minimum) * 100 : 100;
  if (percentage <= 50) return { color: "destructive", label: "Crítico" };
  if (percentage <= 100) return { color: "warning", label: "Bajo" };
  return { color: "secondary", label: "OK" };
}
