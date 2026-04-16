import { useState, useEffect, useCallback, lazy, Suspense } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ShoppingCart, ArrowRightLeft, ClipboardCheck, Download, Package, DollarSign,
  Clock, AlertTriangle, ChevronDown, ChevronUp, Loader2, Trash2, Scale,
  ClipboardList, CheckCircle2, XCircle, FileSpreadsheet,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useActiveVenue } from "@/hooks/useActiveVenue";
import { ExcelUpload } from "./ExcelUpload";
import { EditableBatchPreview } from "./EditableBatchPreview";
import { InventoryFreezeBanner } from "@/components/InventoryFreezeBanner";
import { formatCLP } from "@/lib/currency";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { isBottle, calculateCPP } from "@/lib/product-type";
import { toast } from "sonner";

const WarehouseInventory = lazy(() =>
  import("./WarehouseInventory").then((m) => ({ default: m.WarehouseInventory }))
);
const WasteManagement = lazy(() =>
  import("./WasteManagement").then((m) => ({ default: m.WasteManagement }))
);
const ExternalConsumptionPanel = lazy(() =>
  import("./ExternalConsumptionPanel").then((m) => ({ default: m.ExternalConsumptionPanel }))
);
const InventoryComparisonModule = lazy(() =>
  import("./InventoryComparisonModule").then((m) => ({ default: m.InventoryComparisonModule }))
);

type MovementType = "COMPRA" | "TRANSFERENCIA" | "CONTEO";
type SecondaryView = "stock" | "waste" | "comparison" | "external" | null;

interface QuickStats {
  totalProducts: number;
  totalCapital: number;
  lastMovement: string | null;
  lowStockCount: number;
}

interface RecentMovement {
  id: string;
  movement_type: string;
  quantity: number;
  created_at: string;
  productName: string;
  locationName: string;
}

interface PendingBatch {
  id: string;
  batch_type: string;
  status: string;
  uploaded_at: string;
  file_name: string | null;
  row_count: number;
  valid_count: number;
  invalid_count: number;
  summary_json: Record<string, any>;
}

interface BatchRow {
  id: string;
  row_index: number;
  product_id: string | null;
  product_name_excel: string | null;
  product_name_matched: string | null;
  match_confidence: string | null;
  tipo_consumo: string | null;
  location_destino_id: string | null;
  location_origen_id: string | null;
  quantity: number | null;
  unit_cost: number | null;
  computed_base_qty: number | null;
  stock_teorico: number | null;
  stock_real: number | null;
  errors: string[] | null;
  is_valid: boolean;
  raw_data: Record<string, any>;
}

interface InventoryHubProps {
  isReadOnly?: boolean;
}

