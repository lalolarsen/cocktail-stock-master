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
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

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

interface IntakeRow {
  id: string;
  product_id: string;
  quantity: string;          // For ml products: quantity in ml. For unit products: units.
  net_unit_cost: string;     // For ml products: costo neto por BOTELLA. For unit: costo por unidad.
  tax_category_id: string;
  other_tax_unit: string;
  notes: string;
  // computed
  iva_unit: number;          // IVA per bottle (ml) or per unit (ud)
  specific_tax_unit: number;
  total_unit: number;        // total acquisition cost per bottle or unit
  total_line: number;        // total_unit * qty (or bottles_equiv for ml)
  bottles_equiv: number;     // only for ml products
  cost_per_ml: number;       // only for ml products
  // validation
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
  bottles_equiv: 0,
  cost_per_ml: 0,
  errors: {},
});

// Source of truth: capacity_ml (not unit string). See src/lib/product-type.ts
function isVolumetric(product: Product | undefined): boolean {
  if (!product) return false;
  return typeof product.capacity_ml === "number" && product.capacity_ml > 0;
}

function computeRow(row: IntakeRow, taxCategories: TaxCategory[], products: Product[]): IntakeRow {
  const product = products.find(p => p.id === row.product_id);
  const volumetric = isVolumetric(product);
  const capacityMl = product?.capacity_ml || 0;

  const net = parseFloat(row.net_unit_cost) || 0;  // always "per bottle" for ml, "per unit" for ud
  const qty = parseFloat(row.quantity) || 0;        // ml for volumetric, units for ud
  const other = parseFloat(row.other_tax_unit) || 0;

  const iva_unit = Math.round(net * VAT_PCT / 100);

  const taxCat = taxCategories.find((t) => t.id === row.tax_category_id);
  const specific_tax_unit = taxCat ? Math.round(net * taxCat.rate_pct / 100) : 0;

  const total_unit = net + iva_unit + specific_tax_unit + other;  // per bottle or unit

  let total_line = 0;
  let bottles_equiv = 0;
  let cost_per_ml = 0;

  if (volumetric && capacityMl > 0) {
    bottles_equiv = qty / capacityMl;
    cost_per_ml = net / capacityMl;
    total_line = bottles_equiv * net;  // only net cost for inventory valuation
  } else {
    total_line = total_unit * qty;
  }

  const errors: Record<string, boolean> = {};
  if (!row.product_id) errors.product_id = true;
  if (!row.quantity || qty <= 0) errors.quantity = true;
  if (!row.net_unit_cost || net <= 0) errors.net_unit_cost = true;
  if (!row.tax_category_id) errors.tax_category_id = true;

  return { ...row, iva_unit, specific_tax_unit, total_unit, total_line, bottles_equiv, cost_per_ml, errors };
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

  // Fetch tax categories
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
      const product = products.find(p => p.id === r.product_id);
      const vol = isVolumetric(product);
      const qty = parseFloat(r.quantity) || 0;
      const net = parseFloat(r.net_unit_cost) || 0;
      const capacityMl = product?.capacity_ml || 1;

      if (vol && capacityMl > 0) {
        const bottles = qty / capacityMl;
        s.net += net * bottles;
        s.vat += r.iva_unit * bottles;
        s.specificTax += r.specific_tax_unit * bottles;
        s.otherTax += (parseFloat(r.other_tax_unit) || 0) * bottles;
        s.total += r.total_unit * bottles;
      } else {
        s.net += net * qty;
        s.vat += r.iva_unit * qty;
        s.specificTax += r.specific_tax_unit * qty;
        s.otherTax += (parseFloat(r.other_tax_unit) || 0) * qty;
        s.total += r.total_line;
      }
    });
    return s;
  }, [computedRows, products]);

  // Auto-fill cost from product's current cost_per_unit when product changes
  const handleProductChange = useCallback((rowId: string, productId: string) => {
    const product = products.find(p => p.id === productId);
    setRows(prev => prev.map(r => {
      if (r.id !== rowId) return r;
      const defaultCost = product?.cost_per_unit && product.cost_per_unit > 0
        ? String(Math.round(product.cost_per_unit))
        : "";
      return { ...r, product_id: productId, net_unit_cost: defaultCost };
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
      const newRows = source.map((r) => ({ ...r, id: crypto.randomUUID() }));
      return [...prev, ...newRows];
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

      // Create batch — all items go to warehouseId
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

      // Insert items — location_id always = warehouseId
      const items = computedRows.map((r) => {
        const product = products.find(p => p.id === r.product_id);
        const vol = isVolumetric(product);
        const capacityMl = product?.capacity_ml || 1;
        const qty = parseFloat(r.quantity);
        const net = parseFloat(r.net_unit_cost);
        // For volumetric: net_unit_cost is per-bottle, so per-item for DB is per-bottle
        // The quantity in ml is stored as-is
        return {
          batch_id: batch.id,
          product_id: r.product_id,
          location_id: warehouseId,
          quantity: qty,
          net_unit_cost: vol && capacityMl > 0 ? net / capacityMl : net, // store per-ml for volumetric
          vat_unit: vol && capacityMl > 0 ? r.iva_unit / capacityMl : r.iva_unit,
          specific_tax_unit: vol && capacityMl > 0 ? r.specific_tax_unit / capacityMl : r.specific_tax_unit,
          other_tax_unit: (parseFloat(r.other_tax_unit) || 0),
          total_unit: vol && capacityMl > 0 ? r.total_unit / capacityMl : r.total_unit,
          total_line: r.total_line,
          tax_category_id: r.tax_category_id,
          venue_id: venueId,
        };
      });

      const { error: itemsErr } = await supabase
        .from("stock_intake_items")
        .insert(items);
      if (itemsErr) throw itemsErr;

      // Create stock movements and update balances — all to warehouseId
      for (const r of computedRows) {
        const product = products.find(p => p.id === r.product_id);
        const vol = isVolumetric(product);
        const capacityMl = product?.capacity_ml || 1;
        const qty = parseFloat(r.quantity);  // ml for volumetric, units for ud
        const net = parseFloat(r.net_unit_cost);  // per bottle or per unit

        // For stock movements, unit_cost should always be per-unit-of-measure
        // For ml: per ml. For ud: per unit.
        const unitCostForMovement = vol && capacityMl > 0 ? net / capacityMl : net;
        const bottlesEquiv = vol && capacityMl > 0 ? qty / capacityMl : qty;
        const totalNetCost = vol && capacityMl > 0 ? bottlesEquiv * net : net * qty;

        await supabase.from("stock_movements").insert({
          product_id: r.product_id,
          quantity: qty,
          movement_type: "entrada",
          to_location_id: warehouseId,
          unit_cost: unitCostForMovement,
          // unit_cost_snapshot for traceability (per ml or per unit)
          unit_cost_snapshot: unitCostForMovement,
          vat_amount: vol && capacityMl > 0 ? (r.iva_unit / capacityMl) * qty : r.iva_unit * qty,
          specific_tax_amount: vol && capacityMl > 0 ? (r.specific_tax_unit / capacityMl) * qty : r.specific_tax_unit * qty,
          source_type: "manual_batch",
          notes: r.notes || "Ingreso masivo a Bodega Principal",
          venue_id: venueId,
        });

        // Update stock balance in warehouse
        const { data: existing } = await supabase
          .from("stock_balances")
          .select("quantity")
          .eq("location_id", warehouseId)
          .eq("product_id", r.product_id)
          .single();

        if (existing) {
          await supabase
            .from("stock_balances")
            .update({ quantity: existing.quantity + qty, updated_at: new Date().toISOString() })
            .eq("location_id", warehouseId)
            .eq("product_id", r.product_id);
        } else {
          await supabase.from("stock_balances").insert({
            location_id: warehouseId,
            product_id: r.product_id,
            quantity: qty,
            venue_id: venueId,
          });
        }

        // Update product current_stock + CPP via centralized calculateCPP utility
        const { data: productData } = await supabase
          .from("products")
          .select("current_stock, cost_per_unit, capacity_ml")
          .eq("id", r.product_id)
          .single();

        if (productData) {
          const currentStock = productData.current_stock || 0;
          const newCostPerUnit = calculateCPP({
            product: productData,
            currentStock,
            oldCostPerUnit: productData.cost_per_unit || 0,
            addedQty: qty,
            newCostPerUnit: net,
          });

          await supabase.from("products").update({
            current_stock: currentStock + qty,
            cost_per_unit: Math.round(newCostPerUnit),
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
          IVA (19%) e impuesto específico se calculan automáticamente según categoría.
          Para botellas: ingrese cantidad en ml y costo por botella.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* ── Info banner ── */}
        <div className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/30 px-4 py-3">
          <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            Todo ingreso se registra en <span className="font-semibold text-foreground">Bodega Principal</span>.
            La distribución a barras se realiza desde el módulo <span className="font-semibold text-foreground">Reposición</span>.
            Para productos en <span className="font-semibold text-foreground">ml (botellas)</span>: el campo "Neto unit." corresponde al <span className="font-semibold text-foreground">costo neto por botella completa</span>.
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
                <TableHead className="min-w-[180px]">Producto *</TableHead>
                <TableHead className="w-16 text-center">Tipo</TableHead>
                <TableHead className="w-[100px]">Cantidad *</TableHead>
                <TableHead className="w-[110px]">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-help underline decoration-dotted">Neto unit. *</span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Para botellas (ml): costo neto por botella completa.</p>
                      <p>Para unitarios (ud): costo neto por unidad.</p>
                    </TooltipContent>
                  </Tooltip>
                </TableHead>
                <TableHead className="min-w-[160px]">Cat. Impuesto *</TableHead>
                <TableHead className="w-[80px] text-right">IVA unit.</TableHead>
                <TableHead className="w-[80px] text-right">Imp. Esp.</TableHead>
                <TableHead className="w-[90px]">Otros imp.</TableHead>
                <TableHead className="w-[120px] text-right">Info botella</TableHead>
                <TableHead className="w-[110px] text-right">Costo total neto</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {computedRows.map((row) => {
                const product = products.find(p => p.id === row.product_id);
                const vol = isVolumetric(product);
                const capacityMl = product?.capacity_ml || 0;

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

                    {/* Product */}
                    <TableCell className="p-1">
                      <select
                        value={row.product_id}
                        onChange={(e) => handleProductChange(row.id, e.target.value)}
                        className={`w-full h-8 text-xs rounded-md border px-2 bg-background ${
                          hasErrors(row, "product_id") ? "border-destructive" : "border-input"
                        }`}
                      >
                        <option value="">Seleccionar...</option>
                        {sortedProducts.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.code})
                          </option>
                        ))}
                      </select>
                    </TableCell>

                    {/* Type badge */}
                    <TableCell className="text-center p-1">
                      {product ? (
                        vol
                          ? <Badge variant="secondary" className="text-[10px] gap-1"><FlaskConical className="h-2.5 w-2.5" />ml</Badge>
                          : <Badge variant="outline" className="text-[10px]">ud</Badge>
                      ) : <span className="text-muted-foreground text-xs">—</span>}
                    </TableCell>

                    {/* Quantity */}
                    <TableCell className="p-1">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="relative">
                            <Input
                              type="number"
                              min="0.01"
                              step={vol ? "1" : "0.01"}
                              value={row.quantity}
                              onChange={(e) => updateRow(row.id, "quantity", e.target.value)}
                              className={`h-8 text-xs pr-7 ${hasErrors(row, "quantity") ? "border-destructive" : ""}`}
                            />
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-muted-foreground pointer-events-none">
                              {product ? (vol ? "ml" : "ud") : ""}
                            </span>
                          </div>
                        </TooltipTrigger>
                        {vol && capacityMl > 0 && (
                          <TooltipContent>
                            <p>Cap. botella: {capacityMl} ml</p>
                            {parseFloat(row.quantity) > 0 && (
                              <p>≈ {(parseFloat(row.quantity) / capacityMl).toFixed(2)} botellas</p>
                            )}
                          </TooltipContent>
                        )}
                      </Tooltip>
                    </TableCell>

                    {/* Net unit cost */}
                    <TableCell className="p-1">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="relative">
                            <Input
                              type="number"
                              min="1"
                              step="1"
                              value={row.net_unit_cost}
                              onChange={(e) => updateRow(row.id, "net_unit_cost", e.target.value)}
                              placeholder={vol ? "$/botella" : "$/ud"}
                              className={`h-8 text-xs ${hasErrors(row, "net_unit_cost") ? "border-destructive" : ""}`}
                            />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          {vol
                            ? <p>Costo neto por botella completa ({capacityMl} ml)</p>
                            : <p>Costo neto por unidad</p>
                          }
                        </TooltipContent>
                      </Tooltip>
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
                      {vol && <div className="text-[9px] text-muted-foreground/70">/botella</div>}
                    </TableCell>

                    {/* Specific tax (readonly) */}
                    <TableCell className="text-right text-xs text-muted-foreground p-1">
                      {formatCLP(row.specific_tax_unit)}
                      {vol && <div className="text-[9px] text-muted-foreground/70">/botella</div>}
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

                    {/* Bottle info (volumetric only) */}
                    <TableCell className="text-right p-1">
                      {vol && capacityMl > 0 && parseFloat(row.quantity) > 0 && parseFloat(row.net_unit_cost) > 0 ? (
                        <div className="space-y-0.5">
                          <div className="text-[10px] text-muted-foreground">
                            {row.bottles_equiv.toFixed(2)} bot.
                          </div>
                          <div className="text-[10px] font-medium text-primary">
                            {formatCLP(row.cost_per_ml)}/ml
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>

                    {/* Total net cost */}
                    <TableCell className="text-right text-xs font-bold p-1">
                      {parseFloat(row.quantity) > 0 && parseFloat(row.net_unit_cost) > 0
                        ? formatCLP(vol ? row.bottles_equiv * parseFloat(row.net_unit_cost) : parseFloat(row.net_unit_cost) * parseFloat(row.quantity))
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
