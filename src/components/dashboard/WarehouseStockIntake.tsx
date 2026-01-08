import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
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
import { toast } from "sonner";
import { formatCLP } from "@/lib/currency";
import {
  Plus,
  FileUp,
  FileSpreadsheet,
  Loader2,
  Check,
  AlertCircle,
  Warehouse,
  Download,
} from "lucide-react";
import * as XLSX from "xlsx";

interface Product {
  id: string;
  name: string;
  code: string;
  category: string;
  unit: string;
}

interface ExcelRow {
  product_name: string;
  quantity: number;
  unit_cost: number;
  matched_product_id?: string;
  matched_product_name?: string;
  error?: string;
}

interface WarehouseStockIntakeProps {
  warehouseId: string;
  products: Product[];
  onStockUpdated: () => void;
}

const INTAKE_REASONS = [
  { value: "compra", label: "Compra" },
  { value: "ajuste", label: "Ajuste de inventario" },
  { value: "donacion", label: "Donación" },
  { value: "correccion", label: "Corrección" },
];

export function WarehouseStockIntake({ 
  warehouseId, 
  products, 
  onStockUpdated 
}: WarehouseStockIntakeProps) {
  const navigate = useNavigate();
  
  // Manual intake state
  const [showManualDialog, setShowManualDialog] = useState(false);
  const [manualProductId, setManualProductId] = useState("");
  const [manualQuantity, setManualQuantity] = useState("");
  const [manualUnitCost, setManualUnitCost] = useState("");
  const [manualReason, setManualReason] = useState("");
  const [manualNotes, setManualNotes] = useState("");
  const [submittingManual, setSubmittingManual] = useState(false);

  // Excel import state
  const [showExcelDialog, setShowExcelDialog] = useState(false);
  const [excelRows, setExcelRows] = useState<ExcelRow[]>([]);
  const [excelStep, setExcelStep] = useState<"upload" | "preview" | "confirm">("upload");
  const [processingExcel, setProcessingExcel] = useState(false);
  const [submittingExcel, setSubmittingExcel] = useState(false);

  const handleManualSubmit = async () => {
    if (!manualProductId || !manualQuantity || !manualReason) {
      toast.error("Complete los campos requeridos");
      return;
    }

    const quantity = parseFloat(manualQuantity);
    if (isNaN(quantity) || quantity <= 0) {
      toast.error("La cantidad debe ser un número positivo");
      return;
    }

    setSubmittingManual(true);
    try {
      const unitCost = manualUnitCost ? parseFloat(manualUnitCost) : null;
      
      // Create stock movement
      const { error: movementError } = await supabase
        .from("stock_movements")
        .insert({
          product_id: manualProductId,
          quantity: quantity,
          movement_type: "entrada",
          to_location_id: warehouseId,
          unit_cost: unitCost,
          source_type: "manual",
          notes: `${manualReason}${manualNotes ? `: ${manualNotes}` : ""}`,
        });

      if (movementError) throw movementError;

      // Update stock balance
      const { error: balanceError } = await supabase
        .from("stock_balances")
        .upsert(
          {
            location_id: warehouseId,
            product_id: manualProductId,
            quantity: quantity,
          },
          {
            onConflict: "location_id,product_id",
          }
        );

      // If upsert didn't work, try updating
      if (balanceError) {
        const { data: existing } = await supabase
          .from("stock_balances")
          .select("quantity")
          .eq("location_id", warehouseId)
          .eq("product_id", manualProductId)
          .single();

        if (existing) {
          await supabase
            .from("stock_balances")
            .update({ quantity: existing.quantity + quantity, updated_at: new Date().toISOString() })
            .eq("location_id", warehouseId)
            .eq("product_id", manualProductId);
        } else {
          await supabase
            .from("stock_balances")
            .insert({ location_id: warehouseId, product_id: manualProductId, quantity });
        }
      }

      // Update product current_stock
      const { data: product } = await supabase
        .from("products")
        .select("current_stock, cost_per_unit")
        .eq("id", manualProductId)
        .single();

      if (product) {
        const updates: { current_stock: number; cost_per_unit?: number } = {
          current_stock: (product.current_stock || 0) + quantity,
        };
        if (unitCost && (!product.cost_per_unit || product.cost_per_unit === 0)) {
          updates.cost_per_unit = unitCost;
        }
        await supabase.from("products").update(updates).eq("id", manualProductId);
      }

      toast.success("Stock ingresado correctamente");
      resetManualForm();
      setShowManualDialog(false);
      onStockUpdated();
    } catch (error) {
      console.error("Error:", error);
      toast.error("Error al ingresar stock");
    } finally {
      setSubmittingManual(false);
    }
  };

  const resetManualForm = () => {
    setManualProductId("");
    setManualQuantity("");
    setManualUnitCost("");
    setManualReason("");
    setManualNotes("");
  };

  const handleExcelFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const validTypes = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "text/csv",
    ];
    
    if (!validTypes.includes(file.type) && !file.name.endsWith(".csv") && !file.name.endsWith(".xlsx")) {
      toast.error("Use un archivo Excel (.xlsx) o CSV");
      return;
    }

    setProcessingExcel(true);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet) as Record<string, unknown>[];

      // Parse and match products
      const rows: ExcelRow[] = jsonData.map((row) => {
        const productName = String(row.product_name || row.producto || row.nombre || "").trim();
        const quantity = parseFloat(String(row.quantity || row.cantidad || 0));
        const unitCost = parseFloat(String(row.unit_cost || row.costo_unitario || row.costo || 0));

        // Try to match product
        const matchedProduct = products.find(
          (p) =>
            p.name.toLowerCase() === productName.toLowerCase() ||
            p.code.toLowerCase() === productName.toLowerCase()
        );

        return {
          product_name: productName,
          quantity: isNaN(quantity) ? 0 : quantity,
          unit_cost: isNaN(unitCost) ? 0 : unitCost,
          matched_product_id: matchedProduct?.id,
          matched_product_name: matchedProduct?.name,
          error: !productName
            ? "Sin nombre"
            : quantity <= 0
            ? "Cantidad inválida"
            : !matchedProduct
            ? "Producto no encontrado"
            : undefined,
        };
      });

      setExcelRows(rows);
      setExcelStep("preview");
    } catch (error) {
      console.error("Error parsing Excel:", error);
      toast.error("Error al leer el archivo");
    } finally {
      setProcessingExcel(false);
    }
  };

  const handleExcelConfirm = async () => {
    const validRows = excelRows.filter((r) => r.matched_product_id && r.quantity > 0 && !r.error);
    
    if (validRows.length === 0) {
      toast.error("No hay filas válidas para importar");
      return;
    }

    setSubmittingExcel(true);
    try {
      let successCount = 0;

      for (const row of validRows) {
        // Create stock movement
        await supabase.from("stock_movements").insert({
          product_id: row.matched_product_id,
          quantity: row.quantity,
          movement_type: "entrada",
          to_location_id: warehouseId,
          unit_cost: row.unit_cost || null,
          source_type: "excel",
          notes: "Importación desde Excel",
        });

        // Update stock balance
        const { data: existing } = await supabase
          .from("stock_balances")
          .select("quantity")
          .eq("location_id", warehouseId)
          .eq("product_id", row.matched_product_id)
          .single();

        if (existing) {
          await supabase
            .from("stock_balances")
            .update({ 
              quantity: existing.quantity + row.quantity, 
              updated_at: new Date().toISOString() 
            })
            .eq("location_id", warehouseId)
            .eq("product_id", row.matched_product_id);
        } else {
          await supabase.from("stock_balances").insert({
            location_id: warehouseId,
            product_id: row.matched_product_id,
            quantity: row.quantity,
          });
        }

        // Update product current_stock
        const { data: product } = await supabase
          .from("products")
          .select("current_stock")
          .eq("id", row.matched_product_id)
          .single();

        if (product) {
          await supabase
            .from("products")
            .update({ current_stock: (product.current_stock || 0) + row.quantity })
            .eq("id", row.matched_product_id);
        }

        successCount++;
      }

      toast.success(`${successCount} productos importados correctamente`);
      resetExcelForm();
      setShowExcelDialog(false);
      onStockUpdated();
    } catch (error) {
      console.error("Error importing Excel:", error);
      toast.error("Error al importar desde Excel");
    } finally {
      setSubmittingExcel(false);
    }
  };

  const resetExcelForm = () => {
    setExcelRows([]);
    setExcelStep("upload");
  };

  const downloadExcelTemplate = () => {
    const templateData = [
      { product_name: "Ejemplo: Vodka Absolut 750ml", quantity: 10, unit_cost: 8500 },
      { product_name: "Ejemplo: Ron Havana 750ml", quantity: 5, unit_cost: 12000 },
    ];
    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Stock");
    XLSX.writeFile(wb, "plantilla_ingreso_stock.xlsx");
  };

  const validExcelRows = excelRows.filter((r) => !r.error);
  const totalExcelQuantity = validExcelRows.reduce((sum, r) => sum + r.quantity, 0);
  const totalExcelValue = validExcelRows.reduce((sum, r) => sum + r.quantity * r.unit_cost, 0);

  return (
    <>
      {/* Stock Intake Section */}
      <Card className="glass-effect border-primary/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Warehouse className="h-5 w-5 text-primary" />
            Ingreso de stock a bodega
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Manual Intake */}
            <button
              onClick={() => setShowManualDialog(true)}
              className="glass-effect p-4 rounded-lg text-left hover:bg-primary/5 transition-colors group"
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-green-500/10 rounded-lg group-hover:bg-green-500/20 transition-colors">
                  <Plus className="h-5 w-5 text-green-600" />
                </div>
                <span className="font-semibold">Ingreso manual</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Agrega productos uno a uno con cantidad y costo
              </p>
            </button>

            {/* Invoice Import */}
            <button
              onClick={() => navigate("/admin/purchases/import")}
              className="glass-effect p-4 rounded-lg text-left hover:bg-primary/5 transition-colors group"
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-blue-500/10 rounded-lg group-hover:bg-blue-500/20 transition-colors">
                  <FileUp className="h-5 w-5 text-blue-600" />
                </div>
                <span className="font-semibold">Importar factura</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Sube PDF o imagen de factura para ingreso automático
              </p>
            </button>

            {/* Excel Import */}
            <button
              onClick={() => setShowExcelDialog(true)}
              className="glass-effect p-4 rounded-lg text-left hover:bg-primary/5 transition-colors group"
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-emerald-500/10 rounded-lg group-hover:bg-emerald-500/20 transition-colors">
                  <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
                </div>
                <span className="font-semibold">Importar Excel</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Carga múltiples productos desde archivo .xlsx o .csv
              </p>
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Manual Intake Dialog */}
      <Dialog open={showManualDialog} onOpenChange={setShowManualDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Ingreso manual de stock
            </DialogTitle>
            <DialogDescription>
              El stock se agregará directamente a bodega
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Producto *</Label>
              <Select value={manualProductId} onValueChange={setManualProductId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar producto..." />
                </SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} ({p.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Cantidad *</Label>
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={manualQuantity}
                  onChange={(e) => setManualQuantity(e.target.value)}
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <Label>Costo unitario</Label>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={manualUnitCost}
                  onChange={(e) => setManualUnitCost(e.target.value)}
                  placeholder="Opcional"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Razón *</Label>
              <Select value={manualReason} onValueChange={setManualReason}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar razón..." />
                </SelectTrigger>
                <SelectContent>
                  {INTAKE_REASONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Notas</Label>
              <Textarea
                value={manualNotes}
                onChange={(e) => setManualNotes(e.target.value)}
                placeholder="Notas adicionales (opcional)"
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowManualDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleManualSubmit} disabled={submittingManual}>
              {submittingManual ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Check className="h-4 w-4 mr-2" />
              )}
              Confirmar ingreso
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Excel Import Dialog */}
      <Dialog open={showExcelDialog} onOpenChange={(open) => {
        setShowExcelDialog(open);
        if (!open) resetExcelForm();
      }}>
        <DialogContent className="sm:max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Importar stock desde Excel
            </DialogTitle>
            <DialogDescription>
              El stock se agregará directamente a bodega
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-auto">
            {excelStep === "upload" && (
              <div className="py-8">
                <div className="border-2 border-dashed rounded-lg p-8 text-center">
                  <FileSpreadsheet className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground mb-2">
                    Selecciona un archivo Excel o CSV
                  </p>
                  <p className="text-xs text-muted-foreground mb-4">
                    Columnas requeridas: product_name, quantity, unit_cost
                  </p>
                  <div className="flex justify-center gap-4">
                    <Input
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      onChange={handleExcelFileUpload}
                      className="max-w-xs"
                      disabled={processingExcel}
                    />
                  </div>
                  {processingExcel && (
                    <div className="mt-4 flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-sm">Procesando archivo...</span>
                    </div>
                  )}
                </div>
                <div className="mt-4 text-center">
                  <Button variant="link" size="sm" onClick={downloadExcelTemplate} className="gap-2">
                    <Download className="h-4 w-4" />
                    Descargar plantilla de ejemplo
                  </Button>
                </div>
              </div>
            )}

            {excelStep === "preview" && (
              <div className="space-y-4 py-4">
                {/* Summary */}
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div className="glass-effect p-3 rounded-lg">
                    <div className="text-2xl font-bold text-primary">{validExcelRows.length}</div>
                    <div className="text-xs text-muted-foreground">Productos válidos</div>
                  </div>
                  <div className="glass-effect p-3 rounded-lg">
                    <div className="text-2xl font-bold">{totalExcelQuantity}</div>
                    <div className="text-xs text-muted-foreground">Unidades totales</div>
                  </div>
                  <div className="glass-effect p-3 rounded-lg">
                    <div className="text-2xl font-bold">{formatCLP(totalExcelValue)}</div>
                    <div className="text-xs text-muted-foreground">Valor total</div>
                  </div>
                </div>

                {excelRows.some((r) => r.error) && (
                  <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-500/10 p-3 rounded-lg">
                    <AlertCircle className="h-4 w-4" />
                    {excelRows.filter((r) => r.error).length} filas con errores serán omitidas
                  </div>
                )}

                {/* Table preview */}
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Producto</TableHead>
                        <TableHead>Match</TableHead>
                        <TableHead className="text-right">Cantidad</TableHead>
                        <TableHead className="text-right">Costo Unit.</TableHead>
                        <TableHead>Estado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {excelRows.slice(0, 20).map((row, idx) => (
                        <TableRow key={idx} className={row.error ? "bg-red-50/50" : ""}>
                          <TableCell className="text-sm">{row.product_name}</TableCell>
                          <TableCell className="text-sm">{row.matched_product_name || "-"}</TableCell>
                          <TableCell className="text-right">{row.quantity}</TableCell>
                          <TableCell className="text-right">{row.unit_cost > 0 ? formatCLP(row.unit_cost) : "-"}</TableCell>
                          <TableCell>
                            {row.error ? (
                              <span className="text-xs text-red-600">{row.error}</span>
                            ) : (
                              <Check className="h-4 w-4 text-green-600" />
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {excelRows.length > 20 && (
                    <div className="p-2 text-center text-sm text-muted-foreground bg-muted/50">
                      ... y {excelRows.length - 20} filas más
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="border-t pt-4">
            {excelStep === "upload" && (
              <Button variant="outline" onClick={() => setShowExcelDialog(false)}>
                Cancelar
              </Button>
            )}
            {excelStep === "preview" && (
              <>
                <Button variant="outline" onClick={resetExcelForm}>
                  Subir otro archivo
                </Button>
                <Button 
                  onClick={handleExcelConfirm} 
                  disabled={submittingExcel || validExcelRows.length === 0}
                >
                  {submittingExcel ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Check className="h-4 w-4 mr-2" />
                  )}
                  Confirmar ingreso ({validExcelRows.length} productos)
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
