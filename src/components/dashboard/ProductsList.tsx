import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Wine, 
  Droplet, 
  Package, 
  Search,
  ChevronDown,
  ChevronRight,
  Pencil,
  Check,
  X,
  Trash2,
  AlertTriangle,
  Calculator,
  Plus,
  Info,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { NewProductWizard } from "@/components/dashboard/NewProductWizard";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { useStockData, ProductWithStock } from "@/hooks/useStockData";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCLP } from "@/lib/currency";

// ──────────────────────────────────────────────
// Categorías (fuente de verdad: products.category)
// unit (ml/unidades/gramos) es INDEPENDIENTE y no se toca
// ──────────────────────────────────────────────
const CATEGORY_CONFIG: Record<string, {
  label: string;
  icon: typeof Wine;
  order: number;
  description: string;
  isVolumetric: boolean;         // solo informativo para colores/badges
  defaultCapacityMl?: number;    // para auto-asignar capacity_ml al guardar
}> = {
  botellas_1500: { label: "Botellas 1500ml", icon: Wine,    order: 1,  description: "Formato grande. Control volumétrico.", isVolumetric: true,  defaultCapacityMl: 1500 },
  botellas_1000: { label: "Botellas 1000ml", icon: Wine,    order: 2,  description: "Destilados y coctelería.", isVolumetric: true,  defaultCapacityMl: 1000 },
  botellas_750:  { label: "Botellas 750ml",  icon: Wine,    order: 3,  description: "Venta directa o coctelería.", isVolumetric: true,  defaultCapacityMl: 750  },
  botellas_700:  { label: "Botellas 700ml",  icon: Wine,    order: 4,  description: "Venta directa o coctelería.", isVolumetric: true,  defaultCapacityMl: 700  },
  botellines:           { label: "Botellines",          icon: Package, order: 5,  description: "Cervezas y botellines individuales.", isVolumetric: false },
  latas_redbull:        { label: "Latas/Redbull",        icon: Droplet, order: 6,  description: "Latas de bebidas, Red Bull y similares.", isVolumetric: false },
  // compatibilidad con valores legacy
  mixers_tradicionales: { label: "Latas/Redbull",        icon: Droplet, order: 6,  description: "Latas de bebidas, Red Bull y similares.", isVolumetric: false },
  redbull:              { label: "Latas/Redbull",        icon: Droplet, order: 6,  description: "Latas de bebidas, Red Bull y similares.", isVolumetric: false },
  mixers_redbull:       { label: "Latas/Redbull",        icon: Droplet, order: 6,  description: "Latas de bebidas, Red Bull y similares.", isVolumetric: false },
  ml:                   { label: "Volumétrico (ml)",     icon: Wine,    order: 8,  description: "Productos volumétricos sin categoría específica.", isVolumetric: true  },
  unidades:             { label: "Unitario (ud)",        icon: Package, order: 9,  description: "Productos unitarios sin categoría específica.", isVolumetric: false },
  sin_categoria:        { label: "Sin Categoría",        icon: Package, order: 99, description: "Pendientes de clasificación.", isVolumetric: false },
};

const CATEGORY_OPTIONS = [
  { value: "botellas_1500",        label: "Botellas 1500ml (volumétrico)" },
  { value: "botellas_1000",        label: "Botellas 1000ml (volumétrico)" },
  { value: "botellas_750",         label: "Botellas 750ml (volumétrico)" },
  { value: "botellas_700",         label: "Botellas 700ml (volumétrico)" },
  { value: "botellines",           label: "Botellines (unitario)" },
  { value: "latas_redbull",        label: "Latas/Redbull (unitario)" },
];

const getCategoryConfig = (category: string | null) => {
  if (!category) return CATEGORY_CONFIG.sin_categoria;
  return CATEGORY_CONFIG[category.toLowerCase()] || CATEGORY_CONFIG.sin_categoria;
};

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────
type InventoryFilter = "all" | "volumetrico" | "unitario";

const isVolumetric = (p: ProductWithStock) => !!(p.capacity_ml && p.capacity_ml > 0);

const getStockDisplay = (p: ProductWithStock) => {
  if (isVolumetric(p)) return `${Number(p.totalStock).toLocaleString("es-CL")} ml`;
  return `${Number(p.totalStock).toLocaleString("es-CL")} uds`;
};

const getCostDisplay = (p: ProductWithStock) => {
  if (!p.cost_per_unit || p.cost_per_unit === 0) return null;
  if (isVolumetric(p)) {
    if (!p.capacity_ml) return { perBottle: formatCLP(p.cost_per_unit), perMl: null, missingCapacity: true };
    const costPerMl = p.cost_per_unit / p.capacity_ml;
    return {
      perBottle: `${formatCLP(p.cost_per_unit)} / ${p.capacity_ml}ml`,
      perMl: `${formatCLP(Math.round(costPerMl * 100) / 100)} / ml`,
      missingCapacity: false,
    };
  }
  return { perUnit: `${formatCLP(p.cost_per_unit)} / ud`, missingCapacity: false };
};

