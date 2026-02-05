import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  ArrowRight,
  Package,
  Plus,
  Trash2,
  History,
  Check,
  AlertTriangle,
  ClipboardList,
  Eye,
  Play,
  Download,
  Warehouse,
  Store,
  Search,
  Send,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import * as XLSX from "xlsx";
import { formatCLP } from "@/lib/currency";

interface StockLocation {
  id: string;
  name: string;
  is_active?: boolean;
  type: "warehouse" | "bar";
}

interface Product {
  id: string;
  name: string;
  code: string;
  category: string;
  unit: string;
  cost_per_unit: number | null;
}

interface StockBalance {
  product_id: string;
  location_id: string;
  quantity: number;
}

interface PlanItem {
  to_location_id: string;
  product_id: string;
  quantity: number;
}

interface ReplenishmentPlan {
  id: string;
  name: string;
  plan_date: string;
  status: "draft" | "applied" | "cancelled";
  applied_at: string | null;
  created_at: string;
  items?: Array<{
    id: string;
    to_location_id: string;
    product_id: string;
    quantity: number;
    location?: { name: string };
    product?: { name: string; unit: string };
  }>;
}

interface InsufficientItem {
  product_id: string;
  product_name: string;
  required: number;
  available: number;
  missing: number;
}

export function BarReplenishment() {
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [balances, setBalances] = useState<StockBalance[]>([]);
  const [plans, setPlans] = useState<ReplenishmentPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Quick transfer state
  const [selectedBarId, setSelectedBarId] = useState<string>("");
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [transferQuantity, setTransferQuantity] = useState<string>("");
  const [productSearch, setProductSearch] = useState("");

  // Plan details state
  const [selectedPlan, setSelectedPlan] = useState<ReplenishmentPlan | null>(null);
  const [showPlanDetails, setShowPlanDetails] = useState(false);

  const warehouse = useMemo(() => locations.find((l) => l.type === "warehouse"), [locations]);
  const barLocations = useMemo(() => locations.filter((l) => l.type === "bar" && l.is_active !== false), [locations]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [locResult, prodResult, balResult, plansResult] = await Promise.all([
        supabase.from("stock_locations").select("*").order("type", { ascending: false }).order("name"),
        supabase.from("products").select("*").order("name"),
        supabase.from("stock_balances").select("*"),
        supabase
          .from("replenishment_plans")
          .select(`
            *,
            items:replenishment_plan_items(
              id, to_location_id, product_id, quantity,
              location:stock_locations(name),
              product:products(name, unit)
            )
          `)
          .order("created_at", { ascending: false })
          .limit(20),
      ]);

      if (locResult.error) throw locResult.error;
      if (prodResult.error) throw prodResult.error;
      if (balResult.error) throw balResult.error;
      if (plansResult.error) throw plansResult.error;

      setLocations(locResult.data as StockLocation[] || []);
      setProducts(prodResult.data || []);
      setBalances(balResult.data || []);
      setPlans(plansResult.data as unknown as ReplenishmentPlan[] || []);
    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error("Error al cargar datos");
    } finally {
      setLoading(false);
    }
  };

  const getWarehouseBalance = (productId: string): number => {
    if (!warehouse) return 0;
    const balance = balances.find((b) => b.product_id === productId && b.location_id === warehouse.id);
    return balance?.quantity || 0;
  };

  const getBarBalance = (productId: string, barId: string): number => {
    const balance = balances.find((b) => b.product_id === productId && b.location_id === barId);
    return balance?.quantity || 0;
  };

  // Products with warehouse stock for display
  const warehouseProducts = useMemo(() => {
    return products.map(p => ({
      ...p,
      warehouseStock: getWarehouseBalance(p.id),
    })).filter(p => p.warehouseStock > 0);
  }, [products, balances, warehouse]);

  // Filtered products for search
  const filteredProducts = useMemo(() => {
    if (!productSearch.trim()) return warehouseProducts;
    const term = productSearch.toLowerCase();
    return warehouseProducts.filter(p => 
      p.name.toLowerCase().includes(term) || 
      p.code.toLowerCase().includes(term)
    );
  }, [warehouseProducts, productSearch]);

  const selectedProduct = products.find(p => p.id === selectedProductId);
  const selectedBar = barLocations.find(b => b.id === selectedBarId);

  const handleQuickTransfer = async () => {
    if (!selectedBarId || !selectedProductId || !transferQuantity) {
      toast.error("Completa todos los campos");
      return;
    }

    const quantity = parseFloat(transferQuantity);
    if (isNaN(quantity) || quantity <= 0) {
      toast.error("Cantidad debe ser mayor a 0");
      return;
    }

    const warehouseStock = getWarehouseBalance(selectedProductId);
    if (quantity > warehouseStock) {
      toast.error(`Stock insuficiente. Disponible: ${warehouseStock}`);
      return;
    }

    if (!warehouse) {
      toast.error("No hay bodega configurada");
      return;
    }

    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuario no autenticado");
      
      const { data: profile } = await supabase
        .from("profiles")
        .select("venue_id")
        .eq("id", user.id)
        .single();
      
      const venueId = profile?.venue_id;
      if (!venueId) throw new Error("No venue encontrado");

      // Create stock movement record
      const { error: movementError } = await supabase.from("stock_movements").insert({
        product_id: selectedProductId,
        quantity: quantity,
        movement_type: "salida",
        from_location_id: warehouse.id,
        to_location_id: selectedBarId,
        source_type: "replenishment",
        notes: `Reposición desde bodega a ${selectedBar?.name}`,
        venue_id: venueId,
      });

      if (movementError) throw movementError;

      // Update warehouse balance (decrease)
      const currentWarehouseQty = getWarehouseBalance(selectedProductId);
      const { error: warehouseError } = await supabase
        .from("stock_balances")
        .update({ 
          quantity: currentWarehouseQty - quantity, 
          updated_at: new Date().toISOString() 
        })
        .eq("location_id", warehouse.id)
        .eq("product_id", selectedProductId);

      if (warehouseError) throw warehouseError;

      // Update or insert bar balance (increase)
      const currentBarQty = getBarBalance(selectedProductId, selectedBarId);
      const { data: existingBarBalance } = await supabase
        .from("stock_balances")
        .select("id")
        .eq("location_id", selectedBarId)
        .eq("product_id", selectedProductId)
        .maybeSingle();

      if (existingBarBalance) {
        const { error: barUpdateError } = await supabase
          .from("stock_balances")
          .update({ 
            quantity: currentBarQty + quantity, 
            updated_at: new Date().toISOString() 
          })
          .eq("location_id", selectedBarId)
          .eq("product_id", selectedProductId);

        if (barUpdateError) throw barUpdateError;
      } else {
        const { error: barInsertError } = await supabase.from("stock_balances").insert({
          location_id: selectedBarId,
          product_id: selectedProductId,
          quantity: quantity,
          venue_id: venueId,
        });

        if (barInsertError) throw barInsertError;
      }

      toast.success(`${quantity} ${selectedProduct?.unit || ''} enviados a ${selectedBar?.name}`);
      setTransferQuantity("");
      fetchData();
    } catch (error: any) {
      console.error("Transfer error:", error);
      toast.error(error.message || "Error al transferir");
    } finally {
      setSubmitting(false);
    }
  };

  const handleApplyPlan = async (planId: string) => {
    setSubmitting(true);
    try {
      const { data, error } = await supabase.rpc("apply_replenishment_plan", {
        p_plan_id: planId,
      });

      if (error) throw error;

      const result = data as unknown as { success: boolean; error?: string; insufficient_items?: InsufficientItem[]; items_moved?: number; bars_affected?: number };

      if (!result.success) {
        if (result.insufficient_items?.length) {
          toast.error(
            <div>
              <p className="font-semibold mb-2">Stock insuficiente:</p>
              <ul className="text-sm">
                {result.insufficient_items.slice(0, 3).map((item, i) => (
                  <li key={i}>{item.product_name}: falta {item.missing}</li>
                ))}
              </ul>
            </div>,
            { duration: 6000 }
          );
        } else {
          throw new Error(result.error || "Error al aplicar");
        }
        return;
      }

      toast.success(`Plan aplicado: ${result.items_moved} items → ${result.bars_affected} barras`);
      setShowPlanDetails(false);
      fetchData();
    } catch (error: any) {
      toast.error(error.message || "Error al aplicar plan");
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "draft":
        return <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30">Borrador</Badge>;
      case "applied":
        return <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">Aplicado</Badge>;
      case "cancelled":
        return <Badge variant="destructive">Cancelado</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

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
          <p className="text-muted-foreground">Configure una ubicación de tipo "warehouse"</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Send className="h-6 w-6 text-primary" />
            </div>
            Reposición de Barras
          </h2>
          <p className="text-muted-foreground mt-1">
            Envía stock desde bodega a las barras para operación
          </p>
        </div>
      </div>

      {/* Flow indicator */}
      <div className="flex items-center gap-3 text-sm bg-muted/50 rounded-lg p-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Warehouse className="h-5 w-5" />
          <span className="font-medium text-foreground">{warehouse.name}</span>
        </div>
        <ArrowRight className="h-5 w-5 text-primary" />
        <div className="flex items-center gap-2">
          <Store className="h-5 w-5 text-primary" />
          <span className="font-medium text-primary">{barLocations.length} barras activas</span>
        </div>
      </div>

      <Tabs defaultValue="quick" className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-6">
          <TabsTrigger value="quick" className="flex items-center gap-2">
            <Send className="w-4 h-4" />
            Envío Rápido
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2">
            <History className="w-4 h-4" />
            Historial
          </TabsTrigger>
        </TabsList>

        <TabsContent value="quick" className="space-y-6">
          {/* Quick Transfer Card */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Send className="h-5 w-5 text-primary" />
                Transferencia Rápida
              </CardTitle>
              <CardDescription>
                Envía productos de bodega a una barra específica
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Bar selection */}
              <div className="space-y-2">
                <Label>Barra destino</Label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {barLocations.map(bar => (
                    <Button
                      key={bar.id}
                      variant={selectedBarId === bar.id ? "default" : "outline"}
                      className="h-auto py-3 flex flex-col items-center gap-1"
                      onClick={() => setSelectedBarId(bar.id)}
                    >
                      <Store className="h-5 w-5" />
                      <span className="text-sm">{bar.name}</span>
                    </Button>
                  ))}
                </div>
              </div>

              {selectedBarId && (
                <>
                  {/* Product selection */}
                  <div className="space-y-2">
                    <Label>Producto</Label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Buscar producto..."
                        value={productSearch}
                        onChange={(e) => setProductSearch(e.target.value)}
                        className="pl-9"
                      />
                    </div>
                    
                    <ScrollArea className="h-48 border rounded-lg">
                      <div className="p-2 space-y-1">
                        {filteredProducts.length === 0 ? (
                          <div className="text-center py-4 text-muted-foreground text-sm">
                            {productSearch ? "No se encontraron productos" : "No hay productos con stock"}
                          </div>
                        ) : (
                          filteredProducts.map(product => {
                            const barStock = getBarBalance(product.id, selectedBarId);
                            const isSelected = selectedProductId === product.id;
                            
                            return (
                              <button
                                key={product.id}
                                onClick={() => setSelectedProductId(product.id)}
                                className={`w-full flex items-center justify-between p-3 rounded-lg transition-colors text-left ${
                                  isSelected 
                                    ? "bg-primary text-primary-foreground" 
                                    : "hover:bg-muted"
                                }`}
                              >
                                <div>
                                  <p className="font-medium">{product.name}</p>
                                  <p className={`text-xs ${isSelected ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                                    {product.code}
                                  </p>
                                </div>
                                <div className="text-right">
                                  <p className="font-bold">{product.warehouseStock} {product.unit}</p>
                                  <p className={`text-xs ${isSelected ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                                    En barra: {barStock}
                                  </p>
                                </div>
                              </button>
                            );
                          })
                        )}
                      </div>
                    </ScrollArea>
                  </div>

                  {/* Quantity input */}
                  {selectedProductId && (
                    <div className="flex items-end gap-4 p-4 bg-muted/50 rounded-lg">
                      <div className="flex-1 space-y-2">
                        <Label>Cantidad a enviar</Label>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            min="1"
                            max={getWarehouseBalance(selectedProductId)}
                            value={transferQuantity}
                            onChange={(e) => setTransferQuantity(e.target.value)}
                            placeholder="0"
                            className="text-lg font-bold"
                          />
                          <span className="text-muted-foreground">{selectedProduct?.unit}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Disponible en bodega: {getWarehouseBalance(selectedProductId)} {selectedProduct?.unit}
                        </p>
                      </div>
                      <Button 
                        onClick={handleQuickTransfer} 
                        disabled={submitting || !transferQuantity}
                        className="gap-2"
                      >
                        {submitting ? "Enviando..." : (
                          <>
                            <Send className="h-4 w-4" />
                            Enviar a {selectedBar?.name}
                          </>
                        )}
                      </Button>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* Available Stock Overview */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Stock Disponible en Bodega</CardTitle>
              <CardDescription>
                {warehouseProducts.length} productos con stock para reponer
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {warehouseProducts.slice(0, 12).map(product => (
                  <div 
                    key={product.id}
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="font-medium truncate">{product.name}</p>
                      <p className="text-xs text-muted-foreground">{product.code}</p>
                    </div>
                    <Badge variant="secondary" className="ml-2 shrink-0">
                      {product.warehouseStock} {product.unit}
                    </Badge>
                  </div>
                ))}
              </div>
              {warehouseProducts.length > 12 && (
                <p className="text-center text-sm text-muted-foreground mt-4">
                  Y {warehouseProducts.length - 12} productos más...
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          {plans.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <History className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                <p className="text-muted-foreground">No hay planes de reposición</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {plans.map((plan) => (
                <Card key={plan.id} className="hover:bg-muted/30 transition-colors">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {getStatusBadge(plan.status)}
                        <div>
                          <h4 className="font-semibold">{plan.name}</h4>
                          <p className="text-sm text-muted-foreground">
                            {format(new Date(plan.plan_date), "dd MMM yyyy", { locale: es })}
                            {plan.items && ` • ${plan.items.length} items`}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button 
                          size="sm" 
                          variant="outline" 
                          onClick={() => {
                            setSelectedPlan(plan);
                            setShowPlanDetails(true);
                          }}
                        >
                          <Eye className="w-4 h-4 mr-1" />
                          Ver
                        </Button>
                        {plan.status === "draft" && (
                          <Button 
                            size="sm" 
                            onClick={() => handleApplyPlan(plan.id)}
                            disabled={submitting}
                          >
                            <Play className="w-4 h-4 mr-1" />
                            Aplicar
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Plan Details Dialog */}
      <Dialog open={showPlanDetails} onOpenChange={setShowPlanDetails}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardList className="w-5 h-5" />
              {selectedPlan?.name}
            </DialogTitle>
            <DialogDescription>
              {selectedPlan?.plan_date && format(new Date(selectedPlan.plan_date), "dd MMMM yyyy", { locale: es })}
            </DialogDescription>
          </DialogHeader>

          <div className="mb-4">{selectedPlan && getStatusBadge(selectedPlan.status)}</div>

          <ScrollArea className="h-64">
            {selectedPlan?.items && (
              <div className="space-y-2">
                {selectedPlan.items.map((item, i) => (
                  <div key={i} className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <p className="font-medium">{item.product?.name}</p>
                      <p className="text-xs text-muted-foreground">→ {item.location?.name}</p>
                    </div>
                    <Badge variant="secondary">
                      {item.quantity} {item.product?.unit}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPlanDetails(false)}>
              Cerrar
            </Button>
            {selectedPlan?.status === "draft" && (
              <Button onClick={() => handleApplyPlan(selectedPlan.id)} disabled={submitting}>
                <Play className="w-4 h-4 mr-2" />
                Aplicar Plan
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
