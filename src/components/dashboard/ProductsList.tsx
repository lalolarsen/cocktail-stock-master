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
  Trash2
} from "lucide-react";
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
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useActiveVenue } from "@/hooks/useActiveVenue";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

// Product type from Supabase
interface Product {
  id: string;
  name: string;
  code: string;
  category: "ml" | "unidades" | "gramos";
  subcategory: string | null;
  unit: string;
}
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Taxonomía de Control de Stock - Manual DiStock
// Clasificación según función operativa y capacidad
const SUBCATEGORY_CONFIG: Record<string, { 
  label: string; 
  icon: typeof Wine; 
  order: number;
  description: string;
  stockType: 'volumetrico' | 'unitario';
}> = {
  // === BOTELLAS 1500ml ===
  botellas_1500: { 
    label: "Botellas 1500ml", 
    icon: Wine, 
    order: 1,
    description: "Uso exclusivo como ingrediente. No se venden unitarias. Siempre descuentan ml según receta.",
    stockType: 'volumetrico'
  },
  
  // === BOTELLAS 1000ml ===
  botellas_1000: { 
    label: "Botellas 1000ml", 
    icon: Wine, 
    order: 2,
    description: "Destilados, Coctelería, Shots. No se venden unitarias. Destilado: 90ml, Shot: 45ml, Cóctel: según receta.",
    stockType: 'volumetrico'
  },
  
  // === BOTELLAS 750/700ml ===
  botellas_750: { 
    label: "Botellas 750ml", 
    icon: Wine, 
    order: 3,
    description: "Venta unitaria o coctelería. Botella completa: 750ml. Coctelería: ml definidos.",
    stockType: 'volumetrico'
  },
  botellas_700: { 
    label: "Botellas 700ml", 
    icon: Wine, 
    order: 4,
    description: "Venta unitaria o coctelería. Botella completa: 700ml. Coctelería: ml definidos.",
    stockType: 'volumetrico'
  },
  
  // === BOTELLINES VENTA UNITARIA ===
  botellines: { 
    label: "Botellines (Venta Unitaria)", 
    icon: Wine, 
    order: 5,
    description: "Venta unitaria. Cervezas, Mistral Ice y otros formatos.",
    stockType: 'unitario'
  },
  
  // === MIXERS: BEBIDAS TRADICIONALES ===
  mixers_tradicionales: { 
    label: "Mixers Tradicionales (220/350ml)", 
    icon: Droplet, 
    order: 6,
    description: "CocaCola, Ginger Ale, Sprite y similares.",
    stockType: 'unitario'
  },
  
  // === MIXERS: REDBULL ===
  mixers_redbull: { 
    label: "Red Bull (250ml)", 
    icon: Droplet, 
    order: 7,
    description: "Red Bull variedades 250ml.",
    stockType: 'unitario'
  },
  
  // === SIN CATEGORÍA ===
  sin_categoria: { 
    label: "Sin Categoría", 
    icon: Package, 
    order: 99,
    description: "Productos pendientes de clasificación.",
    stockType: 'unitario'
  },
};

// Opciones de formato/medición
const MEASUREMENT_OPTIONS = [
  { value: "ml", label: "Mililitros (ml)" },
  { value: "unidades", label: "Unidades" },
  { value: "gramos", label: "Gramos (g)" },
];

// Opciones de subcategoría
const SUBCATEGORY_OPTIONS = Object.entries(SUBCATEGORY_CONFIG).map(([value, config]) => ({
  value,
  label: config.label,
}));

const getSubcategoryConfig = (subcategory: string | null) => {
  if (!subcategory) return SUBCATEGORY_CONFIG.sin_categoria;
  return SUBCATEGORY_CONFIG[subcategory] || SUBCATEGORY_CONFIG.sin_categoria;
};

const getUnitDisplay = (category: string) => {
  if (category === "unidades") return "uds";
  if (category === "gramos") return "g";
  return "ml";
};

interface ProductsListProps {
  isReadOnly?: boolean;
}

interface EditingState {
  name: string;
  category: string; // measurement type (ml, unidades, gramos)
  subcategory: string;
}

