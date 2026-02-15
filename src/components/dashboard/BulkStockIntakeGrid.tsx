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
import {
  Plus,
  Copy,
  Trash2,
  Loader2,
  Check,
  Warehouse,
  Info,
  AlertCircle,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────

interface Product {
  id: string;
  name: string;
  code: string;
  category: string;
  unit: string;
}

interface TaxCategory {
  id: string;
  name: string;
  rate_pct: number;
}

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
  errors: {},
});

function computeRow(row: IntakeRow, taxCategories: TaxCategory[]): IntakeRow {
  const net = parseFloat(row.net_unit_cost) || 0;
  const qty = parseFloat(row.quantity) || 0;
  const other = parseFloat(row.other_tax_unit) || 0;

  const iva_unit = Math.round(net * VAT_PCT / 100);

  const taxCat = taxCategories.find((t) => t.id === row.tax_category_id);
  const specific_tax_unit = taxCat ? Math.round(net * taxCat.rate_pct / 100) : 0;

  const total_unit = net + iva_unit + specific_tax_unit + other;
  const total_line = total_unit * qty;

  const errors: Record<string, boolean> = {};
  if (!row.product_id) errors.product_id = true;
  if (!row.quantity || qty <= 0) errors.quantity = true;
  if (!row.net_unit_cost || net <= 0) errors.net_unit_cost = true;
  if (!row.tax_category_id) errors.tax_category_id = true;

  return { ...row, iva_unit, specific_tax_unit, total_unit, total_line, errors };
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
    () => rows.map((r) => computeRow(r, taxCategories)),
    [rows, taxCategories]
  );

  const summary = useMemo(() => {
    const s = { net: 0, vat: 0, specificTax: 0, otherTax: 0, total: 0 };
    computedRows.forEach((r) => {
      const qty = parseFloat(r.quantity) || 0;
      const net = parseFloat(r.net_unit_cost) || 0;
      s.net += net * qty;
      s.vat += r.iva_unit * qty;
      s.specificTax += r.specific_tax_unit * qty;
      s.otherTax += (parseFloat(r.other_tax_unit) || 0) * qty;
      s.total += r.total_line;
    });
    return s;
  }, [computedRows]);

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
      const items = computedRows.map((r) => ({
        batch_id: batch.id,
        product_id: r.product_id,
        location_id: warehouseId,
        quantity: parseFloat(r.quantity),
        net_unit_cost: parseFloat(r.net_unit_cost),
        vat_unit: r.iva_unit,
        specific_tax_unit: r.specific_tax_unit,
        other_tax_unit: parseFloat(r.other_tax_unit) || 0,
        total_unit: r.total_unit,
        total_line: r.total_line,
        tax_category_id: r.tax_category_id,
        venue_id: venueId,
      }));

      const { error: itemsErr } = await supabase
        .from("stock_intake_items")
        .insert(items);
      if (itemsErr) throw itemsErr;

      // Create stock movements and update balances — all to warehouseId
      for (const r of computedRows) {
        const qty = parseFloat(r.quantity);
        const net = parseFloat(r.net_unit_cost);

        await supabase.from("stock_movements").insert({
          product_id: r.product_id,
          quantity: qty,
          movement_type: "entrada",
          to_location_id: warehouseId,
          unit_cost: net,
          vat_amount: r.iva_unit * qty,
          specific_tax_amount: r.specific_tax_unit * qty,
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

        // Update product current_stock
        const { data: product } = await supabase
          .from("products")
          .select("current_stock, cost_per_unit")
          .eq("id", r.product_id)
          .single();

        if (product) {
          const updates: { current_stock: number; cost_per_unit?: number } = {
            current_stock: (product.current_stock || 0) + qty,
          };
          if (net > 0 && (!product.cost_per_unit || product.cost_per_unit === 0)) {
            updates.cost_per_unit = net;
          }
          await supabase.from("products").update(updates).eq("id", r.product_id);
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
    <Card className="glass-effect border-primary/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Warehouse className="h-5 w-5 text-primary" />
          Ingreso manual masivo
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          IVA (19%) e impuesto específico se calculan automáticamente según categoría.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* ── Info banner ── */}
        <div className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/30 px-4 py-3">
          <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            Todo ingreso se registra en <span className="font-semibold text-foreground">Bodega Principal</span>.
            La distribución a barras se realiza desde el módulo <span className="font-semibold text-foreground">Reposición</span>.
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

        {/* ── Grid (no location column) ── */}
        <div ref={tableRef} className="border rounded-lg overflow-auto max-h-[60vh]">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-8 text-center">#</TableHead>
                <TableHead className="min-w-[200px]">Producto *</TableHead>
                <TableHead className="w-[90px]">Cantidad *</TableHead>
                <TableHead className="w-[110px]">Neto unit. *</TableHead>
                <TableHead className="min-w-[180px]">Cat. Impuesto *</TableHead>
                <TableHead className="w-[80px] text-right">IVA unit.</TableHead>
                <TableHead className="w-[80px] text-right">Imp. Esp.</TableHead>
                <TableHead className="w-[90px]">Otros imp.</TableHead>
                <TableHead className="w-[100px] text-right">Total unit.</TableHead>
                <TableHead className="w-[110px] text-right">Total línea</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {computedRows.map((row) => (
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
                      onChange={(e) => updateRow(row.id, "product_id", e.target.value)}
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

                  {/* Quantity */}
                  <TableCell className="p-1">
                    <Input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={row.quantity}
                      onChange={(e) => updateRow(row.id, "quantity", e.target.value)}
                      className={`h-8 text-xs ${hasErrors(row, "quantity") ? "border-destructive" : ""}`}
                    />
                  </TableCell>

                  {/* Net unit cost */}
                  <TableCell className="p-1">
                    <Input
                      type="number"
                      min="1"
                      step="1"
                      value={row.net_unit_cost}
                      onChange={(e) => updateRow(row.id, "net_unit_cost", e.target.value)}
                      placeholder="$0"
                      className={`h-8 text-xs ${hasErrors(row, "net_unit_cost") ? "border-destructive" : ""}`}
                    />
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
                  </TableCell>

                  {/* Specific tax (readonly) */}
                  <TableCell className="text-right text-xs text-muted-foreground p-1">
                    {formatCLP(row.specific_tax_unit)}
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

                  {/* Total unit (readonly) */}
                  <TableCell className="text-right text-xs font-medium p-1">
                    {formatCLP(row.total_unit)}
                  </TableCell>

                  {/* Total line (readonly) */}
                  <TableCell className="text-right text-xs font-bold p-1">
                    {formatCLP(row.total_line)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* ── Summary footer ── */}
        <div className="border rounded-lg p-4 bg-muted/30">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Total Neto</p>
              <p className="text-sm font-semibold">{formatCLP(summary.net)}</p>
              <p className="text-[9px] text-muted-foreground">→ Inventario</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">IVA Crédito Fiscal</p>
              <p className="text-sm font-semibold text-blue-600">{formatCLP(summary.vat)}</p>
              <p className="text-[9px] text-muted-foreground">→ IVA Crédito</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Imp. Específico</p>
              <p className="text-sm font-semibold text-amber-600">{formatCLP(summary.specificTax)}</p>
              <p className="text-[9px] text-muted-foreground">→ Gasto tributario</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Otros Impuestos</p>
              <p className="text-sm font-semibold">{formatCLP(summary.otherTax)}</p>
              <p className="text-[9px] text-muted-foreground">→ Cuenta separada</p>
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
  );
}
