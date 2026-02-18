import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_VENUE_ID } from "@/lib/venue";
import { formatDistanceToNow, format } from "date-fns";
import { es } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Wine, MapPin, Package, AlertTriangle, RefreshCw } from "lucide-react";
import { OpenBottleDetailDrawer } from "./OpenBottleDetailDrawer";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OpenBottleRow {
  id: string;
  venue_id: string;
  location_id: string;
  product_id: string;
  status: string;
  opened_at: string;
  opened_by_user_id: string;
  label_code: string | null;
  initial_ml: number;
  remaining_ml: number;
  last_counted_ml: number | null;
  last_counted_at: string | null;
  notes: string | null;
  // joined
  product_name: string;
  product_capacity_ml: number | null;
  location_name: string;
  opened_by_name: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getPct(remaining: number, initial: number) {
  if (!initial) return 0;
  return Math.round((remaining / initial) * 100);
}

function getStatusLevel(pct: number): "ok" | "low" | "critical" {
  if (pct < 15) return "critical";
  if (pct < 35) return "low";
  return "ok";
}

const LEVEL_LABEL: Record<string, string> = {
  ok: "OK",
  low: "Bajo",
  critical: "Crítico",
};
const LEVEL_VARIANT: Record<string, "default" | "secondary" | "destructive"> = {
  ok: "secondary",
  low: "default",
  critical: "destructive",
};

// ─── Data Fetching ────────────────────────────────────────────────────────────

async function fetchOpenBottles(): Promise<OpenBottleRow[]> {
  const { data, error } = await (supabase as any)
    .from("open_bottles")
    .select(`
      *,
      products:product_id(id, name, capacity_ml),
      stock_locations:location_id(id, name),
      profiles:opened_by_user_id(full_name)
    `)
    .eq("venue_id", DEFAULT_VENUE_ID)
    .order("location_id", { ascending: true })
    .order("opened_at", { ascending: true });

  if (error) throw error;

  return (data || []).map((r: any) => ({
    ...r,
    product_name: r.products?.name ?? "—",
    product_capacity_ml: r.products?.capacity_ml ?? null,
    location_name: r.stock_locations?.name ?? "—",
    opened_by_name: r.profiles?.full_name ?? r.opened_by_user_id?.slice(0, 8) ?? "—",
  }));
}

// ─── Component ────────────────────────────────────────────────────────────────

export function OpenBottlesMonitor() {
  const [search, setSearch] = useState("");
  const [locationFilter, setLocationFilter] = useState("all");
  const [includeClosed, setIncludeClosed] = useState(false);
  const [capacityFilter, setCapacityFilter] = useState("all");
  const [selectedBottle, setSelectedBottle] = useState<OpenBottleRow | null>(null);

  const { data: bottles = [], isLoading, refetch } = useQuery({
    queryKey: ["open-bottles-monitor", DEFAULT_VENUE_ID],
    queryFn: fetchOpenBottles,
    staleTime: 30_000,
  });

  // Unique locations for filter dropdown
  const locations = useMemo(() => {
    const map = new Map<string, string>();
    for (const b of bottles) map.set(b.location_id, b.location_name);
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [bottles]);

  // Unique capacity sizes
  const capacities = useMemo(() => {
    const set = new Set<number>();
    for (const b of bottles) if (b.initial_ml) set.add(b.initial_ml);
    return Array.from(set).sort((a, b) => a - b);
  }, [bottles]);

  // Filtered bottles
  const filtered = useMemo(() => {
    return bottles.filter((b) => {
      if (!includeClosed && b.status !== "OPEN") return false;
      if (locationFilter !== "all" && b.location_id !== locationFilter) return false;
      if (capacityFilter !== "all" && String(b.initial_ml) !== capacityFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !b.product_name.toLowerCase().includes(q) &&
          !(b.label_code ?? "").toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [bottles, includeClosed, locationFilter, capacityFilter, search]);

  // Summary chips
  const totalOpen = bottles.filter((b) => b.status === "OPEN").length;
  const activeBars = new Set(bottles.filter((b) => b.status === "OPEN").map((b) => b.location_id)).size;
  const distinctProducts = new Set(bottles.filter((b) => b.status === "OPEN").map((b) => b.product_id)).size;

  // Group by location
  const grouped = useMemo(() => {
    const map = new Map<string, OpenBottleRow[]>();
    for (const b of filtered) {
      const list = map.get(b.location_name) ?? [];
      list.push(b);
      map.set(b.location_name, list);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
            <Wine className="w-5 h-5 text-primary" />
            Botellas Abiertas
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Monitoreo operativo por barra (solo lectura)
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          className="gap-1.5 shrink-0"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Actualizar
        </Button>
      </div>

      {/* Summary chips */}
      <div className="flex flex-wrap gap-2">
        <Badge variant="secondary" className="gap-1.5 text-sm px-3 py-1">
          <Wine className="w-3.5 h-3.5" />
          Total abiertas: <span className="font-bold">{totalOpen}</span>
        </Badge>
        <Badge variant="secondary" className="gap-1.5 text-sm px-3 py-1">
          <MapPin className="w-3.5 h-3.5" />
          Barras con abiertas: <span className="font-bold">{activeBars}</span>
        </Badge>
        <Badge variant="secondary" className="gap-1.5 text-sm px-3 py-1">
          <Package className="w-3.5 h-3.5" />
          Productos distintos: <span className="font-bold">{distinctProducts}</span>
        </Badge>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[180px] max-w-xs">
          <Label className="text-xs text-muted-foreground mb-1 block">Buscar producto</Label>
          <Input
            placeholder="Nombre o etiqueta..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 text-sm"
          />
        </div>

        <div className="min-w-[160px]">
          <Label className="text-xs text-muted-foreground mb-1 block">Ubicación</Label>
          <Select value={locationFilter} onValueChange={setLocationFilter}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="Todas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {locations.map(([id, name]) => (
                <SelectItem key={id} value={id}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {capacities.length > 1 && (
          <div className="min-w-[140px]">
            <Label className="text-xs text-muted-foreground mb-1 block">Tamaño</Label>
            <Select value={capacityFilter} onValueChange={setCapacityFilter}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {capacities.map((ml) => (
                  <SelectItem key={ml} value={String(ml)}>
                    {ml} ml
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="flex items-center gap-2 pb-0.5">
          <Switch
            id="include-closed"
            checked={includeClosed}
            onCheckedChange={setIncludeClosed}
          />
          <Label htmlFor="include-closed" className="text-sm cursor-pointer">
            Incluir cerradas
          </Label>
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
          <Wine className="w-10 h-10 opacity-20" />
          <p className="text-sm">No hay botellas abiertas con los filtros seleccionados.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(([locationName, rows]) => (
            <div key={locationName}>
              {/* Location header */}
              <div className="flex items-center gap-2 mb-2">
                <MapPin className="w-4 h-4 text-primary shrink-0" />
                <span className="text-sm font-semibold text-foreground">{locationName}</span>
                <span className="text-xs text-muted-foreground">({rows.length} botella{rows.length !== 1 ? "s" : ""})</span>
              </div>

              <div className="rounded-lg border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead className="text-xs py-2">Producto</TableHead>
                      <TableHead className="text-xs py-2">Código</TableHead>
                      <TableHead className="text-xs py-2 text-right">Capacidad</TableHead>
                      <TableHead className="text-xs py-2 text-right">Restante</TableHead>
                      <TableHead className="text-xs py-2 text-right">%</TableHead>
                      <TableHead className="text-xs py-2">Estado</TableHead>
                      <TableHead className="text-xs py-2">Abierta desde</TableHead>
                      <TableHead className="text-xs py-2">Abierta por</TableHead>
                      <TableHead className="text-xs py-2">Último conteo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((bottle) => {
                      const pct = getPct(bottle.remaining_ml, bottle.initial_ml);
                      const level = getStatusLevel(pct);
                      return (
                        <TableRow
                          key={bottle.id}
                          className="cursor-pointer hover:bg-muted/30"
                          onClick={() => setSelectedBottle(bottle)}
                        >
                          <TableCell className="font-medium text-sm py-2.5">
                            {bottle.product_name}
                          </TableCell>
                          <TableCell className="text-sm py-2.5 text-muted-foreground">
                            {bottle.label_code ?? "—"}
                          </TableCell>
                          <TableCell className="text-sm py-2.5 text-right text-muted-foreground">
                            {bottle.initial_ml} ml
                          </TableCell>
                          <TableCell className="text-sm py-2.5 text-right font-mono">
                            {bottle.remaining_ml} ml
                          </TableCell>
                          <TableCell className="text-sm py-2.5 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {level === "critical" && (
                                <AlertTriangle className="w-3 h-3 text-destructive" />
                              )}
                              <Badge variant={LEVEL_VARIANT[level]} className="text-xs px-1.5 py-0">
                                {pct}% {LEVEL_LABEL[level]}
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell className="py-2.5">
                            <Badge
                              variant={bottle.status === "OPEN" ? "default" : "secondary"}
                              className="text-xs"
                            >
                              {bottle.status === "OPEN" ? "Abierta" : "Cerrada"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs py-2.5 text-muted-foreground">
                            <span title={format(new Date(bottle.opened_at), "dd/MM/yyyy HH:mm")}>
                              {formatDistanceToNow(new Date(bottle.opened_at), {
                                locale: es,
                                addSuffix: true,
                              })}
                            </span>
                          </TableCell>
                          <TableCell className="text-xs py-2.5 text-muted-foreground">
                            {bottle.opened_by_name}
                          </TableCell>
                          <TableCell className="text-xs py-2.5 text-muted-foreground">
                            {bottle.last_counted_at ? (
                              <span title={format(new Date(bottle.last_counted_at), "dd/MM HH:mm")}>
                                {bottle.last_counted_ml} ml ·{" "}
                                {formatDistanceToNow(new Date(bottle.last_counted_at), {
                                  locale: es,
                                  addSuffix: true,
                                })}
                              </span>
                            ) : (
                              "—"
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail drawer */}
      <OpenBottleDetailDrawer
        bottle={selectedBottle}
        onClose={() => setSelectedBottle(null)}
      />
    </div>
  );
}
