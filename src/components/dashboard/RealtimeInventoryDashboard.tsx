import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Activity,
  AlertTriangle,
  DollarSign,
  Package,
  RefreshCw,
  Search,
  Warehouse,
  XCircle,
} from "lucide-react";
import { useAppSession } from "@/contexts/AppSessionContext";
import { useRealtimeInventory, type InventorySnapshotRow } from "@/hooks/useRealtimeInventory";
import { formatCLP } from "@/lib/currency";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

function StatusBadge({ status }: { status: InventorySnapshotRow["status"] }) {
  if (status === "critical") {
    return (
      <Badge variant="destructive" className="gap-1">
        <XCircle className="w-3 h-3" /> Sin stock
      </Badge>
    );
  }
  if (status === "low") {
    return (
      <Badge className="bg-yellow-500/15 text-yellow-500 hover:bg-yellow-500/20 gap-1">
        <AlertTriangle className="w-3 h-3" /> Bajo
      </Badge>
    );
  }
  return <Badge variant="secondary">OK</Badge>;
}

function KPI({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  icon: typeof Package;
  accent?: boolean;
}) {
  return (
    <Card className={accent ? "border-primary/40" : undefined}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
            <p className="text-2xl font-semibold mt-1">{value}</p>
          </div>
          <Icon className={`w-5 h-5 ${accent ? "text-primary" : "text-muted-foreground"}`} />
        </div>
      </CardContent>
    </Card>
  );
}

export function RealtimeInventoryDashboard() {
  const { venue } = useAppSession();
  const { rows, loading, lastUpdate, refresh, error } = useRealtimeInventory(venue?.id);

  const [search, setSearch] = useState("");
  const [activeLocation, setActiveLocation] = useState<string>("__all__");

  const locations = useMemo(() => {
    const map = new Map<string, { id: string; name: string; type: string | null }>();
    for (const r of rows) {
      if (!map.has(r.location_id)) {
        map.set(r.location_id, { id: r.location_id, name: r.location_name, type: r.location_type });
      }
    }
    return Array.from(map.values()).sort((a, b) => {
      // Bodega first
      const aw = (a.type ?? "").toLowerCase().includes("bodega") ? 0 : 1;
      const bw = (b.type ?? "").toLowerCase().includes("bodega") ? 0 : 1;
      if (aw !== bw) return aw - bw;
      return a.name.localeCompare(b.name);
    });
  }, [rows]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (activeLocation !== "__all__" && r.location_id !== activeLocation) return false;
      if (!s) return true;
      return (
        r.product_name.toLowerCase().includes(s) ||
        (r.sku_base ?? "").toLowerCase().includes(s) ||
        (r.category ?? "").toLowerCase().includes(s)
      );
    });
  }, [rows, search, activeLocation]);

  const totals = useMemo(() => {
    const totalValue = Math.round(rows.reduce((acc, r) => acc + (r.stock_value || 0), 0));
    const productSet = new Set(rows.filter((r) => r.quantity > 0).map((r) => r.product_id));
    const lowCount = rows.filter((r) => r.status === "low").length;
    const criticalCount = rows.filter((r) => r.status === "critical").length;
    return { totalValue, productCount: productSet.size, lowCount, criticalCount };
  }, [rows]);

  const lastUpdateLabel = lastUpdate
    ? formatDistanceToNow(lastUpdate, { addSuffix: true, locale: es })
    : "—";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" />
            Inventario en vivo
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Última actualización {lastUpdateLabel}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Actualizar
        </Button>
      </div>

      {error && (
        <Card className="border-destructive/40">
          <CardContent className="p-4 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI label="Capital inmovilizado" value={formatCLP(totals.totalValue)} icon={DollarSign} accent />
        <KPI label="Productos con stock" value={String(totals.productCount)} icon={Package} />
        <KPI label="Bajo mínimo" value={String(totals.lowCount)} icon={AlertTriangle} />
        <KPI label="Sin stock" value={String(totals.criticalCount)} icon={XCircle} />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Warehouse className="w-4 h-4" />
              Stock por ubicación
            </CardTitle>
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar producto, SKU o categoría"
                className="pl-8 h-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={activeLocation} onValueChange={setActiveLocation}>
            <TabsList className="flex flex-wrap h-auto justify-start">
              <TabsTrigger value="__all__">Todas</TabsTrigger>
              {locations.map((loc) => (
                <TabsTrigger key={loc.id} value={loc.id}>
                  {loc.name}
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value={activeLocation} className="mt-4">
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Producto</TableHead>
                      <TableHead className="hidden md:table-cell">Ubicación</TableHead>
                      <TableHead className="text-right">Stock</TableHead>
                      <TableHead className="text-right hidden sm:table-cell">CPP</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead className="text-right hidden md:table-cell">Mínimo</TableHead>
                      <TableHead>Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                          {loading ? "Cargando inventario…" : "Sin resultados."}
                        </TableCell>
                      </TableRow>
                    )}
                    {filtered.map((r) => (
                      <TableRow key={`${r.product_id}-${r.location_id}`}>
                        <TableCell>
                          <div className="font-medium">{r.product_name}</div>
                          <div className="text-xs text-muted-foreground">
                            {r.sku_base ?? "—"} · {r.category ?? "—"}
                            {r.is_bottle && r.capacity_ml ? ` · ${r.capacity_ml} ml` : ""}
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-sm">{r.location_name}</TableCell>
                        <TableCell className="text-right font-mono">
                          {r.is_bottle
                            ? `${Math.round(r.quantity)} ml`
                            : Number(r.quantity).toLocaleString("es-CL")}
                        </TableCell>
                        <TableCell className="text-right font-mono hidden sm:table-cell">
                          {formatCLP(Math.round(r.cpp))}
                        </TableCell>
                        <TableCell className="text-right font-mono">{formatCLP(r.stock_value)}</TableCell>
                        <TableCell className="text-right font-mono hidden md:table-cell text-muted-foreground">
                          {Number(r.min_quantity).toLocaleString("es-CL")}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={r.status} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
