import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { formatCLP } from "@/lib/currency";
import {
  ArrowLeft,
  Upload,
  FileText,
  Loader2,
  Check,
  Package,
  Search,
  Warehouse,
  Lock,
} from "lucide-react";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import { logAuditEvent } from "@/lib/monitoring";
import { useUserRole } from "@/hooks/useUserRole";

// Motor de cálculo único
import {
  computePurchaseLine,
  recalculateLine,
  validateForConfirmation,
  type ComputedLine,
  type DiscountMode,
} from "@/lib/purchase-calculator";

// Componentes específicos
import { MinimalReviewTable } from "@/components/purchase/MinimalReviewTable";
import { LineDetailDrawer } from "@/components/purchase/LineDetailDrawer";
import { DiagnosticPanel } from "@/components/purchase/DiagnosticPanel";
import { StabilizedChecklist } from "@/components/purchase/StabilizedChecklist";

interface Product {
  id: string;
  name: string;
  code: string;
  category: string;
  unit: string;
  current_stock: number;
}

type Step = "upload" | "processing" | "review" | "complete" | "no-warehouse" | "no-access";

export default function PurchasesImport() {
  const navigate = useNavigate();
  const { isEnabled, isLoading: flagsLoading } = useFeatureFlags();
  const { hasRole, loading: roleLoading } = useUserRole();
  const isAdmin = hasRole("admin");
  
  // Estados principales
  const [step, setStep] = useState<Step>("upload");
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [checkingWarehouse, setCheckingWarehouse] = useState(true);

  // Datos del documento
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [providerName, setProviderName] = useState("");
  const [providerRut, setProviderRut] = useState("");
  const [documentNumber, setDocumentNumber] = useState("");
  const [documentDate, setDocumentDate] = useState("");
  const [netAmount, setNetAmount] = useState(0);
  const [ivaAmount, setIvaAmount] = useState(0);
  const [totalAmountGross, setTotalAmountGross] = useState(0);
  const [venueId, setVenueId] = useState<string | null>(null);
  
  // Raw extraction para diagnóstico
  const [rawExtraction, setRawExtraction] = useState<Record<string, unknown> | null>(null);

  // Líneas computadas (single source of truth)
  const [computedLines, setComputedLines] = useState<ComputedLine[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  // Modo de descuento del documento
  const [discountMode, setDiscountMode] = useState<DiscountMode>("APPLY_TO_GROSS");

  // UI states
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedLineForDetail, setSelectedLineForDetail] = useState<ComputedLine | null>(null);
  const [showDetailDrawer, setShowDetailDrawer] = useState(false);
  
  // New product dialog
  const [showNewProductDialog, setShowNewProductDialog] = useState(false);
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [newProductName, setNewProductName] = useState("");
  const [newProductCode, setNewProductCode] = useState("");
  const [newProductCategory, setNewProductCategory] = useState("unidades");
  const [creatingProduct, setCreatingProduct] = useState(false);

  // Registrar gastos
  const [registerExpenses, setRegisterExpenses] = useState(false);

  // ============================================================================
  // EFECTOS Y CARGA INICIAL
  // ============================================================================

  useEffect(() => {
    if (!flagsLoading) {
      if (!isEnabled("invoice_reader")) {
        setStep("no-access");
        setCheckingWarehouse(false);
      } else {
        checkWarehouseAndFetchProducts();
      }
    }
  }, [flagsLoading, isEnabled]);

  const checkWarehouseAndFetchProducts = async () => {
    try {
      const { data: warehouse } = await supabase
        .from("stock_locations")
        .select("id")
        .eq("type", "warehouse")
        .eq("is_active", true)
        .limit(1)
        .single();

      if (!warehouse) {
        setStep("no-warehouse");
        setCheckingWarehouse(false);
        return;
      }

      const { data: productsData } = await supabase
        .from("products")
        .select("id, name, code, category, unit, current_stock")
        .order("name");
      setProducts((productsData as Product[]) || []);
      setCheckingWarehouse(false);
    } catch {
      setStep("no-warehouse");
      setCheckingWarehouse(false);
    }
  };

  // ============================================================================
  // UPLOAD Y PROCESAMIENTO
  // ============================================================================

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const allowedTypes = ["application/pdf", "image/jpeg", "image/png", "text/xml", "application/xml"];
    if (!allowedTypes.includes(file.type)) {
      toast.error("Tipo de archivo no soportado. Use PDF, JPG, PNG o XML.");
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      toast.error("El archivo es demasiado grande (máximo 20MB)");
      return;
    }

    setUploading(true);
    setStep("processing");

    try {
      const base64 = await fileToBase64(file);
      const fileType = getFileType(file.type);

      const filePath = `invoices/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("purchase-documents")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: doc, error: docError } = await supabase
        .from("purchase_documents")
        .insert({
          file_path: filePath,
          file_type: fileType,
          status: "pending",
        })
        .select()
        .single();

      if (docError) throw docError;
      setDocumentId(doc.id);

      setProcessing(true);
      const { data: parseResult, error: parseError } = await supabase.functions.invoke(
        "parse-invoice",
        {
          body: {
            purchase_document_id: doc.id,
            file_url: filePath,
            file_type: fileType,
            file_content_base64: base64,
          },
        }
      );

      if (parseError) throw parseError;

      // Guardar raw extraction para diagnóstico
      setRawExtraction(parseResult?.raw_extraction || null);

      // Fetch updated document and items
      const { data: updatedDoc } = await supabase
        .from("purchase_documents")
        .select("*")
        .eq("id", doc.id)
        .single();

      const { data: purchaseItems } = await supabase
        .from("purchase_items")
        .select("*")
        .eq("purchase_document_id", doc.id);

      if (updatedDoc) {
        setProviderName(updatedDoc.provider_name || "");
        setProviderRut(updatedDoc.provider_rut || "");
        setDocumentNumber(updatedDoc.document_number || "");
        setDocumentDate(updatedDoc.document_date || "");
        setNetAmount(updatedDoc.net_amount || 0);
        setIvaAmount(updatedDoc.iva_amount || 0);
        setTotalAmountGross(updatedDoc.total_amount_gross || 0);
        setVenueId(updatedDoc.venue_id || null);
      }

      // Procesar ítems con el MOTOR DE CÁLCULO ÚNICO
      const lines = (purchaseItems || []).map((item) => {
        const computed = computePurchaseLine({
          id: item.id,
          raw_product_name: item.raw_product_name || "",
          qty_text: item.extracted_quantity,
          unit_price_text: item.extracted_unit_price,
          line_total_text: item.extracted_total,
          discount_text: item.discount_amount || item.discount_percent,
          discount_mode: discountMode,
          uom_text: item.extracted_uom,
          tax_iaba_10: item.tax_iaba_10,
          tax_iaba_18: item.tax_iaba_18,
          tax_ila_vin: item.tax_ila_vin,
          tax_ila_cer: item.tax_ila_cer,
          tax_ila_lic: item.tax_ila_lic,
        });

        // Asignar match del backend
        return {
          ...computed,
          matched_product_id: item.matched_product_id,
          matched_product_name: products.find(p => p.id === item.matched_product_id)?.name || null,
          match_confidence: item.match_confidence || 0,
        };
      });

      setComputedLines(lines);
      setStep("review");
      toast.success("Documento procesado correctamente");
    } catch (error: unknown) {
      console.error("Error processing file:", error);
      const errorMessage = error instanceof Error ? error.message : "Error al procesar el documento";
      toast.error(errorMessage);
      setStep("upload");
    } finally {
      setUploading(false);
      setProcessing(false);
    }
  };

  // ============================================================================
  // HANDLERS DE LÍNEAS
  // ============================================================================

  const handleUpdateLine = useCallback((id: string, updates: Partial<ComputedLine>) => {
    setComputedLines(prev => prev.map(line => {
      if (line.id !== id) return line;
      
      // Si cambian valores que afectan cálculos, recalcular
      if ('qty_invoice' in updates || 'pack_multiplier' in updates || 'discount_amount' in updates) {
        return recalculateLine(line, updates);
      }
      
      // Si solo cambia el match, actualizar directo
      return { ...line, ...updates };
    }));
  }, []);

  const handleMarkAsExpense = useCallback((id: string) => {
    setComputedLines(prev => prev.map(line => {
      if (line.id !== id) return line;
      return {
        ...line,
        status: "EXPENSE" as const,
        matched_product_id: null,
        matched_product_name: null,
        reasons: [...line.reasons, "Marcado como gasto por el usuario"],
      };
    }));
  }, []);

  const handleMarkAsInventory = useCallback((id: string) => {
    setComputedLines(prev => prev.map(line => {
      if (line.id !== id) return line;
      // Recalcular con el motor para re-validar
      const recalculated = recalculateLine(line, {});
      // Forzar que no sea expense
      return {
        ...recalculated,
        status: recalculated.real_units > 0 && recalculated.net_unit_cost > 0 ? "OK" : "REVIEW_REQUIRED",
        reasons: recalculated.reasons.filter(r => !r.includes("gasto") && !r.includes("flete")),
      };
    }));
  }, []);

  const handleOpenDetail = useCallback((line: ComputedLine) => {
    setSelectedLineForDetail(line);
    setShowDetailDrawer(true);
  }, []);

  const handleCreateProduct = useCallback((lineId: string, rawName: string) => {
    setEditingLineId(lineId);
    setNewProductName(rawName);
    setShowNewProductDialog(true);
  }, []);

  // ============================================================================
  // CREAR PRODUCTO
  // ============================================================================

  const handleCreateNewProduct = async () => {
    if (!newProductName.trim()) {
      toast.error("Ingrese un nombre para el producto");
      return;
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      toast.error("Sesión no válida");
      return;
    }
    
    const { data: profile } = await supabase
      .from("profiles")
      .select("venue_id")
      .eq("id", session.user.id)
      .single();
    
    if (!profile?.venue_id) {
      toast.error("Venue no disponible");
      return;
    }

    setCreatingProduct(true);
    try {
      const { data: codeData } = await supabase.rpc("generate_product_code");
      const code = newProductCode.trim() || codeData;

      const { data: newProduct, error } = await supabase
        .from("products")
        .insert({
          name: newProductName.trim(),
          code: code,
          category: newProductCategory as "ml" | "gramos" | "unidades",
          unit: newProductCategory === "ml" ? "ml" : newProductCategory === "gramos" ? "g" : "un",
          current_stock: 0,
          minimum_stock: 0,
          cost_per_unit: 0,
          venue_id: profile.venue_id,
        })
        .select()
        .single();

      if (error) throw error;

      if (newProduct) {
        setProducts(prev => [...prev, newProduct as Product]);

        if (editingLineId) {
          handleUpdateLine(editingLineId, { 
            matched_product_id: newProduct.id,
            matched_product_name: newProduct.name,
            match_confidence: 1.0,
          });
        }
      }

      toast.success("Producto creado correctamente");
      setShowNewProductDialog(false);
      setNewProductName("");
      setNewProductCode("");
      setNewProductCategory("unidades");
      setEditingLineId(null);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Error al crear el producto";
      toast.error(errorMessage);
    } finally {
      setCreatingProduct(false);
    }
  };

  // ============================================================================
  // CONFIRMACIÓN
  // ============================================================================

  const validation = useMemo(() => validateForConfirmation(computedLines), [computedLines]);

  const inventoryLines = useMemo(() => 
    computedLines.filter(l => l.status === "OK" && l.matched_product_id), 
    [computedLines]
  );
  
  const expenseLines = useMemo(() => 
    computedLines.filter(l => l.status === "EXPENSE"), 
    [computedLines]
  );

  const canConfirm = validation.canConfirm && (inventoryLines.length > 0 || (expenseLines.length > 0 && registerExpenses));

  const handleConfirm = async () => {
    if (!documentId || !canConfirm) return;

    setConfirming(true);
    try {
      // Handle inventory items
      if (inventoryLines.length > 0) {
        const itemsPayload = inventoryLines.map((line) => ({
          item_id: line.id,
          product_id: line.matched_product_id,
          quantity: line.real_units,
          unit_cost: line.net_unit_cost,
          raw_name: line.raw_product_name,
          conversion_factor: line.pack_multiplier,
        }));

        const { data, error } = await supabase.rpc("confirm_purchase_intake", {
          p_purchase_document_id: documentId,
          p_items: itemsPayload,
        });

        if (error) throw error;

        const result = data as { success: boolean; error?: string };
        if (!result.success) {
          throw new Error(result.error || "Error desconocido");
        }
      }

      // Handle expense items
      if (expenseLines.length > 0 && registerExpenses) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Usuario no autenticado");

        const { data: profile } = await supabase
          .from("profiles")
          .select("venue_id")
          .eq("id", user.id)
          .single();

        const { data: jornadaId } = await supabase.rpc("get_active_jornada");

        const expenseRecords = expenseLines.map((line) => ({
          description: line.raw_product_name,
          amount: line.gross_line,
          expense_type: "operational",
          category: "Transporte",
          notes: `Importado desde factura: ${providerName} - ${documentNumber}`,
          created_by: user.id,
          jornada_id: jornadaId || null,
          venue_id: profile?.venue_id || null,
          source_type: "purchase_invoice",
          source_id: documentId,
        }));

        const { error: expenseError } = await supabase
          .from("expenses")
          .insert(expenseRecords);

        if (expenseError) throw expenseError;
      }

      await logAuditEvent({
        action: "invoice_import_confirm",
        status: "success",
        metadata: {
          document_id: documentId,
          provider: providerName,
          inventory_items: inventoryLines.length,
          expense_items: expenseLines.length,
        },
      });

      toast.success(`Ingreso confirmado: ${inventoryLines.length} productos, ${registerExpenses ? expenseLines.length : 0} gastos`);
      setStep("complete");
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Error al confirmar";
      toast.error(errorMessage);
    } finally {
      setConfirming(false);
    }
  };

  const resetForm = () => {
    setStep("upload");
    setDocumentId(null);
    setProviderName("");
    setProviderRut("");
    setDocumentNumber("");
    setDocumentDate("");
    setNetAmount(0);
    setIvaAmount(0);
    setTotalAmountGross(0);
    setVenueId(null);
    setComputedLines([]);
    setRawExtraction(null);
    setRegisterExpenses(false);
  };

  // ============================================================================
  // HELPERS
  // ============================================================================

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(",")[1]);
      };
      reader.onerror = reject;
    });
  };

  const getFileType = (mimeType: string): string => {
    if (mimeType.includes("pdf")) return "pdf";
    if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "jpeg";
    if (mimeType.includes("png")) return "png";
    if (mimeType.includes("xml")) return "xml";
    return "unknown";
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="flex h-14 items-center gap-4 border-b bg-card px-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/admin")}
          className="gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver
        </Button>
        <div className="flex-1">
          <h1 className="text-lg font-semibold">Importar Factura de Compra</h1>
          <span className="text-xs text-muted-foreground">Modo Estabilizado</span>
        </div>
      </header>

      <main className="p-6 max-w-5xl mx-auto space-y-6">
        {/* No Access */}
        {step === "no-access" && (
          <Card className="border-muted">
            <CardContent className="py-12 text-center">
              <Lock className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h2 className="text-2xl font-bold mb-2">Función desactivada</h2>
              <p className="text-muted-foreground mb-6">
                El Lector de Facturas no está habilitado para este local.
              </p>
              <Button variant="outline" onClick={() => navigate("/admin")}>
                Volver al panel
              </Button>
            </CardContent>
          </Card>
        )}

        {/* No Warehouse */}
        {step === "no-warehouse" && (
          <Card className="border-amber-500/30">
            <CardContent className="py-12 text-center">
              <Warehouse className="h-12 w-12 mx-auto text-amber-600 mb-4" />
              <h2 className="text-2xl font-bold mb-2">Bodega no configurada</h2>
              <p className="text-muted-foreground mb-6">
                Debe tener una bodega configurada antes de importar stock.
              </p>
              <Button variant="outline" onClick={() => navigate("/admin")}>
                Volver al panel
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Loading */}
        {checkingWarehouse && step !== "no-warehouse" && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}

        {/* Step Indicator */}
        {!checkingWarehouse && step !== "no-warehouse" && step !== "no-access" && (
          <div className="flex items-center justify-center gap-2">
            {[
              { key: "upload", label: "Subir" },
              { key: "review", label: "Revisar" },
              { key: "complete", label: "Listo" },
            ].map((s, i) => (
              <div key={s.key} className="flex items-center gap-2">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                    step === s.key || (step === "processing" && s.key === "upload")
                      ? "bg-primary text-primary-foreground"
                      : step === "complete" || (step === "review" && s.key === "upload")
                      ? "bg-primary/20 text-primary"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {(step === "complete" && s.key !== "complete") || 
                   (step === "review" && s.key === "upload") ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    i + 1
                  )}
                </div>
                <span className="text-sm hidden sm:inline">{s.label}</span>
                {i < 2 && <div className="w-8 h-px bg-border" />}
              </div>
            ))}
          </div>
        )}

        {/* Upload Step */}
        {(step === "upload" || step === "processing") && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5" />
                Subir documento
              </CardTitle>
            </CardHeader>
            <CardContent>
              {step === "processing" ? (
                <div className="flex flex-col items-center justify-center py-12 gap-4">
                  <Loader2 className="h-12 w-12 animate-spin text-primary" />
                  <p className="text-muted-foreground">
                    {uploading ? "Subiendo archivo..." : "Procesando documento..."}
                  </p>
                </div>
              ) : (
                <div className="border-2 border-dashed rounded-lg p-8 text-center">
                  <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground mb-2">
                    Arrastra un archivo o haz clic para seleccionar
                  </p>
                  <p className="text-sm text-muted-foreground mb-4">
                    PDF, JPG, PNG o XML (máximo 20MB)
                  </p>
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.xml"
                    onChange={handleFileUpload}
                    className="hidden"
                    id="invoice-upload"
                  />
                  <label htmlFor="invoice-upload">
                    <Button asChild>
                      <span>Seleccionar archivo</span>
                    </Button>
                  </label>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Review Step */}
        {step === "review" && (
          <div className="space-y-4">
            {/* Document Header */}
            <Card>
              <CardHeader className="py-4">
                <CardTitle className="text-base">Datos del Documento</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <Label className="text-xs">Proveedor</Label>
                    <Input
                      value={providerName}
                      onChange={(e) => setProviderName(e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">RUT</Label>
                    <Input
                      value={providerRut}
                      onChange={(e) => setProviderRut(e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">N° Documento</Label>
                    <Input
                      value={documentNumber}
                      onChange={(e) => setDocumentNumber(e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Fecha</Label>
                    <Input
                      type="date"
                      value={documentDate}
                      onChange={(e) => setDocumentDate(e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
                
                <Separator />
                
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label className="text-xs">Neto</Label>
                    <Input
                      type="number"
                      value={netAmount}
                      onChange={(e) => setNetAmount(parseFloat(e.target.value) || 0)}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">IVA</Label>
                    <Input
                      type="number"
                      value={ivaAmount}
                      onChange={(e) => setIvaAmount(parseFloat(e.target.value) || 0)}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Total</Label>
                    <Input
                      type="number"
                      value={totalAmountGross}
                      onChange={(e) => setTotalAmountGross(parseFloat(e.target.value) || 0)}
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Products Table - MINIMAL */}
            <Card>
              <CardHeader className="py-4">
                <CardTitle className="flex items-center justify-between text-base">
                  <span className="flex items-center gap-2">
                    <Package className="h-4 w-4" />
                    Productos ({computedLines.length})
                  </span>
                  <div className="flex items-center gap-2">
                    <Search className="h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-36 h-8 text-sm"
                    />
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <MinimalReviewTable
                  lines={computedLines}
                  products={products}
                  searchQuery={searchQuery}
                  onUpdateLine={handleUpdateLine}
                  onMarkAsExpense={handleMarkAsExpense}
                  onMarkAsInventory={handleMarkAsInventory}
                  onOpenDetail={handleOpenDetail}
                  onCreateProduct={handleCreateProduct}
                />
              </CardContent>
            </Card>

            {/* Diagnostic Panel (Admin/Dev) */}
            {isAdmin && (
              <DiagnosticPanel
                rawExtraction={rawExtraction}
                computedLines={computedLines}
              />
            )}

            {/* Checklist & Confirmation */}
            <div className="grid md:grid-cols-2 gap-4">
              <StabilizedChecklist
                lines={computedLines}
                hasVenueId={!!venueId}
                isAdmin={isAdmin}
              />

              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm">Resumen</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <span className="text-muted-foreground">Productos a inventario:</span>
                    <span className="text-right font-medium">{inventoryLines.length}</span>
                    <span className="text-muted-foreground">Unidades totales:</span>
                    <span className="text-right font-medium">
                      {inventoryLines.reduce((s, l) => s + l.real_units, 0)}
                    </span>
                    <span className="text-muted-foreground">Monto inventario:</span>
                    <span className="text-right font-medium">
                      {formatCLP(inventoryLines.reduce((s, l) => s + l.net_line_for_cost, 0))}
                    </span>
                  </div>

                  {expenseLines.length > 0 && (
                    <>
                      <Separator />
                      <div className="flex items-center justify-between">
                        <Label htmlFor="register-expenses" className="text-sm">
                          Registrar gastos ({expenseLines.length})
                        </Label>
                        <Switch
                          id="register-expenses"
                          checked={registerExpenses}
                          onCheckedChange={setRegisterExpenses}
                        />
                      </div>
                      {registerExpenses && (
                        <div className="text-sm text-amber-700">
                          Monto: {formatCLP(expenseLines.reduce((s, l) => s + l.gross_line, 0))}
                        </div>
                      )}
                    </>
                  )}

                  <Button
                    className="w-full"
                    onClick={handleConfirm}
                    disabled={!canConfirm || confirming}
                  >
                    {confirming ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Check className="h-4 w-4 mr-2" />
                    )}
                    Confirmar Ingreso
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* Complete Step */}
        {step === "complete" && (
          <Card>
            <CardContent className="py-12 text-center">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                <Check className="h-8 w-8 text-green-600" />
              </div>
              <h2 className="text-2xl font-bold mb-2">¡Ingreso completado!</h2>
              <p className="text-muted-foreground mb-6">
                Los productos han sido agregados al inventario.
              </p>
              <div className="flex justify-center gap-4">
                <Button variant="outline" onClick={() => navigate("/admin")}>
                  Ir al panel
                </Button>
                <Button onClick={resetForm}>
                  Importar otro documento
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </main>

      {/* Detail Drawer */}
      <LineDetailDrawer
        open={showDetailDrawer}
        onOpenChange={setShowDetailDrawer}
        line={selectedLineForDetail}
      />

      {/* New Product Dialog */}
      <Dialog open={showNewProductDialog} onOpenChange={setShowNewProductDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Crear nuevo producto</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nombre</Label>
              <Input
                value={newProductName}
                onChange={(e) => setNewProductName(e.target.value)}
              />
            </div>
            <div>
              <Label>Código (opcional)</Label>
              <Input
                value={newProductCode}
                onChange={(e) => setNewProductCode(e.target.value)}
                placeholder="Auto-generado si vacío"
              />
            </div>
            <div>
              <Label>Categoría</Label>
              <Select value={newProductCategory} onValueChange={setNewProductCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unidades">Unidades</SelectItem>
                  <SelectItem value="ml">Mililitros (ml)</SelectItem>
                  <SelectItem value="gramos">Gramos (g)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewProductDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreateNewProduct} disabled={creatingProduct}>
              {creatingProduct && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Crear producto
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
