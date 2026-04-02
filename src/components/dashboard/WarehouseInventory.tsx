import { useEffect, useState, useMemo } from "react";
import { isBottle } from "@/lib/product-type";
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
  Plus,
  Trash2,
  Download,
} from "lucide-react";
import { formatCLP } from "@/lib/currency";
import { ManualStockEntryDialog } from "./ManualStockEntryDialog";
import { WasteRegistrationDialog } from "./WasteRegistrationDialog";
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
  capacity_ml: number | null;
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
export function WarehouseInventory({ isReadOnly = false }: { isReadOnly?: boolean }) {
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
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [showWasteDialog, setShowWasteDialog] = useState(false);

  // Collapsible sections — Admin: OK open first, low/out collapsed
  const [okStockOpen, setOkStockOpen] = useState(true);
  const [lowStockOpen, setLowStockOpen] = useState(false);
  const [outOfStockOpen, setOutOfStockOpen] = useState(false);

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

  const activeLocationIds = useMemo(() => {
    if (selectedLocationId === "all_bars") {
      return barLocations.map((l) => l.id);
    }
    return [selectedLocationId];
  }, [selectedLocationId, barLocations]);

  const enrichedProducts: EnrichedProduct[] = useMemo(() => {
    return products.map((product) => {
      const quantity = balances
        .filter((b) => b.product_id === product.id && activeLocationIds.includes(b.location_id))
        .reduce((sum, b) => sum + (Number(b.quantity) || 0), 0);

      let effectiveMinimum = product.minimum_stock;
      if (activeLocationIds.length === 1) {
        const locMin = locationMinimums.find(
          (m) => m.product_id === product.id && m.location_id === activeLocationIds[0]
        );
        if (locMin) effectiveMinimum = Number(locMin.minimum_stock);
      }

      const status: StockStatus = getStockStatus(quantity, effectiveMinimum);
      const bottle = isBottle(product);
      const cap = product.capacity_ml;
      const costPerBase = bottle && cap && cap > 0
        ? (product.cost_per_unit || 0) / cap
        : (product.cost_per_unit || 0);
      const value = quantity * costPerBase;

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
  const okStock = useMemo(() => filteredProducts.filter((p) => p.status === "ok"), [filteredProducts]);
  const lowStock = useMemo(() => filteredProducts.filter((p) => p.status === "low"), [filteredProducts]);
  const outOfStock = useMemo(() => filteredProducts.filter((p) => p.status === "out"), [filteredProducts]);

  // Stats
  const stats = useMemo(() => ({
    withStock: enrichedProducts.filter((p) => p.quantity > 0).length,
    lowStock: enrichedProducts.filter((p) => p.status === "low").length,
    outOfStock: enrichedProducts.filter((p) => p.status === "out").length,
    totalValue: enrichedProducts.reduce((sum, p) => sum + p.value, 0),
  }), [enrichedProducts]);

  // Per-location value breakdown for Gerencia
  const valueByLocation = useMemo(() => {
    const map = new Map<string, { name: string; type: string; value: number; productCount: number }>();
    locations.forEach((loc) => {
      const locProducts = products.map((product) => {
        const qty = balances
          .filter((b) => b.product_id === product.id && b.location_id === loc.id)
          .reduce((sum, b) => sum + (Number(b.quantity) || 0), 0);
        const bottle = isBottle(product);
        const cap = product.capacity_ml;
        const costPerBase = bottle && cap && cap > 0
          ? (product.cost_per_unit || 0) / cap
          : (product.cost_per_unit || 0);
        return { value: qty * costPerBase, hasStock: qty > 0 };
      });
      map.set(loc.id, {
        name: loc.name,
        type: loc.type,
        value: locProducts.reduce((s, p) => s + p.value, 0),
        productCount: locProducts.filter((p) => p.hasStock).length,
      });
    });
    return Array.from(map.values()).sort((a, b) => b.value - a.value);
  }, [locations, products, balances]);

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

  // ─── Export CSV ──────────────────────────────────────────
  const handleExportCSV = (countingSheet = false) => {
    const baseHeaders = ["Código", "Producto", "Categoría", "Subcategoría", "Ubicación", "Stock Teórico", "Unidad", "Mínimo", "Estado", "Costo Unitario", "Valor Total"];
    const headers = countingSheet
      ? [...baseHeaders, "Conteo Real", "Diferencia"]
      : baseHeaders;

    const rows: string[][] = [];
    const targetLocs = selectedLocationId === "all_bars" ? barLocations : locations.filter(l => l.id === selectedLocationId);

    // Sort by subcategory then name for easier physical counting
    const sortedProducts = [...products].sort((a, b) => {
      const catA = a.subcategory || "zzz";
      const catB = b.subcategory || "zzz";
      if (catA !== catB) return catA.localeCompare(catB);
      return a.name.localeCompare(b.name);
    });

    sortedProducts.forEach((product) => {
      targetLocs.forEach((loc) => {
        const qty = balances
          .filter((b) => b.product_id === product.id && b.location_id === loc.id)
          .reduce((sum, b) => sum + (Number(b.quantity) || 0), 0);

        const locMin = locationMinimums.find(
          (m) => m.product_id === product.id && m.location_id === loc.id
        );
        const effectiveMin = locMin ? Number(locMin.minimum_stock) : product.minimum_stock;
        const status = getStockStatus(qty, effectiveMin);
        const bottle = isBottle(product);
        const cap = product.capacity_ml;
        const costPerBase = bottle && cap && cap > 0
          ? (product.cost_per_unit || 0) / cap
          : (product.cost_per_unit || 0);
        const value = qty * costPerBase;

        const row = [
          product.code,
          product.name,
          product.category,
          product.subcategory || "",
          loc.name,
          qty.toString(),
          product.unit,
          effectiveMin.toString(),
          status === "ok" ? "OK" : status === "low" ? "Bajo" : "Sin Stock",
          (product.cost_per_unit || 0).toString(),
          Math.round(value).toString(),
        ];

        if (countingSheet) {
          row.push("", ""); // Empty columns for user to fill
        }

        rows.push(row);
      });
    });

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.map((c) => `"${c}"`).join(",")),
    ].join("\n");

    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    const today = new Date().toISOString().slice(0, 10);
    const prefix = countingSheet ? "planilla_conteo" : "inventario";
    link.download = `${prefix}_${selectedLocationName.replace(/\s+/g, "_")}_${today}.csv`;
    link.click();
    toast.success(countingSheet ? "Planilla de conteo exportada" : "Inventario exportado a CSV");
  };

  // ─── Loading state ─────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16" />)}
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

  // ═══════════════════════════════════════════════════════════
  // GERENCIA VIEW — Simplified: value overview + per-location
  // ═══════════════════════════════════════════════════════════
  if (isReadOnly) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold tracking-tight">Inventario</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Capital inmovilizado por ubicación</p>
          </div>
          <Button variant="outline" size="sm" className="text-xs h-8" onClick={() => handleExportCSV(true)}>
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Planilla conteo
          </Button>
          <Button variant="outline" size="sm" className="text-xs h-8" onClick={() => handleExportCSV(false)}>
            <Download className="h-3.5 w-3.5 mr-1.5" />
            CSV
          </Button>
        </div>

        {/* Total value KPI */}
        <Card className="bg-card">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Valor total inventario</p>
                <p className="text-2xl sm:text-3xl font-bold tabular-nums mt-1">{formatCLP(stats.totalValue)}</p>
              </div>
              <div className="p-3 rounded-xl bg-muted">
                <DollarSign className="h-6 w-6 text-muted-foreground" />
              </div>
            </div>
            <div className="flex gap-4 mt-3 text-xs text-muted-foreground">
              <span>{stats.withStock} productos con stock</span>
              <span>{products.length} productos totales</span>
            </div>
          </CardContent>
        </Card>

        {/* Per-location breakdown */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Valor por ubicación
          </h3>
          {valueByLocation.map((loc) => {
            const pct = stats.totalValue > 0 ? (loc.value / stats.totalValue) * 100 : 0;
            return (
              <Card key={loc.name} className="bg-card">
                <CardContent className="p-3 sm:p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {loc.type === "warehouse" ? (
                        <Warehouse className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Package className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span className="font-medium text-sm">{loc.name}</span>
                      <Badge variant="outline" className="text-[10px]">
                        {loc.type === "warehouse" ? "Bodega" : "Barra"}
                      </Badge>
                    </div>
                    <span className="font-bold tabular-nums text-sm">{formatCLP(loc.value)}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Progress value={pct} className="h-1.5 flex-1" />
                    <span className="text-[11px] text-muted-foreground tabular-nums w-10 text-right">
                      {pct.toFixed(0)}%
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1.5">
                    {loc.productCount} productos con stock
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // ADMIN VIEW — Full inventory management
  // ═══════════════════════════════════════════════════════════
  return (
    <div className="space-y-4">
      {/* ━━━ HEADER ━━━ */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Inventario</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Control de stock por ubicación</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="text-xs h-8" onClick={() => handleExportCSV(true)}>
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Planilla conteo
          </Button>
          <Button variant="outline" size="sm" className="text-xs h-8" onClick={() => handleExportCSV(false)}>
            <Download className="h-3.5 w-3.5 mr-1.5" />
            CSV
          </Button>
        </div>
      </div>

      {/* ━━━ STOCK INTAKE ACTIONS ━━━ */}
      {warehouseLocation && (
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            className="h-auto py-3 px-4 justify-start gap-3"
            onClick={() => setShowManualEntry(true)}
          >
            <div className="p-1.5 rounded-md bg-primary/10">
              <Plus className="h-4 w-4 text-primary" />
            </div>
            <div className="text-left">
              <span className="text-sm font-medium block">Ingreso manual</span>
              <span className="text-[11px] text-muted-foreground">Agregar a bodega</span>
            </div>
          </Button>
          <Button
            variant="outline"
            className="h-auto py-3 px-4 justify-start gap-3"
            onClick={() => setShowWasteDialog(true)}
          >
            <div className="p-1.5 rounded-md bg-destructive/10">
              <Trash2 className="h-4 w-4 text-destructive" />
            </div>
            <div className="text-left">
              <span className="text-sm font-medium block">Registrar merma</span>
              <span className="text-[11px] text-muted-foreground">Botella rota, derrame</span>
            </div>
          </Button>
        </div>
      )}

      {/* ━━━ LOCATION SELECTOR ━━━ */}
      <div className="flex items-center gap-2 flex-wrap">
        <Select value={selectedLocationId} onValueChange={setSelectedLocationId}>
          <SelectTrigger className="w-[200px] h-9 text-sm">
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
      </div>

      {/* ━━━ KPI STRIP ━━━ */}
      <div className="grid grid-cols-4 gap-2">
        <MiniKPI label="Con stock" value={stats.withStock} className="text-primary" />
        <MiniKPI label="Bajo mín." value={stats.lowStock} className="text-warning" />
        <MiniKPI label="Sin stock" value={stats.outOfStock} className="text-destructive" />
        <MiniKPI label="Valor" value={formatCLP(stats.totalValue)} className="text-foreground" />
      </div>

      {/* Info hint (collapsed) */}
      <Collapsible open={infoBannerOpen} onOpenChange={setInfoBannerOpen}>
        <CollapsibleTrigger className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
          <Info className="h-3 w-3" />
          <span>Acerca del inventario</span>
          {infoBannerOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2 text-xs text-muted-foreground bg-muted/30 rounded-lg p-3 space-y-1">
          <p>Los mínimos y alertas se calculan por ubicación (Bodega / Barras).</p>
          <p>El inventario se descuenta al redimir el QR en barra. IVA pagado se registra como crédito fiscal.</p>
        </CollapsibleContent>
      </Collapsible>

      {/* ━━━ FILTERS ━━━ */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[160px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm("")} className="absolute right-2.5 top-1/2 -translate-y-1/2">
              <X className="h-3 w-3 text-muted-foreground" />
            </button>
          )}
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[150px] h-8 text-xs">
            <SelectValue placeholder="Categoría" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="sin_categoria">Sin categoría</SelectItem>
            {availableSubcategories.map((sub) => (
              <SelectItem key={sub} value={sub}>
                {subcategoryLabels[sub] || sub}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex gap-1">
          {(["all", "ok", "low", "out"] as FilterChip[]).map((chip) => (
            <button
              key={chip}
              onClick={() => setChipFilter(chip)}
              className={`px-2.5 py-1 text-[11px] rounded-md border transition-colors ${
                chipFilter === chip
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-muted-foreground border-border hover:bg-muted"
              }`}
            >
              {chip === "all" ? "Todos" : chip === "ok" ? "OK" : chip === "low" ? "Bajo" : "Sin"}
            </button>
          ))}
        </div>
      </div>

      {/* ━━━ PRODUCT LIST — Order: OK → Low → Out ━━━ */}
      {filteredProducts.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <Package className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-50" />
            <p className="text-sm text-muted-foreground">
              {searchTerm || chipFilter !== "all" || categoryFilter !== "all"
                ? "Sin resultados para los filtros aplicados"
                : "No hay productos en el catálogo"}
            </p>
            {(searchTerm || chipFilter !== "all" || categoryFilter !== "all") && (
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => { setSearchTerm(""); setChipFilter("all"); setCategoryFilter("all"); }}
              >
                Limpiar filtros
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {/* 1. Con stock (OK) — open by default */}
          {okStock.length > 0 && (
            <StockSection
              title="Con Stock"
              count={okStock.length}
              open={okStockOpen}
              onToggle={setOkStockOpen}
              accent="primary"
              products={okStock}
              unit={getUnitDisplay}
              onAdjustMin={handleOpenAdjustMin}
            />
          )}
          {/* 2. Bajo mínimo */}
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
          {/* 3. Sin stock */}
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

      {/* ━━━ MANUAL STOCK ENTRY DIALOG ━━━ */}
      {warehouseLocation && (
        <ManualStockEntryDialog
          open={showManualEntry}
          onOpenChange={setShowManualEntry}
          warehouseId={warehouseLocation.id}
          products={products.map((p) => ({ ...p, code: p.code || "" }))}
          onStockUpdated={fetchData}
        />
      )}

      {/* ━━━ WASTE REGISTRATION DIALOG ━━━ */}
      {selectedLocationId !== "all_bars" && (
        <WasteRegistrationDialog
          open={showWasteDialog}
          onOpenChange={setShowWasteDialog}
          lockedLocationId={selectedLocationId}
          lockedLocationName={selectedLocationName}
          onWasteRegistered={fetchData}
        />
      )}
      {selectedLocationId === "all_bars" && showWasteDialog && warehouseLocation && (
        <WasteRegistrationDialog
          open={showWasteDialog}
          onOpenChange={setShowWasteDialog}
          lockedLocationId={warehouseLocation.id}
          lockedLocationName={warehouseLocation.name}
          onWasteRegistered={fetchData}
        />
      )}
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────

function MiniKPI({ label, value, className }: { label: string; value: number | string; className?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-2.5 text-center">
      <p className={`text-base sm:text-lg font-bold tabular-nums ${className}`}>{value}</p>
      <p className="text-[10px] text-muted-foreground leading-tight">{label}</p>
    </div>
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
  onAdjustMin?: (p: EnrichedProduct) => void;
}) {
  const badgeClass =
    accent === "destructive"
      ? "bg-destructive/15 text-destructive border-destructive/30"
      : accent === "warning"
      ? "bg-warning/15 text-warning border-warning/30"
      : "bg-primary/15 text-primary border-primary/30";

  return (
    <Collapsible open={open} onOpenChange={onToggle}>
      <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-2 bg-card border border-border rounded-lg hover:bg-muted/50 transition-colors">
        <div className="flex items-center gap-2">
          {open ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
          <span className="font-semibold text-sm">{title}</span>
          <Badge variant="outline" className={`text-[10px] ${badgeClass}`}>
            {count}
          </Badge>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-1 space-y-0.5">
        {products.map((product) => (
          <ProductRow
            key={product.id}
            product={product}
            unit={unit}
            accent={accent}
            onAdjustMin={onAdjustMin ? () => onAdjustMin(product) : undefined}
          />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

function ProductRow({
  product,
  unit,
  accent,
  onAdjustMin,
}: {
  product: EnrichedProduct;
  unit: (cat: string, u: string) => string;
  accent: string;
  onAdjustMin?: () => void;
}) {
  const unitLabel = unit(product.category, product.unit);
  const isVolumetric = !!(product.capacity_ml && product.capacity_ml > 0);

  const bottleDisplay = useMemo(() => {
    if (!isVolumetric) return null;
    const stockMl = product.quantity;
    const bottleMl = product.capacity_ml!;
    const fullBottles = Math.floor(stockMl / bottleMl);
    const openMl = Math.round(stockMl % bottleMl);
    const openPercent = Math.round((openMl / bottleMl) * 100);
    return { fullBottles, openMl, openPercent };
  }, [isVolumetric, product.quantity, product.capacity_ml]);

  const pct =
    product.effectiveMinimum > 0
      ? Math.min((product.quantity / (product.effectiveMinimum * 2)) * 100, 100)
      : product.quantity > 0
      ? 100
      : 0;

  const borderColor =
    accent === "destructive"
      ? "border-l-destructive"
      : accent === "warning"
      ? "border-l-warning"
      : "border-l-primary/30";

  const costDisplay = useMemo(() => {
    const cost = product.cost_per_unit;
    if (!cost || cost <= 0) return null;
    if (isVolumetric && product.capacity_ml) {
      return formatCLP(cost) + "/bot.";
    }
    return formatCLP(cost) + "/ud";
  }, [isVolumetric, product.cost_per_unit, product.capacity_ml]);

  return (
    <div className={`flex items-center gap-2 px-3 py-2 bg-card border border-border rounded-md border-l-2 ${borderColor} hover:bg-muted/20 transition-colors`}>
      {/* Name + meta */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-medium text-sm truncate">{product.name}</span>
          {product.subcategory && (
            <span className="text-[10px] text-muted-foreground">
              {subcategoryLabels[product.subcategory] || product.subcategory}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-1">
          <Progress value={pct} className="h-1 w-16" />
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {bottleDisplay ? (
              <>
                {bottleDisplay.fullBottles} bot.
                {bottleDisplay.openPercent > 0 && ` +${bottleDisplay.openPercent}%`}
                {" · "}Mín {product.effectiveMinimum} {unitLabel}
              </>
            ) : (
              <>
                {product.quantity.toLocaleString()} {unitLabel} · Mín {product.effectiveMinimum}
              </>
            )}
          </span>
        </div>
      </div>

      {/* Right: value + cost + actions */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="text-right">
          <p className="text-sm font-bold tabular-nums">{formatCLP(product.value)}</p>
          {costDisplay && (
            <p className="text-[10px] text-muted-foreground">{costDisplay}</p>
          )}
        </div>
        {onAdjustMin && (
          <button
            className="p-1.5 rounded-md hover:bg-muted transition-colors"
            title="Ajustar mínimo"
            onClick={(e) => { e.stopPropagation(); onAdjustMin(); }}
          >
            <SlidersHorizontal className="h-3 w-3 text-muted-foreground" />
          </button>
        )}
      </div>
    </div>
  );
}
