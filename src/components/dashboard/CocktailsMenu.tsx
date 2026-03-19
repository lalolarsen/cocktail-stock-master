import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { 
  Pencil, 
  Trash2, 
  Plus, 
  Loader2, 
  Search,
  Wine,
  Beer,
  GlassWater,
  Sparkles,
  Package,
  Tag,
  ChevronDown,
  ChevronRight,
  FileSpreadsheet
} from "lucide-react";
import { MenuImportDialog } from "./MenuImportDialog";
import { CategoryRecipeEditor, type IngredientEntry } from "./CategoryRecipeEditor";
import { toast } from "sonner";
import { formatCLP } from "@/lib/currency";
import { useActiveVenue } from "@/hooks/useActiveVenue";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface Cocktail {
  id: string;
  name: string;
  description: string | null;
  price: number;
  category: string;
  venue_id: string;
}

interface Ingredient {
  id: string;
  product_id: string | null;
  quantity: number;
  product_name: string;
  product_category: string;
  product_unit: string;
}

interface CocktailWithIngredients extends Cocktail {
  ingredients: Ingredient[];
}

interface Product {
  id: string;
  name: string;
  category: string;
  unit: string;
  capacity_ml?: number | null;
}

interface CocktailsMenuProps {
  isReadOnly?: boolean;
}

import { normalizeCategory, getCategoryDef, compareCategoryOrder, CATEGORIES } from "@/lib/categories";

const getCategoryConfig = (category: string) => {
  const def = getCategoryDef(category);
  return { label: def.label, icon: def.icon, order: def.order };
};

