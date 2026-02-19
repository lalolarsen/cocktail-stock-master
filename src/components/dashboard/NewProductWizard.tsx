import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useActiveVenue } from "@/hooks/useActiveVenue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
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
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, AlertTriangle, Check, Package, Blend } from "lucide-react";

interface Product {
  id: string;
  name: string;
  code: string;
  category: string;
}

interface NewProductWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rawName: string;
  suggestedUnitCost?: number;
  existingProducts: Product[];
  onProductCreated: (productId: string, productName: string) => void;
  onLinkToExisting: (productId: string) => void;
}

// Calculate similarity between two strings (Jaccard + substring)
function calculateSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();
  
  // Exact match
  if (s1 === s2) return 1;
  
  // Substring match
  if (s1.includes(s2) || s2.includes(s1)) return 0.9;
  
  // Jaccard similarity on words
  const words1 = new Set(s1.split(/\s+/));
  const words2 = new Set(s2.split(/\s+/));
  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);
  
  return intersection.size / union.size;
}

export function NewProductWizard({
  open,
  onOpenChange,
  rawName,
  suggestedUnitCost,
  existingProducts,
  onProductCreated,
  onLinkToExisting,
}: NewProductWizardProps) {
  const { venue } = useActiveVenue();
  const [step, setStep] = useState<"review" | "create">("review");
  const [creating, setCreating] = useState(false);
  
  // Form fields
  const [productName, setProductName] = useState(rawName);
  const [productCategory, setProductCategory] = useState<string>("unidades");
  const [productCost, setProductCost] = useState(suggestedUnitCost?.toString() || "");
  const [minStock, setMinStock] = useState("10");
  const [confirmNotDuplicate, setConfirmNotDuplicate] = useState(false);
  const [isMixer, setIsMixer] = useState(false);
  const [mixerSubcategory, setMixerSubcategory] = useState<"MIXER_TRADICIONAL" | "REDBULL" | "">("");

  // Find similar products
  const similarProducts = useMemo(() => {
    const threshold = 0.3;
    return existingProducts
      .map(p => ({
        ...p,
        similarity: calculateSimilarity(rawName, p.name),
      }))
      .filter(p => p.similarity >= threshold)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 5);
  }, [rawName, existingProducts]);

  const hasSimilarProducts = similarProducts.length > 0;

  const handleLinkToExisting = (productId: string) => {
    onLinkToExisting(productId);
    resetForm();
    onOpenChange(false);
  };

  const handleProceedToCreate = () => {
    setStep("create");
    setProductName(rawName);
    setProductCost(suggestedUnitCost?.toString() || "");
  };

  const handleCreate = async () => {
    if (!productName.trim()) {
      toast.error("El nombre del producto es requerido");
      return;
    }

    // Mixer validation
    if (isMixer && !mixerSubcategory) {
      toast.error("Selecciona el tipo de mixer (Tradicional o Redbull)");
      return;
    }

    // Ley de Costos ESTRICTA: costo >= $1 obligatorio
    const costValue = parseFloat(productCost);
    if (!productCost || isNaN(costValue) || costValue < 1) {
      toast.error("El costo unitario debe ser al menos $1 (Ley de Costos)");
      return;
    }

    if (hasSimilarProducts && !confirmNotDuplicate) {
      toast.error("Debe confirmar que el producto no es duplicado");
      return;
    }

    if (!venue?.id) {
      toast.error("Venue no disponible");
      return;
    }

    setCreating(true);
    try {
      // Generate code
      const { data: codeData } = await supabase.rpc("generate_product_code");
      
      const { data: newProduct, error } = await supabase
        .from("products")
        .insert({
          name: productName.trim(),
          code: codeData || `P${Date.now()}`,
          category: productCategory as "ml" | "gramos" | "unidades",
          unit: productCategory === "ml" ? "ml" : productCategory === "gramos" ? "g" : "un",
          cost_per_unit: parseFloat(productCost),
          minimum_stock: minStock ? parseFloat(minStock) : 10,
          current_stock: 0,
          is_active_in_sales: false,
          venue_id: venue.id,
          is_mixer: isMixer,
          subcategory: isMixer ? mixerSubcategory : null,
        })
        .select()
        .single();

      if (error) throw error;

      toast.success("Producto creado (pendiente de aprobación para ventas)");
      onProductCreated(newProduct.id, newProduct.name);
      resetForm();
      onOpenChange(false);
    } catch (error) {
      console.error("Error creating product:", error);
      toast.error("Error al crear el producto");
    } finally {
      setCreating(false);
    }
  };

  const resetForm = () => {
    setStep("review");
    setProductName(rawName);
    setProductCategory("unidades");
    setProductCost("");
    setMinStock("10");
    setConfirmNotDuplicate(false);
    setIsMixer(false);
    setMixerSubcategory("");
  };

  const getSimilarityBadge = (similarity: number) => {
    if (similarity >= 0.8) {
      return <Badge variant="destructive">Muy similar</Badge>;
    } else if (similarity >= 0.5) {
      return <Badge className="bg-amber-500/20 text-amber-700 border-amber-500/30">Similar</Badge>;
    }
    return <Badge variant="outline">Parcial</Badge>;
  };

  return (
    <Dialog open={open} onOpenChange={(o) => {
      if (!o) resetForm();
      onOpenChange(o);
    }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            {step === "review" ? "Producto no encontrado" : "Crear nuevo producto"}
          </DialogTitle>
          <DialogDescription>
            {step === "review" 
              ? `"${rawName}" no coincide con ningún producto existente`
              : "Complete los datos del nuevo producto"
            }
          </DialogDescription>
        </DialogHeader>

        {step === "review" && (
          <ScrollArea className="flex-1 min-h-0 max-h-[50vh]">
            <div className="space-y-4 py-4 pr-3">
              {hasSimilarProducts && (
                <>
                  <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-500/10 p-3 rounded-lg">
                    <AlertTriangle className="h-4 w-4" />
                    Se encontraron productos similares. Revise antes de crear uno nuevo.
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Productos similares:</Label>
                    {similarProducts.map((product) => (
                      <div
                        key={product.id}
                        className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{product.name}</span>
                          {getSimilarityBadge(product.similarity)}
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleLinkToExisting(product.id)}
                        >
                          Vincular
                        </Button>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {!hasSimilarProducts && (
                <div className="text-center py-4 text-muted-foreground">
                  <Check className="h-8 w-8 mx-auto mb-2 text-green-500" />
                  <p>No se encontraron productos similares</p>
                </div>
              )}
            </div>
          </ScrollArea>
        )}

        {step === "create" && (
          <ScrollArea className="flex-1 min-h-0 max-h-[50vh]">
            <div className="space-y-4 py-4 pr-3">
              <div className="space-y-2">
                <Label>Nombre del producto *</Label>
                <Input
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  placeholder="Nombre del producto"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Categoría *</Label>
                  <Select value={productCategory} onValueChange={setProductCategory}>
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
                <div className="space-y-2">
                  <Label>Costo unitario * (mín. $1)</Label>
                  <Input
                    type="number"
                    min="1"
                    step="1"
                    value={productCost}
                    onChange={(e) => setProductCost(e.target.value)}
                    placeholder="Mínimo $1"
                    className={!productCost || parseFloat(productCost) < 1 ? "border-destructive" : ""}
                  />
                  {(!productCost || parseFloat(productCost) < 1) && (
                    <p className="text-xs text-destructive">El costo debe ser al menos $1</p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Stock mínimo</Label>
                <Input
                  type="number"
                  min="0"
                  value={minStock}
                  onChange={(e) => setMinStock(e.target.value)}
                  placeholder="10"
                />
              </div>

              {/* ── Mixer toggle ── */}
              <div className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <Blend className="h-4 w-4 text-primary" />
                  <div>
                    <p className="text-sm font-medium">Es Mixer</p>
                    <p className="text-xs text-muted-foreground">Bebida que acompaña un cóctel</p>
                  </div>
                </div>
                <Switch
                  checked={isMixer}
                  onCheckedChange={(v) => { setIsMixer(v); if (!v) setMixerSubcategory(""); }}
                />
              </div>

              {/* ── Mixer type (only when is_mixer=true) ── */}
              {isMixer && (
                <div className="space-y-2">
                  <Label>
                    Tipo de Mixer <span className="text-destructive">*</span>
                  </Label>
                  <Select value={mixerSubcategory} onValueChange={(v) => setMixerSubcategory(v as "MIXER_TRADICIONAL" | "REDBULL")}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona el tipo..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MIXER_TRADICIONAL">Mixers tradicionales</SelectItem>
                      <SelectItem value="REDBULL">Redbull</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg text-sm text-foreground/80">
                ℹ️ El producto se creará como <strong>inactivo para ventas</strong> hasta que un admin lo apruebe en el catálogo.
              </div>

              {hasSimilarProducts && (
                <div className="flex items-start space-x-2 p-3 border border-amber-500/30 rounded-lg bg-amber-500/5">
                  <Checkbox
                    id="confirm"
                    checked={confirmNotDuplicate}
                    onCheckedChange={(checked) => setConfirmNotDuplicate(checked as boolean)}
                  />
                  <label htmlFor="confirm" className="text-sm leading-tight">
                    Confirmo que este producto <strong>no es duplicado</strong> de ninguno existente
                  </label>
                </div>
              )}
            </div>
          </ScrollArea>
        )}

        <DialogFooter>
          {step === "review" && (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button onClick={handleProceedToCreate}>
                Crear nuevo producto
              </Button>
            </>
          )}
          {step === "create" && (
            <>
              <Button variant="outline" onClick={() => setStep("review")}>
                Volver
              </Button>
              <Button
                onClick={handleCreate}
                disabled={creating || (hasSimilarProducts && !confirmNotDuplicate)}
              >
                {creating ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Check className="h-4 w-4 mr-2" />
                )}
                Crear producto
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
