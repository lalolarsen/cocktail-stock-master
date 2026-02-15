import { useEffect, useState, useMemo } from "react";

import { supabase } from "@/integrations/supabase/client";
import { useActiveVenue } from "@/hooks/useActiveVenue";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Warehouse,
  Package,
  Search,
  TrendingDown,
  DollarSign,
  Boxes,
  ChevronDown,
  ChevronRight,
  Info,
  SlidersHorizontal,
  X,
  Loader2,
  PackageX,
} from "lucide-react";
import { formatCLP } from "@/lib/currency";
import { WarehouseStockIntake } from "./WarehouseStockIntake";
import { toast } from "sonner";

// ─── Types ──────────────────────────────────────────────────
interface StockLocation {
  id: string;
  name: string;
  type: "warehouse" | "bar";
  is_active: boolean;
}

interface Product {
  id: string;
  name: string;
  code: string;
  category: string;
  subcategory: string | null;
  minimum_stock: number;
  unit: string;
  cost_per_unit: number | null;
  is_mixer: boolean;
}

interface StockBalance {
  product_id: string;
  location_id: string;
  quantity: number;
}

interface LocationMinimum {
  id: string;
  product_id: string;
  location_id: string;
  minimum_stock: number;
}

type StockStatus = "out" | "low" | "ok";
type FilterChip = "all" | "out" | "low" | "ok";

interface EnrichedProduct extends Product {
  quantity: number;
  effectiveMinimum: number;
  status: StockStatus;
  value: number;
}

// ─── Helpers ────────────────────────────────────────────────
const subcategoryLabels: Record<string, string> = {
  botellas_1000: "1000ml",
  botellas_750: "750ml",
  botellas_700: "700ml",
  botellines: "Botellines",
  mixers_latas: "Latas",
  mixers_redbull: "Red Bull",
  jugos: "Jugos",
  aguas: "Aguas",
  bebidas_1500: "1.5L",
};

const getUnitDisplay = (category: string, unit: string) => {
  if (category === "unidades") return "uds";
  if (category === "gramos") return "g";
  return unit;
};

const getStockStatus = (current: number, minimum: number): StockStatus => {
  if (current === 0) return "out";
  if (minimum > 0 && current <= minimum) return "low";
  return "ok";
};

