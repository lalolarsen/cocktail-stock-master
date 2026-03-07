import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PILOT_VENUE_ID } from "@/lib/venue";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Send, Warehouse, History } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { useReplenishmentData } from "./replenishment/useReplenishmentData";
import { StockMetricsBar } from "./replenishment/StockMetricsBar";
import { ConfirmTransferDialog } from "./replenishment/ConfirmTransferDialog";
import { TransferHistory } from "./replenishment/TransferHistory";
import { BulkTransferGrid } from "./replenishment/BulkTransferGrid";
import type { TransferLine } from "./replenishment/types";

export function BarReplenishment() {
  const {
    warehouse, barLocations, products, getBalance, history, metrics, loading, refetch,
  } = useReplenishmentData();

  const [submitting, setSubmitting] = useState(false);
  const [confirmLines, setConfirmLines] = useState<TransferLine[]>([]);
  const [showConfirm, setShowConfirm] = useState(false);

  const handlePrepareTransfer = (lines: TransferLine[]) => {
    setConfirmLines(lines);
    setShowConfirm(true);
  };

  const handleConfirmTransfer = async () => {
    if (!warehouse || confirmLines.length === 0) return;
    setSubmitting(true);
    try {
      for (const line of confirmLines) {
        const { product, barId } = line;
        const targetBarId = barId || "";
        // For volumetric (ml) products: unitCost = cost_per_ml = cost_per_unit / capacity_ml
        // For unit products: unitCost = cost_per_unit
        // Always use unitCost as snapshot so valorization is coherent with the unit of measure
        const costSnapshot = product.unitCost;
        const totalCost = line.quantity * product.unitCost;

        // 1. transfer_out from warehouse
        const { error: outErr } = await supabase.from("stock_movements").insert({
          product_id: product.id,
          quantity: line.quantity,
          movement_type: "transfer_out" as never,
          from_location_id: warehouse.id,
          to_location_id: targetBarId,
          source_type: "replenishment",
          unit_cost_snapshot: costSnapshot,
          total_cost_snapshot: totalCost,
          notes: `Reposición → ${line.barName}`,
          venue_id: PILOT_VENUE_ID,
        });
        if (outErr) throw outErr;

        // 2. transfer_in to bar
        const { error: inErr } = await supabase.from("stock_movements").insert({
          product_id: product.id,
          quantity: line.quantity,
          movement_type: "transfer_in" as never,
          from_location_id: warehouse.id,
          to_location_id: targetBarId,
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
        const currentB = getBalance(product.id, targetBarId);
        const { data: existing } = await supabase
          .from("stock_balances")
          .select("id")
          .eq("location_id", targetBarId)
          .eq("product_id", product.id)
          .maybeSingle();

        if (existing) {
          await supabase
            .from("stock_balances")
            .update({ quantity: currentB + line.quantity, updated_at: new Date().toISOString() })
            .eq("location_id", targetBarId)
            .eq("product_id", product.id);
        } else {
          await supabase.from("stock_balances").insert({
            location_id: targetBarId,
            product_id: product.id,
            quantity: line.quantity,
            venue_id: PILOT_VENUE_ID,
          });
        }

        // 5. Sync products.current_stock to real balance total
        // Transfers don't change total stock, but we keep current_stock in sync
        // to avoid drift that would corrupt CPP calculations on next intake.
        const { data: allBalances } = await supabase
          .from("stock_balances")
          .select("quantity")
          .eq("product_id", product.id);
        const realTotal = (allBalances || []).reduce((s, b) => s + (Number(b.quantity) || 0), 0);
        await supabase
          .from("products")
          .update({ current_stock: realTotal })
          .eq("id", product.id);
      }

      const barNames = [...new Set(confirmLines.map(l => l.barName))].join(", ");
      toast.success(`Reposición completada → ${barNames}`);
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
          Envío masivo desde bodega — sin afectar costos ni impuestos
        </p>
      </div>

      {/* Metrics */}
      <StockMetricsBar
        warehouseCost={metrics.warehouseCost}
        barsCost={metrics.barsCost}
        warehousePct={metrics.warehousePct}
        barsPct={metrics.barsPct}
      />

      <Tabs defaultValue="bulk" className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-6">
          <TabsTrigger value="bulk" className="flex items-center gap-2">
            <Send className="w-4 h-4" />
            Envío Rápido (Masivo)
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2">
            <History className="w-4 h-4" />
            Historial
          </TabsTrigger>
        </TabsList>

        <TabsContent value="bulk" className="space-y-4">
          <BulkTransferGrid
            products={products}
            barLocations={barLocations}
            getBalance={getBalance}
            onConfirm={handlePrepareTransfer}
            submitting={submitting}
          />
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
        barName={[...new Set(confirmLines.map(l => l.barName))].join(", ") || ""}
        onConfirm={handleConfirmTransfer}
        submitting={submitting}
      />
    </div>
  );
}
