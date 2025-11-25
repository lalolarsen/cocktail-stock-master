import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Wine, Pencil, Trash2, Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatCLP } from "@/lib/currency";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Cocktail {
  id: string;
  name: string;
  description: string | null;
  price: number;
  category: string;
}

interface Ingredient {
  id: string;
  product_id: string;
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
}

export const CocktailsMenu = () => {
  const [cocktails, setCocktails] = useState<CocktailWithIngredients[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCocktail, setSelectedCocktail] = useState<CocktailWithIngredients | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  
  const [editForm, setEditForm] = useState({
    name: "",
    description: "",
    price: 0,
    category: "Clásicos",
    ingredients: [] as { product_id: string; quantity: number }[],
  });

  useEffect(() => {
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
  }, []);

  const fetchProducts = async () => {
    const { data, error } = await supabase
      .from("products")
      .select("id, name, category, unit")
      .order("name");

    if (error) {
      console.error("Error fetching products:", error);
      return;
    }

    setProducts(data || []);
  };

  const fetchCocktails = async () => {
    setLoading(true);
    const { data: cocktailsData, error: cocktailsError } = await supabase
      .from("cocktails")
      .select("*")
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
              unit
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

  const handleEditClick = (cocktail: CocktailWithIngredients) => {
    setSelectedCocktail(cocktail);
    setEditForm({
      name: cocktail.name,
      description: cocktail.description || "",
      price: cocktail.price,
      category: cocktail.category,
      ingredients: cocktail.ingredients.map(ing => ({
        product_id: ing.product_id,
        quantity: ing.quantity,
      })),
    });
    setEditDialogOpen(true);
  };

  const handleAddClick = () => {
    setEditForm({
      name: "",
      description: "",
      price: 0,
      category: "Clásicos",
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
      // Delete ingredients first
      await supabase
        .from("cocktail_ingredients")
        .delete()
        .eq("cocktail_id", selectedCocktail.id);

      // Then delete cocktail
      const { error } = await supabase
        .from("cocktails")
        .delete()
        .eq("id", selectedCocktail.id);

      if (error) throw error;

      toast.success("Cóctel eliminado correctamente");
      setDeleteDialogOpen(false);
      fetchCocktails();
    } catch (error) {
      console.error("Error deleting cocktail:", error);
      toast.error("Error al eliminar el cóctel");
    }
  };

  const handleSave = async () => {
    if (!selectedCocktail) return;

    try {
      // Update cocktail
      const { error: cocktailError } = await supabase
        .from("cocktails")
        .update({
          name: editForm.name,
          description: editForm.description,
          price: editForm.price,
          category: editForm.category,
        })
        .eq("id", selectedCocktail.id);

      if (cocktailError) throw cocktailError;

      // Delete old ingredients
      await supabase
        .from("cocktail_ingredients")
        .delete()
        .eq("cocktail_id", selectedCocktail.id);

      // Insert new ingredients
      if (editForm.ingredients.length > 0) {
        const { error: ingredientsError } = await supabase
          .from("cocktail_ingredients")
          .insert(
            editForm.ingredients.map(ing => ({
              cocktail_id: selectedCocktail.id,
              product_id: ing.product_id,
              quantity: ing.quantity,
            }))
          );

        if (ingredientsError) throw ingredientsError;
      }

      toast.success("Cóctel actualizado correctamente");
      setEditDialogOpen(false);
      fetchCocktails();
    } catch (error) {
      console.error("Error updating cocktail:", error);
      toast.error("Error al actualizar el cóctel");
    }
  };

  const handleAdd = async () => {
    try {
      // Insert cocktail
      const { data: cocktailData, error: cocktailError } = await supabase
        .from("cocktails")
        .insert({
          name: editForm.name,
          description: editForm.description,
          price: editForm.price,
          category: editForm.category,
        })
        .select()
        .single();

      if (cocktailError) throw cocktailError;

      // Insert ingredients
      if (editForm.ingredients.length > 0) {
        const { error: ingredientsError } = await supabase
          .from("cocktail_ingredients")
          .insert(
            editForm.ingredients.map(ing => ({
              cocktail_id: cocktailData.id,
              product_id: ing.product_id,
              quantity: ing.quantity,
            }))
          );

        if (ingredientsError) throw ingredientsError;
      }

      toast.success("Cóctel agregado correctamente");
      setAddDialogOpen(false);
      fetchCocktails();
    } catch (error) {
      console.error("Error adding cocktail:", error);
      toast.error("Error al agregar el cóctel");
    }
  };

  const addIngredient = () => {
    setEditForm({
      ...editForm,
      ingredients: [...editForm.ingredients, { product_id: "", quantity: 0 }],
    });
  };

  const removeIngredient = (index: number) => {
    setEditForm({
      ...editForm,
      ingredients: editForm.ingredients.filter((_, i) => i !== index),
    });
  };

  const updateIngredient = (index: number, field: "product_id" | "quantity", value: string | number) => {
    const newIngredients = [...editForm.ingredients];
    newIngredients[index] = { ...newIngredients[index], [field]: value };
    setEditForm({ ...editForm, ingredients: newIngredients });
  };

  const getUnitDisplay = (category: string, unit: string) => {
    if (category === "unidades") return "unidades";
    if (category === "gramos") return "g";
    return unit;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-bold gradient-text">Menú de Cócteles</h2>
        <Button onClick={handleAddClick} className="primary-gradient">
          <Plus className="w-4 h-4 mr-2" />
          Agregar Cóctel
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {cocktails.map((cocktail) => (
          <Card key={cocktail.id} className="glass-effect shadow-elegant hover-lift">
            <CardHeader>
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-2">
                  <Wine className="h-5 w-5 text-primary" />
                  <CardTitle className="text-xl">{cocktail.name}</CardTitle>
                </div>
                <div className="flex gap-1">
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => handleEditClick(cocktail)}
                    className="h-8 w-8"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => handleDeleteClick(cocktail)}
                    className="h-8 w-8 hover:bg-destructive hover:text-destructive-foreground"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <Badge variant="secondary" className="w-fit">
                {cocktail.category}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-4">
              {cocktail.description && (
                <p className="text-sm text-muted-foreground">{cocktail.description}</p>
              )}
              
              <div className="space-y-2">
                <h4 className="font-semibold text-sm">Ingredientes:</h4>
                <ul className="space-y-1">
                  {cocktail.ingredients.map((ing) => (
                    <li key={ing.id} className="text-sm flex justify-between">
                      <span className="text-muted-foreground">{ing.product_name}</span>
                      <span className="font-medium">
                        {ing.quantity} {getUnitDisplay(ing.product_category, ing.product_unit)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="pt-4 border-t border-border">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Precio:</span>
                  <span className="text-xl font-bold text-primary">
                    {formatCLP(cocktail.price)}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Delete Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar cóctel?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Se eliminará el cóctel "{selectedCocktail?.name}" 
              y todos sus ingredientes.
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
            <DialogTitle>Editar Cóctel</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Nombre</Label>
              <Input
                id="edit-name"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-category">Categoría</Label>
              <Input
                id="edit-category"
                value={editForm.category}
                onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                placeholder="Ej: Clásicos, Refrescantes, Tropicales"
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

            <div className="space-y-2">
              <Label htmlFor="edit-description">Descripción</Label>
              <Textarea
                id="edit-description"
                value={editForm.description}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                rows={3}
              />
            </div>

            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <Label>Ingredientes</Label>
                <Button type="button" size="sm" onClick={addIngredient} variant="outline">
                  <Plus className="w-4 h-4 mr-1" />
                  Agregar
                </Button>
              </div>

              {editForm.ingredients.map((ingredient, index) => (
                <div key={index} className="flex gap-2 items-end">
                  <div className="flex-1 space-y-2">
                    <Label>Producto</Label>
                    <Select
                      value={ingredient.product_id}
                      onValueChange={(value) => updateIngredient(index, "product_id", value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar producto" />
                      </SelectTrigger>
                      <SelectContent>
                        {products.map((product) => (
                          <SelectItem key={product.id} value={product.id}>
                            {product.name} ({getUnitDisplay(product.category, product.unit)})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-32 space-y-2">
                    <Label>Cantidad</Label>
                    <Input
                      type="number"
                      value={ingredient.quantity}
                      onChange={(e) => updateIngredient(index, "quantity", Number(e.target.value))}
                      min="0"
                      step="0.01"
                    />
                  </div>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    onClick={() => removeIngredient(index)}
                    className="hover:bg-destructive hover:text-destructive-foreground"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} className="primary-gradient">
              Guardar Cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Agregar Cóctel</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="add-name">Nombre</Label>
              <Input
                id="add-name"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="add-category">Categoría</Label>
              <Input
                id="add-category"
                value={editForm.category}
                onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                placeholder="Ej: Clásicos, Refrescantes, Tropicales"
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

            <div className="space-y-2">
              <Label htmlFor="add-description">Descripción</Label>
              <Textarea
                id="add-description"
                value={editForm.description}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                rows={3}
              />
            </div>

            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <Label>Ingredientes</Label>
                <Button type="button" size="sm" onClick={addIngredient} variant="outline">
                  <Plus className="w-4 h-4 mr-1" />
                  Agregar
                </Button>
              </div>

              {editForm.ingredients.map((ingredient, index) => (
                <div key={index} className="flex gap-2 items-end">
                  <div className="flex-1 space-y-2">
                    <Label>Producto</Label>
                    <Select
                      value={ingredient.product_id}
                      onValueChange={(value) => updateIngredient(index, "product_id", value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar producto" />
                      </SelectTrigger>
                      <SelectContent>
                        {products.map((product) => (
                          <SelectItem key={product.id} value={product.id}>
                            {product.name} ({getUnitDisplay(product.category, product.unit)})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-32 space-y-2">
                    <Label>Cantidad</Label>
                    <Input
                      type="number"
                      value={ingredient.quantity}
                      onChange={(e) => updateIngredient(index, "quantity", Number(e.target.value))}
                      min="0"
                      step="0.01"
                    />
                  </div>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    onClick={() => removeIngredient(index)}
                    className="hover:bg-destructive hover:text-destructive-foreground"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleAdd} className="primary-gradient">
              Agregar Cóctel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};