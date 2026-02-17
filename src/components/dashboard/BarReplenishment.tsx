import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PILOT_VENUE_ID } from "@/lib/venue";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { formatCLP } from "@/lib/currency";
import {
  ArrowRight, Send, Warehouse, Store, Search, History,
} from "lucide-react";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";

import { useReplenishmentData } from "./replenishment/useReplenishmentData";
import { StockMetricsBar } from "./replenishment/StockMetricsBar";
import { ConfirmTransferDialog } from "./replenishment/ConfirmTransferDialog";
import { TransferHistory } from "./replenishment/TransferHistory";
import type { TransferLine } from "./replenishment/types";

export function BarReplenishment() {
  const {
    warehouse, barLocations, products, getBalance, history, metrics, loading, refetch,
  } = useReplenishmentData();

  const [selectedBarId, setSelectedBarId] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [transferQuantity, setTransferQuantity] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Confirmation dialog state
  const [confirmLines, setConfirmLines] = useState<TransferLine[]>([]);
  const [showConfirm, setShowConfirm] = useState(false);

  // Products with warehouse stock > 0
  const warehouseProducts = useMemo(() => {
    return products.filter(p => p.warehouseStock > 0);
  }, [products]);

  const filteredProducts = useMemo(() => {
    if (!productSearch.trim()) return warehouseProducts;
    const term = productSearch.toLowerCase();
    return warehouseProducts.filter(p =>
      p.name.toLowerCase().includes(term) || p.code.toLowerCase().includes(term)
    );
  }, [warehouseProducts, productSearch]);

  const selectedProduct = products.find(p => p.id === selectedProductId);
  const selectedBar = barLocations.find(b => b.id === selectedBarId);

  const quantity = parseFloat(transferQuantity) || 0;
  const estimatedCost = selectedProduct ? quantity * selectedProduct.unitCost : 0;

  const handlePrepareTransfer = () => {
    if (!selectedBarId || !selectedProductId || quantity <= 0) {
      toast.error("Completa todos los campos");
      return;
    }
    if (!selectedProduct) return;
    if (quantity > selectedProduct.warehouseStock) {
      toast.error(`Stock insuficiente. Disponible: ${selectedProduct.warehouseStock} ${selectedProduct.unit}`);
      return;
    }

    setConfirmLines([{
      product: selectedProduct,
      quantity,
      estimatedCost,
    }]);
    setShowConfirm(true);
  };

  const handleConfirmTransfer = async () => {
    if (!warehouse || !selectedBar || confirmLines.length === 0) return;
    setSubmitting(true);
    try {
      for (const line of confirmLines) {
        const { product } = line;
        const costSnapshot = product.cost_per_unit; // WAC per bottle/unit
        const totalCost = line.quantity * product.unitCost;

        // 1. Insert transfer_out from warehouse
        const { error: outErr } = await supabase.from("stock_movements").insert({
          product_id: product.id,
          quantity: line.quantity,
          movement_type: "transfer_out" as any,
          from_location_id: warehouse.id,
          to_location_id: selectedBar.id,
          source_type: "replenishment",
          unit_cost_snapshot: costSnapshot,
          total_cost_snapshot: totalCost,
          notes: `Reposición → ${selectedBar.name}`,
          venue_id: PILOT_VENUE_ID,
        });
        if (outErr) throw outErr;

        // 2. Insert transfer_in to bar
        const { error: inErr } = await supabase.from("stock_movements").insert({
          product_id: product.id,
          quantity: line.quantity,
          movement_type: "transfer_in" as any,
          from_location_id: warehouse.id,
          to_location_id: selectedBar.id,
          source_type: "replenishment",
          unit_cost_snapshot: costSnapshot,
          total_cost_snapshot: totalCost,
          notes: `Recepción ← Bodega`,
          venue_id: PILOT_VENUE_ID,
        });
        if (inErr) throw inErr;

        // 3. Update warehouse balance (decrease)
        const currentW = getBalance(product.id, warehouse.id);
        await supabase
          .from("stock_balances")
          .update({ quantity: currentW - line.quantity, updated_at: new Date().toISOString() })
          .eq("location_id", warehouse.id)
          .eq("product_id", product.id);

        // 4. Update or create bar balance (increase)
        const currentB = getBalance(product.id, selectedBar.id);
        const { data: existing } = await supabase
          .from("stock_balances")
          .select("id")
          .eq("location_id", selectedBar.id)
          .eq("product_id", product.id)
          .maybeSingle();

        if (existing) {
          await supabase
            .from("stock_balances")
            .update({ quantity: currentB + line.quantity, updated_at: new Date().toISOString() })
            .eq("location_id", selectedBar.id)
            .eq("product_id", product.id);
        } else {
          await supabase.from("stock_balances").insert({
            location_id: selectedBar.id,
            product_id: product.id,
            quantity: line.quantity,
            venue_id: PILOT_VENUE_ID,
          });
        }
      }

      toast.success(`Reposición completada → ${selectedBar.name}`);
      setTransferQuantity("");
      setSelectedProductId("");
      setShowConfirm(false);
      setConfirmLines([]);
      refetch();
    } catch (error: any) {
      console.error("Transfer error:", error);
      toast.error(error.message || "Error al transferir");
    } finally {
      setSubmitting(false);
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
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Send className="h-6 w-6 text-primary" />
          </div>
          Reposición de Barras
        </h2>
        <p className="text-muted-foreground mt-1">
          Mueve stock desde bodega a las barras — sin afectar costos ni impuestos
        </p>
      </div>

      {/* Metrics */}
      <StockMetricsBar
        warehouseCost={metrics.warehouseCost}
        barsCost={metrics.barsCost}
        warehousePct={metrics.warehousePct}
        barsPct={metrics.barsPct}
      />

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
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Send className="h-5 w-5 text-primary" />
                Transferencia Rápida
              </CardTitle>
              <CardDescription>
                Solo bodega → barra. No afecta OPEX, IVA ni impuestos.
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

                    <ScrollArea className="h-52 border rounded-lg">
                      <div className="p-2 space-y-1">
                        {filteredProducts.length === 0 ? (
                          <div className="text-center py-4 text-muted-foreground text-sm">
                            {productSearch ? "No se encontraron productos" : "No hay productos con stock"}
                          </div>
                        ) : (
                          filteredProducts.map(product => {
                            const barStock = getBalance(product.id, selectedBarId);
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
                                <div className="min-w-0">
                                  <p className="font-medium truncate">{product.name}</p>
                                  <p className={`text-xs ${isSelected ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                                    {product.code}
                                    {product.isVolumetric && ` · ${product.capacity_ml}ml`}
                                  </p>
                                  <p className={`text-xs mt-0.5 ${isSelected ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                                    WAC: {formatCLP(product.cost_per_unit)}
                                    {product.isVolumetric && ` · ${formatCLP(product.unitCost)}/ml`}
                                  </p>
                                </div>
                                <div className="text-right shrink-0 ml-2">
                                  <p className="font-bold">{product.warehouseStock} {product.unit}</p>
                                  <p className={`text-xs ${isSelected ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                                    Barra: {barStock} {product.unit}
                                  </p>
                                </div>
                              </button>
                            );
                          })
                        )}
                      </div>
                    </ScrollArea>
                  </div>

                  {/* Quantity + cost estimate */}
                  {selectedProduct && (
                    <div className="p-4 bg-muted/50 rounded-lg space-y-3">
                      <div className="flex items-end gap-4">
                        <div className="flex-1 space-y-2">
                          <Label>Cantidad a enviar ({selectedProduct.unit})</Label>
                          <Input
                            type="number"
                            min="0"
                            step={selectedProduct.isVolumetric ? "1" : "1"}
                            max={selectedProduct.warehouseStock}
                            value={transferQuantity}
                            onChange={(e) => setTransferQuantity(e.target.value)}
                            placeholder="0"
                            className="text-lg font-bold"
                          />
                          <p className="text-xs text-muted-foreground">
                            Disponible: {selectedProduct.warehouseStock} {selectedProduct.unit}
                          </p>
                        </div>
                      </div>

                      {quantity > 0 && (
                        <div className="flex items-center justify-between p-3 bg-background rounded-lg border">
                          <span className="text-sm text-muted-foreground">Costo estimado</span>
                          <span className="font-bold text-lg">{formatCLP(estimatedCost)}</span>
                        </div>
                      )}

                      {quantity > selectedProduct.warehouseStock && (
                        <p className="text-sm text-destructive font-medium">
                          ⚠ Excede el stock disponible
                        </p>
                      )}

                      <Button
                        onClick={handlePrepareTransfer}
                        disabled={submitting || quantity <= 0 || quantity > selectedProduct.warehouseStock}
                        className="w-full gap-2"
                      >
                        <Send className="h-4 w-4" />
                        Enviar a {selectedBar?.name}
                      </Button>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <TransferHistory history={history} />
        </TabsContent>
      </Tabs>

      {/* Confirmation Dialog */}
      <ConfirmTransferDialog
        open={showConfirm}
        onOpenChange={setShowConfirm}
        lines={confirmLines}
        barName={selectedBar?.name || ""}
        onConfirm={handleConfirmTransfer}
        submitting={submitting}
      />
    </div>
  );
}
