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
  parseExcelInventory,
  generateTemplate,
  type ParseResult,
  type ProductRef,
  type LocationRef,
  type ResolvedRow,
} from "@/lib/excel-inventory-parser";
import { isBottle, calculateCPP } from "@/lib/product-type";

export const ExcelUpload = () => {
  const { venue } = useActiveVenue();
  const [uploading, setUploading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // ── Load reference data ────────────────────────────────────────────────────

  const loadReferenceData = useCallback(async () => {
    if (!venue?.id) return null;

    const [productsRes, locationsRes, balancesRes] = await Promise.all([
      supabase.from("products").select("id, code, name, capacity_ml, cost_per_unit, current_stock").eq("venue_id", venue.id),
      supabase.from("stock_locations").select("id, name, type").eq("venue_id", venue.id),
      supabase.from("stock_balances").select("product_id, location_id, quantity").eq("venue_id", venue.id),
    ]);

    if (productsRes.error || locationsRes.error || balancesRes.error) {
      toast.error("Error cargando datos de referencia");
      return null;
    }

    const products: ProductRef[] = (productsRes.data || []).map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      capacity_ml: p.capacity_ml,
      cost_per_unit: p.cost_per_unit || 0,
      current_stock: p.current_stock || 0,
    }));

    const locations: LocationRef[] = (locationsRes.data || []).map((l) => ({
      id: l.id,
      name: l.name,
      type: l.type,
    }));

    const balancesMap = new Map<string, number>();
    const balancesArray = (balancesRes.data || []).map((b) => {
      const qty = Number(b.quantity) || 0;
      balancesMap.set(`${b.product_id}::${b.location_id}`, qty);
      return { productId: b.product_id, locationId: b.location_id, quantity: qty };
    });

    return { products, locations, balancesMap, balancesArray };
  }, [venue?.id]);

  // ── Download template ──────────────────────────────────────────────────────

  const handleDownloadTemplate = async () => {
    const ref = await loadReferenceData();
    if (!ref) return;

    const wb = generateTemplate(ref.products, ref.locations, ref.balancesArray);
    XLSX.writeFile(wb, `plantilla_inventario_${venue?.name || "stockia"}.xlsx`);
    toast.success("Plantilla descargada", {
      description: "Incluye hojas de referencia y stock actual por ubicación.",
    });
  };

  // ── Download current stock ─────────────────────────────────────────────────

  const handleDownloadStock = async () => {
    const ref = await loadReferenceData();
    if (!ref) return;

    const wb = generateTemplate(ref.products, ref.locations, ref.balancesArray);
    // Extract only the stock sheet
    const stockWb = XLSX.utils.book_new();
    const stockSheet = wb.Sheets["Export_Stock_Actual"];
    if (stockSheet) {
      XLSX.utils.book_append_sheet(stockWb, stockSheet, "Stock_Actual");
    }
    XLSX.writeFile(stockWb, `stock_actual_${new Date().toISOString().split("T")[0]}.xlsx`);
    toast.success("Stock actual exportado");
  };

  // ── File upload ────────────────────────────────────────────────────────────

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const ref = await loadReferenceData();
      if (!ref) return;

      const data = await file.arrayBuffer();
      const result = parseExcelInventory(data, ref.products, ref.locations, ref.balancesMap);

      if (result.rows.length === 0) {
        toast.error("El archivo no contiene movimientos válidos");
        return;
      }

      setParseResult(result);
      setPreviewOpen(true);

      if (result.summary.invalid > 0) {
        toast.warning(`${result.summary.invalid} fila(s) con errores`, {
          description: "Revisa el preview antes de confirmar.",
        });
      }
    } catch (error) {
      console.error("Error reading file:", error);
      toast.error("Error al leer el archivo");
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  // ── Process confirmed import ───────────────────────────────────────────────

  const handleConfirmImport = async () => {
    if (!venue?.id || !parseResult) return;

    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) {
      toast.error("Usuario no autenticado");
      return;
    }

    setIsProcessing(true);
    try {
      const validRows = parseResult.rows.filter((r) => r.isValid);
      const compras = validRows.filter((r) => r.tipo_movimiento === "COMPRA");
      const transferencias = validRows.filter((r) => r.tipo_movimiento === "TRANSFERENCIA");
      const conteos = validRows.filter((r) => r.tipo_movimiento === "CONTEO");

      // 1) Process COMPRAS
      if (compras.length > 0) {
        await processCompras(compras, userId, venue.id);
      }

      // 2) Process TRANSFERENCIAS
      if (transferencias.length > 0) {
        await processTransferencias(transferencias, userId, venue.id);
      }

      // 3) Process CONTEOS
      if (conteos.length > 0) {
        await processConteos(conteos, userId, venue.id);
      }

      toast.success("Importación completada", {
        description: `${compras.length} compras, ${transferencias.length} transferencias, ${conteos.length} conteos procesados.`,
      });

      setPreviewOpen(false);
      setParseResult(null);
    } catch (error) {
      console.error("Error processing import:", error);
      toast.error("Error al procesar la importación");
    } finally {
      setIsProcessing(false);
    }
  };

  // ── COMPRA processing ─────────────────────────────────────────────────────

  const processCompras = async (rows: ResolvedRow[], userId: string, venueId: string) => {
    // Create batch
    const { data: batch, error: batchError } = await supabase
      .from("stock_intake_batches")
      .insert({
        venue_id: venueId,
        created_by: userId,
        notes: `Excel import: ${rows[0]?.documento_ref || ""} ${rows[0]?.proveedor || ""}`.trim(),
        total_net: rows.reduce((s, r) => s + (Number(r.costo_neto_envase) || 0) * (Number(r.cantidad_envases) || 0), 0),
        total_vat: 0,
        total_specific_tax: 0,
        total_other_tax: 0,
        total_amount: rows.reduce((s, r) => s + (Number(r.costo_neto_envase) || 0) * (Number(r.cantidad_envases) || 0), 0),
        items_count: rows.length,
        default_location_id: rows[0]?.locationDestinoId,
      })
      .select("id")
      .single();

    if (batchError || !batch) throw batchError;

    for (const row of rows) {
      if (!row.productId || !row.locationDestinoId) continue;

      const costoEnvase = Number(row.costo_neto_envase) || 0;
      const cantEnvases = Number(row.cantidad_envases) || 0;
      const baseQty = row.computedBaseQty;

      // For bottles: quantity in stock_intake_items is in bottles, stock_balances in ml
      // For units: quantity is the same
      const isBotella = row.tipo_consumo === "ML";

      // Insert intake item
      await supabase.from("stock_intake_items").insert({
        batch_id: batch.id,
        product_id: row.productId,
        location_id: row.locationDestinoId,
        quantity: cantEnvases,
        net_unit_cost: costoEnvase,
        vat_unit: 0,
        specific_tax_unit: 0,
        other_tax_unit: 0,
        total_unit: costoEnvase,
        total_line: costoEnvase * cantEnvases,
        venue_id: venueId,
      });

      // Upsert stock_balances (add baseQty in ml or units)
      const { data: existingBalance } = await supabase
        .from("stock_balances")
        .select("id, quantity")
        .eq("product_id", row.productId)
        .eq("location_id", row.locationDestinoId)
        .eq("venue_id", venueId)
        .maybeSingle();

      const currentBalance = Number(existingBalance?.quantity) || 0;
      const newBalance = currentBalance + baseQty;

      if (existingBalance) {
        await supabase
          .from("stock_balances")
          .update({ quantity: newBalance, updated_at: new Date().toISOString() })
          .eq("id", existingBalance.id);
      } else {
        await supabase.from("stock_balances").insert({
          product_id: row.productId,
          location_id: row.locationDestinoId,
          quantity: newBalance,
          venue_id: venueId,
        });
      }

      // Insert stock_movement
      await supabase.from("stock_movements").insert({
        product_id: row.productId,
        movement_type: "compra",
        quantity: baseQty,
        notes: `Excel compra: ${row.documento_ref || ""} ${row.proveedor || ""}`.trim(),
        to_location_id: row.locationDestinoId,
        unit_cost_snapshot: costoEnvase,
        total_cost_snapshot: costoEnvase * cantEnvases,
        venue_id: venueId,
      });

      // Recalculate CPP
      // Get total stock across all locations for this product
      const { data: allBalances } = await supabase
        .from("stock_balances")
        .select("quantity")
        .eq("product_id", row.productId)
        .eq("venue_id", venueId);

      const totalStockNow = (allBalances || []).reduce((s, b) => s + (Number(b.quantity) || 0), 0);
      const stockBeforeIntake = totalStockNow - baseQty;

      // Get current product cost
      const { data: currentProduct } = await supabase
        .from("products")
        .select("cost_per_unit, capacity_ml")
        .eq("id", row.productId)
        .single();

      const oldCost = currentProduct?.cost_per_unit || 0;
      const capMl = currentProduct?.capacity_ml;

      // For ML: CPP is per-bottle, so convert stock to bottles for the calc
      const newCPP = calculateCPP({
        product: { capacity_ml: capMl },
        currentStock: stockBeforeIntake,
        oldCostPerUnit: oldCost,
        addedQty: baseQty,
        newCostPerUnit: costoEnvase,
      });

      // Update product: cost + sync current_stock
      await supabase
        .from("products")
        .update({
          cost_per_unit: Math.round(newCPP),
          current_stock: totalStockNow,
        })
        .eq("id", row.productId);
    }
  };

  // ── TRANSFERENCIA processing ───────────────────────────────────────────────

  const processTransferencias = async (rows: ResolvedRow[], userId: string, venueId: string) => {
    // Group by origin/destination pair
    const transferKey = (r: ResolvedRow) => `${r.locationOrigenId}::${r.locationDestinoId}`;
    const groups = new Map<string, ResolvedRow[]>();
    rows.forEach((r) => {
      const key = transferKey(r);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(r);
    });

    for (const [, groupRows] of groups) {
      const first = groupRows[0];
      if (!first.locationOrigenId || !first.locationDestinoId) continue;

      // Create transfer record
      const { data: transfer, error: transferError } = await supabase
        .from("stock_transfers")
        .insert({
          from_location_id: first.locationOrigenId,
          to_location_id: first.locationDestinoId,
          transferred_by: userId,
          notes: `Excel transferencia: ${first.observaciones || ""}`.trim(),
          venue_id: venueId,
        })
        .select("id")
        .single();

      if (transferError || !transfer) throw transferError;

      for (const row of groupRows) {
        if (!row.productId) continue;
        const qty = row.computedBaseQty;

        // Insert transfer item
        await supabase.from("stock_transfer_items").insert({
          transfer_id: transfer.id,
          product_id: row.productId,
          quantity: qty,
          venue_id: venueId,
        });

        // Decrement origin
        const { data: originBal } = await supabase
          .from("stock_balances")
          .select("id, quantity")
          .eq("product_id", row.productId)
          .eq("location_id", first.locationOrigenId!)
          .eq("venue_id", venueId)
          .maybeSingle();

        if (originBal) {
          await supabase
            .from("stock_balances")
            .update({ quantity: Math.max(0, Number(originBal.quantity) - qty), updated_at: new Date().toISOString() })
            .eq("id", originBal.id);
        }

        // Increment destination
        const { data: destBal } = await supabase
          .from("stock_balances")
          .select("id, quantity")
          .eq("product_id", row.productId)
          .eq("location_id", first.locationDestinoId!)
          .eq("venue_id", venueId)
          .maybeSingle();

        if (destBal) {
          await supabase
            .from("stock_balances")
            .update({ quantity: Number(destBal.quantity) + qty, updated_at: new Date().toISOString() })
            .eq("id", destBal.id);
        } else {
          await supabase.from("stock_balances").insert({
            product_id: row.productId,
            location_id: first.locationDestinoId!,
            quantity: qty,
            venue_id: venueId,
          });
        }

        // Insert 2 movements
        await supabase.from("stock_movements").insert([
          {
            product_id: row.productId,
            movement_type: "transfer_out",
            quantity: qty,
            from_location_id: first.locationOrigenId,
            transfer_id: transfer.id,
            venue_id: venueId,
            notes: "Excel transferencia salida",
          },
          {
            product_id: row.productId,
            movement_type: "transfer_in",
            quantity: qty,
            to_location_id: first.locationDestinoId,
            transfer_id: transfer.id,
            venue_id: venueId,
            notes: "Excel transferencia entrada",
          },
        ]);

        // Sync current_stock
        const { data: allBal } = await supabase
          .from("stock_balances")
          .select("quantity")
          .eq("product_id", row.productId)
          .eq("venue_id", venueId);

        const totalStock = (allBal || []).reduce((s, b) => s + (Number(b.quantity) || 0), 0);
        await supabase.from("products").update({ current_stock: totalStock }).eq("id", row.productId);
      }
    }
  };

  // ── CONTEO processing ──────────────────────────────────────────────────────

  const processConteos = async (rows: ResolvedRow[], userId: string, venueId: string) => {
    for (const row of rows) {
      if (!row.productId || !row.locationDestinoId) continue;

      const stockReal = Number(row.stock_real_contado) || 0;

      // Get current balance
      const { data: bal } = await supabase
        .from("stock_balances")
        .select("id, quantity")
        .eq("product_id", row.productId)
        .eq("location_id", row.locationDestinoId)
        .eq("venue_id", venueId)
        .maybeSingle();

      const currentBalance = Number(bal?.quantity) || 0;
      const diff = stockReal - currentBalance;

      if (diff === 0) continue; // No adjustment needed

      // Update balance to real count
      if (bal) {
        await supabase
          .from("stock_balances")
          .update({ quantity: stockReal, updated_at: new Date().toISOString() })
          .eq("id", bal.id);
      } else {
        await supabase.from("stock_balances").insert({
          product_id: row.productId,
          location_id: row.locationDestinoId,
          quantity: stockReal,
          venue_id: venueId,
        });
      }

      // Insert movement
      const movementType = diff < 0 ? "waste" : "reconciliation";
      await supabase.from("stock_movements").insert({
        product_id: row.productId,
        movement_type: movementType,
        quantity: Math.abs(diff),
        notes: `Excel conteo: ${diff < 0 ? "merma" : "ajuste positivo"} (${diff > 0 ? "+" : ""}${diff}) ${row.motivo_ajuste || ""}`.trim(),
        to_location_id: row.locationDestinoId,
        venue_id: venueId,
      });

      // Sync current_stock
      const { data: allBal } = await supabase
        .from("stock_balances")
        .select("quantity")
        .eq("product_id", row.productId)
        .eq("venue_id", venueId);

      const totalStock = (allBal || []).reduce((s, b) => s + (Number(b.quantity) || 0), 0);
      await supabase.from("products").update({ current_stock: totalStock }).eq("id", row.productId);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <Card className="glass-effect shadow-elegant">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            Inventario Excel
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-border rounded-lg hover:border-primary transition-smooth">
              <Upload className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-sm text-muted-foreground mb-4 text-center">
                Sube la plantilla unificada con compras, transferencias o conteos.
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
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Leyendo archivo...
                      </>
                    ) : (
                      <>
                        <Upload className="mr-2 h-4 w-4" />
                        Subir Archivo
                      </>
                    )}
                  </span>
                </Button>
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Button variant="outline" onClick={handleDownloadTemplate}>
                <Download className="mr-2 h-4 w-4" />
                Descargar Plantilla
              </Button>
              <Button variant="outline" onClick={handleDownloadStock}>
                <DownloadCloud className="mr-2 h-4 w-4" />
                Exportar Stock Actual
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <StockImportPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        parseResult={parseResult}
        onConfirm={handleConfirmImport}
        isProcessing={isProcessing}
      />
    </>
  );
};