// ──────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────
interface ProductsListProps {
  isReadOnly?: boolean;
}

interface EditingState {
  name: string;
  category: string;
}

export const ProductsList = ({ isReadOnly = false }: ProductsListProps) => {
  const { products, loading, refetch } = useStockData();
  const [searchTerm, setSearchTerm] = useState("");
  const [inventoryFilter, setInventoryFilter] = useState<InventoryFilter>("all");
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [editingProduct, setEditingProduct] = useState<string | null>(null);
  const [editingState, setEditingState] = useState<EditingState>({ name: "", category: "" });
  const [costCalcMl, setCostCalcMl] = useState<Record<string, number>>({});
  const [showNewProductWizard, setShowNewProductWizard] = useState(false);

  const volCount = useMemo(() => products.filter(isVolumetric).length, [products]);
  const unitCount = useMemo(() => products.filter(p => !isVolumetric(p)).length, [products]);

  const groupedProducts = useMemo(() => {
    let filtered = products;

    if (inventoryFilter === "volumetrico") filtered = filtered.filter(isVolumetric);
    else if (inventoryFilter === "unitario") filtered = filtered.filter(p => !isVolumetric(p));

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(p =>
        p.name.toLowerCase().includes(term) || p.code?.toLowerCase().includes(term)
      );
    }

    const groups: Record<string, ProductWithStock[]> = {};
    filtered.forEach(product => {
      const key = (product.category || "sin_categoria").toLowerCase();
      if (!groups[key]) groups[key] = [];
      groups[key].push(product);
    });

    Object.keys(groups).forEach(key => {
      groups[key].sort((a, b) => a.name.localeCompare(b.name));
    });

    return Object.entries(groups).sort(([a], [b]) => {
      const orderA = getCategoryConfig(a).order;
      const orderB = getCategoryConfig(b).order;
      return orderA - orderB;
    });
  }, [products, searchTerm, inventoryFilter]);

  useMemo(() => {
    if (products.length > 0 && expandedCategories.size === 0) {
      setExpandedCategories(new Set(products.map(p => (p.category || "sin_categoria").toLowerCase())));
    }
  }, [products]);

  const toggleCategory = (category: string) => {
    const s = new Set(expandedCategories);
    s.has(category) ? s.delete(category) : s.add(category);
    setExpandedCategories(s);
  };

  const handleEditProduct = (product: ProductWithStock) => {
    setEditingProduct(product.id);
    setEditingState({ name: product.name, category: product.category || "" });
  };

  const handleSaveProduct = async (productId: string) => {
    try {
      if (!editingState.name.trim()) { toast.error("El nombre no puede estar vacío"); return; }

      const catConfig = getCategoryConfig(editingState.category);
      // Auto-asignar capacity_ml si la categoría lo implica; unit NO se toca
      const capacityUpdate = catConfig.defaultCapacityMl !== undefined
        ? { capacity_ml: catConfig.defaultCapacityMl }
        : {};

      const { error } = await supabase
        .from("products")
        .update({
          name: editingState.name.trim(),
          category: editingState.category as any,
          ...capacityUpdate,
        })
        .eq("id", productId);

      if (error) {
        console.error("Supabase error updating product:", JSON.stringify(error));
        throw error;
      }
      toast.success("Producto actualizado");
      setEditingProduct(null);
      refetch();
    } catch (error: any) {
      console.error("Error updating product:", error?.message, error?.code, error?.details, error?.hint);
      toast.error(`Error al actualizar: ${error?.message || "desconocido"}`);
    }
  };

  const handleCancelEdit = () => {
    setEditingProduct(null);
    setEditingState({ name: "", category: "" });
  };

  const handleDeleteProduct = async (productId: string) => {
    try {
      const { error } = await supabase.from("products").delete().eq("id", productId);
      if (error) throw error;
      toast.success("Producto eliminado");
      refetch();
    } catch (error) {
      console.error("Error deleting product:", error);
      toast.error("Error al eliminar producto");
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader><CardTitle>Catálogo de Productos</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">

      {/* ── Aviso proceso ── */}
      <Alert className="border-primary/30 bg-primary/5">
        <Info className="h-4 w-4 text-primary" />
        <AlertDescription className="text-xs leading-relaxed">
          <span className="font-semibold text-foreground">Para ingresar stock a un producto, este debe existir en el catálogo primero.</span>
          {" "}Usa el botón <span className="font-semibold text-foreground">"Nuevo producto"</span> para crearlo con su tipo (botella o unitario) y capacidad en ml.
          Una vez creado, ve a <span className="font-semibold text-foreground">Inventario → Ingreso manual</span> para registrar el stock.
        </AlertDescription>
      </Alert>

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold">Catálogo de Productos</h2>
          <p className="text-muted-foreground text-sm">
            {volCount} productos volumétricos (ml) • {unitCount} productos unitarios (ud)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar producto..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9" />
          </div>
          {!isReadOnly && (
            <Button onClick={() => setShowNewProductWizard(true)} className="gap-2 shrink-0">
              <Plus className="h-4 w-4" />
              Nuevo producto
            </Button>
          )}
        </div>
      </div>

      {/* ── Filter toggle ── */}
      <div className="flex flex-wrap gap-2">
        {([
          { key: "all" as const, label: "Todos", desc: `${products.length}` },
          { key: "volumetrico" as const, label: "Volumétrico (ml)", desc: `${volCount} — control por ml` },
          { key: "unitario" as const, label: "Unitario (ud)", desc: `${unitCount} — control por unidad` },
        ]).map(f => (
          <Button
            key={f.key}
            size="sm"
            variant={inventoryFilter === f.key ? "default" : "outline"}
            onClick={() => setInventoryFilter(f.key)}
            className="gap-1.5"
            title={f.desc}
          >
            {f.key === "volumetrico" && <Wine className="h-3.5 w-3.5" />}
            {f.key === "unitario" && <Package className="h-3.5 w-3.5" />}
            {f.label}
          </Button>
        ))}
      </div>

      {/* ── Legend ── */}
      <div className="flex flex-wrap gap-2 text-xs">
        <Badge variant="outline" className="gap-1 bg-amber-500/10 border-amber-500/30">
          <Wine className="h-3 w-3 text-amber-600" /> Volumétrico = Control por ml
        </Badge>
        <Badge variant="outline" className="gap-1 bg-blue-500/10 border-blue-500/30">
          <Package className="h-3 w-3 text-blue-600" /> Unitario = Control por unidad
        </Badge>
      </div>

      {/* ── Category groups ── */}
      <div className="space-y-4">
        {groupedProducts.map(([category, items]) => {
          const config = getCategoryConfig(category);
          const Icon = config.icon;
          const isExpanded = expandedCategories.has(category);
          const isVol = config.isVolumetric;

          return (
            <Collapsible key={category} open={isExpanded} onOpenChange={() => toggleCategory(category)}>
              <Card className={isVol ? 'border-l-4 border-l-amber-500' : 'border-l-4 border-l-blue-500'}>
                <CollapsibleTrigger asChild>
                  <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${isVol ? 'bg-amber-500/10' : 'bg-blue-500/10'}`}>
                        <Icon className={`h-5 w-5 ${isVol ? 'text-amber-600' : 'text-blue-600'}`} />
                      </div>
                      <div>
                        <h3 className="font-semibold">{config.label}</h3>
                        <p className="text-xs text-muted-foreground">{config.description}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={isVol ? 'default' : 'secondary'} className="text-xs">
                        {items.length} {isVol ? 'vol' : 'uds'}
                      </Badge>
                      {isExpanded ? <ChevronDown className="h-5 w-5 text-muted-foreground" /> : <ChevronRight className="h-5 w-5 text-muted-foreground" />}
                    </div>
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="border-t divide-y">
                    {items.map((product) => (
                      <ProductRow
                        key={product.id}
                        product={product}
                        isReadOnly={isReadOnly}
                        isEditing={editingProduct === product.id}
                        editingState={editingState}
                        setEditingState={setEditingState}
                        onEdit={() => handleEditProduct(product)}
                        onSave={() => handleSaveProduct(product.id)}
                        onCancel={handleCancelEdit}
                        onDelete={() => handleDeleteProduct(product.id)}
                        costCalcMl={costCalcMl[product.id] ?? 90}
                        onCostCalcMlChange={(v) => setCostCalcMl(prev => ({ ...prev, [product.id]: v }))}
                      />
                    ))}
                  </div>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          );
        })}
      </div>

      {groupedProducts.length === 0 && (
        <Card className="p-12 text-center">
          <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <h3 className="text-lg font-semibold mb-2">
            {searchTerm ? "No se encontraron productos" : "No hay productos"}
          </h3>
          <p className="text-muted-foreground text-sm">
            {searchTerm ? "Intenta con otro término de búsqueda" : "Crea tu primer producto con el botón \"Nuevo producto\""}
          </p>
        </Card>
      )}

      {showNewProductWizard && (
        <NewProductWizard
          open={showNewProductWizard}
          onOpenChange={setShowNewProductWizard}
          rawName=""
          existingProducts={products.map(p => ({ id: p.id, name: p.name, code: p.code || "", category: p.category }))}
          onProductCreated={(_id, name) => {
            toast.success(`Producto "${name}" creado`);
            refetch();
          }}
          onLinkToExisting={() => {
            setShowNewProductWizard(false);
          }}
        />
      )}
    </div>
  );
};

// ──────────────────────────────────────────────
// ProductRow
// ──────────────────────────────────────────────
interface ProductRowProps {
  product: ProductWithStock;
  isReadOnly: boolean;
  isEditing: boolean;
  editingState: EditingState;
  setEditingState: React.Dispatch<React.SetStateAction<EditingState>>;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete: () => void;
  costCalcMl: number;
  onCostCalcMlChange: (v: number) => void;
}

const ProductRow = ({
  product, isReadOnly, isEditing, editingState, setEditingState,
  onEdit, onSave, onCancel, onDelete, costCalcMl, onCostCalcMlChange,
}: ProductRowProps) => {
  const vol = isVolumetric(product);
  const costInfo = getCostDisplay(product);
  const [showCalc, setShowCalc] = useState(false);

  if (isEditing) {
    return (
      <div className="p-4 bg-muted/20 space-y-3">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Nombre</label>
          <Input value={editingState.name} onChange={(e) => setEditingState(prev => ({ ...prev, name: e.target.value }))} className="h-9" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Categoría</label>
          <Select value={editingState.category} onValueChange={(val) => setEditingState(prev => ({ ...prev, category: val }))}>
            <SelectTrigger className="h-9"><SelectValue placeholder="Seleccionar categoría" /></SelectTrigger>
            <SelectContent>
              {CATEGORY_OPTIONS.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button size="sm" variant="ghost" onClick={onCancel}><X className="h-4 w-4 mr-1" /> Cancelar</Button>
          <Button size="sm" onClick={onSave}><Check className="h-4 w-4 mr-1" /> Guardar</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 hover:bg-muted/30 transition-colors space-y-1">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium truncate">{product.name}</span>
            {product.code && <Badge variant="secondary" className="text-xs shrink-0">{product.code}</Badge>}
            <Badge variant={vol ? "default" : "secondary"} className="text-[10px] shrink-0 uppercase tracking-wider">
              {vol ? "ML" : "UD"}
            </Badge>
          </div>

          <p className="text-sm text-muted-foreground mt-0.5">
            Stock: {getStockDisplay(product)}
          </p>

          {costInfo ? (
            <div className="mt-1 text-xs space-y-0.5">
              {vol ? (
                <>
                  {'perBottle' in costInfo && (
                    <p className="text-foreground/80">
                      Costo prom. neto: <span className="font-medium text-primary">{costInfo.perBottle}</span>
                    </p>
                  )}
                  {costInfo.perMl && (
                    <p className="text-muted-foreground">
                      → <span className="font-medium">{costInfo.perMl}</span>
                    </p>
                  )}
                  {costInfo.missingCapacity && (
                    <p className="text-amber-500 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" /> Falta capacidad ml
                    </p>
                  )}
                </>
              ) : (
                'perUnit' in costInfo && (
                  <p className="text-foreground/80">
                    Costo prom. neto: <span className="font-medium text-primary">{costInfo.perUnit}</span>
                  </p>
                )
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground/60 mt-1 italic">Sin costo registrado</p>
          )}

          {vol && costInfo && !costInfo.missingCapacity && product.capacity_ml && product.cost_per_unit > 0 && (
            <div className="mt-2">
              {!showCalc ? (
                <Button variant="ghost" size="sm" className="h-6 text-xs text-muted-foreground gap-1 px-1" onClick={() => setShowCalc(true)}>
                  <Calculator className="h-3 w-3" /> Calcular consumo
                </Button>
              ) : (
                <div className="flex items-center gap-2 bg-muted/40 rounded p-2">
                  <Input
                    type="number"
                    value={costCalcMl}
                    onChange={(e) => onCostCalcMlChange(Number(e.target.value) || 0)}
                    className="h-7 w-20 text-xs"
                    min={0}
                  />
                  <span className="text-xs text-muted-foreground">ml →</span>
                  <span className="text-xs font-medium text-primary">
                    {formatCLP(Math.round(costCalcMl * (product.cost_per_unit / product.capacity_ml)))}
                  </span>
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setShowCalc(false)}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        {!isReadOnly && (
          <div className="flex items-center gap-1 shrink-0 mt-0.5">
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onEdit} title="Editar producto">
              <Pencil className="h-4 w-4" />
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" title="Eliminar producto">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Eliminar producto?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Esta acción eliminará permanentemente "{product.name}". No se puede deshacer.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={onDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Eliminar
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </div>
    </div>
  );
};