// ─── Component ──────────────────────────────────────────────
export function WarehouseInventory() {
  const { venue } = useActiveVenue();
  

  // Data state
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [balances, setBalances] = useState<StockBalance[]>([]);
  const [locationMinimums, setLocationMinimums] = useState<LocationMinimum[]>([]);
  const [loading, setLoading] = useState(true);

  // UI state
  const [selectedLocationId, setSelectedLocationId] = useState<string>("all_bars");
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [chipFilter, setChipFilter] = useState<FilterChip>("all");
  const [infoBannerOpen, setInfoBannerOpen] = useState(false);

  // Collapsible sections
  const [outOfStockOpen, setOutOfStockOpen] = useState(true);
  const [lowStockOpen, setLowStockOpen] = useState(true);
  const [normalStockOpen, setNormalStockOpen] = useState(false);

  // Adjust minimum modal
  const [adjustMinProduct, setAdjustMinProduct] = useState<EnrichedProduct | null>(null);
  const [adjustMinLocationId, setAdjustMinLocationId] = useState("");
  const [adjustMinValue, setAdjustMinValue] = useState("");
  const [savingMin, setSavingMin] = useState(false);

  // ─── Fetch data ─────────────────────────────────────────
  useEffect(() => {
    if (venue?.id) fetchData();
  }, [venue?.id]);

  const fetchData = async () => {
    if (!venue?.id) return;
    try {
      setLoading(true);
      const [locResult, prodResult, balResult, minResult] = await Promise.all([
        supabase.from("stock_locations").select("*").eq("venue_id", venue.id).eq("is_active", true),
        supabase.from("products").select("*").eq("venue_id", venue.id).order("name"),
        supabase.from("stock_balances").select("*").eq("venue_id", venue.id),
        supabase.from("stock_location_minimums").select("*").eq("venue_id", venue.id),
      ]);

      if (locResult.error) throw locResult.error;
      if (prodResult.error) throw prodResult.error;
      if (balResult.error) throw balResult.error;

      const locs = (locResult.data || []) as StockLocation[];
      setLocations(locs);
      setProducts((prodResult.data || []) as Product[]);
      setBalances(balResult.data || []);
      setLocationMinimums((minResult.data || []) as LocationMinimum[]);

      // Default to warehouse if exists
      const warehouse = locs.find((l) => l.type === "warehouse");
      if (warehouse && selectedLocationId === "all_bars") {
        setSelectedLocationId(warehouse.id);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  // ─── Derived data ───────────────────────────────────────
  const warehouseLocation = useMemo(
    () => locations.find((l) => l.type === "warehouse"),
    [locations]
  );

  const barLocations = useMemo(
    () => locations.filter((l) => l.type === "bar"),
    [locations]
  );

  // Location IDs to aggregate for selected filter
  const activeLocationIds = useMemo(() => {
    if (selectedLocationId === "all_bars") {
      return barLocations.map((l) => l.id);
    }
    return [selectedLocationId];
  }, [selectedLocationId, barLocations]);

  const enrichedProducts: EnrichedProduct[] = useMemo(() => {
    return products.map((product) => {
      // Sum balances for active locations
      const quantity = balances
        .filter((b) => b.product_id === product.id && activeLocationIds.includes(b.location_id))
        .reduce((sum, b) => sum + (Number(b.quantity) || 0), 0);

      // Get effective minimum: per-location if set, else global
      let effectiveMinimum = product.minimum_stock;
      if (activeLocationIds.length === 1) {
        const locMin = locationMinimums.find(
          (m) => m.product_id === product.id && m.location_id === activeLocationIds[0]
        );
        if (locMin) effectiveMinimum = Number(locMin.minimum_stock);
      }

      const status = getStockStatus(quantity, effectiveMinimum);
      const value = quantity * (product.cost_per_unit || 0);

      return { ...product, quantity, effectiveMinimum, status, value };
    });
  }, [products, balances, activeLocationIds, locationMinimums]);

  // Filtered products
  const filteredProducts = useMemo(() => {
    let list = enrichedProducts;
    if (categoryFilter !== "all") {
      list = list.filter((p) => p.subcategory === categoryFilter || (!p.subcategory && categoryFilter === "sin_categoria"));
    }
    if (chipFilter !== "all") {
      list = list.filter((p) => p.status === chipFilter);
    }
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(term) || p.code.toLowerCase().includes(term));
    }
    return list;
  }, [enrichedProducts, categoryFilter, chipFilter, searchTerm]);

  // Grouped by status
  const outOfStock = useMemo(() => filteredProducts.filter((p) => p.status === "out"), [filteredProducts]);
  const lowStock = useMemo(() => filteredProducts.filter((p) => p.status === "low"), [filteredProducts]);
  const normalStock = useMemo(() => filteredProducts.filter((p) => p.status === "ok"), [filteredProducts]);

  // Stats
  const stats = useMemo(() => ({
    withStock: enrichedProducts.filter((p) => p.quantity > 0).length,
    lowStock: enrichedProducts.filter((p) => p.status === "low").length,
    outOfStock: enrichedProducts.filter((p) => p.status === "out").length,
    totalValue: enrichedProducts.reduce((sum, p) => sum + p.value, 0),
  }), [enrichedProducts]);

  // Available subcategories
  const availableSubcategories = useMemo(() => {
    const subs = new Set<string>();
    products.forEach((p) => { if (p.subcategory) subs.add(p.subcategory); });
    return Array.from(subs).sort();
  }, [products]);

  const selectedLocationName = useMemo(() => {
    if (selectedLocationId === "all_bars") return "Todas las barras";
    return locations.find((l) => l.id === selectedLocationId)?.name || "—";
  }, [selectedLocationId, locations]);

  // ─── Adjust minimum handler ─────────────────────────────
  const handleOpenAdjustMin = (product: EnrichedProduct) => {
    setAdjustMinProduct(product);
    setAdjustMinLocationId(activeLocationIds.length === 1 ? activeLocationIds[0] : "");
    setAdjustMinValue(product.effectiveMinimum.toString());
  };

  const handleSaveMinimum = async () => {
    if (!adjustMinProduct || !adjustMinLocationId || !venue?.id) return;
    const minVal = parseFloat(adjustMinValue);
    if (isNaN(minVal) || minVal < 0) {
      toast.error("El mínimo debe ser ≥ 0");
      return;
    }
    setSavingMin(true);
    try {
      const { error } = await supabase
        .from("stock_location_minimums")
        .upsert(
          {
            product_id: adjustMinProduct.id,
            location_id: adjustMinLocationId,
            minimum_stock: minVal,
            venue_id: venue.id,
          },
          { onConflict: "product_id,location_id" }
        );
      if (error) throw error;
      toast.success("Mínimo actualizado");
      setAdjustMinProduct(null);
      fetchData();
    } catch (error) {
      console.error(error);
      toast.error("Error al guardar el mínimo");
    } finally {
      setSavingMin(false);
    }
  };

  // ─── Render helpers ─────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-20" />)}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (locations.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Warehouse className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-lg font-semibold mb-2">No hay ubicaciones configuradas</h3>
          <p className="text-muted-foreground">Configure ubicaciones en Barras y POS primero.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* ━━━ HEADER ━━━ */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Inventario en Tiempo Real</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Control centralizado de stock y mínimos por ubicación
        </p>
      </div>

      {/* Info hint */}
      <p className="text-xs text-muted-foreground">
        Los mínimos y alertas se calculan por ubicación (Bodega / Barras).
      </p>

      {/* ━━━ INFO BANNER ━━━ */}
      <div className="border border-border rounded-lg px-4 py-2.5 flex items-start gap-3">
        <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Los terminales POS no requieren ubicación. El inventario se descuenta al redimir el QR en barra.
          </p>
          {infoBannerOpen && (
            <p className="text-xs text-muted-foreground leading-relaxed mt-1">
              IVA pagado se registra como IVA crédito fiscal. Impuesto específico se registra como impuesto específico (no parte del costo neto). Cada ingreso de stock exige costo neto + IVA + impuesto específico para trazabilidad legal.
            </p>
          )}
        </div>
        <button
          onClick={() => setInfoBannerOpen(!infoBannerOpen)}
          className="text-xs text-primary hover:underline shrink-0"
        >
          {infoBannerOpen ? "Ocultar" : "Ver más"}
        </button>
      </div>

      {/* ━━━ STOCK INTAKE ━━━ */}
      <div id="stock-intake-section">
        {warehouseLocation && (
          <WarehouseStockIntake
            warehouseId={warehouseLocation.id}
            products={products.map((p) => ({ ...p, code: p.code || "" }))}
            onStockUpdated={fetchData}
          />
        )}
      </div>

      {/* ━━━ LOCATION SELECTOR + KPIs ━━━ */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground shrink-0">Ubicación</Label>
          <Select value={selectedLocationId} onValueChange={setSelectedLocationId}>
            <SelectTrigger className="w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {warehouseLocation && (
                <SelectItem value={warehouseLocation.id}>
                  {warehouseLocation.name} (Bodega)
                </SelectItem>
              )}
              {barLocations.length > 0 && (
                <SelectItem value="all_bars">Todas las barras</SelectItem>
              )}
              {barLocations.map((b) => (
                <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Badge variant="outline" className="text-xs">
            {selectedLocationName}
          </Badge>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KPICard
            icon={<Boxes className="h-4 w-4 text-primary" />}
            value={stats.withStock}
            label="Con stock"
            accent="primary"
          />
          <KPICard
            icon={<TrendingDown className="h-4 w-4 text-warning" />}
            value={stats.lowStock}
            label="Bajo mínimo"
            accent="warning"
          />
          <KPICard
            icon={<PackageX className="h-4 w-4 text-destructive" />}
            value={stats.outOfStock}
            label="Sin stock"
            accent="destructive"
          />
          <KPICard
            icon={<DollarSign className="h-4 w-4 text-muted-foreground" />}
            value={formatCLP(stats.totalValue)}
            label="Valor inventario"
            accent="muted"
          />
        </div>
      </div>

      {/* ━━━ FILTERS ━━━ */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Categoría" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las categorías</SelectItem>
            <SelectItem value="sin_categoria">Sin categoría</SelectItem>
            {availableSubcategories.map((sub) => (
              <SelectItem key={sub} value={sub}>
                {subcategoryLabels[sub] || sub}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar producto..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm("")} className="absolute right-3 top-1/2 -translate-y-1/2">
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          )}
        </div>
        <div className="flex gap-1.5">
          {(["all", "out", "low", "ok"] as FilterChip[]).map((chip) => (
            <button
              key={chip}
              onClick={() => setChipFilter(chip)}
              className={`px-3 py-1.5 text-xs rounded-md border transition-fast ${
                chipFilter === chip
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-muted-foreground border-border hover:bg-muted"
              }`}
            >
              {chip === "all" ? "Todos" : chip === "out" ? "Sin stock" : chip === "low" ? "Bajo mínimo" : "Con stock"}
            </button>
          ))}
        </div>
      </div>

      {/* ━━━ PRODUCT LIST (Collapsible sections) ━━━ */}
      {filteredProducts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Package className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground">
              {searchTerm || chipFilter !== "all" || categoryFilter !== "all"
                ? "Sin resultados para los filtros aplicados"
                : "No hay productos en el catálogo"}
            </p>
            {(searchTerm || chipFilter !== "all" || categoryFilter !== "all") && (
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => { setSearchTerm(""); setChipFilter("all"); setCategoryFilter("all"); }}
              >
                Limpiar filtros
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {outOfStock.length > 0 && (
            <StockSection
              title="Sin Stock"
              count={outOfStock.length}
              open={outOfStockOpen}
              onToggle={setOutOfStockOpen}
              accent="destructive"
              products={outOfStock}
              unit={getUnitDisplay}
              onAdjustMin={handleOpenAdjustMin}
            />
          )}
          {lowStock.length > 0 && (
            <StockSection
              title="Bajo Mínimo"
              count={lowStock.length}
              open={lowStockOpen}
              onToggle={setLowStockOpen}
              accent="warning"
              products={lowStock}
              unit={getUnitDisplay}
              onAdjustMin={handleOpenAdjustMin}
            />
          )}
          {normalStock.length > 0 && (
            <StockSection
              title="Stock Normal"
              count={normalStock.length}
              open={normalStockOpen}
              onToggle={setNormalStockOpen}
              accent="primary"
              products={normalStock}
              unit={getUnitDisplay}
              onAdjustMin={handleOpenAdjustMin}
            />
          )}
        </div>
      )}

      {/* ━━━ ADJUST MINIMUM MODAL ━━━ */}
      <Dialog open={!!adjustMinProduct} onOpenChange={(o) => !o && setAdjustMinProduct(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <SlidersHorizontal className="h-4 w-4" />
              Mínimo de stock
            </DialogTitle>
            <DialogDescription className="text-sm">
              {adjustMinProduct?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-xs">Ubicación</Label>
              <Select value={adjustMinLocationId} onValueChange={setAdjustMinLocationId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar ubicación" />
                </SelectTrigger>
                <SelectContent>
                  {locations.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name} ({l.type === "warehouse" ? "Bodega" : "Barra"})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">
                Mínimo ({adjustMinProduct ? getUnitDisplay(adjustMinProduct.category, adjustMinProduct.unit) : ""})
              </Label>
              <Input
                type="number"
                min="0"
                value={adjustMinValue}
                onChange={(e) => setAdjustMinValue(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustMinProduct(null)}>Cancelar</Button>
            <Button onClick={handleSaveMinimum} disabled={savingMin || !adjustMinLocationId}>
              {savingMin && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────


function KPICard({
  icon,
  value,
  label,
  accent,
}: {
  icon: React.ReactNode;
  value: number | string;
  label: string;
  accent: string;
}) {
  const textColor =
    accent === "destructive"
      ? "text-destructive"
      : accent === "warning"
      ? "text-warning"
      : accent === "primary"
      ? "text-primary"
      : "text-foreground";
  return (
    <Card className="bg-card">
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-muted">{icon}</div>
          <div>
            <p className={`text-2xl font-bold tabular-nums ${textColor}`}>{value}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StockSection({
  title,
  count,
  open,
  onToggle,
  accent,
  products,
  unit,
  onAdjustMin,
}: {
  title: string;
  count: number;
  open: boolean;
  onToggle: (v: boolean) => void;
  accent: string;
  products: EnrichedProduct[];
  unit: (cat: string, u: string) => string;
  onAdjustMin: (p: EnrichedProduct) => void;
}) {
  const badgeClass =
    accent === "destructive"
      ? "bg-destructive/15 text-destructive border-destructive/30"
      : accent === "warning"
      ? "bg-warning/15 text-warning border-warning/30"
      : "bg-primary/15 text-primary border-primary/30";

  const borderClass =
    accent === "destructive"
      ? "border-l-destructive"
      : accent === "warning"
      ? "border-l-warning"
      : "border-l-transparent";

  return (
    <Collapsible open={open} onOpenChange={onToggle}>
      <CollapsibleTrigger className="flex items-center justify-between w-full px-4 py-2.5 bg-card border border-border rounded-lg hover:bg-muted/50 transition-fast">
        <div className="flex items-center gap-2">
          {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          <span className="font-semibold text-sm">{title}</span>
          <Badge variant="outline" className={`text-xs ${badgeClass}`}>
            {count}
          </Badge>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-1 space-y-1">
        {products.map((product) => (
          <ProductRow
            key={product.id}
            product={product}
            unit={unit}
            borderClass={borderClass}
            onAdjustMin={() => onAdjustMin(product)}
          />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

function ProductRow({
  product,
  unit,
  borderClass,
  onAdjustMin,
}: {
  product: EnrichedProduct;
  unit: (cat: string, u: string) => string;
  borderClass: string;
  onAdjustMin: () => void;
}) {
  const unitLabel = unit(product.category, product.unit);
  const pct =
    product.effectiveMinimum > 0
      ? Math.min((product.quantity / (product.effectiveMinimum * 2)) * 100, 100)
      : product.quantity > 0
      ? 100
      : 0;

  const statusBadge =
    product.status === "out" ? (
      <Badge variant="destructive" className="text-[10px] px-2 py-0.5">Agotado</Badge>
    ) : product.status === "low" ? (
      <Badge className="bg-warning/15 text-warning border border-warning/30 text-[10px] px-2 py-0.5">Bajo mínimo</Badge>
    ) : (
      <Badge variant="secondary" className="text-[10px] px-2 py-0.5">OK</Badge>
    );

  return (
    <div className={`flex items-center gap-3 px-4 py-2.5 bg-card border border-border rounded-lg border-l-2 ${borderClass} hover:bg-muted/30 transition-fast`}>
      {/* Left: Name + SKU + Badge */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h4 className="font-medium text-sm truncate">{product.name}</h4>
          <span className="text-[10px] text-muted-foreground font-mono">{product.code}</span>
          {product.subcategory && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {subcategoryLabels[product.subcategory] || product.subcategory}
            </Badge>
          )}
        </div>
        {/* Progress bar */}
        <div className="flex items-center gap-3 mt-1.5">
          <Progress value={pct} className="h-1.5 w-20" />
          <span className="text-[11px] text-muted-foreground">
            {product.quantity.toLocaleString()} {unitLabel} / Mín: {product.effectiveMinimum} {unitLabel}
          </span>
        </div>
      </div>

      {/* Right: Value + Status + Actions */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="text-right">
          <p className="text-sm font-bold tabular-nums">{product.quantity.toLocaleString()}</p>
          <p className="text-[10px] text-muted-foreground">{formatCLP(product.value)}</p>
        </div>
        {statusBadge}
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          title="Ajustar mínimo"
          onClick={(e) => { e.stopPropagation(); onAdjustMin(); }}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