export const CocktailsMenu = ({ isReadOnly = false }: CocktailsMenuProps) => {
  const { venue } = useActiveVenue();
  const [cocktails, setCocktails] = useState<CocktailWithIngredients[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCocktail, setSelectedCocktail] = useState<CocktailWithIngredients | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  
  const [editForm, setEditForm] = useState({
    name: "",
    description: "",
    price: 0,
    category: "otros",
    ingredients: [] as IngredientEntry[],
  });

  // Group cocktails by category
  const groupedCocktails = useMemo(() => {
    const filtered = searchTerm.trim()
      ? cocktails.filter(c => 
          c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          c.category.toLowerCase().includes(searchTerm.toLowerCase())
        )
      : cocktails;

    const groups: Record<string, CocktailWithIngredients[]> = {};
    filtered.forEach(cocktail => {
      const category = normalizeCategory(cocktail.category);
      if (!groups[category]) groups[category] = [];
      groups[category].push(cocktail);
    });

    // Sort groups by configured order
    return Object.entries(groups)
      .sort(([a], [b]) => compareCategoryOrder(a, b));
  }, [cocktails, searchTerm]);

  // Auto-expand all categories on load
  useEffect(() => {
    if (cocktails.length > 0 && expandedCategories.size === 0) {
      const allCategories = new Set(cocktails.map(c => normalizeCategory(c.category)));
      setExpandedCategories(allCategories);
    }
  }, [cocktails]);

  useEffect(() => {
    if (!venue?.id) return;
    
    fetchCocktails();
    fetchProducts();
    
    const channel = supabase
      .channel('cocktails-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cocktails' }, () => {
        fetchCocktails();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cocktail_ingredients' }, () => {
        fetchCocktails();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [venue?.id]);

  const fetchProducts = async () => {
    const { data, error } = await supabase
      .from("products")
      .select("id, name, category, unit, capacity_ml")
      .order("name");

    if (error) {
      console.error("Error fetching products:", error);
      return;
    }

    setProducts(data || []);
  };

  const fetchCocktails = async () => {
    if (!venue?.id) return;
    
    setLoading(true);
    const { data: cocktailsData, error: cocktailsError } = await supabase
      .from("cocktails")
      .select("*")
      .eq("venue_id", venue.id)
      .order("name");

    if (cocktailsError) {
      console.error("Error fetching cocktails:", cocktailsError);
      setLoading(false);
      return;
    }

    // Fetch ingredients for each cocktail
    const cocktailsWithIngredients = await Promise.all(
      (cocktailsData || []).map(async (cocktail) => {
        const { data: ingredientsData } = await supabase
          .from("cocktail_ingredients")
          .select(`
            id,
            product_id,
            quantity,
            products (
              name,
              category,
              unit,
              capacity_ml
            )
          `)
          .eq("cocktail_id", cocktail.id);

        const ingredients = (ingredientsData || []).map((ing: any) => ({
          id: ing.id,
          product_id: ing.product_id,
          quantity: ing.quantity,
          product_name: ing.products?.name || "",
          product_category: ing.products?.category || "",
          product_unit: ing.products?.unit || "",
          product_capacity_ml: ing.products?.capacity_ml ?? null,
        }));

        return {
          ...cocktail,
          ingredients,
        };
      })
    );

    setCocktails(cocktailsWithIngredients);
    setLoading(false);
  };

  const toggleCategory = (category: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(category)) {
      newExpanded.delete(category);
    } else {
      newExpanded.add(category);
    }
    setExpandedCategories(newExpanded);
  };

  /**
   * Map DB mixer_category ('latas'|'redbull'|'MIXER_TRADICIONAL'|'REDBULL')
   * to the canonical UI values used by CategoryRecipeEditor.
   */
  const toUIMixerCategory = (raw: string | null | undefined): "MIXER_TRADICIONAL" | "REDBULL" | undefined => {
    if (!raw) return "MIXER_TRADICIONAL";
    const n = raw.toUpperCase();
    if (n === "REDBULL" || n.includes("REDBULL")) return "REDBULL";
    return "MIXER_TRADICIONAL";
  };

  const handleEditClick = (cocktail: CocktailWithIngredients) => {
    setSelectedCocktail(cocktail);
    setEditForm({
      name: cocktail.name,
      description: cocktail.description || "",
      price: cocktail.price,
      category: cocktail.category,
      ingredients: cocktail.ingredients.map((ing: any) => {
        const isMixer = ing.is_mixer_slot || false;
        // Determine ingredient_type explicitly from DB data
        let ingredient_type: "ML" | "UD" | "MIXER" = "UD";
        if (isMixer) {
          ingredient_type = "MIXER";
        } else if ((ing.product_capacity_ml ?? 0) > 0) {
          ingredient_type = "ML";
        } else if (ing.product_unit === "ml" || (ing.product_category ?? "").toLowerCase().includes("botella")) {
          ingredient_type = "ML";
        }
        return {
          product_id: ing.product_id || "",
          quantity: ing.quantity,
          ingredient_type,
          is_mixer_slot: isMixer,
          mixer_category: isMixer ? toUIMixerCategory(ing.mixer_category) : undefined,
        } as IngredientEntry;
      }),
    });
    setEditDialogOpen(true);
  };

  const handleAddClick = () => {
    setEditForm({
      name: "",
      description: "",
      price: 0,
      category: "otros",
      ingredients: [],
    });
    setAddDialogOpen(true);
  };

  const handleDeleteClick = (cocktail: CocktailWithIngredients) => {
    setSelectedCocktail(cocktail);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!selectedCocktail) return;

    try {
      await supabase
        .from("cocktail_ingredients")
        .delete()
        .eq("cocktail_id", selectedCocktail.id);

      const { error } = await supabase
        .from("cocktails")
        .delete()
        .eq("id", selectedCocktail.id);

      if (error) throw error;

      toast.success("Producto eliminado correctamente");
      setDeleteDialogOpen(false);
      fetchCocktails();
    } catch (error) {
      console.error("Error deleting cocktail:", error);
      toast.error("Error al eliminar el producto");
    }
  };

  /** Map UI mixer_category → DB string expected by cocktail_ingredients */
  const toDBMixerCategory = (cat: string | undefined): string => {
    if (cat === "REDBULL") return "redbull";
    return "latas";
  };

  const handleSave = async () => {
    if (!selectedCocktail) return;

    // Validate: only name + price required
    if (!editForm.name.trim()) { toast.error("El nombre es obligatorio"); return; }
    if (!editForm.price || editForm.price <= 0) { toast.error("El precio debe ser mayor a 0"); return; }

    try {
      const { error: cocktailError } = await supabase
        .from("cocktails")
        .update({
          name: editForm.name.trim(),
          description: editForm.description,
          price: editForm.price,
          category: editForm.category,
        })
        .eq("id", selectedCocktail.id);

      if (cocktailError) throw cocktailError;

      // Delete existing ingredients
      await supabase
        .from("cocktail_ingredients")
        .delete()
        .eq("cocktail_id", selectedCocktail.id);

      // Insert new ingredients (mixer slots need product_id=null, others need a real id)
      const validIngredients = editForm.ingredients.filter(ing =>
        ing.is_mixer_slot || (ing.product_id && ing.product_id.trim() !== "")
      );

      if (validIngredients.length > 0 && venue?.id) {
        const { error: ingredientsError } = await supabase
          .from("cocktail_ingredients")
          .insert(
            validIngredients.map(ing => ({
              cocktail_id: selectedCocktail.id,
              product_id: ing.is_mixer_slot ? null : ing.product_id,
              quantity: ing.quantity,
              venue_id: venue.id,
              is_mixer_slot: ing.is_mixer_slot ?? false,
              mixer_category: ing.is_mixer_slot ? toDBMixerCategory(ing.mixer_category) : null,
            }))
          );
        if (ingredientsError) throw ingredientsError;
      }

      toast.success("Producto actualizado correctamente");
      setEditDialogOpen(false);
      fetchCocktails();
    } catch (error) {
      console.error("Error updating cocktail:", error);
      toast.error("Error al actualizar el producto");
    }
  };

  const handleAdd = async () => {
    if (!venue?.id) { toast.error("No se pudo determinar el venue activo"); return; }

    // Validate: only name + price required
    if (!editForm.name.trim()) { toast.error("El nombre es obligatorio"); return; }
    if (!editForm.price || editForm.price <= 0) { toast.error("El precio debe ser mayor a 0"); return; }

    try {
      const { data: cocktailData, error: cocktailError } = await supabase
        .from("cocktails")
        .insert({
          name: editForm.name.trim(),
          description: editForm.description,
          price: editForm.price,
          category: editForm.category,
          venue_id: venue.id,
        })
        .select()
        .single();

      if (cocktailError) throw cocktailError;

      const validIngredients = editForm.ingredients.filter(ing =>
        ing.is_mixer_slot || (ing.product_id && ing.product_id.trim() !== "")
      );

      if (validIngredients.length > 0) {
        const { error: ingredientsError } = await supabase
          .from("cocktail_ingredients")
          .insert(
            validIngredients.map(ing => ({
              cocktail_id: cocktailData.id,
              product_id: ing.is_mixer_slot ? null : ing.product_id,
              quantity: ing.quantity,
              venue_id: venue.id,
              is_mixer_slot: ing.is_mixer_slot ?? false,
              mixer_category: ing.is_mixer_slot ? toDBMixerCategory(ing.mixer_category) : null,
            }))
          );
        if (ingredientsError) throw ingredientsError;
      }

      toast.success("Producto agregado correctamente");
      setAddDialogOpen(false);
      fetchCocktails();
    } catch (error) {
      console.error("Error adding cocktail:", error);
      toast.error("Error al agregar el producto");
    }
  };

  // Stats
  const stats = useMemo(() => {
    const totalItems = cocktails.length;
    const totalCategories = new Set(cocktails.map(c => c.category)).size;
    const avgPrice = totalItems > 0 
      ? Math.round(cocktails.reduce((sum, c) => sum + c.price, 0) / totalItems)
      : 0;
    return { totalItems, totalCategories, avgPrice };
  }, [cocktails]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold">Carta de Productos</h2>
          <p className="text-muted-foreground text-sm">
            {stats.totalItems} productos en {stats.totalCategories} categorías
          </p>
        </div>
        <div className="flex gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar producto..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
          {!isReadOnly && (
            <>
              <Button variant="outline" onClick={() => setImportDialogOpen(true)}>
                <FileSpreadsheet className="w-4 h-4 mr-2" />
                Importar
              </Button>
              <Button onClick={handleAddClick}>
                <Plus className="w-4 h-4 mr-2" />
                Agregar
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="p-4">
          <div className="text-2xl font-bold">{stats.totalItems}</div>
          <div className="text-xs text-muted-foreground">Productos</div>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-bold">{stats.totalCategories}</div>
          <div className="text-xs text-muted-foreground">Categorías</div>
        </Card>
      </div>

      {/* Categories */}
      <div className="space-y-4">
        {groupedCocktails.map(([category, items]) => {
          const config = getCategoryConfig(category);
          const Icon = config.icon;
          const isExpanded = expandedCategories.has(category);

          return (
            <Collapsible key={category} open={isExpanded} onOpenChange={() => toggleCategory(category)}>
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
                  <div className="border-t">
                    <div className="divide-y">
                      {items.map((item) => (
                        <div 
                          key={item.id} 
                          className="flex items-center justify-between p-4 hover:bg-muted/30 transition-colors"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium truncate">{item.name}</span>
                            </div>
                            {item.description && (
                              <p className="text-xs text-muted-foreground truncate mt-0.5">
                                {item.description}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-4 shrink-0">
                            <span className="text-lg font-bold text-primary tabular-nums">
                              {formatCLP(item.price)}
                            </span>
                            {!isReadOnly && (
                              <div className="flex gap-1">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => handleEditClick(item)}
                                  className="h-8 w-8"
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => handleDeleteClick(item)}
                                  className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          );
        })}
      </div>

      {groupedCocktails.length === 0 && (
        <Card className="p-12 text-center">
          <Wine className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <h3 className="text-lg font-semibold mb-2">
            {searchTerm ? "No se encontraron productos" : "No hay productos en la carta"}
          </h3>
          <p className="text-muted-foreground text-sm">
            {searchTerm 
              ? "Intenta con otro término de búsqueda" 
              : "Agrega productos para comenzar a vender"}
          </p>
        </Card>
      )}

      {/* Delete Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar producto?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Se eliminará "{selectedCocktail?.name}" 
              de la carta.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive text-destructive-foreground">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Producto</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Nombre</Label>
                <Input
                  id="edit-name"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-price">Precio</Label>
                <Input
                  id="edit-price"
                  type="number"
                  value={editForm.price}
                  onChange={(e) => setEditForm({ ...editForm, price: Number(e.target.value) })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-category">Categoría</Label>
              <Select 
                value={editForm.category} 
                onValueChange={(value) => setEditForm({ ...editForm, category: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar categoría" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORIES).map(([key, def]) => (
                    <SelectItem key={key} value={key}>
                      {def.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-description">Descripción (opcional)</Label>
              <Textarea
                id="edit-description"
                value={editForm.description}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                rows={2}
              />
            </div>

            <CategoryRecipeEditor
              category={editForm.category}
              ingredients={editForm.ingredients}
              products={products}
              onChange={(ingredients) => setEditForm({ ...editForm, ingredients })}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave}>Guardar Cambios</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Agregar Producto</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="add-name">Nombre</Label>
                <Input
                  id="add-name"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="add-price">Precio</Label>
                <Input
                  id="add-price"
                  type="number"
                  value={editForm.price}
                  onChange={(e) => setEditForm({ ...editForm, price: Number(e.target.value) })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="add-category">Categoría</Label>
              <Select 
                value={editForm.category} 
                onValueChange={(value) => setEditForm({ ...editForm, category: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar categoría" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORIES).map(([key, def]) => (
                    <SelectItem key={key} value={key}>
                      {def.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="add-description">Descripción (opcional)</Label>
              <Textarea
                id="add-description"
                value={editForm.description}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                rows={2}
              />
            </div>

            <CategoryRecipeEditor
              category={editForm.category}
              ingredients={editForm.ingredients}
              products={products}
              onChange={(ingredients) => setEditForm({ ...editForm, ingredients })}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleAdd}>Agregar Producto</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Dialog */}
      {venue?.id && (
        <MenuImportDialog
          open={importDialogOpen}
          onOpenChange={setImportDialogOpen}
          venueId={venue.id}
          onImportComplete={fetchCocktails}
        />
      )}
    </div>
  );
};