export const ProductsList = ({ isReadOnly = false }: ProductsListProps) => {
  const { venue } = useActiveVenue();
  const venueId = venue?.id;
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [editingProduct, setEditingProduct] = useState<string | null>(null);
  const [editingState, setEditingState] = useState<EditingState>({ name: "", category: "", subcategory: "" });

  // Fetch products from Supabase
  const { data: products = [], isLoading: loading, refetch } = useQuery({
    queryKey: ["products", venueId],
    queryFn: async () => {
      if (!venueId) return [];
      const { data, error } = await supabase
        .from("products")
        .select("id, name, code, category, subcategory, unit")
        .eq("venue_id", venueId)
        .order("name");
      if (error) throw error;
      return data as Product[];
    },
    enabled: !!venueId,
  });

  // Agrupar productos por subcategoría
  const groupedProducts = useMemo(() => {
    const filtered = searchTerm.trim()
      ? products.filter(p => 
          p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          p.code?.toLowerCase().includes(searchTerm.toLowerCase())
        )
      : products;

    const groups: Record<string, Product[]> = {};
    filtered.forEach(product => {
      const subcategory = product.subcategory || "sin_categoria";
      if (!groups[subcategory]) groups[subcategory] = [];
      groups[subcategory].push(product);
    });

    // Ordenar productos dentro de cada grupo
    Object.keys(groups).forEach(key => {
      groups[key].sort((a, b) => a.name.localeCompare(b.name));
    });

    // Ordenar grupos por orden definido
    return Object.entries(groups)
      .sort(([a], [b]) => {
        const orderA = getSubcategoryConfig(a).order;
        const orderB = getSubcategoryConfig(b).order;
        return orderA - orderB;
      });
  }, [products, searchTerm]);

  // Auto-expandir todas las categorías al cargar
  useMemo(() => {
    if (products.length > 0 && expandedCategories.size === 0) {
      const allCategories = new Set<string>(products.map(p => p.subcategory || "sin_categoria"));
      setExpandedCategories(allCategories);
    }
  }, [products]);

  const toggleCategory = (category: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(category)) {
      newExpanded.delete(category);
    } else {
      newExpanded.add(category);
    }
    setExpandedCategories(newExpanded);
  };

  const handleEditProduct = (product: Product) => {
    setEditingProduct(product.id);
    setEditingState({
      name: product.name,
      category: product.category,
      subcategory: product.subcategory || "sin_categoria",
    });
  };

  const handleSaveProduct = async (productId: string) => {
    try {
      if (!editingState.name.trim()) {
        toast.error("El nombre no puede estar vacío");
        return;
      }

      let newUnit = "ml";
      if (editingState.category === "gramos") newUnit = "g";
      if (editingState.category === "unidades") newUnit = "unidad";

      const { error } = await supabase
        .from("products")
        .update({ 
          name: editingState.name.trim(),
          category: editingState.category as any,
          subcategory: editingState.subcategory === "sin_categoria" ? null : editingState.subcategory,
          unit: newUnit
        })
        .eq("id", productId);

      if (error) throw error;

      toast.success("Producto actualizado");
      setEditingProduct(null);
      refetch();
    } catch (error) {
      console.error("Error updating product:", error);
      toast.error("Error al actualizar producto");
    }
  };

  const handleCancelEdit = () => {
    setEditingProduct(null);
    setEditingState({ name: "", category: "", subcategory: "" });
  };

  const handleDeleteProduct = async (productId: string) => {
    try {
      const { error } = await supabase
        .from("products")
        .delete()
        .eq("id", productId);

      if (error) throw error;

      toast.success("Producto eliminado");
      refetch();
    } catch (error) {
      console.error("Error deleting product:", error);
      toast.error("Error al eliminar producto");
    }
  };

  // Stats
  const stats = useMemo(() => {
    const total = products.length;
    const byFormat = {
      ml: products.filter(p => p.category === "ml").length,
      unidades: products.filter(p => p.category === "unidades").length,
      gramos: products.filter(p => p.category === "gramos").length,
    };
    return { total, byFormat };
  }, [products]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Catálogo de Productos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold">Catálogo de Productos</h2>
          <p className="text-muted-foreground text-sm">
            {stats.total} productos • {stats.byFormat.ml} en ml, {stats.byFormat.unidades} unidades
          </p>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar producto..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Leyenda de tipos de stock según Manual DiStock */}
      <div className="flex flex-wrap gap-2">
        <Badge variant="outline" className="gap-1 bg-amber-500/10 border-amber-500/30">
          <Wine className="h-3 w-3 text-amber-600" />
          Volumétrico = Control por ml
        </Badge>
        <Badge variant="outline" className="gap-1 bg-blue-500/10 border-blue-500/30">
          <Package className="h-3 w-3 text-blue-600" />
          Unitario = Control por unidad
        </Badge>
      </div>

      {/* Listado por categorías */}
      <div className="space-y-4">
        {groupedProducts.map(([subcategory, items]) => {
          const config = getSubcategoryConfig(subcategory);
          const Icon = config.icon;
          const isExpanded = expandedCategories.has(subcategory);

          return (
            <Collapsible key={subcategory} open={isExpanded} onOpenChange={() => toggleCategory(subcategory)}>
              <Card className={config.stockType === 'volumetrico' ? 'border-l-4 border-l-amber-500' : 'border-l-4 border-l-blue-500'}>
                <CollapsibleTrigger asChild>
                  <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${config.stockType === 'volumetrico' ? 'bg-amber-500/10' : 'bg-blue-500/10'}`}>
                        <Icon className={`h-5 w-5 ${config.stockType === 'volumetrico' ? 'text-amber-600' : 'text-blue-600'}`} />
                      </div>
                      <div>
                        <h3 className="font-semibold">{config.label}</h3>
                        <p className="text-xs text-muted-foreground">{config.description}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={config.stockType === 'volumetrico' ? 'default' : 'secondary'} className="text-xs">
                        {items.length} {config.stockType === 'volumetrico' ? 'vol' : 'uds'}
                      </Badge>
                      {isExpanded ? (
                        <ChevronDown className="h-5 w-5 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="border-t divide-y">
                    {items.map((product) => {
                      const isEditing = editingProduct === product.id;
                      const unitDisplay = getUnitDisplay(product.category);

                      return (
                        <div 
                          key={product.id} 
                          className={`p-4 hover:bg-muted/30 transition-colors ${isEditing ? 'bg-muted/20' : ''}`}
                        >
                          {isEditing ? (
                            <div className="space-y-3">
                              {/* Row 1: Name */}
                              <div>
                                <label className="text-xs text-muted-foreground mb-1 block">Nombre</label>
                                <Input
                                  value={editingState.name}
                                  onChange={(e) => setEditingState(prev => ({ ...prev, name: e.target.value }))}
                                  className="h-9"
                                  placeholder="Nombre del producto"
                                />
                              </div>
                              
                              {/* Row 2: Measurement & Category */}
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <label className="text-xs text-muted-foreground mb-1 block">Tipo de Medición</label>
                                  <Select
                                    value={editingState.category}
                                    onValueChange={(val) => setEditingState(prev => ({ ...prev, category: val }))}
                                  >
                                    <SelectTrigger className="h-9">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {MEASUREMENT_OPTIONS.map((opt) => (
                                        <SelectItem key={opt.value} value={opt.value}>
                                          {opt.label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div>
                                  <label className="text-xs text-muted-foreground mb-1 block">Categoría</label>
                                  <Select
                                    value={editingState.subcategory}
                                    onValueChange={(val) => setEditingState(prev => ({ ...prev, subcategory: val }))}
                                  >
                                    <SelectTrigger className="h-9">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {SUBCATEGORY_OPTIONS.map((opt) => (
                                        <SelectItem key={opt.value} value={opt.value}>
                                          {opt.label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                              
                              {/* Row 3: Actions */}
                              <div className="flex justify-end gap-2 pt-1">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={handleCancelEdit}
                                >
                                  <X className="h-4 w-4 mr-1" />
                                  Cancelar
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={() => handleSaveProduct(product.id)}
                                >
                                  <Check className="h-4 w-4 mr-1" />
                                  Guardar
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium truncate">{product.name}</span>
                                  {product.code && (
                                    <Badge variant="secondary" className="text-xs shrink-0">
                                      {product.code}
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  Unidad: {product.unit}
                                </p>
                              </div>
                              
                              <div className="flex items-center gap-2 shrink-0">
                                <Badge 
                                  variant={product.category === "ml" ? "default" : "secondary"}
                                  className="min-w-[60px] justify-center"
                                >
                                  {unitDisplay}
                                </Badge>
                                {!isReadOnly && (
                                  <>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-8 w-8"
                                      onClick={() => handleEditProduct(product)}
                                      title="Editar producto"
                                    >
                                      <Pencil className="h-4 w-4" />
                                    </Button>
                                    <AlertDialog>
                                      <AlertDialogTrigger asChild>
                                        <Button
                                          size="icon"
                                          variant="ghost"
                                          className="h-8 w-8 text-destructive hover:text-destructive"
                                          title="Eliminar producto"
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </Button>
                                      </AlertDialogTrigger>
                                      <AlertDialogContent>
                                        <AlertDialogHeader>
                                          <AlertDialogTitle>¿Eliminar producto?</AlertDialogTitle>
                                          <AlertDialogDescription>
                                            Esta acción eliminará permanentemente "{product.name}". 
                                            No se puede deshacer.
                                          </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                          <AlertDialogAction
                                            onClick={() => handleDeleteProduct(product.id)}
                                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                          >
                                            Eliminar
                                          </AlertDialogAction>
                                        </AlertDialogFooter>
                                      </AlertDialogContent>
                                    </AlertDialog>
                                  </>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
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
            {searchTerm 
              ? "Intenta con otro término de búsqueda" 
              : "Los productos se crean desde el módulo de Inventario"}
          </p>
        </Card>
      )}
    </div>
  );
};
