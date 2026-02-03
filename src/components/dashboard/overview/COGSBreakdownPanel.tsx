import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Calculator,
  Package,
  Layers,
  TrendingDown,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
import { formatCLP } from "@/lib/currency";
import { useCOGSData, COGSByProduct, COGSByCategory } from "@/hooks/useCOGSData";
import { DateRange } from "react-day-picker";

interface COGSBreakdownPanelProps {
  dateRange?: DateRange;
  jornadaId?: string;
  compact?: boolean;
}

const CATEGORY_LABELS: Record<string, string> = {
  licores: "Licores",
  vinos: "Vinos",
  cervezas: "Cervezas",
  bebidas: "Bebidas",
  mezcladores: "Mezcladores",
  otros: "Otros",
  insumos: "Insumos",
};

const SUBCATEGORY_LABELS: Record<string, string> = {
  botellas_1000: "Botellas 1L",
  botellas_750: "Botellas 750ml",
  botellas_700: "Botellas 700ml",
  botellines: "Botellines",
  mixers_latas: "Mixers Latas",
  mixers_redbull: "Red Bull",
  jugos: "Jugos",
  aguas: "Aguas",
  bebidas_1500: "Bebidas 1.5L",
};

export function COGSBreakdownPanel({ dateRange, jornadaId, compact = false }: COGSBreakdownPanelProps) {
  const { summary, byProduct, byCategory, loading, refresh } = useCOGSData(dateRange, jornadaId);
  const [activeTab, setActiveTab] = useState<"summary" | "products" | "categories">("summary");

  if (loading) {
    return (
      <Card className="glass-effect">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Calculator className="h-4 w-4 text-primary" />
            Costo de Ventas (COGS)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (compact) {
    return (
      <Card className="glass-effect">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Calculator className="h-4 w-4 text-destructive" />
              COGS
            </CardTitle>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={refresh}>
              <RefreshCw className="h-3 w-3" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-muted-foreground">Total</span>
            <span className="text-xl font-bold text-destructive">
              {formatCLP(summary.total_cogs)}
            </span>
          </div>
          
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Redenciones</span>
              <span className="font-medium">{summary.redemptions_count}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Productos</span>
              <span className="font-medium">{summary.products_count}</span>
            </div>
          </div>

          {byCategory.slice(0, 3).map((cat) => (
            <div key={cat.category} className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {CATEGORY_LABELS[cat.category] || cat.category}
              </span>
              <span className="font-mono text-destructive">
                {formatCLP(cat.total_cost)}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-effect shadow-elegant">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5 text-destructive" />
            Costo de Ventas (COGS)
          </CardTitle>
          <Button variant="ghost" size="icon" onClick={refresh}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* KPI Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div className="p-3 rounded-lg bg-destructive/10">
            <p className="text-xs text-muted-foreground">COGS Total</p>
            <p className="text-lg font-bold text-destructive">{formatCLP(summary.total_cogs)}</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/50">
            <p className="text-xs text-muted-foreground">Redenciones QR</p>
            <p className="text-lg font-bold">{summary.redemptions_count}</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/50">
            <p className="text-xs text-muted-foreground">Costo Promedio</p>
            <p className="text-lg font-bold">{formatCLP(summary.avg_cost_per_redemption)}</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/50">
            <p className="text-xs text-muted-foreground">Productos Únicos</p>
            <p className="text-lg font-bold">{summary.products_count}</p>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="summary" className="text-xs">
              <TrendingDown className="h-3 w-3 mr-1" />
              Resumen
            </TabsTrigger>
            <TabsTrigger value="products" className="text-xs">
              <Package className="h-3 w-3 mr-1" />
              Productos
            </TabsTrigger>
            <TabsTrigger value="categories" className="text-xs">
              <Layers className="h-3 w-3 mr-1" />
              Categorías
            </TabsTrigger>
          </TabsList>

          <TabsContent value="summary" className="mt-4">
            <div className="space-y-2">
              {byCategory.map((cat) => {
                const percentage = summary.total_cogs > 0 
                  ? (cat.total_cost / summary.total_cogs) * 100 
                  : 0;
                return (
                  <div key={cat.category} className="flex items-center gap-3">
                    <div className="flex-1">
                      <div className="flex justify-between mb-1">
                        <span className="text-sm font-medium">
                          {CATEGORY_LABELS[cat.category] || cat.category}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {percentage.toFixed(1)}%
                        </span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-destructive/70 rounded-full transition-all"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                    <span className="text-sm font-mono w-24 text-right">
                      {formatCLP(cat.total_cost)}
                    </span>
                  </div>
                );
              })}
              {byCategory.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Sin movimientos de stock en este período
                </p>
              )}
            </div>
          </TabsContent>

          <TabsContent value="products" className="mt-4">
            <ScrollArea className="h-[300px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    <TableHead className="text-right">Consumo</TableHead>
                    <TableHead className="text-right">Costo/U</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byProduct.map((p) => (
                    <TableRow key={p.product_id}>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium text-sm">{p.product_name}</span>
                          {p.subcategory && (
                            <Badge variant="outline" className="text-xs w-fit mt-1">
                              {SUBCATEGORY_LABELS[p.subcategory] || p.subcategory}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {p.total_quantity.toFixed(1)} {p.unit}
                      </TableCell>
                      <TableCell className="text-right font-mono text-muted-foreground">
                        {formatCLP(p.unit_cost)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-destructive font-medium">
                        {formatCLP(p.total_cost)}
                      </TableCell>
                    </TableRow>
                  ))}
                  {byProduct.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                        Sin movimientos de productos
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="categories" className="mt-4">
            <div className="space-y-3">
              {byCategory.map((cat) => (
                <div
                  key={cat.category}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-destructive/10">
                      <Layers className="h-4 w-4 text-destructive" />
                    </div>
                    <div>
                      <p className="font-medium">
                        {CATEGORY_LABELS[cat.category] || cat.category}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {cat.product_count} productos • {cat.items_count} movimientos
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-mono font-bold text-destructive">
                      {formatCLP(cat.total_cost)}
                    </p>
                  </div>
                </div>
              ))}
              {byCategory.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Sin categorías con movimientos
                </p>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
