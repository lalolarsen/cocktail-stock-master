import { useEffect, useState, useMemo, useCallback } from "react";
import { isBottle } from "@/lib/product-type";
import { supabase } from "@/integrations/supabase/client";
import { useActiveVenue } from "@/hooks/useActiveVenue";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DollarSign,
  MapPin,
  Clock,
  Search,
  Download,
  ChevronDown,
  ChevronUp,
  Package,
} from "lucide-react";
import { formatCLP } from "@/lib/currency";
import { format } from "date-fns";
import { es } from "date-fns/locale";

// ─── Types ──────────────────────────────────────────────────
interface StockLocation {
  id: string;
  name: string;
  type: "warehouse" | "bar";
}

interface Product {
  id: string;
  name: string;
  code: string;
  unit: string;
  cost_per_unit: number | null;
  capacity_ml: number | null;
}

interface BalanceRow {
  product_id: string;
  location_id: string;
  quantity: number;
  updated_at: string;
}

interface LocationSummary {
  id: string;
  name: string;
  type: string;
  value: number;
  pct: number;
  productCount: number;
}

interface DetailRow {
  sku: string;
  name: string;
  tipo: "ML" | "UNIT";
  location: string;
  stock: number;
  unit: string;
  cpp: number;
  value: number;
}

// ─── Helpers ────────────────────────────────────────────────
function calcValue(product: Product, qty: number): number {
  if (isBottle(product) && product.capacity_ml && product.capacity_ml > 0) {
    return qty * ((product.cost_per_unit ?? 0) / product.capacity_ml);
  }
  return qty * (product.cost_per_unit ?? 0);
}

function calcCppBase(product: Product): number {
  if (isBottle(product) && product.capacity_ml && product.capacity_ml > 0) {
    return (product.cost_per_unit ?? 0) / product.capacity_ml;
  }
  return product.cost_per_unit ?? 0;
}

function unitBase(product: Product): string {
  if (isBottle(product)) return "ml";
  return product.unit || "ud";
}

