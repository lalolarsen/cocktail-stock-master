import { useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { 
  Upload, 
  FileSpreadsheet, 
  Loader2, 
  Check, 
  AlertCircle,
  Link2,
  Plus,
  ArrowRight
} from "lucide-react";
import * as XLSX from "xlsx";
import { formatCLP } from "@/lib/currency";

interface ImportedProduct {
  name: string;
  format: number | null;
  category: string;
  price: number;
  matchedInventoryId: string | null;
  matchedInventoryName: string | null;
  matchScore: number;
  action: "link" | "create" | "skip";
}

interface InventoryProduct {
  id: string;
  name: string;
  category: string;
  unit: string;
}

interface MenuImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  venueId: string;
  onImportComplete: () => void;
}

// Normalize string for comparison
const normalizeString = (str: string): string => {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove accents
    .replace(/[^a-z0-9]/g, " ") // Replace non-alphanumeric with space
    .replace(/\s+/g, " ") // Collapse multiple spaces
    .trim();
};

// Calculate Levenshtein distance
const levenshteinDistance = (a: string, b: string): number => {
  const matrix: number[][] = [];
  
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  
  return matrix[b.length][a.length];
};

// Calculate similarity score (0-100)
const calculateSimilarity = (str1: string, str2: string): number => {
  const norm1 = normalizeString(str1);
  const norm2 = normalizeString(str2);
  
  if (norm1 === norm2) return 100;
  
  // Check if one contains the other
  if (norm1.includes(norm2) || norm2.includes(norm1)) {
    return 85;
  }
  
  // Check word overlap
  const words1 = new Set(norm1.split(" ").filter(w => w.length > 2));
  const words2 = new Set(norm2.split(" ").filter(w => w.length > 2));
  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);
  
  if (union.size > 0) {
    const jaccardSimilarity = (intersection.size / union.size) * 100;
    if (jaccardSimilarity >= 50) {
      return Math.round(jaccardSimilarity);
    }
  }
  
  // Use Levenshtein as fallback
  const maxLen = Math.max(norm1.length, norm2.length);
  if (maxLen === 0) return 100;
  
  const distance = levenshteinDistance(norm1, norm2);
  return Math.round((1 - distance / maxLen) * 100);
};

// Find best match in inventory
const findBestMatch = (
  productName: string, 
  inventory: InventoryProduct[]
): { id: string; name: string; score: number } | null => {
  let bestMatch: { id: string; name: string; score: number } | null = null;
  
  for (const item of inventory) {
    const score = calculateSimilarity(productName, item.name);
    if (score >= 50 && (!bestMatch || score > bestMatch.score)) {
      bestMatch = { id: item.id, name: item.name, score };
    }
  }
  
  return bestMatch;
};

// Category mapping from Excel
const CATEGORY_MAP: Record<string, string> = {
  "botellas": "botellas",
  "botella": "botellas",
  "espumantes": "espumantes",
  "espumante": "espumantes",
  "destilados": "destilados",
  "destilado": "destilados",
  "cocteleria": "cocteleria",
  "cocteles": "cocteleria",
  "shots": "shots",
  "shot": "shots",
  "botellines": "botellines",
  "botellin": "botellines",
  "cervezas": "botellines",
  "cerveza": "botellines",
  "sin alcohol": "sin_alcohol",
  "sin_alcohol": "sin_alcohol",
  "bebidas": "sin_alcohol",
  "promociones": "promociones",
  "promo": "promociones",
};

const normalizeCategory = (category: string): string => {
  const normalized = normalizeString(category);
  return CATEGORY_MAP[normalized] || "otros";
};

