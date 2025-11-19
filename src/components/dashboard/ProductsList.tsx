import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Wine, Droplet, Citrus, Leaf } from "lucide-react";

interface Product {
  id: string;
  name: string;
  category: string;
  current_stock: number;
  minimum_stock: number;
  unit: string;
  cost_per_unit: number;
}

const categoryIcons = {
  con_alcohol: Wine,
  sin_alcohol: Droplet,
  mixers: Droplet,
  garnish: Citrus,
  otros: Leaf,
};

const categoryLabels = {
  con_alcohol: "Con Alcohol",
  sin_alcohol: "Sin Alcohol",
  mixers: "Mixers",
  garnish: "Guarniciones",
  otros: "Otros",
};

export const ProductsList = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProducts();

    const channel = supabase
      .channel("products-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "products" },
        () => {
          fetchProducts();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchProducts = async () => {
    try {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .order("name");

      if (error) throw error;
      setProducts(data || []);
    } catch (error) {
      console.error("Error fetching products:", error);
    } finally {
      setLoading(false);
    }
  };

  const getStockStatus = (current: number, minimum: number) => {
    const percentage = (current / minimum) * 100;
    if (percentage <= 50) return { color: "destructive", label: "Crítico" };
    if (percentage <= 100) return { color: "warning", label: "Bajo" };
    return { color: "default", label: "Normal" };
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
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {products.map((product) => {
            const Icon = categoryIcons[product.category as keyof typeof categoryIcons];
            const status = getStockStatus(product.current_stock, product.minimum_stock);
            const stockPercentage = (product.current_stock / product.minimum_stock) * 100;

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
                  <Badge
                    variant={status.color as any}
                    className="transition-smooth"
                  >
                    {status.label}
                  </Badge>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Stock actual</span>
                    <span className="font-semibold">
                      {product.current_stock} {product.unit}
                    </span>
                  </div>
                  <Progress
                    value={Math.min(stockPercentage, 100)}
                    className="h-2"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Mínimo: {product.minimum_stock} {product.unit}</span>
                    <span>Valor: ${(product.current_stock * product.cost_per_unit).toFixed(2)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};
