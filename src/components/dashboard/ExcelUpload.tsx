import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, FileSpreadsheet, Loader2, Download, DownloadCloud } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { useActiveVenue } from "@/hooks/useActiveVenue";
import { StockImportPreviewDialog } from "./StockImportPreviewDialog";
import {
  parseCompraSimple,
  parseReposicionSimple,
  parseConteoSimple,
  parseExcelInventory,
  generateCompraTemplate,
  generateReposicionTemplate,
  generateConteoTemplateByLocation,
  generateTemplate,
  type ParseResult,
  type ProductRef,
  type LocationRef,
  type LearningMapping,
} from "@/lib/excel-inventory-parser";

interface ExcelUploadProps {
  defaultMovementType?: "COMPRA" | "TRANSFERENCIA" | "CONTEO";
  onBatchSaved?: () => void;
}

export const ExcelUpload = ({ defaultMovementType, onBatchSaved }: ExcelUploadProps) => {
  const { venue } = useActiveVenue();
  const [uploading, setUploading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [fileName, setFileName] = useState<string>("");

  // ── Load reference data ────────────────────────────────────────────────────

  const loadReferenceData = useCallback(async () => {
    if (!venue?.id) return null;

    const [productsRes, locationsRes, balancesRes, learningsRes] = await Promise.all([
      supabase.from("products").select("id, code, name, capacity_ml, cost_per_unit, current_stock").eq("venue_id", venue.id),
      supabase.from("stock_locations").select("id, name, type").eq("venue_id", venue.id),
      supabase.from("stock_balances").select("product_id, location_id, quantity").eq("venue_id", venue.id),
      supabase.from("learning_product_mappings").select("raw_text, product_id, confidence, times_used").eq("venue_id", venue.id),
    ]);

    if (productsRes.error || locationsRes.error || balancesRes.error) {
      toast.error("Error cargando datos de referencia");
      return null;
    }

    const products: ProductRef[] = (productsRes.data || []).map((p) => ({
      id: p.id, code: p.code, name: p.name,
      capacity_ml: p.capacity_ml, cost_per_unit: p.cost_per_unit || 0, current_stock: p.current_stock || 0,
    }));

    const locations: LocationRef[] = (locationsRes.data || []).map((l) => ({
      id: l.id, name: l.name, type: l.type,
    }));

    const balancesMap = new Map<string, number>();
    const balancesArray = (balancesRes.data || []).map((b) => {
      const qty = Number(b.quantity) || 0;
      balancesMap.set(`${b.product_id}::${b.location_id}`, qty);
      return { productId: b.product_id, locationId: b.location_id, quantity: qty };
    });

    const learnings: LearningMapping[] = (learningsRes.data || []).map((l) => ({
      raw_text: l.raw_text,
      product_id: l.product_id,
      confidence: l.confidence,
      times_used: l.times_used,
    }));

    return { products, locations, balancesMap, balancesArray, learnings };
  }, [venue?.id]);

  // ── Download template (specific per type) ──────────────────────────────────

  const handleDownloadTemplate = async () => {
    const ref = await loadReferenceData();
    if (!ref) return;

    let wb: XLSX.WorkBook;
    let filename: string;

    if (defaultMovementType === "COMPRA") {
      wb = generateCompraTemplate(ref.products);
      filename = `plantilla_compra_${venue?.name || "stockia"}.xlsx`;
    } else if (defaultMovementType === "TRANSFERENCIA") {
      wb = generateReposicionTemplate(ref.products, ref.locations);
      filename = `plantilla_reposicion_${venue?.name || "stockia"}.xlsx`;
    } else if (defaultMovementType === "CONTEO") {
      wb = generateConteoTemplateByLocation(ref.products, ref.locations, ref.balancesArray);
      filename = `plantilla_conteo_${venue?.name || "stockia"}.xlsx`;
    } else {
      wb = generateTemplate(ref.products, ref.locations, ref.balancesArray);
      filename = `plantilla_inventario_${venue?.name || "stockia"}.xlsx`;
    }

    XLSX.writeFile(wb, filename);
    toast.success("Plantilla descargada");
  };

  // ── Download current stock ─────────────────────────────────────────────────

  const handleDownloadStock = async () => {
    const ref = await loadReferenceData();
    if (!ref) return;
    const wb = generateTemplate(ref.products, ref.locations, ref.balancesArray);
    const stockWb = XLSX.utils.book_new();
    const stockSheet = wb.Sheets["Export_Stock_Actual"];
    if (stockSheet) XLSX.utils.book_append_sheet(stockWb, stockSheet, "Stock_Actual");
    XLSX.writeFile(stockWb, `stock_actual_${new Date().toISOString().split("T")[0]}.xlsx`);
    toast.success("Stock actual exportado");
  };

  // ── AI fallback for low-confidence matches ─────────────────────────────────

  const tryAIMatching = async (result: ParseResult, products: ProductRef[]): Promise<ParseResult> => {
    const lowConfRows = result.rows.filter(
      (r) => (r.matchConfidence === "baja" || r.matchConfidence === "sin_match") && r.producto_nombre
    );

    if (lowConfRows.length === 0) return result;

    try {
      const items = lowConfRows.map((r) => ({
        raw_name: r.producto_nombre,
        candidates: products.map((p) => ({ id: p.id, name: p.name })),
      }));

      const { data, error } = await supabase.functions.invoke("match-products", {
        body: { items },
      });

      if (error || !data?.matches) return result;

      const matchMap = new Map<string, { product_id: string; confidence: number }>();
      for (const m of data.matches) {
        if (m.product_id && m.confidence >= 0.6) {
          matchMap.set(m.raw_name.toLowerCase().trim(), m);
        }
      }

      const updatedRows = result.rows.map((row) => {
        if (row.matchConfidence !== "baja" && row.matchConfidence !== "sin_match") return row;

        const aiMatch = matchMap.get(row.producto_nombre.toLowerCase().trim());
        if (!aiMatch) return row;

        const product = products.find((p) => p.id === aiMatch.product_id);
        if (!product) return row;

        const newErrors = row.errors.filter((e) => !e.includes("no encontrado"));
        return {
          ...row,
          productId: product.id,
          productNameMatched: product.name,
          matchConfidence: (aiMatch.confidence >= 0.85 ? "alta" : aiMatch.confidence >= 0.7 ? "media" : "baja") as any,
          errors: newErrors,
          isValid: newErrors.length === 0,
        };
      });

      return {
        ...result,
        rows: updatedRows,
        summary: {
          ...result.summary,
          valid: updatedRows.filter((r) => r.isValid).length,
          invalid: updatedRows.filter((r) => !r.isValid).length,
        },
      };
    } catch {
      console.warn("AI matching failed, continuing with fuzzy results");
      return result;
    }
  };

  // ── File upload ────────────────────────────────────────────────────────────

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setFileName(file.name);
    try {
      const ref = await loadReferenceData();
      if (!ref) return;

      const data = await file.arrayBuffer();
      let result: ParseResult;

      if (defaultMovementType === "COMPRA") {
        result = parseCompraSimple(data, ref.products, ref.locations, ref.learnings);
      } else if (defaultMovementType === "TRANSFERENCIA") {
        result = parseReposicionSimple(data, ref.products, ref.locations, ref.balancesMap, ref.learnings);
      } else if (defaultMovementType === "CONTEO") {
        result = parseConteoSimple(data, ref.products, ref.locations, ref.balancesMap, ref.learnings);
      } else {
        result = parseExcelInventory(data, ref.products, ref.locations, ref.balancesMap);
      }

      // Try AI matching for low confidence results
      if (result.rows.some((r) => r.matchConfidence === "baja" || r.matchConfidence === "sin_match")) {
        result = await tryAIMatching(result, ref.products);
      }

      if (result.rows.length === 0) {
        toast.error("El archivo no contiene movimientos válidos");
        return;
      }

      setParseResult(result);
      setPreviewOpen(true);

      if (result.summary.invalid > 0) {
        toast.warning(`${result.summary.invalid} fila(s) con errores`);
      }
    } catch (error) {
      console.error("Error reading file:", error);
      toast.error("Error al leer el archivo");
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  // ── Save as pending (NO stock impact) ──────────────────────────────────────

  const handleSaveAsPending = async () => {
    if (!venue?.id || !parseResult) return;

    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) { toast.error("Usuario no autenticado"); return; }

    setIsSaving(true);
    try {
      const validRows = parseResult.rows.filter((r) => r.isValid);
      const batchType = defaultMovementType ||
        (parseResult.rows[0]?.tipo_movimiento as "COMPRA" | "TRANSFERENCIA" | "CONTEO") ||
        "COMPRA";

      const summaryJson: Record<string, any> = {
        totalFilas: parseResult.rows.length,
        productosAfectados: new Set(validRows.map((r) => r.productId).filter(Boolean)).size,
      };

      if (batchType === "COMPRA") {
        summaryJson.montoTotal = validRows.reduce((s, r) => s + (Number(r.costo_neto_envase) || 0) * (Number(r.cantidad_envases) || 0), 0);
      } else if (batchType === "TRANSFERENCIA") {
        summaryJson.totalMovido = validRows.reduce((s, r) => s + r.computedBaseQty, 0);
      } else if (batchType === "CONTEO") {
        const diffs = validRows.map((r) => (Number(r.stock_real_contado) || 0) - (Number(r.stock_teorico_exportado) || 0));
        summaryJson.ajustesPositivos = diffs.filter((d) => d > 0).length;
        summaryJson.mermas = diffs.filter((d) => d < 0).length;
        summaryJson.diferenciaNeta = diffs.reduce((s, d) => s + d, 0);
      }

      const { data: batch, error: batchError } = await supabase
        .from("stock_import_batches")
        .insert({
          venue_id: venue.id,
          batch_type: batchType,
          uploaded_by: userId,
          file_name: fileName,
          summary_json: summaryJson,
          row_count: parseResult.rows.length,
          valid_count: parseResult.summary.valid,
          invalid_count: parseResult.summary.invalid,
        })
        .select("id")
        .single();

      if (batchError || !batch) throw batchError;

      const rowInserts = parseResult.rows.map((r) => ({
        batch_id: batch.id,
        row_index: r.rowIndex,
        raw_data: {
          documento_ref: r.documento_ref,
          proveedor: r.proveedor,
          formato_compra_ml: r.formato_compra_ml,
          cantidad_envases: r.cantidad_envases,
          observaciones: r.observaciones,
        },
        product_id: r.productId,
        product_name_excel: r.producto_nombre,
        product_name_matched: r.productNameMatched,
        match_confidence: r.matchConfidence,
        tipo_consumo: r.tipo_consumo,
        unidad_detectada: r.unidad_base,
        location_destino_id: r.locationDestinoId,
        location_origen_id: r.locationOrigenId,
        quantity: r.cantidad_envases || r.cantidad_base_movida,
        unit_cost: r.costo_neto_envase,
        computed_base_qty: r.computedBaseQty,
        stock_teorico: r.stock_teorico_exportado,
        stock_real: r.stock_real_contado,
        errors: r.errors,
        is_valid: r.isValid,
      }));

      const { error: rowsError } = await supabase
        .from("stock_import_rows")
        .insert(rowInserts);

      if (rowsError) throw rowsError;

      toast.success("Lote guardado como pendiente", {
        description: `${parseResult.summary.valid} filas válidas esperando aprobación.`,
      });

      setPreviewOpen(false);
      setParseResult(null);
      onBatchSaved?.();
    } catch (error) {
      console.error("Error saving batch:", error);
      toast.error("Error al guardar el lote");
    } finally {
      setIsSaving(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const templateLabel = defaultMovementType === "COMPRA" ? "Plantilla Compra"
    : defaultMovementType === "TRANSFERENCIA" ? "Plantilla Reposición"
    : defaultMovementType === "CONTEO" ? "Plantilla Conteo"
    : "Descargar Plantilla";

  return (
    <>
      <Card className="glass-effect shadow-elegant">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            {defaultMovementType === "COMPRA" ? "Subir Compra" :
             defaultMovementType === "TRANSFERENCIA" ? "Subir Reposición" :
             defaultMovementType === "CONTEO" ? "Subir Conteo" : "Inventario Excel"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-border rounded-lg hover:border-primary transition-smooth">
              <Upload className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-sm text-muted-foreground mb-4 text-center">
                {defaultMovementType === "COMPRA" && "Columnas: producto_nombre, cantidad, formato_ml, costo_neto_unitario"}
                {defaultMovementType === "TRANSFERENCIA" && "Columnas: producto_nombre, cantidad, ubicacion_destino"}
                {defaultMovementType === "CONTEO" && "Columnas: producto_nombre, stock_real, ubicacion"}
                {!defaultMovementType && "Sube la plantilla unificada con compras, transferencias o conteos."}
              </p>
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileUpload}
                className="hidden"
                id="excel-upload"
                disabled={uploading}
              />
              <label htmlFor="excel-upload">
                <Button asChild disabled={uploading} className="primary-gradient">
                  <span>
                    {uploading ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Procesando...</>
                    ) : (
                      <><Upload className="mr-2 h-4 w-4" />Subir Archivo</>
                    )}
                  </span>
                </Button>
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Button variant="outline" onClick={handleDownloadTemplate}>
                <Download className="mr-2 h-4 w-4" />
                {templateLabel}
              </Button>
              {defaultMovementType !== "CONTEO" && (
                <Button variant="outline" onClick={handleDownloadStock}>
                  <DownloadCloud className="mr-2 h-4 w-4" />
                  Exportar Stock Actual
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <StockImportPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        parseResult={parseResult}
        onConfirm={handleSaveAsPending}
        isProcessing={isSaving}
        mode="pending"
      />
    </>
  );
};
