import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Wine, Droplet, Leaf, Pencil, Trash2, Warehouse } from "lucide-react";
import { toast } from "sonner";
import { formatCLP } from "@/lib/currency";
import { useStockData, ProductWithStock } from "@/hooks/useStockData";
import { StockBreakdownPopover } from "./StockBreakdownPopover";
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
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const categoryIcons = {
  ml: Droplet,
  gramos: Leaf,
  unidades: Wine,
};

const categoryLabels = {
  ml: "Mililitros",
  gramos: "Gramos",
  unidades: "Unidades",
};

// Helper function to get the correct unit display
const getUnitDisplay = (category: string, unit: string) => {
  if (category === "unidades") return "unidades";
  if (category === "gramos") return "g";
  return unit;
};

interface ProductsListProps {
  isReadOnly?: boolean;
}

export const ProductsList = ({ isReadOnly = false }: ProductsListProps) => {
  const { products, loading, refetch } = useStockData();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ProductWithStock | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    category: "",
    minimum_stock: 0,
    unit: "",
    cost_per_unit: 0,
  });

  const getStockStatus = (warehouseStock: number, minimumStock: number) => {
    const percentage = (warehouseStock / minimumStock) * 100;
    if (percentage <= 50) return { color: "destructive", label: "Bodega Crítico" };
    if (percentage <= 100) return { color: "warning", label: "Bodega Bajo" };
    return { color: "default", label: "Normal" };
  };

  const handleEditClick = (product: ProductWithStock) => {
    setSelectedProduct(product);
    setEditForm({
      name: product.name,
      category: product.category,
      minimum_stock: product.minimum_stock,
      unit: product.unit,
      cost_per_unit: product.cost_per_unit || 0,
    });
    setEditDialogOpen(true);
  };

  const handleDeleteClick = (product: ProductWithStock) => {
    setSelectedProduct(product);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!selectedProduct) return;

    try {
      const { error } = await supabase
        .from("products")
        .delete()
        .eq("id", selectedProduct.id);

      if (error) throw error;

      toast.success("Producto eliminado", {
        description: `${selectedProduct.name} ha sido eliminado del inventario`,
      });
      setDeleteDialogOpen(false);
      setSelectedProduct(null);
      refetch();
    } catch (error) {
      console.error("Error deleting product:", error);
      toast.error("Error al eliminar el producto");
    }
  };

  const handleEditSave = async () => {
    if (!selectedProduct) return;

    try {
      const { error } = await supabase
        .from("products")
        .update({
          name: editForm.name,
          category: editForm.category as any,
          minimum_stock: editForm.minimum_stock,
          unit: editForm.unit,
          cost_per_unit: editForm.cost_per_unit,
        })
        .eq("id", selectedProduct.id);

      if (error) throw error;

      toast.success("Producto actualizado", {
        description: `${editForm.name} ha sido actualizado correctamente`,
      });
      setEditDialogOpen(false);
      setSelectedProduct(null);
      refetch();
    } catch (error) {
      console.error("Error updating product:", error);
      toast.error("Error al actualizar el producto");
    }
  };

  if (loading) {
    return (
      <Card className="glass-effect">
        <CardHeader>
          <CardTitle>Productos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-effect shadow-elegant">
      <CardHeader>
        <CardTitle className="text-2xl bg-gradient-to-r from-primary to-primary-glow bg-clip-text text-transparent">
          Inventario de Productos
        </CardTitle>
        <p className="text-sm text-muted-foreground mt-1">
          Stock total = Bodega + Barras. Estado basado en stock de bodega para planificación de reposición.
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {products.map((product) => {
            const Icon = categoryIcons[product.category as keyof typeof categoryIcons];
            const status = getStockStatus(product.warehouseStock, product.minimum_stock);
            const stockPercentage = (product.warehouseStock / product.minimum_stock) * 100;
            const unitDisplay = getUnitDisplay(product.category, product.unit);

            return (
              <div
                key={product.id}
                className="glass-effect p-4 rounded-lg hover-lift"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 primary-gradient rounded-lg">
                      <Icon className="h-5 w-5 text-primary-foreground" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg">{product.name}</h3>
                      <p className="text-sm text-muted-foreground">
                        {categoryLabels[product.category as keyof typeof categoryLabels]}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={status.color as any}
                      className="transition-smooth"
                    >
                      {status.label}
                    </Badge>
                    {!isReadOnly && (
                      <>
                        <Button
                          size="icon"
                          variant="outline"
                          onClick={() => handleEditClick(product)}
                          className="h-8 w-8"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="outline"
                          onClick={() => handleDeleteClick(product)}
                          className="h-8 w-8 hover:bg-destructive hover:text-destructive-foreground"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  {/* Stock breakdown row */}
                  <div className="flex justify-between items-center text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">Stock Total (Bodega + Barras)</span>
                      <StockBreakdownPopover product={product} unit={unitDisplay} />
                    </div>
                    <span className="font-semibold">
                      {product.totalStock} {unitDisplay}
                    </span>
                  </div>
                  
                  {/* Quick breakdown inline */}
                  <div className="flex gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Warehouse className="h-3 w-3" />
                      Bodega: {product.warehouseStock} {unitDisplay}
                    </span>
                    <span className="flex items-center gap-1">
                      <Wine className="h-3 w-3" />
                      Barras: {product.barStock} {unitDisplay}
                    </span>
                  </div>

                  {/* Progress bar based on warehouse stock */}
                  <div className="pt-1">
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span>Stock Bodega vs Mínimo</span>
                      <span>{product.warehouseStock} / {product.minimum_stock}</span>
                    </div>
                    <Progress
                      value={Math.min(stockPercentage, 100)}
                      className="h-2"
                    />
                  </div>

                  <div className="flex justify-between text-xs text-muted-foreground pt-1">
                    <span>Mínimo requerido: {product.minimum_stock} {unitDisplay}</span>
                    <span>Valor total: {formatCLP(product.totalStock * product.cost_per_unit)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>

      {/* Delete Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar producto?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Esto eliminará permanentemente{" "}
              <span className="font-semibold">{selectedProduct?.name}</span> del inventario.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Producto</DialogTitle>
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
              <Select
                value={editForm.category}
                onValueChange={(value) => {
                  let newUnit = "ml";
                  if (value === "gramos") newUnit = "g";
                  if (value === "unidades") newUnit = "unidad";
                  setEditForm({ ...editForm, category: value, unit: newUnit });
                }}
              >
                <SelectTrigger id="edit-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ml">Mililitros</SelectItem>
                  <SelectItem value="gramos">Gramos</SelectItem>
                  <SelectItem value="unidades">Unidades</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-min">Stock Mínimo (Bodega)</Label>
                <Input
                  id="edit-min"
                  type="number"
                  value={editForm.minimum_stock}
                  onChange={(e) => setEditForm({ ...editForm, minimum_stock: Number(e.target.value) })}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="edit-cost">Costo por Unidad</Label>
                <Input
                  id="edit-cost"
                  type="number"
                  step="0.01"
                  value={editForm.cost_per_unit}
                  onChange={(e) => setEditForm({ ...editForm, cost_per_unit: Number(e.target.value) })}
                />
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Nota: El stock se gestiona a través de transferencias entre ubicaciones, no se puede editar directamente aquí.
            </p>
          </div>
          
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleEditSave}>
              Guardar Cambios
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
};
