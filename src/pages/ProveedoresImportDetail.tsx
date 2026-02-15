import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useActiveVenue } from "@/hooks/useActiveVenue";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { formatCLP } from "@/lib/currency";
import { ArrowLeft, Loader2, CheckCircle2, AlertTriangle, Plus, Trash2, RefreshCw } from "lucide-react";
import ProductPicker from "@/components/purchase/ProductPicker";

interface ImportLine {
  id: string;
  line_index: number;
  raw_text: string;
  qty_invoiced: number;
  unit_price_net: number | null;
  line_total_net: number | null;
  discount_pct: number | null;
  detected_multiplier: number;
  units_real: number;
  cost_unit_net: number;
  product_id: string | null;
  classification: string;
  tax_category_id: string | null;
  status: string;
  notes: string | null;
}

interface Product {
  id: string;
  name: string;
  code: string;
  category: string;
}

export default function ProveedoresImportDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { venue } = useActiveVenue();

  const [imp, setImp] = useState<any>(null);
  const [lines, setLines] = useState<ImportLine[]>([]);
  const [taxes, setTaxes] = useState<any[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [taxCategories, setTaxCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(1); // 1=Summary, 2=Lines, 3=Confirm
  const [confirming, setConfirming] = useState(false);
  const [checks, setChecks] = useState({ reviewed: false, understood: false });
  const [filterReview, setFilterReview] = useState(false);

  const fetchAll = useCallback(async () => {
    if (!id) return;
    setLoading(true);

    const [impRes, linesRes, taxesRes, prodsRes, taxCatRes] = await Promise.all([
      supabase.from("purchase_imports" as any).select("*").eq("id", id).single(),
      supabase.from("purchase_import_lines" as any).select("*").eq("purchase_import_id", id).order("line_index"),
      supabase.from("purchase_import_taxes" as any).select("*").eq("purchase_import_id", id),
      supabase.from("products").select("id, name, code, category").eq("venue_id", venue?.id || "").eq("is_active_in_sales", true).order("name"),
      supabase.from("specific_tax_categories" as any).select("*").eq("is_active", true),
    ]);

    if (impRes.data) setImp(impRes.data);
    if (linesRes.data) setLines(linesRes.data as any[]);
    if (taxesRes.data) setTaxes(taxesRes.data as any[]);
    if (prodsRes.data) setProducts(prodsRes.data as Product[]);
    if (taxCatRes.data) setTaxCategories(taxCatRes.data as any[]);
    setLoading(false);
  }, [id, venue?.id]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Line editing
  const updateLine = async (lineId: string, updates: Partial<ImportLine>) => {
    const line = lines.find(l => l.id === lineId);
    if (!line) return;

    const merged = { ...line, ...updates };
    // Recalculate derived fields
    if (updates.detected_multiplier !== undefined || updates.qty_invoiced !== undefined) {
      merged.units_real = (merged.qty_invoiced || 0) * (merged.detected_multiplier || 1);
    }
    if (updates.detected_multiplier !== undefined || updates.line_total_net !== undefined || updates.unit_price_net !== undefined || updates.discount_pct !== undefined || updates.qty_invoiced !== undefined) {
      let packNet = merged.line_total_net ? merged.line_total_net / (merged.qty_invoiced || 1) : (merged.unit_price_net || 0);
      if (merged.discount_pct && merged.discount_pct > 0) packNet *= (1 - merged.discount_pct / 100);
      merged.cost_unit_net = merged.detected_multiplier > 0 ? Math.round((packNet / merged.detected_multiplier) * 100) / 100 : 0;
    }

    // Auto status
    if (merged.classification === "freight") {
      merged.status = "OK";
      merged.product_id = null;
    } else if (merged.product_id && merged.units_real > 0 && merged.cost_unit_net > 0) {
      // Keep as REVIEW unless explicitly marked OK
    }

    setLines(prev => prev.map(l => l.id === lineId ? merged : l));

    await supabase.from("purchase_import_lines" as any).update({
      product_id: merged.product_id,
      detected_multiplier: merged.detected_multiplier,
      units_real: merged.units_real,
      cost_unit_net: merged.cost_unit_net,
      classification: merged.classification,
      status: merged.status,
      notes: merged.notes,
      qty_invoiced: merged.qty_invoiced,
      unit_price_net: merged.unit_price_net,
      line_total_net: merged.line_total_net,
      discount_pct: merged.discount_pct,
      tax_category_id: merged.tax_category_id,
    }).eq("id", lineId);
  };

  const markLineOK = async (lineId: string) => {
    const line = lines.find(l => l.id === lineId);
    if (!line) return;
    if (line.classification === "inventory" && !line.product_id) {
      toast.error("Asigna un producto primero"); return;
    }
    if (line.units_real <= 0) { toast.error("Unidades reales debe ser > 0"); return; }
    if (line.classification === "inventory" && line.cost_unit_net <= 0) { toast.error("Costo neto debe ser > 0"); return; }
    await updateLine(lineId, { status: "OK" });
    toast.success("Línea marcada OK");
  };

  const addLine = async () => {
    if (!id) return;
    const newLine = {
      purchase_import_id: id,
      line_index: lines.length,
      raw_text: "",
      qty_invoiced: 1,
      detected_multiplier: 1,
      units_real: 1,
      cost_unit_net: 0,
      classification: "inventory",
      status: "REVIEW",
    };
    const { data, error } = await supabase.from("purchase_import_lines" as any).insert(newLine).select("*").single();
    if (data) setLines(prev => [...prev, data as any]);
  };

  const deleteLine = async (lineId: string) => {
    await supabase.from("purchase_import_lines" as any).delete().eq("id", lineId);
    setLines(prev => prev.filter(l => l.id !== lineId));
  };

  // Validation
  const inventoryLines = lines.filter(l => l.classification === "inventory");
  const reviewLines = lines.filter(l => l.status === "REVIEW");
  const canConfirm = reviewLines.length === 0 && inventoryLines.length > 0 && inventoryLines.every(l => l.product_id && l.units_real > 0 && l.cost_unit_net > 0 && l.tax_category_id);

  // Confirm
  const handleConfirm = async () => {
    if (!imp || !id || !venue?.id) return;
    setConfirming(true);

    try {
      const userId = (await supabase.auth.getUser()).data.user?.id;

      // Create purchases record
      const { data: purchase, error: purErr } = await supabase.from("purchases" as any).insert({
        purchase_import_id: id,
        venue_id: venue.id,
        location_id: imp.location_id,
        supplier_name: imp.supplier_name,
        supplier_rut: imp.supplier_rut,
        document_number: imp.document_number,
        document_date: imp.document_date,
        net_subtotal: imp.net_subtotal,
        vat_credit: imp.vat_amount,
        total_amount: imp.total_amount,
        confirmed_by: userId,
        confirmed_at: new Date().toISOString(),
      }).select("id").single();

      if (purErr) throw purErr;
      const purchaseId = (purchase as any).id;

      // Create purchase_lines (inventory)
      const invLines = lines.filter(l => l.classification === "inventory" && l.product_id);
      if (invLines.length > 0) {
        await supabase.from("purchase_lines" as any).insert(
          invLines.map(l => ({
            purchase_id: purchaseId,
            product_id: l.product_id,
            units_real: l.units_real,
            cost_unit_net: l.cost_unit_net,
            line_total_net: l.units_real * l.cost_unit_net,
          }))
        );
      }

      // Create expense_lines (freight/other)
      const expLines = lines.filter(l => l.classification !== "inventory");
      if (expLines.length > 0) {
        await supabase.from("expense_lines" as any).insert(
          expLines.map(l => ({
            purchase_id: purchaseId,
            expense_type: l.classification === "freight" ? "freight" : "other",
            description: l.raw_text,
            amount_net: l.line_total_net || (l.qty_invoiced || 0) * (l.unit_price_net || 0),
          }))
        );
      }

      // Update stock for each inventory line (CPP)
      for (const line of invLines) {
        const { data: product } = await supabase.from("products").select("current_stock, cost_per_unit").eq("id", line.product_id!).single();
        if (!product) continue;

        const currentStock = product.current_stock || 0;
        const currentCost = product.cost_per_unit || 0;
        const newCPP = currentStock === 0 || currentCost === 0
          ? line.cost_unit_net
          : Math.round(((currentStock * currentCost) + (line.units_real * line.cost_unit_net)) / (currentStock + line.units_real) * 100) / 100;

        await supabase.from("products").update({
          current_stock: currentStock + line.units_real,
          cost_per_unit: newCPP,
          updated_at: new Date().toISOString(),
        }).eq("id", line.product_id!);

        // Update stock_balances
        const { data: balance } = await supabase.from("stock_balances")
          .select("id, quantity")
          .eq("product_id", line.product_id!)
          .eq("location_id", imp.location_id)
          .single();

        if (balance) {
          await supabase.from("stock_balances").update({
            quantity: (balance.quantity || 0) + line.units_real,
            updated_at: new Date().toISOString(),
          }).eq("id", balance.id);
        } else {
          await supabase.from("stock_balances").insert({
            product_id: line.product_id,
            location_id: imp.location_id,
            venue_id: venue.id,
            quantity: line.units_real,
          });
        }
      }

      // Learning: upsert product mappings
      for (const line of invLines) {
        if (!line.raw_text || !line.product_id) continue;
        const { data: existing } = await supabase
          .from("learning_product_mappings" as any)
          .select("id, times_used")
          .eq("venue_id", venue.id)
          .eq("raw_text", line.raw_text)
          .eq("product_id", line.product_id)
          .maybeSingle();

        if (existing) {
          await supabase.from("learning_product_mappings" as any).update({
            times_used: ((existing as any).times_used || 0) + 1,
            detected_multiplier: line.detected_multiplier,
            last_used_at: new Date().toISOString(),
            confidence: Math.min(0.95, 0.8 + ((existing as any).times_used || 0) * 0.02),
          }).eq("id", (existing as any).id);
        } else {
          await supabase.from("learning_product_mappings" as any).insert({
            venue_id: venue.id,
            supplier_rut: imp.supplier_rut,
            raw_text: line.raw_text,
            product_id: line.product_id,
            detected_multiplier: line.detected_multiplier,
          });
        }
      }

      // Update import status
      await supabase.from("purchase_imports" as any).update({
        status: "CONFIRMED",
        updated_at: new Date().toISOString(),
      }).eq("id", id);

      toast.success("Compra confirmada e ingresada a Bodega Principal");
      navigate("/admin");
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Error al confirmar");
    } finally {
      setConfirming(false);
    }
  };

  const handleReject = async () => {
    if (!id) return;
    await supabase.from("purchase_imports" as any).update({ status: "REJECTED", updated_at: new Date().toISOString() }).eq("id", id);
    toast.info("Importación rechazada");
    navigate("/admin");
  };

  const handleReExtract = async () => {
    if (!id) return;
    toast.info("Re-extrayendo...");
    // Delete existing lines and taxes
    await supabase.from("purchase_import_lines" as any).delete().eq("purchase_import_id", id);
    await supabase.from("purchase_import_taxes" as any).delete().eq("purchase_import_id", id);
    // Trigger extraction
    const { error } = await supabase.functions.invoke("extract-invoice", {
      body: { purchase_import_id: id },
    });
    if (error) toast.error("Error en re-extracción");
    else { toast.success("Re-extracción completada"); fetchAll(); }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  if (!imp) {
    return <div className="p-6"><p>Importación no encontrada</p></div>;
  }

  const displayedLines = filterReview ? lines.filter(l => l.status === "REVIEW") : lines;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background border-b px-6 py-3">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/admin")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-lg font-semibold">Importación: {imp.supplier_name || "Sin proveedor"}</h1>
            <p className="text-xs text-muted-foreground">Doc #{imp.document_number || "—"} · {imp.document_date || "—"}</p>
          </div>
          <Badge variant={imp.status === "CONFIRMED" ? "default" : imp.status === "REJECTED" ? "destructive" : "secondary"}>
            {imp.status}
          </Badge>
        </div>
      </header>

      {/* Step indicators */}
      <div className="px-6 py-3 border-b bg-muted/30">
        <div className="flex gap-2">
          {[{ n: 1, label: "Resumen" }, { n: 2, label: "Líneas" }, { n: 3, label: "Confirmar" }].map(s => (
            <Button
              key={s.n}
              variant={step === s.n ? "default" : "outline"}
              size="sm"
              onClick={() => setStep(s.n)}
              disabled={s.n === 3 && !canConfirm}
            >
              {s.n}. {s.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="p-6 space-y-4">
        {/* STEP 1: Summary */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Proveedor</p><p className="font-medium text-sm mt-1">{imp.supplier_name || "—"}</p></CardContent></Card>
              <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">RUT</p><p className="font-medium text-sm mt-1">{imp.supplier_rut || "—"}</p></CardContent></Card>
              <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Documento</p><p className="font-medium text-sm mt-1">{imp.document_number || "—"}</p></CardContent></Card>
              <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Fecha</p><p className="font-medium text-sm mt-1">{imp.document_date || "—"}</p></CardContent></Card>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Neto</p><p className="font-semibold mt-1">{imp.net_subtotal ? formatCLP(imp.net_subtotal) : "—"}</p></CardContent></Card>
              <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">IVA Crédito Fiscal</p><p className="font-semibold mt-1">{imp.vat_amount ? formatCLP(imp.vat_amount) : "—"}</p></CardContent></Card>
              <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Total</p><p className="font-semibold mt-1">{imp.total_amount ? formatCLP(imp.total_amount) : "—"}</p></CardContent></Card>
            </div>

            {taxes.length > 0 && (
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Impuestos detectados</CardTitle></CardHeader>
                <CardContent className="space-y-1">
                  {taxes.map((t: any) => (
                    <div key={t.id} className="flex justify-between text-sm">
                      <span>{t.tax_label}</span>
                      <span className="font-medium">{formatCLP(t.tax_amount)}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {reviewLines.length > 0 ? (
              <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                <p className="text-sm text-amber-700 dark:text-amber-400">
                  {reviewLines.length} línea(s) requieren revisión antes de confirmar.
                </p>
              </div>
            ) : lines.length > 0 ? (
              <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg p-3 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                <p className="text-sm text-green-700 dark:text-green-400">
                  Todas las líneas están listas para confirmar.
                </p>
              </div>
            ) : null}

            <div className="flex gap-2">
              <Button variant="outline" onClick={handleReExtract}><RefreshCw className="h-4 w-4 mr-1" />Re-extraer</Button>
              <Button variant="destructive" onClick={handleReject}>Rechazar</Button>
              <Button onClick={() => setStep(2)}>Revisar líneas →</Button>
            </div>
          </div>
        )}

        {/* STEP 2: Lines */}
        {step === 2 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-sm">Líneas ({lines.length})</h3>
                {reviewLines.length > 0 && (
                  <Badge variant="outline" className="text-amber-600">{reviewLines.length} en revisión</Badge>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setFilterReview(!filterReview)}>
                  {filterReview ? "Ver todas" : "Solo REVIEW"}
                </Button>
                <Button size="sm" onClick={addLine}><Plus className="h-3 w-3 mr-1" />Agregar fila</Button>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">Todo ingreso se registra en Bodega Principal. La distribución a barras se hace en Reposición.</p>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8">#</TableHead>
                    <TableHead className="min-w-[180px]">Texto original</TableHead>
                    <TableHead className="w-16">Cant.</TableHead>
                    <TableHead className="w-14">Mult.</TableHead>
                    <TableHead className="w-20">Uds. reales</TableHead>
                    <TableHead className="w-24">Costo unit. neto</TableHead>
                    <TableHead className="min-w-[160px]">Producto</TableHead>
                    <TableHead className="min-w-[140px]">Cat. tributaria</TableHead>
                    <TableHead className="w-28">Clasif.</TableHead>
                    <TableHead className="w-16">Estado</TableHead>
                    <TableHead className="w-20"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayedLines.map((line) => (
                    <TableRow key={line.id} className={line.status === "REVIEW" ? "bg-amber-50/50 dark:bg-amber-950/10" : ""}>
                      <TableCell className="text-xs text-muted-foreground">{line.line_index + 1}</TableCell>
                      <TableCell>
                        <Input
                          value={line.raw_text || ""}
                          onChange={(e) => updateLine(line.id, { raw_text: e.target.value })}
                          className="h-7 text-xs"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={line.qty_invoiced || ""}
                          onChange={(e) => updateLine(line.id, { qty_invoiced: parseFloat(e.target.value) || 0 })}
                          className="h-7 text-xs w-16"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={line.detected_multiplier}
                          onChange={(e) => updateLine(line.id, { detected_multiplier: parseInt(e.target.value) || 1 })}
                          className="h-7 text-xs w-14"
                        />
                      </TableCell>
                      <TableCell className="text-xs font-medium">{line.units_real}</TableCell>
                      <TableCell className="text-xs">{formatCLP(line.cost_unit_net)}</TableCell>
                      <TableCell>
                      {line.classification === "freight" ? (
                          <span className="text-xs text-muted-foreground italic">Flete</span>
                        ) : (
                          <ProductPicker
                            venueId={venue?.id || ""}
                            value={line.product_id}
                            displayName={products.find(p => p.id === line.product_id)?.name}
                            disabled={imp.status === "CONFIRMED"}
                            onSelect={(pid, pname) => updateLine(line.id, { product_id: pid })}
                          />
                        )}
                      </TableCell>
                      <TableCell>
                        {line.classification === "freight" ? (
                          <span className="text-xs text-muted-foreground italic">—</span>
                        ) : (
                          <Select
                            value={line.tax_category_id || "none"}
                            onValueChange={(v) => updateLine(line.id, { tax_category_id: v === "none" ? null : v })}
                          >
                            <SelectTrigger className="h-7 text-xs">
                              <SelectValue placeholder="Sin impuesto" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none" className="text-xs">Sin impuesto</SelectItem>
                              {taxCategories.map((tc: any) => (
                                <SelectItem key={tc.id} value={tc.id} className="text-xs">
                                  {tc.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={line.classification}
                          onValueChange={(v) => updateLine(line.id, { classification: v })}
                        >
                          <SelectTrigger className="h-7 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="inventory" className="text-xs">Inventario</SelectItem>
                            <SelectItem value="freight" className="text-xs">Flete</SelectItem>
                            <SelectItem value="other_expense" className="text-xs">Otro gasto</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        {line.status === "OK" ? (
                          <Badge variant="default" className="text-[10px] bg-green-600">OK</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300 cursor-pointer" onClick={() => markLineOK(line.id)}>
                            REVIEW
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {line.status === "REVIEW" && (
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => markLineOK(line.id)}>
                              <CheckCircle2 className="h-3 w-3 text-green-600" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => deleteLine(line.id)}>
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Totals */}
            <Card>
              <CardContent className="p-4">
                <div className="grid grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Líneas inventario</p>
                    <p className="font-semibold">{inventoryLines.length}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total neto</p>
                    <p className="font-semibold">{formatCLP(inventoryLines.reduce((s, l) => s + l.units_real * l.cost_unit_net, 0))}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Gastos/flete</p>
                    <p className="font-semibold">{formatCLP(lines.filter(l => l.classification !== "inventory").reduce((s, l) => s + (l.line_total_net || 0), 0))}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">En revisión</p>
                    <p className={`font-semibold ${reviewLines.length > 0 ? "text-amber-600" : "text-green-600"}`}>{reviewLines.length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(1)}>← Resumen</Button>
              <Button onClick={() => setStep(3)} disabled={!canConfirm}>
                {canConfirm ? "Continuar a confirmación →" : 
                  reviewLines.length > 0 ? `${reviewLines.length} líneas en REVIEW` :
                  inventoryLines.some(l => !l.tax_category_id) ? "Falta categoría tributaria" :
                  inventoryLines.some(l => !l.product_id) ? "Falta producto" :
                  "Complete todos los campos"
                }
              </Button>
            </div>
          </div>
        )}

        {/* STEP 3: Confirm */}
        {step === 3 && (
          <div className="space-y-4 max-w-lg mx-auto">
            <Card>
              <CardHeader><CardTitle className="text-base">Confirmación final</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Productos inventariables</span><span className="font-medium">{inventoryLines.length} líneas</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Unidades totales</span><span className="font-medium">{inventoryLines.reduce((s, l) => s + l.units_real, 0)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Neto total inventario</span><span className="font-semibold">{formatCLP(inventoryLines.reduce((s, l) => s + l.units_real * l.cost_unit_net, 0))}</span></div>
                  {imp.vat_amount && <div className="flex justify-between"><span className="text-muted-foreground">IVA Crédito Fiscal</span><span className="font-medium">{formatCLP(imp.vat_amount)}</span></div>}
                  {taxes.filter((t: any) => t.tax_type === "specific_tax").length > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Impuestos específicos</span>
                      <span className="font-medium">{formatCLP(taxes.filter((t: any) => t.tax_type === "specific_tax").reduce((s: number, t: any) => s + t.tax_amount, 0))}</span>
                    </div>
                  )}
                  {lines.filter(l => l.classification !== "inventory").length > 0 && (
                    <div className="flex justify-between"><span className="text-muted-foreground">Gastos (flete/otros)</span><span className="font-medium">{lines.filter(l => l.classification !== "inventory").length} líneas</span></div>
                  )}
                </div>

                <div className="border-t pt-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Checkbox id="c1" checked={checks.reviewed} onCheckedChange={(v) => setChecks(p => ({ ...p, reviewed: !!v }))} />
                    <label htmlFor="c1" className="text-sm">Revisé productos, cantidades y categorías tributarias</label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox id="c2" checked={checks.understood} onCheckedChange={(v) => setChecks(p => ({ ...p, understood: !!v }))} />
                    <label htmlFor="c2" className="text-sm">Entiendo que esto ingresará stock a Bodega Principal</label>
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <Button variant="outline" onClick={() => setStep(2)} className="flex-1">← Volver</Button>
                  <Button
                    onClick={handleConfirm}
                    disabled={!checks.reviewed || !checks.understood || confirming}
                    className="flex-1 bg-green-600 hover:bg-green-700"
                  >
                    {confirming ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Confirmar e ingresar
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
