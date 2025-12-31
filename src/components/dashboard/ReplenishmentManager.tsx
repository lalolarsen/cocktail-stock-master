import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { ArrowRight, Package, Upload, Plus, Trash2, FileSpreadsheet, History, Check, AlertCircle } from "lucide-react";
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import * as XLSX from "xlsx";

interface StockLocation {
  id: string;
  name: string;
  is_active?: boolean;
  type: "warehouse" | "bar";
}

interface Product {
  id: string;
  name: string;
  code: string;
  category: string;
  unit: string;
}

interface TransferItem {
  product_id: string;
  quantity: number;
  product?: Product;
}

interface StockBalance {
  product_id: string;
  location_id: string;
  quantity: number;
}

interface TransferHistory {
  id: string;
  from_location: { name: string };
  to_location: { name: string };
  transferred_by: string;
  created_at: string;
  notes: string | null;
  items: Array<{ product: { name: string }; quantity: number }>;
}

interface ImportRow {
  bar_name: string;
  product_code?: string;
  product_name?: string;
  quantity: number;
  valid: boolean;
  error?: string;
  product_id?: string;
  bar_id?: string;
}

export function ReplenishmentManager() {
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [balances, setBalances] = useState<StockBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  
  const [selectedBarId, setSelectedBarId] = useState<string>("");
  const [transferItems, setTransferItems] = useState<TransferItem[]>([]);
  const [notes, setNotes] = useState("");
  
  const [history, setHistory] = useState<TransferHistory[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  
  // Import state
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importData, setImportData] = useState<ImportRow[]>([]);
  const [importFile, setImportFile] = useState<File | null>(null);
  
  const warehouseId = locations.find(l => l.type === "warehouse")?.id;
  const barLocations = locations.filter(l => l.type === "bar" && l.is_active !== false);

  useEffect(() => {
    fetchData();
    fetchHistory();
  }, []);

  const fetchData = async () => {
    try {
      const [locResult, prodResult, balResult] = await Promise.all([
        supabase.from("stock_locations").select("*").order("type", { ascending: false }).order("name"),
        supabase.from("products").select("*").order("name"),
        supabase.from("stock_balances").select("*")
      ]);
      
      if (locResult.error) throw locResult.error;
      if (prodResult.error) throw prodResult.error;
      if (balResult.error) throw balResult.error;
      
      setLocations(locResult.data as StockLocation[] || []);
      setProducts(prodResult.data || []);
      setBalances(balResult.data || []);
    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error("Error al cargar datos");
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async () => {
    setLoadingHistory(true);
    try {
      const { data, error } = await supabase
        .from("stock_transfers")
        .select(`
          id,
          notes,
          created_at,
          transferred_by,
          from_location:stock_locations!stock_transfers_from_location_id_fkey(name),
          to_location:stock_locations!stock_transfers_to_location_id_fkey(name),
          items:stock_transfer_items(quantity, product:products(name))
        `)
        .order("created_at", { ascending: false })
        .limit(20);
      
      if (error) throw error;
      setHistory(data as unknown as TransferHistory[] || []);
    } catch (error) {
      console.error("Error fetching history:", error);
    } finally {
      setLoadingHistory(false);
    }
  };

  const getWarehouseBalance = (productId: string): number => {
    if (!warehouseId) return 0;
    const balance = balances.find(b => b.product_id === productId && b.location_id === warehouseId);
    return balance?.quantity || 0;
  };

  const addItem = () => {
    setTransferItems([...transferItems, { product_id: "", quantity: 0 }]);
  };

  const removeItem = (index: number) => {
    setTransferItems(transferItems.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: "product_id" | "quantity", value: string | number) => {
    const updated = [...transferItems];
    if (field === "product_id") {
      updated[index].product_id = value as string;
      updated[index].product = products.find(p => p.id === value);
    } else {
      updated[index].quantity = Number(value);
    }
    setTransferItems(updated);
  };

  const handleSubmitTransfer = async () => {
    if (!warehouseId || !selectedBarId) {
      toast.error("Selecciona una barra destino");
      return;
    }
    
    const validItems = transferItems.filter(item => item.product_id && item.quantity > 0);
    if (validItems.length === 0) {
      toast.error("Agrega al menos un producto");
      return;
    }
    
    // Validate stock availability
    for (const item of validItems) {
      const available = getWarehouseBalance(item.product_id);
      if (item.quantity > available) {
        const product = products.find(p => p.id === item.product_id);
        toast.error(`Stock insuficiente para ${product?.name}: disponible ${available}`);
        return;
      }
    }
    
    setSubmitting(true);
    try {
      const { data, error } = await supabase.rpc("transfer_stock", {
        p_from_location_id: warehouseId,
        p_to_location_id: selectedBarId,
        p_items: validItems.map(item => ({ product_id: item.product_id, quantity: item.quantity })),
        p_notes: notes || null
      });
      
      if (error) throw error;
      
      const result = data as { success: boolean; error?: string };
      if (!result.success) {
        throw new Error(result.error || "Error al transferir stock");
      }
      
      toast.success("Transferencia completada");
      setTransferItems([]);
      setNotes("");
      fetchData();
      fetchHistory();
    } catch (error: any) {
      console.error("Transfer error:", error);
      toast.error(error.message || "Error al procesar transferencia");
    } finally {
      setSubmitting(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImportFile(file);
      parseExcelFile(file);
    }
  };

  const parseExcelFile = async (file: File) => {
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet) as Array<{
        bar_name?: string;
        barra?: string;
        product_code?: string;
        codigo?: string;
        product_name?: string;
        producto?: string;
        quantity?: number;
        cantidad?: number;
      }>;
      
      // Parse and validate rows
      const parsed: ImportRow[] = jsonData.map(row => {
        const barName = row.bar_name || row.barra || "";
        const productCode = row.product_code || row.codigo || "";
        const productName = row.product_name || row.producto || "";
        const quantity = Number(row.quantity || row.cantidad || 0);
        
        // Find bar
        const bar = barLocations.find(l => 
          l.name.toLowerCase() === barName.toLowerCase()
        );
        
        // Find product
        const product = products.find(p => 
          p.code.toLowerCase() === productCode.toLowerCase() ||
          p.name.toLowerCase() === productName.toLowerCase()
        );
        
        let valid = true;
        let error = "";
        
        if (!bar) {
          valid = false;
          error = `Barra "${barName}" no encontrada`;
        } else if (!product) {
          valid = false;
          error = `Producto "${productCode || productName}" no encontrado`;
        } else if (quantity <= 0) {
          valid = false;
          error = "Cantidad debe ser mayor a 0";
        } else {
          const available = getWarehouseBalance(product.id);
          if (quantity > available) {
            valid = false;
            error = `Stock insuficiente (disponible: ${available})`;
          }
        }
        
        return {
          bar_name: barName,
          product_code: productCode,
          product_name: productName,
          quantity,
          valid,
          error,
          product_id: product?.id,
          bar_id: bar?.id
        };
      });
      
      setImportData(parsed);
    } catch (error) {
      console.error("Error parsing file:", error);
      toast.error("Error al leer el archivo");
    }
  };

  const handleImportConfirm = async () => {
    const validRows = importData.filter(row => row.valid);
    if (validRows.length === 0) {
      toast.error("No hay filas válidas para importar");
      return;
    }
    
    // Group by bar
    const byBar = validRows.reduce((acc, row) => {
      if (!row.bar_id) return acc;
      if (!acc[row.bar_id]) acc[row.bar_id] = [];
      acc[row.bar_id].push({ product_id: row.product_id!, quantity: row.quantity });
      return acc;
    }, {} as Record<string, Array<{ product_id: string; quantity: number }>>);
    
    setSubmitting(true);
    let successCount = 0;
    let errorCount = 0;
    
    try {
      for (const [barId, items] of Object.entries(byBar)) {
        const { data, error } = await supabase.rpc("transfer_stock", {
          p_from_location_id: warehouseId!,
          p_to_location_id: barId,
          p_items: items,
          p_notes: `Importación desde ${importFile?.name}`
        });
        
        if (error) {
          console.error("Transfer error for bar:", barId, error);
          errorCount++;
        } else {
          const result = data as { success: boolean };
          if (result.success) {
            successCount++;
          } else {
            errorCount++;
          }
        }
      }
      
      if (successCount > 0) {
        toast.success(`${successCount} transferencia(s) completada(s)`);
      }
      if (errorCount > 0) {
        toast.warning(`${errorCount} transferencia(s) fallaron`);
      }
      
      setShowImportDialog(false);
      setImportData([]);
      setImportFile(null);
      fetchData();
      fetchHistory();
    } catch (error: any) {
      console.error("Import error:", error);
      toast.error(error.message || "Error al importar");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <Card className="glass-effect">
        <CardHeader>
          <CardTitle>Reposición de Stock</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="glass-effect shadow-elegant">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-2xl bg-gradient-to-r from-primary to-primary-glow bg-clip-text text-transparent">
            Reposición de Stock
          </CardTitle>
          <Button variant="outline" onClick={() => setShowImportDialog(true)} className="gap-2">
            <Upload className="w-4 h-4" />
            Importar Excel
          </Button>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="transfer" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="transfer" className="flex items-center gap-2">
                <Package className="w-4 h-4" />
                Nueva Transferencia
              </TabsTrigger>
              <TabsTrigger value="history" className="flex items-center gap-2">
                <History className="w-4 h-4" />
                Historial
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="transfer" className="space-y-6">
              {/* Transfer header */}
              <div className="glass-effect p-4 rounded-lg flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-gradient-to-br from-amber-500 to-orange-500 rounded-lg">
                    <Package className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="font-semibold">Bodega</h3>
                    <p className="text-sm text-muted-foreground">Origen</p>
                  </div>
                </div>
                
                <ArrowRight className="w-6 h-6 text-muted-foreground" />
                
                <div className="flex-1 max-w-xs">
                  <Select value={selectedBarId} onValueChange={setSelectedBarId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona barra destino" />
                    </SelectTrigger>
                    <SelectContent>
                      {barLocations.map((bar) => (
                        <SelectItem key={bar.id} value={bar.id}>{bar.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              {/* Transfer items */}
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <Label>Productos a transferir</Label>
                  <Button size="sm" variant="outline" onClick={addItem} className="gap-2">
                    <Plus className="w-4 h-4" />
                    Agregar
                  </Button>
                </div>
                
                {transferItems.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
                    <Package className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>Agrega productos para transferir</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Producto</TableHead>
                        <TableHead>Stock Bodega</TableHead>
                        <TableHead>Cantidad</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {transferItems.map((item, index) => {
                        const warehouseStock = item.product_id ? getWarehouseBalance(item.product_id) : 0;
                        const isOverStock = item.quantity > warehouseStock;
                        return (
                          <TableRow key={index}>
                            <TableCell>
                              <Select
                                value={item.product_id}
                                onValueChange={(v) => updateItem(index, "product_id", v)}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Seleccionar producto" />
                                </SelectTrigger>
                                <SelectContent>
                                  {products.map((p) => (
                                    <SelectItem key={p.id} value={p.id}>
                                      {p.name} ({p.code})
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">{warehouseStock}</Badge>
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                value={item.quantity || ""}
                                onChange={(e) => updateItem(index, "quantity", e.target.value)}
                                className={isOverStock ? "border-destructive" : ""}
                                min={0}
                              />
                              {isOverStock && (
                                <p className="text-xs text-destructive mt-1">Excede stock disponible</p>
                              )}
                            </TableCell>
                            <TableCell>
                              <Button size="icon" variant="ghost" onClick={() => removeItem(index)}>
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </div>
              
              {/* Notes */}
              <div className="space-y-2">
                <Label htmlFor="transfer-notes">Notas (opcional)</Label>
                <Input
                  id="transfer-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ej: Reposición para jornada del viernes"
                />
              </div>
              
              {/* Submit */}
              <Button
                className="w-full"
                size="lg"
                onClick={handleSubmitTransfer}
                disabled={submitting || transferItems.length === 0 || !selectedBarId}
              >
                {submitting ? "Procesando..." : "Confirmar Transferencia"}
              </Button>
            </TabsContent>
            
            <TabsContent value="history" className="space-y-4">
              {loadingHistory ? (
                [...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)
              ) : history.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <History className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No hay transferencias registradas</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {history.map((transfer) => (
                    <div key={transfer.id} className="glass-effect p-4 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{transfer.from_location?.name}</Badge>
                          <ArrowRight className="w-4 h-4" />
                          <Badge>{transfer.to_location?.name}</Badge>
                        </div>
                        <span className="text-sm text-muted-foreground">
                          {new Date(transfer.created_at).toLocaleString("es-CL")}
                        </span>
                      </div>
                      <div className="text-sm">
                        {transfer.items?.map((item, i) => (
                          <span key={i} className="inline-block mr-2">
                            {item.product?.name}: {item.quantity}
                            {i < transfer.items.length - 1 && ","}
                          </span>
                        ))}
                      </div>
                      {transfer.notes && (
                        <p className="text-xs text-muted-foreground mt-2">{transfer.notes}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Import Dialog */}
      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5" />
              Importar Reposición desde Excel
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* File upload */}
            <div className="space-y-2">
              <Label>Archivo Excel/CSV</Label>
              <Input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileChange}
              />
              <p className="text-xs text-muted-foreground">
                Columnas requeridas: bar_name (o barra), product_code (o codigo) o product_name (o producto), quantity (o cantidad)
              </p>
            </div>
            
            {/* Preview */}
            {importData.length > 0 && (
              <div className="space-y-2">
                <Label>Vista previa ({importData.filter(r => r.valid).length}/{importData.length} filas válidas)</Label>
                <ScrollArea className="h-64 border rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Estado</TableHead>
                        <TableHead>Barra</TableHead>
                        <TableHead>Producto</TableHead>
                        <TableHead>Cantidad</TableHead>
                        <TableHead>Error</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {importData.map((row, i) => (
                        <TableRow key={i} className={!row.valid ? "bg-destructive/10" : ""}>
                          <TableCell>
                            {row.valid ? (
                              <Check className="w-4 h-4 text-green-500" />
                            ) : (
                              <AlertCircle className="w-4 h-4 text-destructive" />
                            )}
                          </TableCell>
                          <TableCell>{row.bar_name}</TableCell>
                          <TableCell>{row.product_code || row.product_name}</TableCell>
                          <TableCell>{row.quantity}</TableCell>
                          <TableCell className="text-destructive text-xs">{row.error}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </div>
            )}
            
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowImportDialog(false)}>Cancelar</Button>
              <Button
                onClick={handleImportConfirm}
                disabled={submitting || importData.filter(r => r.valid).length === 0}
              >
                {submitting ? "Procesando..." : `Importar ${importData.filter(r => r.valid).length} filas`}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}