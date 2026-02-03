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
  X
} from "lucide-react";
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

// Subcategorías del Manual DiStock
const SUBCATEGORY_CONFIG: Record<string, { label: string; icon: typeof Wine; order: number }> = {
  botellas_1500: { label: "Botellas 1.5L", icon: Wine, order: 1 },
  botellas_1000: { label: "Botellas 1000ml", icon: Wine, order: 2 },
  botellas_750: { label: "Botellas 750ml", icon: Wine, order: 3 },
  botellas_700: { label: "Botellas 700ml", icon: Wine, order: 4 },
  botellines: { label: "Botellines/Cervezas", icon: Wine, order: 5 },
  mixers_latas: { label: "Mixers Latas", icon: Droplet, order: 6 },
  mixers_redbull: { label: "Mixers Red Bull", icon: Droplet, order: 7 },
  jugos: { label: "Jugos", icon: Droplet, order: 8 },
  aguas: { label: "Aguas", icon: Droplet, order: 9 },
  bebidas_1500: { label: "Bebidas 1.5L", icon: Droplet, order: 10 },
  sin_categoria: { label: "Sin Categoría", icon: Package, order: 99 },
};

// Formatos de medida
const FORMAT_OPTIONS = [
  { value: "ml", label: "Mililitros (ml)" },
  { value: "unidades", label: "Unidades" },
  { value: "gramos", label: "Gramos (g)" },
];

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

export const ProductsList = ({ isReadOnly = false }: ProductsListProps) => {
  const { products, loading, refetch } = useStockData();
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [editingProduct, setEditingProduct] = useState<string | null>(null);
  const [editingFormat, setEditingFormat] = useState<string>("");

  // Agrupar productos por subcategoría
  const groupedProducts = useMemo(() => {
    const filtered = searchTerm.trim()
      ? products.filter(p => 
          p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          p.code?.toLowerCase().includes(searchTerm.toLowerCase())
        )
      : products;

    const groups: Record<string, ProductWithStock[]> = {};
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
      const allCategories = new Set(products.map(p => p.subcategory || "sin_categoria"));
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

  const handleEditFormat = (product: ProductWithStock) => {
    setEditingProduct(product.id);
    setEditingFormat(product.category);
  };

  const handleSaveFormat = async (productId: string) => {
    try {
      let newUnit = "ml";
      if (editingFormat === "gramos") newUnit = "g";
      if (editingFormat === "unidades") newUnit = "unidad";

      const { error } = await supabase
        .from("products")
        .update({ 
          category: editingFormat as any,
          unit: newUnit
        })
        .eq("id", productId);

      if (error) throw error;

      toast.success("Formato actualizado");
      setEditingProduct(null);
      refetch();
    } catch (error) {
      console.error("Error updating format:", error);
      toast.error("Error al actualizar formato");
    }
  };

  const handleCancelEdit = () => {
    setEditingProduct(null);
    setEditingFormat("");
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

      {/* Leyenda de formatos */}
      <div className="flex flex-wrap gap-2">
        <Badge variant="outline" className="gap-1">
          <Droplet className="h-3 w-3" />
          ml = Mililitros (licores, jugos)
        </Badge>
        <Badge variant="outline" className="gap-1">
          <Wine className="h-3 w-3" />
          uds = Unidades (botellas, latas)
        </Badge>
        <Badge variant="outline" className="gap-1">
          <Package className="h-3 w-3" />
          g = Gramos (snacks, insumos)
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
              <Card>
                <CollapsibleTrigger asChild>
                  <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-primary/10 rounded-lg">
                        <Icon className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold">{config.label}</h3>
                        <p className="text-xs text-muted-foreground">{items.length} productos</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{items.length}</Badge>
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
                          className="flex items-center justify-between p-4 hover:bg-muted/30 transition-colors"
                        >
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
                              Stock: {product.totalStock} {unitDisplay}
                            </p>
                          </div>
                          
                          <div className="flex items-center gap-2 shrink-0">
                            {isEditing ? (
                              <>
                                <Select
                                  value={editingFormat}
                                  onValueChange={setEditingFormat}
                                >
                                  <SelectTrigger className="w-32 h-8">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {FORMAT_OPTIONS.map((opt) => (
                                      <SelectItem key={opt.value} value={opt.value}>
                                        {opt.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 text-primary"
                                  onClick={() => handleSaveFormat(product.id)}
                                >
                                  <Check className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8"
                                  onClick={handleCancelEdit}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </>
                            ) : (
                              <>
                                <Badge 
                                  variant={product.category === "ml" ? "default" : "secondary"}
                                  className="min-w-[60px] justify-center"
                                >
                                  {unitDisplay}
                                </Badge>
                                {!isReadOnly && (
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-8 w-8"
                                    onClick={() => handleEditFormat(product)}
                                    title="Cambiar formato"
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                )}
                              </>
                            )}
                          </div>
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
