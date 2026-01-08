import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { formatCLP } from "@/lib/currency";
import {
  ArrowLeft,
  Package,
  Check,
  X,
  Loader2,
  AlertCircle,
  ShoppingCart,
} from "lucide-react";

interface PendingProduct {
  id: string;
  name: string;
  code: string;
  category: string;
  unit: string;
  cost_per_unit: number | null;
  minimum_stock: number;
  current_stock: number;
  created_at: string;
}

export default function PendingCatalog() {
  const navigate = useNavigate();
  const [products, setProducts] = useState<PendingProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activating, setActivating] = useState(false);

  useEffect(() => {
    fetchPendingProducts();
  }, []);

  const fetchPendingProducts = async () => {
    try {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("is_active_in_sales", false)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setProducts(data || []);
    } catch (error) {
      console.error("Error fetching pending products:", error);
      toast.error("Error al cargar productos pendientes");
    } finally {
      setLoading(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === products.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(products.map((p) => p.id)));
    }
  };

  const handleActivate = async () => {
    if (selectedIds.size === 0) {
      toast.error("Seleccione al menos un producto");
      return;
    }

    setActivating(true);
    try {
      const { error } = await supabase
        .from("products")
        .update({ is_active_in_sales: true })
        .in("id", Array.from(selectedIds));

      if (error) throw error;

      toast.success(`${selectedIds.size} producto(s) activado(s) para ventas`);
      setSelectedIds(new Set());
      fetchPendingProducts();
    } catch (error) {
      console.error("Error activating products:", error);
      toast.error("Error al activar productos");
    } finally {
      setActivating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Está seguro de eliminar este producto? Esta acción no se puede deshacer.")) {
      return;
    }

    try {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) throw error;
      toast.success("Producto eliminado");
      fetchPendingProducts();
    } catch (error) {
      console.error("Error deleting product:", error);
      toast.error("Error al eliminar producto");
    }
  };

  const getCategoryLabel = (category: string) => {
    switch (category) {
      case "ml":
        return "Mililitros";
      case "gramos":
        return "Gramos";
      case "unidades":
        return "Unidades";
      default:
        return category;
    }
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
          <h1 className="text-lg font-semibold">Productos Pendientes de Aprobación</h1>
        </div>
      </header>

      <main className="p-6 max-w-5xl mx-auto space-y-6">
        {/* Info banner */}
        <div className="flex items-center gap-3 p-4 bg-blue-500/10 rounded-lg text-blue-700">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <div>
            <p className="font-medium">Aprobación de catálogo</p>
            <p className="text-sm opacity-80">
              Los productos importados desde facturas o Excel no aparecen en el POS hasta que sean
              aprobados aquí.
            </p>
          </div>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Productos pendientes ({products.length})
            </CardTitle>
            {selectedIds.size > 0 && (
              <Button onClick={handleActivate} disabled={activating} className="gap-2">
                {activating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ShoppingCart className="h-4 w-4" />
                )}
                Activar para ventas ({selectedIds.size})
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : products.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Check className="h-12 w-12 mx-auto mb-4 text-green-500" />
                <p className="text-lg font-medium">No hay productos pendientes</p>
                <p className="text-sm">Todos los productos están activos para ventas</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={selectedIds.size === products.length && products.length > 0}
                        onCheckedChange={toggleSelectAll}
                      />
                    </TableHead>
                    <TableHead>Producto</TableHead>
                    <TableHead>Código</TableHead>
                    <TableHead>Categoría</TableHead>
                    <TableHead className="text-right">Costo</TableHead>
                    <TableHead className="text-right">Stock</TableHead>
                    <TableHead className="w-24">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.has(product.id)}
                          onCheckedChange={() => toggleSelect(product.id)}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{product.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{product.code}</Badge>
                      </TableCell>
                      <TableCell>{getCategoryLabel(product.category)}</TableCell>
                      <TableCell className="text-right">
                        {product.cost_per_unit ? formatCLP(product.cost_per_unit) : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        {product.current_stock} {product.unit}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setSelectedIds(new Set([product.id]));
                              handleActivate();
                            }}
                            title="Activar para ventas"
                          >
                            <Check className="h-4 w-4 text-green-600" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(product.id)}
                            title="Eliminar producto"
                          >
                            <X className="h-4 w-4 text-red-600" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
