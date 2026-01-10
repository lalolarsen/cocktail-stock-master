import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { formatCLP } from "@/lib/currency";
import {
  ArrowLeft,
  Upload,
  FileText,
  Loader2,
  Check,
  X,
  AlertCircle,
  Package,
  Plus,
  Search,
  Warehouse,
  Receipt,
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface Product {
  id: string;
  name: string;
  code: string;
  category: string;
  unit: string;
  current_stock: number;
}

interface PurchaseItem {
  id: string;
  raw_product_name: string;
  extracted_quantity: number | null;
  extracted_unit_price: number | null;
  extracted_total: number | null;
  matched_product_id: string | null;
  match_confidence: number;
  match_source?: "provider" | "generic" | "fuzzy";
  confirmed_quantity: number | null;
  confirmed_unit_price: number | null;
  is_confirmed: boolean;
}

interface EditableItem extends PurchaseItem {
  selected_product_id: string | null;
  quantity: number;
  unit_price: number;
  match_source?: "provider" | "generic" | "fuzzy";
  // Expense classification
  classification: "inventory" | "expense";
  expense_category?: string;
  expense_subcategory?: string;
  expense_notes?: string;
  expense_amount?: number;
}

type ExpenseCategory = "operational" | "non-operational";

const EXPENSE_SUBCATEGORIES: Record<ExpenseCategory, string[]> = {
  operational: ["Insumos", "Limpieza", "Descartables", "Servicios", "Mantenimiento", "Otros operacional"],
  "non-operational": ["Administrativo", "Marketing", "Transporte", "Otros no-operacional"],
};

type Step = "upload" | "processing" | "review" | "confirm" | "complete" | "no-warehouse";

export default function PurchasesImport() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("upload");
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [checkingWarehouse, setCheckingWarehouse] = useState(true);

  // Document data
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [providerName, setProviderName] = useState<string>("");
  const [providerRut, setProviderRut] = useState<string>("");
  const [documentNumber, setDocumentNumber] = useState<string>("");
  const [documentDate, setDocumentDate] = useState<string>("");

  // Items
  const [items, setItems] = useState<EditableItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  // New product dialog
  const [showNewProductDialog, setShowNewProductDialog] = useState(false);
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null);
  const [newProductName, setNewProductName] = useState("");
  const [newProductCode, setNewProductCode] = useState("");
  const [newProductCategory, setNewProductCategory] = useState<string>("unidades");
  const [creatingProduct, setCreatingProduct] = useState(false);

  // Product search
  const [searchQuery, setSearchQuery] = useState("");

  // Expense registration
  const [registerExpenses, setRegisterExpenses] = useState(false);
  const [expenseMode, setExpenseMode] = useState<"all_inventory" | "partial_expense">("all_inventory");

  useEffect(() => {
    checkWarehouseAndFetchProducts();
  }, []);

  const checkWarehouseAndFetchProducts = async () => {
    try {
      // Check if warehouse exists
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

      // Fetch products
      const { data: productsData } = await supabase
        .from("products")
        .select("id, name, code, category, unit, current_stock")
        .order("name");
      setProducts((productsData as Product[]) || []);
      setCheckingWarehouse(false);
    } catch (error) {
      // No warehouse found
      setStep("no-warehouse");
      setCheckingWarehouse(false);
    }
  };

  const fetchProducts = async () => {
    const { data } = await supabase
      .from("products")
      .select("id, name, code, category, unit, current_stock")
      .order("name");
    setProducts((data as Product[]) || []);
  };

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
      // Convert file to base64
      const base64 = await fileToBase64(file);
      const fileType = getFileType(file.type);

      // Upload file to storage
      const filePath = `invoices/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("purchase-documents")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Create purchase document record
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

      // Call parsing function
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

      // Fetch the updated document and items
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
      }

      // Convert to editable items
      const editableItems: EditableItem[] = (purchaseItems || []).map((item) => ({
        ...item,
        selected_product_id: item.matched_product_id,
        quantity: item.extracted_quantity || 0,
        unit_price: item.extracted_unit_price || 0,
        classification: "inventory" as const,
        expense_amount: (item.extracted_quantity || 0) * (item.extracted_unit_price || 0),
      }));

      setItems(editableItems);
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

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(",")[1];
        resolve(base64);
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

  const updateItem = (index: number, updates: Partial<EditableItem>) => {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, ...updates } : item))
    );
  };

  const getMatchBadge = (confidence: number, matchSource?: string) => {
    if (confidence >= 0.9) {
      return (
        <div className="flex flex-col gap-0.5">
          <Badge className="bg-green-500/20 text-green-700 border-green-500/30">Alta</Badge>
          {matchSource === "provider" && (
            <span className="text-[10px] text-muted-foreground">Aprendido</span>
          )}
        </div>
      );
    } else if (confidence >= 0.7) {
      return (
        <div className="flex flex-col gap-0.5">
          <Badge className="bg-green-500/20 text-green-700 border-green-500/30">Alta</Badge>
          {matchSource === "generic" && (
            <span className="text-[10px] text-muted-foreground">Aprendido</span>
          )}
        </div>
      );
    } else if (confidence >= 0.5) {
      return <Badge className="bg-yellow-500/20 text-yellow-700 border-yellow-500/30">Media</Badge>;
    } else if (confidence > 0) {
      return <Badge className="bg-orange-500/20 text-orange-700 border-orange-500/30">Baja</Badge>;
    }
    return <Badge variant="outline">Sin match</Badge>;
  };

  const handleCreateProduct = async () => {
    if (!newProductName.trim()) {
      toast.error("Ingrese un nombre para el producto");
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
        })
        .select()
        .single();

      if (error) throw error;

      // Add to products list
      if (newProduct) {
        setProducts((prev) => [...prev, newProduct as Product]);

        // Update the item being edited
        if (editingItemIndex !== null) {
          updateItem(editingItemIndex, { selected_product_id: newProduct.id });
        }
      }

      toast.success("Producto creado correctamente");
      setShowNewProductDialog(false);
      setNewProductName("");
      setNewProductCode("");
      setNewProductCategory("unidades");
      setEditingItemIndex(null);
    } catch (error: unknown) {
      console.error("Error creating product:", error);
      const errorMessage = error instanceof Error ? error.message : "Error al crear el producto";
      toast.error(errorMessage);
    } finally {
      setCreatingProduct(false);
    }
  };

  const openNewProductDialog = (index: number) => {
    setEditingItemIndex(index);
    setNewProductName(items[index].raw_product_name);
    setShowNewProductDialog(true);
  };

  const filteredProducts = products.filter(
    (p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Calculate totals
  const inventoryItems = items.filter(
    (item) => item.classification === "inventory" && item.selected_product_id && item.quantity > 0
  );
  const expenseItems = items.filter(
    (item) => item.classification === "expense" && item.expense_category && (item.expense_amount || 0) > 0
  );
  
  const totalInventoryItems = inventoryItems.length;
  const totalQuantity = inventoryItems.reduce((sum, item) => sum + item.quantity, 0);
  const totalInventoryAmount = inventoryItems.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
  const totalExpenseAmount = expenseItems.reduce((sum, item) => sum + (item.expense_amount || 0), 0);
  const totalAmount = totalInventoryAmount + totalExpenseAmount;

  const canConfirm = inventoryItems.length > 0 || expenseItems.length > 0;

  const handleConfirm = async () => {
    if (!documentId || !canConfirm) return;

    setConfirming(true);
    try {
      // Handle inventory items
      if (inventoryItems.length > 0) {
        const itemsPayload = inventoryItems.map((item) => ({
          item_id: item.id,
          product_id: item.selected_product_id,
          quantity: item.quantity,
          unit_cost: item.unit_price,
          raw_name: item.raw_product_name,
        }));

        const { data, error } = await supabase.rpc("confirm_purchase_intake", {
          p_purchase_document_id: documentId,
          p_items: itemsPayload,
        });

        if (error) throw error;

        const result = data as { success: boolean; error?: string; total_items?: number; total_quantity?: number; total_amount?: number };
        if (!result.success) {
          throw new Error(result.error || "Error desconocido");
        }
      }

      // Handle expense items
      if (expenseItems.length > 0 && registerExpenses) {
        // Get current user and venue
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Usuario no autenticado");

        const { data: profile } = await supabase
          .from("profiles")
          .select("venue_id")
          .eq("id", user.id)
          .single();

        // Get active jornada if exists
        const { data: jornadaId } = await supabase.rpc("get_active_jornada");

        // Create expense records
        const expenseRecords = expenseItems.map((item) => ({
          description: item.raw_product_name,
          amount: item.expense_amount || 0,
          expense_type: item.expense_category === "operational" ? "operational" : "non-operational",
          category: item.expense_subcategory || "Otros",
          notes: item.expense_notes || `Importado desde factura: ${providerName} - ${documentNumber}`,
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

      const inventoryMsg = inventoryItems.length > 0 
        ? `${inventoryItems.length} productos a inventario` 
        : "";
      const expenseMsg = expenseItems.length > 0 && registerExpenses
        ? `${expenseItems.length} gastos registrados` 
        : "";
      const messages = [inventoryMsg, expenseMsg].filter(Boolean).join(", ");
      
      toast.success(`Ingreso confirmado: ${messages}`);
      setStep("complete");
    } catch (error: unknown) {
      console.error("Error confirming intake:", error);
      const errorMessage = error instanceof Error ? error.message : "Error al confirmar el ingreso";
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
    setItems([]);
    setRegisterExpenses(false);
    setExpenseMode("all_inventory");
  };

  const updateItemClassification = (index: number, classification: "inventory" | "expense") => {
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;
        return {
          ...item,
          classification,
          expense_amount: item.quantity * item.unit_price,
        };
      })
    );
  };

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
        </div>
      </header>

      <main className="p-6 max-w-5xl mx-auto space-y-6">
        {/* No Warehouse Warning */}
        {step === "no-warehouse" && (
          <Card className="border-amber-500/30">
            <CardContent className="py-12 text-center">
              <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
                <Warehouse className="h-8 w-8 text-amber-600" />
              </div>
              <h2 className="text-2xl font-bold mb-2">Bodega no configurada</h2>
              <p className="text-muted-foreground mb-6">
                Debes tener una bodega configurada antes de importar stock desde facturas.
              </p>
              <div className="flex justify-center gap-4">
                <Button variant="outline" onClick={() => navigate("/admin")}>
                  Volver al panel
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Loading check */}
        {checkingWarehouse && step !== "no-warehouse" && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}

        {/* Step indicator - only show when not blocked */}
        {!checkingWarehouse && step !== "no-warehouse" && (
          <div className="flex items-center justify-center gap-2">
            {[
              { key: "upload", label: "Subir" },
              { key: "review", label: "Revisar" },
              { key: "confirm", label: "Confirmar" },
            ].map((s, i) => (
              <div key={s.key} className="flex items-center gap-2">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                    step === s.key || (step === "processing" && s.key === "upload")
                      ? "bg-primary text-primary-foreground"
                      : step === "complete" || 
                        (step === "review" && s.key === "upload") ||
                        (step === "confirm" && (s.key === "upload" || s.key === "review"))
                      ? "bg-primary/20 text-primary"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {step === "complete" || 
                   (step === "review" && s.key === "upload") ||
                   (step === "confirm" && (s.key === "upload" || s.key === "review")) ? (
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
                    {uploading ? "Subiendo archivo..." : "Procesando documento con IA..."}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Esto puede tomar unos segundos
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="border-2 border-dashed rounded-lg p-8 text-center">
                    <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground mb-2">
                      Arrastra un archivo o haz clic para seleccionar
                    </p>
                    <p className="text-sm text-muted-foreground mb-4">
                      PDF, JPG, PNG o XML (máximo 20MB)
                    </p>
                    <Input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,.xml"
                      onChange={handleFileUpload}
                      className="max-w-xs mx-auto"
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Review Step */}
        {step === "review" && (
          <>
            {/* Document Info */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Datos del documento
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <Label>Proveedor</Label>
                    <Input
                      value={providerName}
                      onChange={(e) => setProviderName(e.target.value)}
                      placeholder="Nombre del proveedor"
                    />
                  </div>
                  <div>
                    <Label>RUT</Label>
                    <Input
                      value={providerRut}
                      onChange={(e) => setProviderRut(e.target.value)}
                      placeholder="XX.XXX.XXX-X"
                    />
                  </div>
                  <div>
                    <Label>N° Documento</Label>
                    <Input
                      value={documentNumber}
                      onChange={(e) => setDocumentNumber(e.target.value)}
                      placeholder="Número"
                    />
                  </div>
                  <div>
                    <Label>Fecha</Label>
                    <Input
                      type="date"
                      value={documentDate}
                      onChange={(e) => setDocumentDate(e.target.value)}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Items */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Package className="h-5 w-5" />
                    Productos ({items.length})
                  </span>
                  <div className="flex items-center gap-2">
                    <Search className="h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar producto..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-48"
                    />
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[250px]">Nombre en factura</TableHead>
                      <TableHead>Match</TableHead>
                      <TableHead className="w-[200px]">Producto</TableHead>
                      <TableHead className="w-[100px]">Cantidad</TableHead>
                      <TableHead className="w-[120px]">Precio Unit.</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      {registerExpenses && expenseMode === "partial_expense" && (
                        <TableHead className="w-[120px]">Clasificación</TableHead>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item, index) => (
                      <TableRow 
                        key={item.id}
                        className={item.classification === "expense" ? "bg-amber-50/50" : ""}
                      >
                        <TableCell className="font-medium text-sm">
                          {item.raw_product_name}
                        </TableCell>
                        <TableCell>
                          {item.classification === "expense" ? (
                            <Badge className="bg-amber-500/20 text-amber-700 border-amber-500/30">
                              Gasto
                            </Badge>
                          ) : (
                            getMatchBadge(item.match_confidence, item.match_source)
                          )}
                        </TableCell>
                        <TableCell>
                          {item.classification === "inventory" ? (
                            <div className="flex gap-1">
                              <Select
                                value={item.selected_product_id || ""}
                                onValueChange={(value) =>
                                  updateItem(index, { selected_product_id: value || null })
                                }
                              >
                                <SelectTrigger className="w-[180px]">
                                  <SelectValue placeholder="Seleccionar..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {filteredProducts.map((p) => (
                                    <SelectItem key={p.id} value={p.id}>
                                      {p.name} ({p.code})
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => openNewProductDialog(index)}
                                title="Crear nuevo producto"
                              >
                                <Plus className="h-4 w-4" />
                              </Button>
                            </div>
                          ) : (
                            <Select
                              value={item.expense_category || ""}
                              onValueChange={(value) =>
                                updateItem(index, { 
                                  expense_category: value as ExpenseCategory,
                                  expense_subcategory: undefined 
                                })
                              }
                            >
                              <SelectTrigger className="w-[180px]">
                                <SelectValue placeholder="Tipo de gasto..." />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="operational">Operacional</SelectItem>
                                <SelectItem value="non-operational">No operacional</SelectItem>
                              </SelectContent>
                            </Select>
                          )}
                        </TableCell>
                        <TableCell>
                          {item.classification === "inventory" ? (
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.quantity}
                              onChange={(e) =>
                                updateItem(index, { quantity: parseFloat(e.target.value) || 0 })
                              }
                              className="w-20"
                            />
                          ) : (
                            item.expense_category && (
                              <Select
                                value={item.expense_subcategory || ""}
                                onValueChange={(value) =>
                                  updateItem(index, { expense_subcategory: value })
                                }
                              >
                                <SelectTrigger className="w-[130px]">
                                  <SelectValue placeholder="Subcategoría..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {EXPENSE_SUBCATEGORIES[item.expense_category as ExpenseCategory]?.map((sub) => (
                                    <SelectItem key={sub} value={sub}>
                                      {sub}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )
                          )}
                        </TableCell>
                        <TableCell>
                          {item.classification === "inventory" ? (
                            <Input
                              type="number"
                              min="0"
                              step="1"
                              value={item.unit_price}
                              onChange={(e) =>
                                updateItem(index, { unit_price: parseFloat(e.target.value) || 0 })
                              }
                              className="w-24"
                            />
                          ) : (
                            <Input
                              type="number"
                              min="0"
                              step="1"
                              value={item.expense_amount || 0}
                              onChange={(e) =>
                                updateItem(index, { expense_amount: parseFloat(e.target.value) || 0 })
                              }
                              className="w-24"
                            />
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {item.classification === "inventory" 
                            ? formatCLP(item.quantity * item.unit_price)
                            : formatCLP(item.expense_amount || 0)
                          }
                        </TableCell>
                        {registerExpenses && expenseMode === "partial_expense" && (
                          <TableCell>
                            <Select
                              value={item.classification}
                              onValueChange={(value) =>
                                updateItemClassification(index, value as "inventory" | "expense")
                              }
                            >
                              <SelectTrigger className="w-[110px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="inventory">Inventario</SelectItem>
                                <SelectItem value="expense">Gasto</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {items.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    No se encontraron productos en el documento
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Expense Registration Toggle */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Receipt className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <CardTitle className="text-base">Registrar parte como GASTO</CardTitle>
                      <CardDescription className="text-sm">
                        Opcionalmente registre ítems como gastos operacionales (ej: hielo, vasos, limpieza)
                      </CardDescription>
                    </div>
                  </div>
                  <Switch
                    checked={registerExpenses}
                    onCheckedChange={setRegisterExpenses}
                  />
                </div>
              </CardHeader>
              {registerExpenses && (
                <CardContent className="pt-0">
                  <div className="space-y-4">
                    <div className="flex gap-4">
                      <Button
                        variant={expenseMode === "all_inventory" ? "default" : "outline"}
                        size="sm"
                        onClick={() => {
                          setExpenseMode("all_inventory");
                          // Reset all to inventory
                          setItems(prev => prev.map(item => ({ ...item, classification: "inventory" as const })));
                        }}
                      >
                        Todo es inventario
                      </Button>
                      <Button
                        variant={expenseMode === "partial_expense" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setExpenseMode("partial_expense")}
                      >
                        Parte es gasto
                      </Button>
                    </div>
                    
                    {expenseMode === "partial_expense" && (
                      <p className="text-sm text-muted-foreground">
                        Use la columna "Clasificación" en la tabla para marcar ítems como gasto.
                      </p>
                    )}
                  </div>
                </CardContent>
              )}
            </Card>

            {/* Summary & Confirm */}
            <Card className="border-primary/30">
              <CardContent className="p-6">
                <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
                    <div>
                      <p className="text-2xl font-bold text-primary">{totalInventoryItems}</p>
                      <p className="text-sm text-muted-foreground">Productos</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{totalQuantity.toFixed(2)}</p>
                      <p className="text-sm text-muted-foreground">Unidades</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{formatCLP(totalInventoryAmount)}</p>
                      <p className="text-sm text-muted-foreground">Inventario</p>
                    </div>
                    {registerExpenses && expenseItems.length > 0 && (
                      <div>
                        <p className="text-2xl font-bold text-amber-600">{formatCLP(totalExpenseAmount)}</p>
                        <p className="text-sm text-muted-foreground">Gastos ({expenseItems.length})</p>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <Button variant="outline" onClick={resetForm}>
                      Cancelar
                    </Button>
                    <Button
                      onClick={handleConfirm}
                      disabled={!canConfirm || confirming}
                      className="gap-2"
                    >
                      {confirming ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="h-4 w-4" />
                      )}
                      Confirmar Ingreso
                    </Button>
                  </div>
                </div>

                {!canConfirm && items.length > 0 && (
                  <div className="flex items-center gap-2 mt-4 text-sm text-amber-600">
                    <AlertCircle className="h-4 w-4" />
                    Debe asignar al menos un producto o gasto válido
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}

        {/* Complete Step */}
        {step === "complete" && (
          <Card>
            <CardContent className="py-12 text-center">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                <Check className="h-8 w-8 text-green-600" />
              </div>
              <h2 className="text-2xl font-bold mb-2">¡Ingreso confirmado!</h2>
              <p className="text-muted-foreground mb-6">
                El stock ha sido actualizado correctamente en bodega.
              </p>
              <div className="flex justify-center gap-4">
                <Button variant="outline" onClick={resetForm}>
                  Importar otro documento
                </Button>
                <Button onClick={() => navigate("/admin")}>
                  Volver al panel
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </main>

      {/* New Product Dialog */}
      <Dialog open={showNewProductDialog} onOpenChange={setShowNewProductDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Crear nuevo producto
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nombre del producto</Label>
              <Input
                value={newProductName}
                onChange={(e) => setNewProductName(e.target.value)}
                placeholder="Ej: Vodka Absolut 750ml"
              />
            </div>
            <div className="space-y-2">
              <Label>Código (opcional)</Label>
              <Input
                value={newProductCode}
                onChange={(e) => setNewProductCode(e.target.value)}
                placeholder="Se generará automáticamente si está vacío"
              />
            </div>
            <div className="space-y-2">
              <Label>Categoría</Label>
              <Select value={newProductCategory} onValueChange={setNewProductCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ml">Mililitros (ml)</SelectItem>
                  <SelectItem value="gramos">Gramos (g)</SelectItem>
                  <SelectItem value="unidades">Unidades</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewProductDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreateProduct} disabled={creatingProduct}>
              {creatingProduct ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              Crear producto
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