export function InventoryHub({ isReadOnly = false }: InventoryHubProps) {
  const { venue } = useActiveVenue();
  const [stats, setStats] = useState<QuickStats | null>(null);
  const [recentMoves, setRecentMoves] = useState<RecentMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadDialog, setUploadDialog] = useState<MovementType | null>(null);
  const [secondaryView, setSecondaryView] = useState<SecondaryView>(null);
  const [showDetailedStock, setShowDetailedStock] = useState(false);

  // Pending batches
  const [pendingBatches, setPendingBatches] = useState<PendingBatch[]>([]);
  const [selectedBatch, setSelectedBatch] = useState<PendingBatch | null>(null);
  const [batchRows, setBatchRows] = useState<BatchRow[]>([]);
  const [loadingRows, setLoadingRows] = useState(false);
  const [approving, setApproving] = useState(false);
  const [allProducts, setAllProducts] = useState<{ id: string; name: string; code: string | null; capacity_ml: number | null }[]>([]);

  const loadDashboard = useCallback(async () => {
    if (!venue?.id) return;
    setLoading(true);

    const [balancesRes, movesRes, batchesRes] = await Promise.all([
      supabase
        .from("stock_balances")
        .select("quantity, product_id, products(name, cost_per_unit)")
        .eq("venue_id", venue.id),
      supabase
        .from("stock_movements")
        .select("id, movement_type, quantity, created_at, product_id, to_location_id, products(name), stock_locations!stock_movements_to_location_id_fkey(name)")
        .eq("venue_id", venue.id)
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("stock_import_batches")
        .select("*")
        .eq("venue_id", venue.id)
        .order("uploaded_at", { ascending: false })
        .limit(10),
    ]);

    const balances = balancesRes.data || [];
    let totalCapital = 0;
    const productIds = new Set<string>();
    let lowStock = 0;

    for (const b of balances) {
      const qty = Number(b.quantity) || 0;
      const cost = Number((b as any).products?.cost_per_unit) || 0;
      totalCapital += qty * cost;
      productIds.add(b.product_id);
      if (qty > 0 && qty <= 5) lowStock++;
    }

    const moves = movesRes.data || [];
    setStats({
      totalProducts: productIds.size,
      totalCapital,
      lastMovement: moves[0]?.created_at || null,
      lowStockCount: lowStock,
    });

    setRecentMoves(
      moves.map((m: any) => ({
        id: m.id, movement_type: m.movement_type, quantity: Number(m.quantity) || 0,
        created_at: m.created_at, productName: m.products?.name || "—",
        locationName: m.stock_locations?.name || "—",
      }))
    );

    setPendingBatches(
      (batchesRes.data || []).map((b: any) => ({
        id: b.id, batch_type: b.batch_type, status: b.status,
        uploaded_at: b.uploaded_at, file_name: b.file_name,
        row_count: b.row_count, valid_count: b.valid_count,
        invalid_count: b.invalid_count, summary_json: b.summary_json || {},
      }))
    );

    setLoading(false);
  }, [venue?.id]);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  // ── Load batch rows ────────────────────────────────────────────────────────

  const openBatchDetail = async (batch: PendingBatch) => {
    setSelectedBatch(batch);
    setLoadingRows(true);

    const [rowsRes, prodsRes] = await Promise.all([
      supabase.from("stock_import_rows").select("*").eq("batch_id", batch.id).order("row_index"),
      allProducts.length > 0
        ? Promise.resolve({ data: null })
        : supabase.from("products").select("id, name, code, capacity_ml").eq("venue_id", venue!.id),
    ]);

    if (prodsRes.data) {
      setAllProducts(prodsRes.data.map((p: any) => ({ id: p.id, name: p.name, code: p.code, capacity_ml: p.capacity_ml })));
    }

    setBatchRows(
      (rowsRes.data || []).map((r: any) => ({
        id: r.id, row_index: r.row_index, product_id: r.product_id,
        product_name_excel: r.product_name_excel, product_name_matched: r.product_name_matched,
        match_confidence: r.match_confidence, tipo_consumo: r.tipo_consumo,
        location_destino_id: r.location_destino_id, location_origen_id: r.location_origen_id,
        quantity: r.quantity ? Number(r.quantity) : null,
        unit_cost: r.unit_cost ? Number(r.unit_cost) : null,
        computed_base_qty: r.computed_base_qty ? Number(r.computed_base_qty) : null,
        stock_teorico: r.stock_teorico ? Number(r.stock_teorico) : null,
        stock_real: r.stock_real ? Number(r.stock_real) : null,
        errors: r.errors, is_valid: r.is_valid, raw_data: r.raw_data || {},
      }))
    );
    setLoadingRows(false);
  };

  // ── Approve batch ──────────────────────────────────────────────────────────

  const handleApprove = async () => {
    if (!selectedBatch || !venue?.id) return;
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) { toast.error("Usuario no autenticado"); return; }

    setApproving(true);
    try {
      const validRows = batchRows.filter((r) => r.is_valid);

      if (selectedBatch.batch_type === "COMPRA") {
        await applyCompras(validRows, userId, venue.id);
      } else if (selectedBatch.batch_type === "TRANSFERENCIA") {
        await applyTransferencias(validRows, userId, venue.id);
      } else if (selectedBatch.batch_type === "CONTEO") {
        await applyConteos(validRows, userId, venue.id);
      }

      // Save learned product mappings
      await saveLearnings(validRows, venue.id);

      await supabase
        .from("stock_import_batches")
        .update({ status: "aprobado", approved_by: userId, approved_at: new Date().toISOString() })
        .eq("id", selectedBatch.id);

      toast.success("Lote aprobado y aplicado");
      setSelectedBatch(null);
      loadDashboard();
    } catch (error) {
      console.error("Error applying batch:", error);
      toast.error("Error al aplicar el lote");
    } finally {
      setApproving(false);
    }
  };

  // ── Save learnings ────────────────────────────────────────────────────────

  const saveLearnings = async (rows: BatchRow[], venueId: string) => {
    const mappings = rows
      .filter((r) => r.product_id && r.product_name_excel)
      .map((r) => ({
        raw_text: r.product_name_excel!.toLowerCase().trim(),
        product_id: r.product_id!,
        venue_id: venueId,
        wasManualCorrection: r.match_confidence === "alta" && r.product_name_matched !== r.product_name_excel,
      }));

    // Deduplicate by raw_text
    const unique = new Map<string, typeof mappings[0]>();
    for (const m of mappings) unique.set(m.raw_text, m);

    for (const m of unique.values()) {
      // Try to upsert: if exists, increment times_used
      const { data: existing } = await supabase
        .from("learning_product_mappings")
        .select("id, times_used")
        .eq("raw_text", m.raw_text)
        .eq("venue_id", venueId)
        .maybeSingle();

      if (existing) {
        const baseConf = m.wasManualCorrection ? 0.95 : 0.7;
        await supabase
          .from("learning_product_mappings")
          .update({
            product_id: m.product_id,
            times_used: (existing.times_used || 0) + 1,
            confidence: Math.min(1, baseConf + (existing.times_used || 0) * 0.05),
            last_used_at: new Date().toISOString(),
          })
          .eq("id", existing.id);
      } else {
        await supabase
          .from("learning_product_mappings")
          .insert({
            raw_text: m.raw_text,
            product_id: m.product_id,
            venue_id: venueId,
            confidence: 0.7,
            times_used: 1,
          });
      }
    }
  };

  // ── Reject batch ───────────────────────────────────────────────────────────

  const handleReject = async () => {
    if (!selectedBatch) return;
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id;

    await supabase
      .from("stock_import_batches")
      .update({ status: "rechazado", approved_by: userId, approved_at: new Date().toISOString() })
      .eq("id", selectedBatch.id);

    toast.success("Lote rechazado");
    setSelectedBatch(null);
    loadDashboard();
  };

  // ── Apply functions ────────────────────────────────────────────────────────

  const applyCompras = async (rows: BatchRow[], userId: string, venueId: string) => {
    const bodegaLoc = rows[0]?.location_destino_id;

    const { data: batch } = await supabase
      .from("stock_intake_batches")
      .insert({
        venue_id: venueId, created_by: userId,
        notes: "Excel import (aprobado)",
        total_net: rows.reduce((s, r) => s + (r.unit_cost || 0) * (r.quantity || 0), 0),
        total_vat: 0, total_specific_tax: 0, total_other_tax: 0,
        total_amount: rows.reduce((s, r) => s + (r.unit_cost || 0) * (r.quantity || 0), 0),
        items_count: rows.length,
        default_location_id: bodegaLoc,
      })
      .select("id").single();

    if (!batch) throw new Error("Failed to create intake batch");

    for (const row of rows) {
      if (!row.product_id || !row.location_destino_id) continue;
      const costoEnv = row.unit_cost || 0;
      const cantEnv = row.quantity || 0;
      const baseQty = row.computed_base_qty || 0;

      await supabase.from("stock_intake_items").insert({
        batch_id: batch.id, product_id: row.product_id, location_id: row.location_destino_id,
        quantity: cantEnv, net_unit_cost: costoEnv, vat_unit: 0, specific_tax_unit: 0,
        other_tax_unit: 0, total_unit: costoEnv, total_line: costoEnv * cantEnv, venue_id: venueId,
      });

      // Upsert balance
      const { data: bal } = await supabase
        .from("stock_balances")
        .select("id, quantity")
        .eq("product_id", row.product_id)
        .eq("location_id", row.location_destino_id)
        .eq("venue_id", venueId)
        .maybeSingle();

      const currentBal = Number(bal?.quantity) || 0;
      const newBal = currentBal + baseQty;

      if (bal) {
        await supabase.from("stock_balances").update({ quantity: newBal, updated_at: new Date().toISOString() }).eq("id", bal.id);
      } else {
        await supabase.from("stock_balances").insert({ product_id: row.product_id, location_id: row.location_destino_id, quantity: newBal, venue_id: venueId });
      }

      await supabase.from("stock_movements").insert({
        product_id: row.product_id, movement_type: "compra", quantity: baseQty,
        notes: "Excel compra (aprobado)", to_location_id: row.location_destino_id,
        unit_cost_snapshot: costoEnv, total_cost_snapshot: costoEnv * cantEnv, venue_id: venueId,
      });

      // CPP
      const { data: allBal } = await supabase.from("stock_balances").select("quantity").eq("product_id", row.product_id).eq("venue_id", venueId);
      const totalStock = (allBal || []).reduce((s, b) => s + (Number(b.quantity) || 0), 0);
      const stockBefore = totalStock - baseQty;

      const { data: prod } = await supabase.from("products").select("cost_per_unit, capacity_ml").eq("id", row.product_id).single();
      const oldCost = prod?.cost_per_unit || 0;

      const newCPP = calculateCPP({
        product: { capacity_ml: prod?.capacity_ml },
        currentStock: stockBefore, oldCostPerUnit: oldCost,
        addedQty: baseQty, newCostPerUnit: costoEnv,
      });

      await supabase.from("products").update({ cost_per_unit: Math.round(newCPP), current_stock: totalStock }).eq("id", row.product_id);
    }
  };

  const applyTransferencias = async (rows: BatchRow[], userId: string, venueId: string) => {
    const first = rows[0];
    if (!first?.location_origen_id || !first?.location_destino_id) return;

    const { data: transfer } = await supabase
      .from("stock_transfers")
      .insert({
        from_location_id: first.location_origen_id, to_location_id: first.location_destino_id,
        transferred_by: userId, notes: "Excel transferencia (aprobado)", venue_id: venueId,
      })
      .select("id").single();

    if (!transfer) throw new Error("Failed to create transfer");

    for (const row of rows) {
      if (!row.product_id) continue;
      const qty = row.computed_base_qty || 0;

      await supabase.from("stock_transfer_items").insert({ transfer_id: transfer.id, product_id: row.product_id, quantity: qty, venue_id: venueId });

      // Decrement origin
      const { data: origBal } = await supabase.from("stock_balances").select("id, quantity")
        .eq("product_id", row.product_id).eq("location_id", first.location_origen_id!).eq("venue_id", venueId).maybeSingle();
      if (origBal) {
        await supabase.from("stock_balances").update({ quantity: Math.max(0, Number(origBal.quantity) - qty), updated_at: new Date().toISOString() }).eq("id", origBal.id);
      }

      // Increment dest
      const { data: destBal } = await supabase.from("stock_balances").select("id, quantity")
        .eq("product_id", row.product_id).eq("location_id", first.location_destino_id!).eq("venue_id", venueId).maybeSingle();
      if (destBal) {
        await supabase.from("stock_balances").update({ quantity: Number(destBal.quantity) + qty, updated_at: new Date().toISOString() }).eq("id", destBal.id);
      } else {
        await supabase.from("stock_balances").insert({ product_id: row.product_id, location_id: first.location_destino_id!, quantity: qty, venue_id: venueId });
      }

      await supabase.from("stock_movements").insert([
        { product_id: row.product_id, movement_type: "transfer_out", quantity: qty, from_location_id: first.location_origen_id, transfer_id: transfer.id, venue_id: venueId, notes: "Excel transfer salida" },
        { product_id: row.product_id, movement_type: "transfer_in", quantity: qty, to_location_id: first.location_destino_id, transfer_id: transfer.id, venue_id: venueId, notes: "Excel transfer entrada" },
      ]);

      const { data: allBal } = await supabase.from("stock_balances").select("quantity").eq("product_id", row.product_id).eq("venue_id", venueId);
      const totalStock = (allBal || []).reduce((s, b) => s + (Number(b.quantity) || 0), 0);
      await supabase.from("products").update({ current_stock: totalStock }).eq("id", row.product_id);
    }
  };

  const applyConteos = async (rows: BatchRow[], userId: string, venueId: string) => {
    for (const row of rows) {
      if (!row.product_id || !row.location_destino_id || row.stock_real === null) continue;
      const stockReal = row.stock_real;

      const { data: bal } = await supabase.from("stock_balances").select("id, quantity")
        .eq("product_id", row.product_id).eq("location_id", row.location_destino_id).eq("venue_id", venueId).maybeSingle();

      const currentBal = Number(bal?.quantity) || 0;
      const diff = stockReal - currentBal;
      if (diff === 0) continue;

      if (bal) {
        await supabase.from("stock_balances").update({ quantity: stockReal, updated_at: new Date().toISOString() }).eq("id", bal.id);
      } else {
        await supabase.from("stock_balances").insert({ product_id: row.product_id, location_id: row.location_destino_id, quantity: stockReal, venue_id: venueId });
      }

      await supabase.from("stock_movements").insert({
        product_id: row.product_id, movement_type: diff < 0 ? "waste" : "reconciliation",
        quantity: Math.abs(diff), notes: `Conteo: ${diff < 0 ? "merma" : "ajuste +"} (${diff})`,
        to_location_id: row.location_destino_id, venue_id: venueId,
      });

      const { data: allBal } = await supabase.from("stock_balances").select("quantity").eq("product_id", row.product_id).eq("venue_id", venueId);
      const totalStock = (allBal || []).reduce((s, b) => s + (Number(b.quantity) || 0), 0);
      await supabase.from("products").update({ current_stock: totalStock }).eq("id", row.product_id);
    }
  };

  // ── Download stock ─────────────────────────────────────────────────────────

  const handleDownloadStock = async () => {
    if (!venue?.id) return;
    try {
      const { data, error } = await supabase
        .from("stock_balances")
        .select("quantity, products(name, code, unit, capacity_ml, cost_per_unit), stock_locations(name)")
        .eq("venue_id", venue.id)
        .gt("quantity", 0);

      if (error) throw error;
      if (!data || data.length === 0) {
        toast.info("No hay stock registrado");
        return;
      }

      const rows = data.map((b: any) => {
        const prod = b.products;
        const loc = b.stock_locations;
        const bottle = prod?.capacity_ml && prod.capacity_ml > 0;
        const cpp = prod?.cost_per_unit || 0;
        const valor = bottle
          ? b.quantity * (cpp / prod.capacity_ml)
          : b.quantity * cpp;

        return [
          prod?.code || "",
          prod?.name || "",
          loc?.name || "",
          bottle ? "ML" : "UNIT",
          prod?.unit || "",
          b.quantity,
          Math.round(cpp),
          Math.round(valor),
        ];
      });

      const header = ["SKU", "Producto", "Ubicación", "Tipo", "Unidad", "Stock", "CPP", "Valor"];
      const csv = [header, ...rows].map((r) => r.join(",")).join("\n");
      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `stock_${venue.name || "venue"}_${format(new Date(), "yyyy-MM-dd")}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Stock descargado");
    } catch (err) {
      console.error(err);
      toast.error("Error al descargar stock");
    }
  };

  // ── UI helpers ─────────────────────────────────────────────────────────────

  const actionCards = [
    { title: "Subir Compra", description: "Ingresar compra de proveedor", icon: ShoppingCart, type: "COMPRA" as MovementType, color: "text-emerald-500", bg: "bg-emerald-500/10" },
    { title: "Subir Reposición", description: "Transferir entre ubicaciones", icon: ArrowRightLeft, type: "TRANSFERENCIA" as MovementType, color: "text-blue-500", bg: "bg-blue-500/10" },
    { title: "Subir Conteo", description: "Registrar conteo físico", icon: ClipboardCheck, type: "CONTEO" as MovementType, color: "text-amber-500", bg: "bg-amber-500/10" },
  ];

  const movementLabel = (type: string) => {
    const map: Record<string, string> = { compra: "Compra", transfer_in: "Entrada", transfer_out: "Salida", waste: "Merma", reconciliation: "Ajuste", sale: "Venta" };
    return map[type] || type;
  };

  const movementColor = (type: string) => {
    if (["compra", "transfer_in", "reconciliation"].includes(type)) return "text-emerald-600";
    if (["waste", "transfer_out", "sale"].includes(type)) return "text-red-500";
    return "text-muted-foreground";
  };

  const batchTypeLabel = (t: string) => ({ COMPRA: "Compra", TRANSFERENCIA: "Reposición", CONTEO: "Conteo" })[t] || t;
  const statusBadge = (s: string) => {
    if (s === "pendiente_aprobacion") return <Badge className="bg-amber-500/15 text-amber-700 border-amber-200" variant="outline">Pendiente</Badge>;
    if (s === "aprobado") return <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-200" variant="outline">Aprobado</Badge>;
    return <Badge variant="destructive">Rechazado</Badge>;
  };

  const pending = pendingBatches.filter((b) => b.status === "pendiente_aprobacion");
  const history = pendingBatches.filter((b) => b.status !== "pendiente_aprobacion");


  return (
    <div className="space-y-6">
      <InventoryFreezeBanner />

      {/* ── Action Cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {actionCards.map((card) => (
          <Card key={card.type} className="cursor-pointer hover:shadow-md transition-shadow border-border/50" onClick={() => !isReadOnly && setUploadDialog(card.type)}>
            <CardContent className="p-4 flex flex-col items-center text-center gap-2">
              <div className={`p-3 rounded-xl ${card.bg}`}><card.icon className={`w-6 h-6 ${card.color}`} /></div>
              <span className="font-medium text-sm text-foreground">{card.title}</span>
              <span className="text-xs text-muted-foreground hidden sm:block">{card.description}</span>
            </CardContent>
          </Card>
        ))}
        <Card className="cursor-pointer hover:shadow-md transition-shadow border-border/50" onClick={handleDownloadStock}>
          <CardContent className="p-4 flex flex-col items-center text-center gap-2">
            <div className="p-3 rounded-xl bg-purple-500/10"><Download className="w-6 h-6 text-purple-500" /></div>
            <span className="font-medium text-sm text-foreground">Descargar Stock</span>
            <span className="text-xs text-muted-foreground hidden sm:block">Exportar stock actual</span>
          </CardContent>
        </Card>
      </div>

      {/* ── Pending Batches ── */}
      {pending.length > 0 && (
        <Card className="border-amber-200 bg-amber-500/5">
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-500" />
              Lotes pendientes de aprobación ({pending.length})
            </h3>
            <div className="space-y-2">
              {pending.map((b) => (
                <div
                  key={b.id}
                  className="flex items-center justify-between p-3 bg-background rounded-lg border border-border/50 cursor-pointer hover:shadow-sm transition-shadow"
                  onClick={() => openBatchDetail(b)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <FileSpreadsheet className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{batchTypeLabel(b.batch_type)}</p>
                      <p className="text-xs text-muted-foreground truncate">{b.file_name || "—"}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(b.uploaded_at), "dd/MM HH:mm")}
                    </span>
                    <Badge variant="outline" className="text-xs">
                      {b.valid_count} válidas
                    </Badge>
                    {statusBadge(b.status)}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Quick Stats ── */}
      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="border-border/50"><CardContent className="p-4 flex items-center gap-3">
            <Package className="w-5 h-5 text-muted-foreground" />
            <div><p className="text-2xl font-bold text-foreground">{stats.totalProducts}</p><p className="text-xs text-muted-foreground">Productos</p></div>
          </CardContent></Card>
          <Card className="border-border/50"><CardContent className="p-4 flex items-center gap-3">
            <DollarSign className="w-5 h-5 text-muted-foreground" />
            <div><p className="text-2xl font-bold text-foreground">{formatCLP(stats.totalCapital)}</p><p className="text-xs text-muted-foreground">Capital stock</p></div>
          </CardContent></Card>
          <Card className="border-border/50"><CardContent className="p-4 flex items-center gap-3">
            <Clock className="w-5 h-5 text-muted-foreground" />
            <div><p className="text-sm font-medium text-foreground">
              {stats.lastMovement ? format(new Date(stats.lastMovement), "dd MMM HH:mm", { locale: es }) : "—"}
            </p><p className="text-xs text-muted-foreground">Último mov.</p></div>
          </CardContent></Card>
          <Card className="border-border/50"><CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className={`w-5 h-5 ${stats.lowStockCount > 0 ? "text-amber-500" : "text-muted-foreground"}`} />
            <div><p className="text-2xl font-bold text-foreground">{stats.lowStockCount}</p><p className="text-xs text-muted-foreground">Stock bajo</p></div>
          </CardContent></Card>
        </div>
      )}

      {/* ── Recent Movements ── */}
      {recentMoves.length > 0 && (
        <Card className="border-border/50"><CardContent className="p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">Últimos movimientos</h3>
          <div className="space-y-2">
            {recentMoves.map((m) => (
              <div key={m.id} className="flex items-center justify-between text-sm py-1.5 border-b border-border/30 last:border-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full bg-muted ${movementColor(m.movement_type)}`}>{movementLabel(m.movement_type)}</span>
                  <span className="text-foreground truncate">{m.productName}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs text-muted-foreground">{m.locationName}</span>
                  <span className={`font-medium ${movementColor(m.movement_type)}`}>
                    {["transfer_out", "waste", "sale"].includes(m.movement_type) ? "-" : "+"}{m.quantity}
                  </span>
                  <span className="text-xs text-muted-foreground">{format(new Date(m.created_at), "dd/MM HH:mm")}</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent></Card>
      )}

      {/* ── Batch history ── */}
      {history.length > 0 && (
        <Card className="border-border/50"><CardContent className="p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">Historial de importaciones</h3>
          <div className="space-y-1">
            {history.map((b) => (
              <div key={b.id} className="flex items-center justify-between text-sm py-1.5 border-b border-border/30 last:border-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-foreground">{batchTypeLabel(b.batch_type)}</span>
                  <span className="text-xs text-muted-foreground truncate max-w-[150px]">{b.file_name || "—"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{format(new Date(b.uploaded_at), "dd/MM HH:mm")}</span>
                  {statusBadge(b.status)}
                </div>
              </div>
            ))}
          </div>
        </CardContent></Card>
      )}

      {/* ── Secondary actions ── */}
      <div className="flex flex-wrap gap-2">
        <Button variant={showDetailedStock ? "secondary" : "outline"} size="sm"
          onClick={() => { setShowDetailedStock(!showDetailedStock); setSecondaryView(null); }}>
          <Package className="w-4 h-4 mr-1" />
          {showDetailedStock ? <ChevronUp className="w-3 h-3 mr-1" /> : <ChevronDown className="w-3 h-3 mr-1" />}
          Stock detallado
        </Button>
        {!isReadOnly && (
          <>
            <Button variant={secondaryView === "waste" ? "secondary" : "outline"} size="sm"
              onClick={() => { setSecondaryView(secondaryView === "waste" ? null : "waste"); setShowDetailedStock(false); }}>
              <Trash2 className="w-4 h-4 mr-1" /> Merma
            </Button>
            <Button variant={secondaryView === "comparison" ? "secondary" : "outline"} size="sm"
              onClick={() => { setSecondaryView(secondaryView === "comparison" ? null : "comparison"); setShowDetailedStock(false); }}>
              <Scale className="w-4 h-4 mr-1" /> Comparación de inventario
            </Button>
            <Button variant={secondaryView === "external" ? "secondary" : "outline"} size="sm"
              onClick={() => { setSecondaryView(secondaryView === "external" ? null : "external"); setShowDetailedStock(false); }}>
              <ClipboardList className="w-4 h-4 mr-1" /> Consumo externo
            </Button>
          </>
        )}
      </div>

      <Suspense fallback={<div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}>
        {showDetailedStock && <WarehouseInventory isReadOnly={isReadOnly} />}
        {secondaryView === "waste" && <WasteManagement />}
        {secondaryView === "comparison" && <InventoryComparisonModule />}
        {secondaryView === "external" && <ExternalConsumptionPanel />}
      </Suspense>

      {/* ── Upload Dialog ── */}
      <Dialog open={!!uploadDialog} onOpenChange={(o) => !o && setUploadDialog(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {uploadDialog === "COMPRA" && "Subir Compra"}
              {uploadDialog === "TRANSFERENCIA" && "Subir Reposición"}
              {uploadDialog === "CONTEO" && "Subir Conteo"}
            </DialogTitle>
          </DialogHeader>
          <ExcelUpload
            defaultMovementType={uploadDialog || undefined}
            onBatchSaved={() => { setUploadDialog(null); loadDashboard(); }}
          />
        </DialogContent>
      </Dialog>

      {/* ── Batch Detail Dialog ── */}
      <Dialog open={!!selectedBatch} onOpenChange={(o) => !o && setSelectedBatch(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-primary" />
              {selectedBatch && batchTypeLabel(selectedBatch.batch_type)} — {selectedBatch?.file_name || "Lote"}
            </DialogTitle>
            <DialogDescription>
              {selectedBatch && `${selectedBatch.valid_count} filas válidas de ${selectedBatch.row_count} totales`}
            </DialogDescription>
          </DialogHeader>

          {/* Summary */}
          {selectedBatch && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 p-3 bg-muted/30 rounded-lg text-sm">
              <div><span className="text-muted-foreground">Tipo</span><p className="font-semibold">{batchTypeLabel(selectedBatch.batch_type)}</p></div>
              <div><span className="text-muted-foreground">Subido</span><p className="font-semibold">{format(new Date(selectedBatch.uploaded_at), "dd MMM HH:mm", { locale: es })}</p></div>
              <div><span className="text-muted-foreground">Válidas</span><p className="font-semibold text-emerald-600">{selectedBatch.valid_count}</p></div>
              <div><span className="text-muted-foreground">Errores</span><p className={`font-semibold ${selectedBatch.invalid_count > 0 ? "text-destructive" : ""}`}>{selectedBatch.invalid_count}</p></div>
            </div>
          )}

          {/* Rows */}
          <ScrollArea className="flex-1 border rounded-lg">
            {loadingRows ? (
              <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
            ) : (
              <EditableBatchPreview
                rows={batchRows}
                batchType={selectedBatch?.batch_type || "COMPRA"}
                products={allProducts}
                onRowsChange={setBatchRows}
              />
            )}
          </ScrollArea>

          {selectedBatch?.status === "pendiente_aprobacion" && (
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={handleReject} disabled={approving}>
                <XCircle className="mr-2 h-4 w-4" />Rechazar
              </Button>
              <Button onClick={handleApprove} disabled={approving || batchRows.filter(r => r.is_valid).length === 0} className="primary-gradient">
                {approving ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Aplicando...</>
                ) : (
                  <><CheckCircle2 className="mr-2 h-4 w-4" />Aprobar ({batchRows.filter(r => r.is_valid).length} filas)</>
                )}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