// ─── Component ──────────────────────────────────────────────
export function WarehouseInventory({ isReadOnly = false }: { isReadOnly?: boolean }) {
  const { venue } = useActiveVenue();

  // Data
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [balances, setBalances] = useState<BalanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);

  // Detail UI
  const [showDetail, setShowDetail] = useState(false);
  const [detailLocation, setDetailLocation] = useState<string>("all");
  const [detailSearch, setDetailSearch] = useState("");
  const [detailType, setDetailType] = useState<"all" | "ML" | "UNIT">("all");
  const [detailPage, setDetailPage] = useState(0);
  const PAGE_SIZE = 50;

  // ─── Fetch (one query for layers 1 & 2) ───────────────────
  useEffect(() => {
    if (venue?.id) fetchData();
  }, [venue?.id]);

  const fetchData = async () => {
    if (!venue?.id) return;
    try {
      setLoading(true);
      const [locRes, prodRes, balRes] = await Promise.all([
        supabase
          .from("stock_locations")
          .select("id, name, type")
          .eq("venue_id", venue.id)
          .eq("is_active", true),
        supabase
          .from("products")
          .select("id, name, code, unit, cost_per_unit, capacity_ml")
          .eq("venue_id", venue.id),
        supabase
          .from("stock_balances")
          .select("product_id, location_id, quantity, updated_at")
          .eq("venue_id", venue.id),
      ]);
      if (locRes.error) throw locRes.error;
      if (prodRes.error) throw prodRes.error;
      if (balRes.error) throw balRes.error;

      setLocations((locRes.data || []) as StockLocation[]);
      setProducts((prodRes.data || []) as Product[]);
      const bals = (balRes.data || []) as BalanceRow[];
      setBalances(bals);

      // last update
      if (bals.length > 0) {
        const maxDate = bals.reduce((max, b) => (b.updated_at > max ? b.updated_at : max), bals[0].updated_at);
        setLastUpdate(maxDate);
      }
    } catch (err) {
      console.error("Error fetching stock data:", err);
    } finally {
      setLoading(false);
    }
  };

  // ─── Product map ──────────────────────────────────────────
  const productMap = useMemo(() => {
    const m = new Map<string, Product>();
    products.forEach((p) => m.set(p.id, p));
    return m;
  }, [products]);

  // ─── Location map ─────────────────────────────────────────
  const locationMap = useMemo(() => {
    const m = new Map<string, StockLocation>();
    locations.forEach((l) => m.set(l.id, l));
    return m;
  }, [locations]);

  // ─── Layer 1: Capital total ───────────────────────────────
  const totalCapital = useMemo(() => {
    return balances.reduce((sum, b) => {
      const p = productMap.get(b.product_id);
      if (!p) return sum;
      return sum + calcValue(p, b.quantity);
    }, 0);
  }, [balances, productMap]);

  // ─── Layer 2: Distribution by location ────────────────────
  const locationSummaries = useMemo(() => {
    const grouped = new Map<string, { value: number; products: Set<string> }>();
    balances.forEach((b) => {
      const p = productMap.get(b.product_id);
      if (!p || b.quantity <= 0) return;
      const entry = grouped.get(b.location_id) || { value: 0, products: new Set<string>() };
      entry.value += calcValue(p, b.quantity);
      entry.products.add(b.product_id);
      grouped.set(b.location_id, entry);
    });

    const summaries: LocationSummary[] = [];
    grouped.forEach((data, locId) => {
      const loc = locationMap.get(locId);
      if (!loc) return;
      summaries.push({
        id: locId,
        name: loc.name,
        type: loc.type,
        value: data.value,
        pct: totalCapital > 0 ? (data.value / totalCapital) * 100 : 0,
        productCount: data.products.size,
      });
    });

    return summaries.sort((a, b) => b.value - a.value);
  }, [balances, productMap, locationMap, totalCapital]);

  // ─── Layer 3: Detail rows ─────────────────────────────────
  const detailRows = useMemo(() => {
    if (!showDetail) return [];

    return balances
      .filter((b) => {
        if (b.quantity <= 0) return false;
        if (detailLocation !== "all" && b.location_id !== detailLocation) return false;
        const p = productMap.get(b.product_id);
        if (!p) return false;
        if (detailType !== "all") {
          const tipo = isBottle(p) ? "ML" : "UNIT";
          if (tipo !== detailType) return false;
        }
        if (detailSearch) {
          const q = detailSearch.toLowerCase();
          if (!p.name.toLowerCase().includes(q) && !p.code.toLowerCase().includes(q)) return false;
        }
        return true;
      })
      .map((b): DetailRow => {
        const p = productMap.get(b.product_id)!;
        const loc = locationMap.get(b.location_id);
        return {
          sku: p.code,
          name: p.name,
          tipo: isBottle(p) ? "ML" : "UNIT",
          location: loc?.name || "—",
          stock: b.quantity,
          unit: unitBase(p),
          cpp: calcCppBase(p),
          value: calcValue(p, b.quantity),
        };
      })
      .sort((a, b) => b.value - a.value);
  }, [showDetail, balances, productMap, locationMap, detailLocation, detailSearch, detailType]);

  const pagedRows = useMemo(() => {
    const start = detailPage * PAGE_SIZE;
    return detailRows.slice(start, start + PAGE_SIZE);
  }, [detailRows, detailPage]);

  const totalPages = Math.ceil(detailRows.length / PAGE_SIZE);

  // ─── Export CSV ───────────────────────────────────────────
  const exportCSV = useCallback(() => {
    const rows = balances
      .filter((b) => b.quantity > 0)
      .map((b) => {
        const p = productMap.get(b.product_id);
        const loc = locationMap.get(b.location_id);
        if (!p) return null;
        return {
          sku: p.code,
          producto: p.name,
          tipo: isBottle(p) ? "ML" : "UNIT",
          ubicacion: loc?.name || "",
          stock: b.quantity,
          unidad: unitBase(p),
          cpp: Math.round(calcCppBase(p)),
          valor: Math.round(calcValue(p, b.quantity)),
        };
      })
      .filter(Boolean);

    const header = "sku,producto,tipo,ubicacion,stock,unidad,cpp,valor";
    const csv = [header, ...rows.map((r: any) =>
      `${r.sku},"${r.producto}",${r.tipo},"${r.ubicacion}",${r.stock},${r.unidad},${r.cpp},${r.valor}`
    )].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `stock_detallado_${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [balances, productMap, locationMap]);

  // ─── Loading ──────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-4 p-4">
        <div className="grid grid-cols-3 gap-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-48" />
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────────
  return (
    <div className="space-y-6 p-4">
      {/* Layer 1: Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <DollarSign className="h-4 w-4" />
              Capital Total
            </div>
            <p className="text-2xl font-bold">{formatCLP(Math.round(totalCapital))}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <MapPin className="h-4 w-4" />
              Ubicaciones Activas
            </div>
            <p className="text-2xl font-bold">{locations.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <Clock className="h-4 w-4" />
              Última Actualización
            </div>
            <p className="text-2xl font-bold">
              {lastUpdate ? format(new Date(lastUpdate), "dd MMM HH:mm", { locale: es }) : "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Layer 2: Distribution by location */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-sm">Distribución por Ubicación</h3>
            <Button variant="outline" size="sm" onClick={exportCSV}>
              <Download className="h-4 w-4 mr-1" /> CSV
            </Button>
          </div>
          {locationSummaries.length === 0 ? (
            <p className="text-muted-foreground text-sm">Sin stock registrado</p>
          ) : (
            <div className="space-y-3">
              {locationSummaries.map((loc) => (
                <button
                  key={loc.id}
                  className="w-full text-left"
                  onClick={() => {
                    setDetailLocation(loc.id);
                    setShowDetail(true);
                    setDetailPage(0);
                  }}
                >
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="font-medium">{loc.name}</span>
                    <div className="flex items-center gap-3 text-muted-foreground">
                      <span>{loc.productCount} prods</span>
                      <span className="font-medium text-foreground">{formatCLP(Math.round(loc.value))}</span>
                      <span className="w-10 text-right">{loc.pct.toFixed(0)}%</span>
                    </div>
                  </div>
                  <Progress value={loc.pct} className="h-2" />
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Layer 3: On-demand detail */}
      <Card>
        <CardContent className="p-4">
          <button
            className="flex items-center justify-between w-full"
            onClick={() => {
              setShowDetail(!showDetail);
              setDetailPage(0);
            }}
          >
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-muted-foreground" />
              <h3 className="font-semibold text-sm">Detalle de Stock</h3>
              <span className="text-xs text-muted-foreground">
                ({detailRows.length > 0 ? `${detailRows.length} registros` : "clic para cargar"})
              </span>
            </div>
            {showDetail ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>

          {showDetail && (
            <div className="mt-4 space-y-3">
              {/* Filters */}
              <div className="flex flex-wrap gap-2">
                <Select value={detailLocation} onValueChange={(v) => { setDetailLocation(v); setDetailPage(0); }}>
                  <SelectTrigger className="w-[180px] h-8 text-xs">
                    <SelectValue placeholder="Ubicación" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {locations.map((l) => (
                      <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={detailType} onValueChange={(v) => { setDetailType(v as any); setDetailPage(0); }}>
                  <SelectTrigger className="w-[120px] h-8 text-xs">
                    <SelectValue placeholder="Tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="ML">ML (botellas)</SelectItem>
                    <SelectItem value="UNIT">Unidades</SelectItem>
                  </SelectContent>
                </Select>

                <div className="relative flex-1 min-w-[150px]">
                  <Search className="absolute left-2 top-2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por nombre o SKU..."
                    value={detailSearch}
                    onChange={(e) => { setDetailSearch(e.target.value); setDetailPage(0); }}
                    className="pl-8 h-8 text-xs"
                  />
                </div>
              </div>

              {/* Table */}
              {pagedRows.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">Sin resultados</p>
              ) : (
                <div className="overflow-auto max-h-[400px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">SKU</TableHead>
                        <TableHead className="text-xs">Producto</TableHead>
                        <TableHead className="text-xs">Tipo</TableHead>
                        <TableHead className="text-xs">Ubicación</TableHead>
                        <TableHead className="text-xs text-right">Stock</TableHead>
                        <TableHead className="text-xs text-right">CPP</TableHead>
                        <TableHead className="text-xs text-right">Valor</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pagedRows.map((row, i) => (
                        <TableRow key={`${row.sku}-${row.location}-${i}`}>
                          <TableCell className="text-xs font-mono">{row.sku}</TableCell>
                          <TableCell className="text-xs">{row.name}</TableCell>
                          <TableCell className="text-xs">{row.tipo}</TableCell>
                          <TableCell className="text-xs">{row.location}</TableCell>
                          <TableCell className="text-xs text-right">
                            {row.tipo === "ML" ? row.stock.toLocaleString("es-CL") : row.stock}
                            <span className="text-muted-foreground ml-1">{row.unit}</span>
                          </TableCell>
                          <TableCell className="text-xs text-right">
                            {formatCLP(Math.round(row.cpp))}/{row.unit}
                          </TableCell>
                          <TableCell className="text-xs text-right font-medium">
                            {formatCLP(Math.round(row.value))}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Página {detailPage + 1} de {totalPages}</span>
                  <div className="flex gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={detailPage === 0}
                      onClick={() => setDetailPage((p) => p - 1)}
                      className="h-7 text-xs"
                    >
                      Anterior
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={detailPage >= totalPages - 1}
                      onClick={() => setDetailPage((p) => p + 1)}
                      className="h-7 text-xs"
                    >
                      Siguiente
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
