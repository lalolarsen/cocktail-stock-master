import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { formatCLP } from "@/lib/currency";
import { calculateCPP } from "@/lib/product-type";
import {
  Plus,
  Copy,
  Trash2,
  Loader2,
  Check,
  Warehouse,
  Info,
  AlertCircle,
  FlaskConical,
  PackageOpen,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Alert, AlertDescription } from "@/components/ui/alert";

// ─── Types ──────────────────────────────────────────────────

interface Product {
  id: string;
  name: string;
  code: string;
  category: string;
  unit: string;
  capacity_ml?: number | null;
  current_stock?: number;
  cost_per_unit?: number;
}

interface TaxCategory {
  id: string;
  name: string;
  rate_pct: number;
}

/**
 * IntakeRow.quantity:
 *   - isBottle product → number of BOTTLES (decimal allowed, e.g. 2.5)
 *   - unit product     → number of units
 *
 * IntakeRow.net_unit_cost:
 *   - isBottle → costo neto por BOTELLA COMPLETA
 *   - unit     → costo neto por UNIDAD
 */
interface IntakeRow {
  id: string;
  product_id: string;
  quantity: string;
  net_unit_cost: string;
  tax_category_id: string;
  other_tax_unit: string;
  notes: string;
  // computed
  iva_unit: number;
  specific_tax_unit: number;
  total_unit: number;
  total_line: number;
  qty_ml: number;       // for bottle products: qty_bottles * capacity_ml
  cost_per_ml: number;  // net_unit_cost / capacity_ml (display only)
  errors: Record<string, boolean>;
}

interface BulkStockIntakeGridProps {
  warehouseId: string;
  products: Product[];
  onStockUpdated: () => void;
}

const VAT_PCT = 19;

const createEmptyRow = (): IntakeRow => ({
  id: crypto.randomUUID(),
  product_id: "",
  quantity: "",
  net_unit_cost: "",
  tax_category_id: "",
  other_tax_unit: "0",
  notes: "",
  iva_unit: 0,
  specific_tax_unit: 0,
  total_unit: 0,
  total_line: 0,
  qty_ml: 0,
  cost_per_ml: 0,
  errors: {},
});

/**
 * Source of truth: isBottle = capacity_ml IS NOT NULL AND capacity_ml > 0.
 * products.unit is only a visual label.
 */
function isBottle(product: Product | undefined): boolean {
  if (!product) return false;
  return typeof product.capacity_ml === "number" && product.capacity_ml > 0;
}

function computeRow(row: IntakeRow, taxCategories: TaxCategory[], products: Product[]): IntakeRow {
  const product = products.find(p => p.id === row.product_id);
  const bottle = isBottle(product);
  const capacityMl = product?.capacity_ml ?? 0;

  // For bottles: quantity = # bottles. For units: quantity = # units.
  const qtyInput = parseFloat(row.quantity) || 0;
  const net = parseFloat(row.net_unit_cost) || 0; // per bottle or per unit
  const other = parseFloat(row.other_tax_unit) || 0;

  const iva_unit = Math.round(net * VAT_PCT / 100);
  const taxCat = taxCategories.find((t) => t.id === row.tax_category_id);
  const specific_tax_unit = taxCat ? Math.round(net * taxCat.rate_pct / 100) : 0;
  const total_unit = net + iva_unit + specific_tax_unit + other; // per bottle or unit

  const qty_ml = bottle && capacityMl > 0 ? qtyInput * capacityMl : 0;
  const cost_per_ml = bottle && capacityMl > 0 ? net / capacityMl : 0;
  const total_line = qtyInput * net; // net cost only (no tax in inventory valuation)

  const errors: Record<string, boolean> = {};
  if (!row.product_id) errors.product_id = true;
  if (!row.quantity || qtyInput <= 0) errors.quantity = true;
  if (!row.net_unit_cost || net <= 0) errors.net_unit_cost = true;
  if (!row.tax_category_id) errors.tax_category_id = true;
  // Hard block: capacity_ml=0/null cannot enter as bottle
  if (product && !bottle && row.quantity && qtyInput > 0) {
    // unit product — ok
  }

  return { ...row, iva_unit, specific_tax_unit, total_unit, total_line, qty_ml, cost_per_ml, errors };
}