export const MenuImportDialog = ({
  open,
  onOpenChange,
  venueId,
  onImportComplete,
}: MenuImportDialogProps) => {
  const [step, setStep] = useState<"upload" | "mapping" | "confirm">("upload");
  const [importing, setImporting] = useState(false);
  const [products, setProducts] = useState<ImportedProduct[]>([]);
  const [inventory, setInventory] = useState<InventoryProduct[]>([]);
  const [defaultCategory, setDefaultCategory] = useState("botellas");
  const [defaultPrice, setDefaultPrice] = useState(0);
  const [dragActive, setDragActive] = useState(false);

  // Fetch inventory products
  const fetchInventory = async () => {
    const { data, error } = await supabase
      .from("products")
      .select("id, name, category, unit")
      .eq("venue_id", venueId)
      .order("name");

    if (error) {
      console.error("Error fetching inventory:", error);
      return;
    }

    setInventory(data || []);
  };

  // Parse Excel file
  const parseExcel = useCallback(async (file: File) => {
    try {
      await fetchInventory();
      
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

      // Find header row
      let headerRowIndex = 0;
      for (let i = 0; i < Math.min(10, jsonData.length); i++) {
        const row = jsonData[i];
        if (row && row.some((cell: any) => 
          typeof cell === "string" && 
          (cell.toLowerCase().includes("producto") || cell.toLowerCase().includes("nombre"))
        )) {
          headerRowIndex = i;
          break;
        }
      }

      // Get header mapping
      const headers = jsonData[headerRowIndex]?.map((h: any) => 
        typeof h === "string" ? normalizeString(h) : ""
      ) || [];
      
      const productColIndex = headers.findIndex((h: string) => 
        h.includes("producto") || h.includes("nombre")
      );
      const formatColIndex = headers.findIndex((h: string) => 
        h.includes("formato") || h.includes("ml") || h.includes("contenido")
      );
      const categoryColIndex = headers.findIndex((h: string) => 
        h.includes("categoria") || h.includes("tipo")
      );
      const priceColIndex = headers.findIndex((h: string) => 
        h.includes("precio") || h.includes("valor")
      );

      if (productColIndex === -1) {
        toast.error("No se encontró la columna de productos");
        return;
      }

      // Parse products
      const parsedProducts: ImportedProduct[] = [];
      
      for (let i = headerRowIndex + 1; i < jsonData.length; i++) {
        const row = jsonData[i];
        if (!row || !row[productColIndex]) continue;

        const name = String(row[productColIndex]).trim();
        if (!name || name.length < 2) continue;

        // Parse format (handle "220/350" format)
        let format: number | null = null;
        if (formatColIndex !== -1 && row[formatColIndex]) {
          const formatStr = String(row[formatColIndex]);
          const formatMatch = formatStr.match(/(\d+)/);
          if (formatMatch) {
            format = parseInt(formatMatch[1], 10);
          }
        }

        // Parse category
        let category = defaultCategory;
        if (categoryColIndex !== -1 && row[categoryColIndex]) {
          category = normalizeCategory(String(row[categoryColIndex]));
        }

        // Parse price
        let price = defaultPrice;
        if (priceColIndex !== -1 && row[priceColIndex]) {
          const priceVal = parseFloat(String(row[priceColIndex]).replace(/[^0-9.-]/g, ""));
          if (!isNaN(priceVal)) {
            price = priceVal;
          }
        }

        // Find matching inventory product
        const match = findBestMatch(name, inventory);

        parsedProducts.push({
          name,
          format,
          category,
          price,
          matchedInventoryId: match?.id || null,
          matchedInventoryName: match?.name || null,
          matchScore: match?.score || 0,
          action: match && match.score >= 70 ? "link" : "create",
        });
      }

      if (parsedProducts.length === 0) {
        toast.error("No se encontraron productos en el archivo");
        return;
      }

      setProducts(parsedProducts);
      setStep("mapping");
      toast.success(`${parsedProducts.length} productos detectados`);
    } catch (error) {
      console.error("Error parsing Excel:", error);
      toast.error("Error al procesar el archivo Excel");
    }
  }, [defaultCategory, defaultPrice, venueId, inventory]);

  // Handle file drop
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith(".xlsx") || file.name.endsWith(".xls"))) {
      parseExcel(file);
    } else {
      toast.error("Por favor sube un archivo Excel (.xlsx o .xls)");
    }
  }, [parseExcel]);

  // Handle file input
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      parseExcel(file);
    }
  };

  // Update product mapping
  const updateProductMapping = (index: number, inventoryId: string | null) => {
    const newProducts = [...products];
    if (inventoryId) {
      const invProduct = inventory.find(p => p.id === inventoryId);
      newProducts[index] = {
        ...newProducts[index],
        matchedInventoryId: inventoryId,
        matchedInventoryName: invProduct?.name || null,
        matchScore: 100,
        action: "link",
      };
    } else {
      newProducts[index] = {
        ...newProducts[index],
        matchedInventoryId: null,
        matchedInventoryName: null,
        matchScore: 0,
        action: "create",
      };
    }
    setProducts(newProducts);
  };

  // Update product action
  const updateProductAction = (index: number, action: "link" | "create" | "skip") => {
    const newProducts = [...products];
    newProducts[index] = { ...newProducts[index], action };
    setProducts(newProducts);
  };

  // Stats
  const stats = useMemo(() => {
    const toLink = products.filter(p => p.action === "link").length;
    const toCreate = products.filter(p => p.action === "create").length;
    const toSkip = products.filter(p => p.action === "skip").length;
    return { toLink, toCreate, toSkip, total: products.length };
  }, [products]);

  // Import products
  const handleImport = async () => {
    setImporting(true);
    
    try {
      const toProcess = products.filter(p => p.action !== "skip");
      let created = 0;
      let linked = 0;
      let errors = 0;

      for (const product of toProcess) {
        try {
          // Create cocktail
          const { data: cocktailData, error: cocktailError } = await supabase
            .from("cocktails")
            .insert({
              name: product.name,
              price: product.price,
              category: product.category,
              venue_id: venueId,
            })
            .select()
            .single();

          if (cocktailError) throw cocktailError;

          let inventoryId = product.matchedInventoryId;

          // If action is "create", create new inventory product
          if (product.action === "create") {
            // Generate unique code
            const code = `MENU-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`;
            
            const { data: newProduct, error: productError } = await supabase
              .from("products")
              .insert({
                name: product.name,
                code,
                category: "ml",
                unit: "ml",
                current_stock: 0,
                minimum_stock: 0,
                cost_per_unit: 0,
                venue_id: venueId,
              })
              .select()
              .single();

            if (productError) throw productError;
            inventoryId = newProduct.id;
            created++;
          } else {
            linked++;
          }

          // Create ingredient link if we have inventory and format
          if (inventoryId && product.format) {
            const { error: ingredientError } = await supabase
              .from("cocktail_ingredients")
              .insert({
                cocktail_id: cocktailData.id,
                product_id: inventoryId,
                quantity: product.format,
                venue_id: venueId,
              });

            if (ingredientError) {
              console.error("Error creating ingredient:", ingredientError);
            }
          }
        } catch (error) {
          console.error("Error processing product:", product.name, error);
          errors++;
        }
      }

      toast.success(
        `Importación completada: ${linked + created} productos agregados` +
        (created > 0 ? ` (${created} nuevos en inventario)` : "") +
        (errors > 0 ? `, ${errors} errores` : "")
      );
      
      onImportComplete();
      handleClose();
    } catch (error) {
      console.error("Import error:", error);
      toast.error("Error durante la importación");
    } finally {
      setImporting(false);
    }
  };

  const handleClose = () => {
    setStep("upload");
    setProducts([]);
    setDefaultCategory("botellas");
    setDefaultPrice(0);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Importar Carta desde Excel
          </DialogTitle>
          <DialogDescription>
            {step === "upload" && "Sube tu archivo Excel con el listado de productos"}
            {step === "mapping" && "Revisa el mapeo de productos con el inventario"}
            {step === "confirm" && "Confirma la importación"}
          </DialogDescription>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-6">
            {/* Drop zone */}
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                dragActive 
                  ? "border-primary bg-primary/5" 
                  : "border-muted-foreground/25 hover:border-primary/50"
              }`}
              onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
            >
              <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-lg font-medium mb-2">
                Arrastra tu archivo Excel aquí
              </p>
              <p className="text-sm text-muted-foreground mb-4">
                o haz clic para seleccionar
              </p>
              <Input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileChange}
                className="max-w-xs mx-auto"
              />
            </div>

            {/* Default values */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Categoría por defecto</Label>
                <Select value={defaultCategory} onValueChange={setDefaultCategory}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="botellas">Botellas</SelectItem>
                    <SelectItem value="espumantes">Espumantes</SelectItem>
                    <SelectItem value="destilados">Destilados</SelectItem>
                    <SelectItem value="cocteleria">Coctelería</SelectItem>
                    <SelectItem value="shots">Shots</SelectItem>
                    <SelectItem value="botellines">Botellines</SelectItem>
                    <SelectItem value="sin_alcohol">Sin Alcohol</SelectItem>
                    <SelectItem value="promociones">Promociones</SelectItem>
                    <SelectItem value="otros">Otros</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Precio por defecto</Label>
                <Input
                  type="number"
                  value={defaultPrice}
                  onChange={(e) => setDefaultPrice(parseInt(e.target.value) || 0)}
                  placeholder="0"
                />
              </div>
            </div>
          </div>
        )}

        {step === "mapping" && (
          <div className="space-y-4">
            {/* Stats */}
            <div className="flex gap-4 text-sm">
              <Badge variant="secondary" className="gap-1">
                <Link2 className="h-3 w-3" />
                {stats.toLink} a enlazar
              </Badge>
              <Badge variant="outline" className="gap-1">
                <Plus className="h-3 w-3" />
                {stats.toCreate} a crear
              </Badge>
              {stats.toSkip > 0 && (
                <Badge variant="destructive" className="gap-1">
                  {stats.toSkip} omitidos
                </Badge>
              )}
            </div>

            {/* Products table */}
            <ScrollArea className="h-[400px] border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto (Excel)</TableHead>
                    <TableHead>Formato</TableHead>
                    <TableHead>Enlace Inventario</TableHead>
                    <TableHead>Match</TableHead>
                    <TableHead>Acción</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.map((product, index) => (
                    <TableRow key={index} className={product.action === "skip" ? "opacity-50" : ""}>
                      <TableCell className="font-medium">{product.name}</TableCell>
                      <TableCell>
                        {product.format ? `${product.format} ml` : "-"}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={product.matchedInventoryId || "none"}
                          onValueChange={(value) => 
                            updateProductMapping(index, value === "none" ? null : value)
                          }
                        >
                          <SelectTrigger className="w-[200px]">
                            <SelectValue placeholder="Sin enlace" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">
                              <span className="text-muted-foreground">Sin enlace (crear nuevo)</span>
                            </SelectItem>
                            {inventory.map((inv) => (
                              <SelectItem key={inv.id} value={inv.id}>
                                {inv.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        {product.matchScore > 0 && (
                          <Badge 
                            variant={product.matchScore >= 80 ? "default" : "secondary"}
                            className="gap-1"
                          >
                            {product.matchScore >= 80 ? (
                              <Check className="h-3 w-3" />
                            ) : (
                              <AlertCircle className="h-3 w-3" />
                            )}
                            {product.matchScore}%
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={product.action}
                          onValueChange={(value) => 
                            updateProductAction(index, value as "link" | "create" | "skip")
                          }
                        >
                          <SelectTrigger className="w-[120px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="link">Enlazar</SelectItem>
                            <SelectItem value="create">Crear nuevo</SelectItem>
                            <SelectItem value="skip">Omitir</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </div>
        )}

        <DialogFooter>
          {step === "upload" && (
            <Button variant="outline" onClick={handleClose}>
              Cancelar
            </Button>
          )}
          
          {step === "mapping" && (
            <>
              <Button variant="outline" onClick={() => setStep("upload")}>
                Volver
              </Button>
              <Button 
                onClick={handleImport} 
                disabled={importing || stats.toLink + stats.toCreate === 0}
              >
                {importing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Importando...
                  </>
                ) : (
                  <>
                    <ArrowRight className="h-4 w-4 mr-2" />
                    Importar {stats.toLink + stats.toCreate} productos
                  </>
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