export function BulkStockIntakeGrid({
  warehouseId,
  products,
  onStockUpdated,
}: BulkStockIntakeGridProps) {
  const [taxCategories, setTaxCategories] = useState<TaxCategory[]>([]);
  const [rows, setRows] = useState<IntakeRow[]>([createEmptyRow()]);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [showValidation, setShowValidation] = useState(false);
  const tableRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchMeta = async () => {
      const { data } = await supabase
        .from("specific_tax_categories")
        .select("id, name, rate_pct")
        .eq("is_active", true)
        .order("name");
      if (data) setTaxCategories(data as TaxCategory[]);
    };
    fetchMeta();
  }, []);

  const computedRows = useMemo(
    () => rows.map((r) => computeRow(r, taxCategories, products)),
    [rows, taxCategories, products]
  );

  const summary = useMemo(() => {
    const s = { net: 0, vat: 0, specificTax: 0, otherTax: 0, total: 0 };
    computedRows.forEach((r) => {
      const qtyInput = parseFloat(r.quantity) || 0;
      const net = parseFloat(r.net_unit_cost) || 0;
      s.net += net * qtyInput;
      s.vat += r.iva_unit * qtyInput;
      s.specificTax += r.specific_tax_unit * qtyInput;
      s.otherTax += (parseFloat(r.other_tax_unit) || 0) * qtyInput;
      s.total += r.total_unit * qtyInput;
    });
    return s;
  }, [computedRows]);

  // When product changes: pre-fill cost and clear quantity
  const handleProductChange = useCallback((rowId: string, productId: string) => {
    const product = products.find(p => p.id === productId);
    setRows(prev => prev.map(r => {
      if (r.id !== rowId) return r;
      const defaultCost = product?.cost_per_unit && product.cost_per_unit > 0
        ? String(Math.round(product.cost_per_unit))
        : "";
      return { ...r, product_id: productId, net_unit_cost: defaultCost, quantity: "" };
    }));
  }, [products]);

  const updateRow = useCallback((rowId: string, field: keyof IntakeRow, value: string) => {
    setRows((prev) =>
      prev.map((r) => (r.id === rowId ? { ...r, [field]: value } : r))
    );
  }, []);

  const addRow = useCallback(() => {
    setRows((prev) => [...prev, createEmptyRow()]);
    setTimeout(() => {
      tableRef.current?.scrollTo({ top: tableRef.current.scrollHeight, behavior: "smooth" });
    }, 50);
  }, []);

  const duplicateRow = useCallback(() => {
    setRows((prev) => {
      const toDuplicate = prev.filter((r) => selectedRows.has(r.id));
      const source = toDuplicate.length > 0 ? toDuplicate : [prev[prev.length - 1]];
      return [...prev, ...source.map((r) => ({ ...r, id: crypto.randomUUID() }))];
    });
  }, [selectedRows]);

  const deleteSelected = useCallback(() => {
    if (selectedRows.size === 0) return;
    setRows((prev) => {
      const remaining = prev.filter((r) => !selectedRows.has(r.id));
      return remaining.length > 0 ? remaining : [createEmptyRow()];
    });
    setSelectedRows(new Set());
  }, [selectedRows]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, rowId: string, isLastCol: boolean) => {
      if (e.key === "Enter" && isLastCol) {
        const lastRow = rows[rows.length - 1];
        if (lastRow.id === rowId) {
          e.preventDefault();
          addRow();
        }
      }
    },
    [rows, addRow]
  );

  const toggleRowSelection = (rowId: string) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!warehouseId) {
      toast.error("No se encontró Bodega Principal activa. Configure una ubicación tipo 'warehouse' primero.");
      return;
    }

    setShowValidation(true);

    const invalidRows = computedRows.filter((r) => Object.keys(r.errors).length > 0);
    if (invalidRows.length > 0) {
      toast.error(`${invalidRows.length} fila(s) con errores. Revise los campos marcados en rojo.`);
      return;
    }

    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await supabase
        .from("profiles")
        .select("venue_id")
        .eq("id", user!.id)
        .single();
      const venueId = profile?.venue_id;
      if (!venueId) throw new Error("No venue");

      // Create batch
      const { data: batch, error: batchErr } = await supabase
        .from("stock_intake_batches")
        .insert({
          venue_id: venueId,
          created_by: user!.id,
          default_location_id: warehouseId,
          total_net: summary.net,
          total_vat: summary.vat,
          total_specific_tax: summary.specificTax,
          total_other_tax: summary.otherTax,
          total_amount: summary.total,
          items_count: computedRows.length,
        })
        .select("id")
        .single();

      if (batchErr || !batch) throw batchErr || new Error("Failed to create batch");

      // Insert items
      const items = computedRows.map((r) => {
        const product = products.find(p => p.id === r.product_id);
        const bottle = isBottle(product);
        const capacityMl = product?.capacity_ml ?? 1;
        const qtyInput = parseFloat(r.quantity); // bottles or units
        const net = parseFloat(r.net_unit_cost);  // per bottle or per unit

        // DB stores quantity in ml for bottle products, units for unit products
        const qtyStored = bottle ? qtyInput * capacityMl : qtyInput;
        // DB stores net_unit_cost per ml for bottles (consistent with stock_movements.unit_cost)
        const netPerUom = bottle ? net / capacityMl : net;

        return {
          batch_id: batch.id,
          product_id: r.product_id,
          location_id: warehouseId,
          quantity: qtyStored,
          net_unit_cost: netPerUom,
          vat_unit: bottle ? r.iva_unit / capacityMl : r.iva_unit,
          specific_tax_unit: bottle ? r.specific_tax_unit / capacityMl : r.specific_tax_unit,
          other_tax_unit: parseFloat(r.other_tax_unit) || 0,
          total_unit: bottle ? r.total_unit / capacityMl : r.total_unit,
          total_line: r.total_line,
          tax_category_id: r.tax_category_id,
          venue_id: venueId,
        };
      });

      const { error: itemsErr } = await supabase.from("stock_intake_items").insert(items);
      if (itemsErr) throw itemsErr;

      // Create stock movements + update balances
      for (const r of computedRows) {
        const product = products.find(p => p.id === r.product_id);
        const bottle = isBottle(product);
        const capacityMl = product?.capacity_ml ?? 1;
        const qtyInput = parseFloat(r.quantity); // bottles or units (from user input)
        const net = parseFloat(r.net_unit_cost);  // per bottle (bottles) or per unit (units)

        // Stock is always stored in base unit: ml for bottles, units for unit products
        const qtyStored = bottle ? qtyInput * capacityMl : qtyInput;
        // unit_cost in stock_movements = per ml (bottles) or per unit
        const unitCostUom = bottle ? net / capacityMl : net;

        // ── STEP 1: Read BEFORE state for correct CPP ─────────────────────────
        // CRITICAL: fetch product cost + all balances BEFORE updating stock_balances
        // so stockBefore is the true pre-intake stock.
        const [productDataRes, balancesBeforeRes] = await Promise.all([
          supabase.from("products").select("cost_per_unit, capacity_ml").eq("id", r.product_id).single(),
          supabase.from("stock_balances").select("quantity").eq("product_id", r.product_id),
        ]);

        const stockBefore = (balancesBeforeRes.data || [])
          .reduce((s, b) => s + (Number(b.quantity) || 0), 0);

        // ── STEP 2: Insert stock_movement ──────────────────────────────────────
        await supabase.from("stock_movements").insert({
          product_id: r.product_id,
          quantity: qtyStored,
          movement_type: "entrada",
          to_location_id: warehouseId,
          unit_cost: unitCostUom,
          unit_cost_snapshot: unitCostUom,
          vat_amount: bottle ? (r.iva_unit / capacityMl) * qtyStored : r.iva_unit * qtyStored,
          specific_tax_amount: bottle ? (r.specific_tax_unit / capacityMl) * qtyStored : r.specific_tax_unit * qtyStored,
          source_type: "manual_batch",
          notes: r.notes || `Ingreso manual a Bodega Principal${bottle ? ` (${qtyInput} bot. × ${capacityMl}ml)` : ""}`,
          venue_id: venueId,
        });

        // ── STEP 3: Update stock_balances ──────────────────────────────────────
        const { data: existing } = await supabase
          .from("stock_balances")
          .select("quantity")
          .eq("location_id", warehouseId)
          .eq("product_id", r.product_id)
          .single();

        if (existing) {
          await supabase
            .from("stock_balances")
            .update({ quantity: (Number(existing.quantity) || 0) + qtyStored, updated_at: new Date().toISOString() })
            .eq("location_id", warehouseId)
            .eq("product_id", r.product_id);
        } else {
          await supabase.from("stock_balances").insert({
            location_id: warehouseId,
            product_id: r.product_id,
            quantity: qtyStored,
            venue_id: venueId,
          });
        }

        // ── STEP 4: Recalculate CPP using BEFORE stock ─────────────────────────
        if (productDataRes.data) {
          const productData = productDataRes.data;
          const oldCostPerUnit = Number(productData.cost_per_unit) || 0;

          // If existing cost is $0 (first intake), treat as fresh start:
          // avoid zero-dilution by ignoring previous stock quantity.
          const effectiveOldStock = oldCostPerUnit > 0 ? stockBefore : 0;
          const effectiveOldCost = oldCostPerUnit > 0 ? oldCostPerUnit : net;

          // calculateCPP handles ml↔bottle conversion internally for bottle products.
          // net = per-bottle cost; qtyStored = ml. Returns per-bottle cost.
          const rawCPP = calculateCPP({
            product: productData,
            currentStock: effectiveOldStock,     // ml before intake (or 0 for fresh)
            oldCostPerUnit: effectiveOldCost,    // per bottle (or per unit)
            addedQty: qtyStored,                 // ml added (or units)
            newCostPerUnit: net,                 // per bottle cost from invoice/entry
          });

          // CLP = integer currency, always round. cost_per_unit = per-bottle for bottles.
          const newCPP = Math.round(rawCPP);
          const newTotalStock = stockBefore + qtyStored;

          await supabase.from("products").update({
            current_stock: newTotalStock,
            cost_per_unit: newCPP,
          }).eq("id", r.product_id);
        }
      }

      toast.success(`${computedRows.length} líneas ingresadas a Bodega Principal`);
      setRows([createEmptyRow()]);
      setShowValidation(false);
      setSelectedRows(new Set());
      onStockUpdated();
    } catch (error) {
      console.error("Error submitting batch:", error);
      toast.error("Error al procesar el ingreso masivo");
    } finally {
      setSubmitting(false);
    }
  };

  const hasErrors = (row: IntakeRow, field: string) => showValidation && row.errors[field];

  const sortedProducts = useMemo(
    () => [...products].sort((a, b) => a.name.localeCompare(b.name)),
    [products]
  );

  if (!warehouseId) {
    return (
      <Card className="border-destructive/30">
        <CardContent className="py-8 text-center">
          <AlertCircle className="h-10 w-10 mx-auto mb-3 text-destructive" />
          <h3 className="font-semibold mb-1">Bodega Principal no configurada</h3>
          <p className="text-sm text-muted-foreground">
            Configure una ubicación tipo "warehouse" en Barras y POS antes de ingresar stock.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <TooltipProvider>
    <Card className="glass-effect border-primary/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Warehouse className="h-5 w-5 text-primary" />
          Ingreso manual masivo
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Solo productos existentes del catálogo. IVA (19%) e impuesto específico se calculan automáticamente.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">

        {/* ── Requisito previo: producto debe existir ── */}
        <Alert className="border-primary/30 bg-primary/5">
          <PackageOpen className="h-4 w-4 text-primary" />
          <AlertDescription className="text-xs leading-relaxed">
            <span className="font-semibold text-foreground">Los productos deben estar creados en el catálogo antes de ingresar stock.</span>
            {" "}Si el producto no aparece en la lista, créalo primero desde el módulo{" "}
            <span className="font-semibold text-foreground">Productos → Nuevo producto</span>{" "}
            (definiendo su tipo y capacidad), y luego regresa aquí para registrar el ingreso.
          </AlertDescription>
        </Alert>

        {/* ── Reglas de ingreso ── */}
        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-border bg-muted/40">
            <FlaskConical className="h-3.5 w-3.5 text-primary" />
            <span><span className="font-medium">Botella</span> (capacity_ml &gt; 0): cantidad en <span className="font-medium">botellas</span> · costo por <span className="font-medium">botella</span></span>
          </div>
          <div className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-border bg-muted/40">
            <PackageOpen className="h-3.5 w-3.5 text-muted-foreground" />
            <span><span className="font-medium">Unitario</span>: cantidad en <span className="font-medium">unidades</span> · costo por <span className="font-medium">unidad</span></span>
          </div>
        </div>

        {/* ── Info banner ── */}
        <div className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/30 px-4 py-3">
          <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            Todo ingreso se registra en <span className="font-semibold text-foreground">Bodega Principal</span>.
            La distribución a barras se realiza desde <span className="font-semibold text-foreground">Reposición</span>.
          </p>
        </div>

        {/* ── Toolbar ── */}
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm" variant="outline" onClick={addRow}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Agregar fila
          </Button>
          <Button size="sm" variant="outline" onClick={duplicateRow}>
            <Copy className="h-3.5 w-3.5 mr-1" /> Duplicar
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={deleteSelected}
            disabled={selectedRows.size === 0}
            className={selectedRows.size > 0 ? "text-destructive border-destructive/30" : ""}
          >
            <Trash2 className="h-3.5 w-3.5 mr-1" /> Eliminar ({selectedRows.size})
          </Button>
        </div>

        {/* ── Grid ── */}
        <div ref={tableRef} className="border rounded-lg overflow-auto max-h-[60vh]">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-8 text-center">#</TableHead>
                <TableHead className="min-w-[200px]">Producto *</TableHead>
                <TableHead className="w-20 text-center">Tipo</TableHead>
                <TableHead className="w-[130px]">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-help underline decoration-dotted">Cantidad *</span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="font-semibold">Botella (capacity_ml &gt; 0)</p>
                      <p>→ Ingresar Nº de botellas completas</p>
                      <p className="font-semibold mt-1">Unitario</p>
                      <p>→ Ingresar Nº de unidades</p>
                      <p className="text-destructive mt-1">⚠ Nunca ingresar ml directamente</p>
                    </TooltipContent>
                  </Tooltip>
                </TableHead>
                <TableHead className="w-[140px]">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-help underline decoration-dotted">Costo neto *</span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="font-semibold">Botella → costo por botella completa</p>
                      <p className="text-muted-foreground">El costo/ml se calcula automáticamente</p>
                      <p className="font-semibold mt-1">Unitario → costo por unidad</p>
                      <p className="text-muted-foreground">Usado para CPP (promedio ponderado)</p>
                    </TooltipContent>
                  </Tooltip>
                </TableHead>
                <TableHead className="min-w-[160px]">Cat. Impuesto *</TableHead>
                <TableHead className="w-[80px] text-right">IVA unit.</TableHead>
                <TableHead className="w-[80px] text-right">Imp. Esp.</TableHead>
                <TableHead className="w-[90px]">Otros imp.</TableHead>
                <TableHead className="w-[130px] text-right">Detalle</TableHead>
                <TableHead className="w-[110px] text-right">Costo neto total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {computedRows.map((row) => {
                const product = products.find(p => p.id === row.product_id);
                const bottle = isBottle(product);
                const capacityMl = product?.capacity_ml ?? 0;
                const qtyInput = parseFloat(row.quantity) || 0;
                const netInput = parseFloat(row.net_unit_cost) || 0;

                return (
                  <TableRow
                    key={row.id}
                    className={selectedRows.has(row.id) ? "bg-primary/5" : ""}
                  >
                    <TableCell className="text-center">
                      <input
                        type="checkbox"
                        checked={selectedRows.has(row.id)}
                        onChange={() => toggleRowSelection(row.id)}
                        className="h-3.5 w-3.5"
                      />
                    </TableCell>

                    {/* Product — select only from existing catalog */}
                    <TableCell className="p-1">
                      <select
                        value={row.product_id}
                        onChange={(e) => handleProductChange(row.id, e.target.value)}
                        className={`w-full h-8 text-xs rounded-md border px-2 bg-background ${
                          hasErrors(row, "product_id") ? "border-destructive" : "border-input"
                        }`}
                      >
                        <option value="">— Seleccionar producto existente —</option>
                        {sortedProducts.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.code}){p.capacity_ml ? ` · ${p.capacity_ml}ml/bot.` : ""}
                          </option>
                        ))}
                      </select>
                    </TableCell>

                    {/* Type badge */}
                    <TableCell className="text-center p-1">
                      {product ? (
                        bottle ? (
                          <Badge variant="secondary" className="text-[10px] gap-1">
                            <FlaskConical className="h-2.5 w-2.5" />
                            botella
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px]">unitario</Badge>
                        )
                      ) : <span className="text-muted-foreground text-xs">—</span>}
                    </TableCell>

                    {/* Quantity */}
                    <TableCell className="p-1">
                      <div className="space-y-0.5">
                        <div className="relative">
                          <Input
                            type="number"
                            min="1"
                            step="1"
                            value={row.quantity}
                            onChange={(e) => updateRow(row.id, "quantity", e.target.value)}
                            placeholder={bottle ? "# botellas" : "# unidades"}
                            className={`h-8 text-xs pr-10 ${hasErrors(row, "quantity") ? "border-destructive" : ""}`}
                          />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-muted-foreground pointer-events-none font-medium">
                            {bottle ? "bot." : product ? "ud" : ""}
                          </span>
                        </div>
                        {/* Helper: botellas → ml conversion */}
                        {bottle && capacityMl > 0 && (
                          <p className="text-[9px] px-0.5">
                            {qtyInput > 0 ? (
                              <span className="font-medium text-primary">
                                {qtyInput} × {capacityMl}ml = {(qtyInput * capacityMl).toLocaleString()} ml
                              </span>
                            ) : (
                              <span className="text-muted-foreground">1 bot. = {capacityMl} ml</span>
                            )}
                          </p>
                        )}
                      </div>
                    </TableCell>

                    {/* Net unit cost */}
                    <TableCell className="p-1">
                      <div className="space-y-0.5">
                        <div className="relative">
                          <Input
                            type="number"
                            min="1"
                            step="1"
                            value={row.net_unit_cost}
                            onChange={(e) => updateRow(row.id, "net_unit_cost", e.target.value)}
                            placeholder={bottle ? "$/botella" : "$/ud"}
                            className={`h-8 text-xs ${hasErrors(row, "net_unit_cost") ? "border-destructive" : ""}`}
                          />
                        </div>
                        {/* Helper: per-bottle → per-ml conversion */}
                        {bottle && capacityMl > 0 && netInput > 0 ? (
                          <p className="text-[9px] px-0.5">
                            <span className="text-muted-foreground">≈ </span>
                            <span className="font-medium text-primary">{formatCLP(Math.round(netInput / capacityMl))}/ml</span>
                          </p>
                        ) : !bottle && product && (
                          <p className="text-[9px] text-muted-foreground px-0.5">por unidad</p>
                        )}
                      </div>
                    </TableCell>

                    {/* Tax category */}
                    <TableCell className="p-1">
                      <select
                        value={row.tax_category_id}
                        onChange={(e) => updateRow(row.id, "tax_category_id", e.target.value)}
                        className={`w-full h-8 text-xs rounded-md border px-2 bg-background ${
                          hasErrors(row, "tax_category_id") ? "border-destructive" : "border-input"
                        }`}
                      >
                        <option value="">Seleccionar...</option>
                        {taxCategories.map((tc) => (
                          <option key={tc.id} value={tc.id}>
                            {tc.name}
                          </option>
                        ))}
                      </select>
                    </TableCell>

                    {/* IVA unit (readonly) */}
                    <TableCell className="text-right text-xs text-muted-foreground p-1">
                      {formatCLP(row.iva_unit)}
                      {bottle && <div className="text-[9px] text-muted-foreground/70">/botella</div>}
                    </TableCell>

                    {/* Specific tax (readonly) */}
                    <TableCell className="text-right text-xs text-muted-foreground p-1">
                      {formatCLP(row.specific_tax_unit)}
                      {bottle && <div className="text-[9px] text-muted-foreground/70">/botella</div>}
                    </TableCell>

                    {/* Other taxes */}
                    <TableCell className="p-1">
                      <Input
                        type="number"
                        min="0"
                        step="1"
                        value={row.other_tax_unit}
                        onChange={(e) => updateRow(row.id, "other_tax_unit", e.target.value)}
                        onKeyDown={(e) => handleKeyDown(e, row.id, true)}
                        className="h-8 text-xs"
                      />
                    </TableCell>

                    {/* Detail column: bottles → show qty_ml; units → show qty */}
                    <TableCell className="text-right p-1">
                      {product && qtyInput > 0 && netInput > 0 ? (
                        bottle ? (
                          <div className="space-y-0.5">
                            <div className="text-[10px] text-muted-foreground">
                              {(qtyInput * capacityMl).toLocaleString()} ml total
                            </div>
                            <div className="text-[10px] font-medium text-primary">
                              {formatCLP(row.cost_per_ml)}/ml
                            </div>
                          </div>
                        ) : (
                          <div className="text-[10px] text-muted-foreground">
                            {qtyInput} {product.unit || "ud"}
                          </div>
                        )
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>

                    {/* Total net cost */}
                    <TableCell className="text-right text-xs font-bold p-1">
                      {qtyInput > 0 && netInput > 0
                        ? formatCLP(row.total_line)
                        : "—"
                      }
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {/* ── Summary footer ── */}
        <div className="border rounded-lg p-4 bg-muted/30">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Total Neto</p>
              <p className="text-sm font-semibold">{formatCLP(summary.net)}</p>
              <p className="text-[9px] text-muted-foreground">→ Inventario</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">IVA Crédito Fiscal</p>
              <p className="text-sm font-semibold text-chart-2">{formatCLP(summary.vat)}</p>
              <p className="text-[9px] text-muted-foreground">→ IVA Crédito</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Imp. Específico</p>
              <p className="text-sm font-semibold text-chart-4">{formatCLP(summary.specificTax)}</p>
              <p className="text-[9px] text-muted-foreground">→ Gasto tributario</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Total General</p>
              <p className="text-lg font-bold text-primary">{formatCLP(summary.total)}</p>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground text-center mt-2 italic">
            Neto → Inventario · IVA → Crédito Fiscal · Imp. Específico → Gasto tributario separado en EERR
          </p>
        </div>

        {/* ── Actions ── */}
        <div className="flex justify-between items-center">
          <p className="text-xs text-muted-foreground">
            {computedRows.length} línea(s) · Enter en última columna agrega fila
          </p>
          <Button onClick={handleSubmit} disabled={submitting} className="min-w-[200px]">
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Check className="h-4 w-4 mr-2" />
            )}
            Confirmar ingreso masivo
          </Button>
        </div>
      </CardContent>
    </Card>
    </TooltipProvider>
  );
}
