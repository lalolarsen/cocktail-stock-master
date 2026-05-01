import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Activity,
  AlertTriangle,
  ClipboardCheck,
  Camera,
  DollarSign,
  Download,
  Package,
  RefreshCw,
  Search,
  Warehouse,
  XCircle,
  PackageOpen,
  Wine,
  Box,
} from "lucide-react";

import { useAppSession } from "@/contexts/AppSessionContext";
import { useRealtimeInventory, type InventorySnapshotRow } from "@/hooks/useRealtimeInventory";
import { formatCLP } from "@/lib/currency";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { ShiftCountDialog } from "./ShiftCountDialog";
import { UploadInvoiceDialog } from "@/components/proveedores/UploadInvoiceDialog";
import { useStockAlertsLive } from "@/hooks/useStockAlertsLive";
import { InventoryOnboardingBanner } from "./InventoryOnboardingBanner";
import { generateInventorySnapshotPDF } from "@/lib/reporting/inventory-snapshot-pdf";
import { toast } from "sonner";

function StatusBadge({ status }: { status: InventorySnapshotRow["status"] }) {
  if (status === "critical") {
    return (
      <Badge variant="destructive" className="gap-1 h-5 px-1.5 text-[10px]">
        <XCircle className="w-3 h-3" /> Sin stock
      </Badge>
    );
  }
  if (status === "low") {
    return (
      <Badge className="bg-yellow-500/15 text-yellow-500 hover:bg-yellow-500/20 gap-1 h-5 px-1.5 text-[10px]">
        <AlertTriangle className="w-3 h-3" /> Bajo
      </Badge>
    );
  }
  return <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">OK</Badge>;
}

const intCL = (n: number) => Math.round(Number(n) || 0).toLocaleString("es-CL");

/** CLP compacto sin decimales: $4.219M, $402K, $1.250 */
function formatCLPCompact(n: number): string {
  const v = Math.round(Number(n) || 0);
  const abs = Math.abs(v);
  if (abs >= 1_000_000_000) return `$${Math.round(v / 1_000_000)} M`;
  if (abs >= 10_000_000) return `$${Math.round(v / 1_000_000)} M`;
  if (abs >= 1_000_000) {
    // 1.0M – 9.9M con 1 decimal solo si no es entero
    const m = v / 1_000_000;
    return `$${(Math.round(m * 10) / 10).toString().replace(".", ",")} M`;
  }
  if (abs >= 10_000) return `$${Math.round(v / 1000)}K`;
  return `$${v.toLocaleString("es-CL")}`;
}

/** Stock simple: ml para botellas, uds para resto. SIN decimales, SIN equivalencias. */
function formatStock(r: InventorySnapshotRow): string {
  const qty = Math.round(Number(r.quantity) || 0);
  if (r.is_bottle) return `${intCL(qty)} ml`;
  return `${intCL(qty)} ${qty === 1 ? "ud" : "uds"}`;
}

function KPI({
  label,
  value,
  icon: Icon,
  accent,
  tone,
}: {
  label: string;
  value: string;
  icon: typeof Package;
  accent?: boolean;
  tone?: "warning" | "danger";
}) {
  const border =
    tone === "danger" ? "border-destructive/40" :
    tone === "warning" ? "border-yellow-500/40" :
    accent ? "border-primary/40" : undefined;
  const iconColor =
    tone === "danger" ? "text-destructive" :
    tone === "warning" ? "text-yellow-500" :
    accent ? "text-primary" : "text-muted-foreground";
  return (
    <Card className={border}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
            <p className="text-2xl font-semibold mt-1 tabular-nums">{value}</p>
          </div>
          <Icon className={`w-5 h-5 ${iconColor}`} />
        </div>
      </CardContent>
    </Card>
  );
}

export function RealtimeInventoryDashboard() {
  const { venue, displayName } = useAppSession();
  const navigate = useNavigate();
  const { rows, totals, loading, lastUpdate, refresh, error } = useRealtimeInventory(venue?.id);
  useStockAlertsLive(venue?.id);
  const [countOpen, setCountOpen] = useState(false);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [activeLocation, setActiveLocation] = useState<string>("__all__");
  const [statusFilter, setStatusFilter] = useState<"all" | "low" | "critical">("all");
  const [pulse, setPulse] = useState(false);
  const lastUpdateRef = useRef<Date | null>(null);

  // Pulse animation when realtime updates arrive
  useEffect(() => {
    if (!lastUpdate) return;
    if (lastUpdateRef.current && lastUpdate.getTime() !== lastUpdateRef.current.getTime()) {
      setPulse(true);
      const t = window.setTimeout(() => setPulse(false), 1800);
      return () => window.clearTimeout(t);
    }
    lastUpdateRef.current = lastUpdate;
  }, [lastUpdate]);

  const warehouseId = useMemo(
    () => rows.find((r) => r.location_type === "warehouse")?.location_id ?? null,
    [rows],
  );

  // Locations + per-location aggregates (count, value, low/critical)
  const locations = useMemo(() => {
    const map = new Map<string, {
      id: string; name: string; type: string | null;
      count: number; value: number; low: number; critical: number;
    }>();
    for (const r of rows) {
      let entry = map.get(r.location_id);
      if (!entry) {
        entry = { id: r.location_id, name: r.location_name, type: r.location_type, count: 0, value: 0, low: 0, critical: 0 };
        map.set(r.location_id, entry);
      }
      entry.count += 1;
      entry.value += Number(r.stock_value) || 0;
      if (r.status === "low") entry.low += 1;
      if (r.status === "critical") entry.critical += 1;
    }
    return Array.from(map.values()).sort((a, b) => {
      const aw = (a.type ?? "").toLowerCase().includes("warehouse") || (a.type ?? "").toLowerCase().includes("bodega") ? 0 : 1;
      const bw = (b.type ?? "").toLowerCase().includes("warehouse") || (b.type ?? "").toLowerCase().includes("bodega") ? 0 : 1;
      if (aw !== bw) return aw - bw;
      return a.name.localeCompare(b.name);
    });
  }, [rows]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (activeLocation !== "__all__" && r.location_id !== activeLocation) return false;
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!s) return true;
      return (
        r.product_name.toLowerCase().includes(s) ||
        (r.sku_base ?? "").toLowerCase().includes(s) ||
        (r.category ?? "").toLowerCase().includes(s)
      );
    });
  }, [rows, search, activeLocation, statusFilter]);

  // Totals for current filtered view
  const filteredValue = useMemo(
    () => filtered.reduce((acc, r) => acc + (Number(r.stock_value) || 0), 0),
    [filtered]
  );

  const lastUpdateLabel = lastUpdate
    ? formatDistanceToNow(lastUpdate, { addSuffix: true, locale: es })
    : "—";

  const handleDownloadPDF = () => {
    if (!venue) {
      toast.error("Venue no disponible");
      return;
    }
    if (rows.length === 0) {
      toast.error("Sin inventario para exportar");
      return;
    }
    try {
      generateInventorySnapshotPDF({
        venueName: venue.name,
        generatedBy: displayName ?? null,
        rows,
        totals,
      });
      toast.success("PDF generado");
    } catch (e: any) {
      toast.error(e?.message ?? "Error generando PDF");
    }
  };

  const isEmpty = !loading && rows.length === 0 && !error;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-4">
        <InventoryOnboardingBanner venueId={venue?.id} />

        {/* Header simple */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-xl font-semibold tracking-tight flex items-center gap-2">
              <Activity className="w-5 h-5 text-primary" />
              Inventario en vivo
              <span
                className={`inline-block w-2 h-2 rounded-full transition-all ${
                  pulse ? "bg-primary animate-pulse scale-125" : "bg-muted"
                }`}
                title={pulse ? "Actualización en vivo" : "En espera"}
              />
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Actualizado {lastUpdateLabel}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={handleDownloadPDF} disabled={rows.length === 0}>
              <Download className="w-4 h-4 mr-1.5" /> PDF
            </Button>
            <Button variant="ghost" size="icon" onClick={() => void refresh()} disabled={loading} title="Refrescar">
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {error && (
          <Card className="border-destructive/40">
            <CardContent className="p-4 text-sm text-destructive">{error}</CardContent>
          </Card>
        )}

        {/* HERO: Acciones prioritarias — Subir factura + Conteo de cierre */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setInvoiceOpen(true)}
            disabled={!warehouseId}
            className="group text-left rounded-lg border-2 border-primary/40 bg-primary/5 hover:bg-primary/10 hover:border-primary transition-all p-4 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-md bg-primary/15 group-hover:bg-primary/25 transition-colors">
                <Camera className="w-5 h-5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-sm">Subir factura</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Foto → IA carga stock en bodega
                </div>
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setCountOpen(true)}
            className="group text-left rounded-lg border-2 border-border hover:border-foreground/30 bg-card hover:bg-muted/30 transition-all p-4"
          >
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-md bg-muted">
                <ClipboardCheck className="w-5 h-5 text-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-sm">Conteo de cierre</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Cuadratura física vs sistema
                </div>
              </div>
            </div>
          </button>
        </div>

        {/* KPIs compactos en una sola fila */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Card className="border-border">
            <CardContent className="p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Capital</p>
              <p className="text-lg sm:text-xl font-semibold mt-0.5 tabular-nums truncate" title={formatCLP(totals.totalValue)}>
                {formatCLPCompact(totals.totalValue)}
              </p>
            </CardContent>
          </Card>
          <Card className="border-border">
            <CardContent className="p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Productos</p>
              <p className="text-lg sm:text-xl font-semibold mt-0.5 tabular-nums">{totals.productCount}</p>
            </CardContent>
          </Card>
          <Card className={totals.lowCount > 0 ? "border-yellow-500/40" : "border-border"}>
            <CardContent className="p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Bajo mínimo</p>
              <p className={`text-lg sm:text-xl font-semibold mt-0.5 tabular-nums ${totals.lowCount > 0 ? "text-yellow-500" : ""}`}>
                {totals.lowCount}
              </p>
            </CardContent>
          </Card>
          <Card className={totals.criticalCount > 0 ? "border-destructive/40" : "border-border"}>
            <CardContent className="p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Sin stock</p>
              <p className={`text-lg sm:text-xl font-semibold mt-0.5 tabular-nums ${totals.criticalCount > 0 ? "text-destructive" : ""}`}>
                {totals.criticalCount}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Empty state */}
        {isEmpty && (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center gap-3">
              <div className="p-3 rounded-full bg-muted">
                <PackageOpen className="w-6 h-6 text-muted-foreground" />
              </div>
              <div className="space-y-1 max-w-md">
                <p className="text-sm font-medium">Aún no hay inventario cargado</p>
                <p className="text-xs text-muted-foreground">
                  Subí tu primera factura. La IA leerá los productos, cantidades y costos, y los cargará en bodega.
                </p>
              </div>
              <Button size="sm" onClick={() => setInvoiceOpen(true)} disabled={!warehouseId}>
                <Camera className="w-4 h-4 mr-2" />
                Subir mi primera factura
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Stock por ubicación — minimalista */}
        {!isEmpty && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <CardTitle className="text-base flex items-center gap-2">
                  <Warehouse className="w-4 h-4" />
                  Stock por ubicación
                </CardTitle>
                <div className="relative w-full sm:w-64">
                  <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar producto…"
                    className="pl-8 h-9"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {/* Tabs por ubicación: solo nombre + count, sin valores que abruman */}
              <Tabs value={activeLocation} onValueChange={setActiveLocation}>
                <TabsList className="flex flex-wrap h-auto justify-start gap-1 bg-transparent p-0 mb-3">
                  <TabsTrigger
                    value="__all__"
                    className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-md border h-8 px-3 text-xs"
                  >
                    Todas <span className="ml-1.5 opacity-60 tabular-nums">{totals.productCount}</span>
                  </TabsTrigger>
                  {locations.map((loc) => (
                    <TabsTrigger
                      key={loc.id}
                      value={loc.id}
                      className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-md border h-8 px-3 text-xs"
                    >
                      {loc.name}
                      <span className="ml-1.5 opacity-60 tabular-nums">{loc.count}</span>
                      {loc.critical > 0 && (
                        <span className="ml-1.5 inline-flex items-center justify-center min-w-[1.1rem] h-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[9px] font-semibold">
                          {loc.critical}
                        </span>
                      )}
                    </TabsTrigger>
                  ))}
                </TabsList>

                {/* Filtros rápidos secundarios */}
                <div className="flex items-center gap-1 mb-3 text-xs">
                  {([
                    { k: "all", label: "Todos" },
                    { k: "low", label: "Bajos", count: totals.lowCount },
                    { k: "critical", label: "Sin stock", count: totals.criticalCount },
                  ] as const).map((opt) => (
                    <button
                      key={opt.k}
                      type="button"
                      onClick={() => setStatusFilter(opt.k)}
                      className={`px-2 py-1 rounded transition-colors ${
                        statusFilter === opt.k
                          ? "bg-foreground/10 text-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {opt.label}
                      {"count" in opt && opt.count > 0 && (
                        <span className="ml-1 opacity-60 tabular-nums">({opt.count})</span>
                      )}
                    </button>
                  ))}
                  <span className="ml-auto text-muted-foreground tabular-nums">
                    {filtered.length.toLocaleString("es-CL")} líneas · {formatCLPCompact(filteredValue)}
                  </span>
                </div>

                <TabsContent value={activeLocation} className="mt-0">
                  <div className="rounded-md border overflow-x-auto max-h-[55vh] overflow-y-auto">
                    <Table>
                      <TableHeader className="sticky top-0 bg-background z-10">
                        <TableRow>
                          <TableHead className="min-w-[200px]">Producto</TableHead>
                          <TableHead className="hidden lg:table-cell text-xs">Ubicación</TableHead>
                          <TableHead className="text-right text-xs">Stock</TableHead>
                          <TableHead className="text-right text-xs">Valor</TableHead>
                          <TableHead className="w-[80px] text-xs">Estado</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filtered.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center text-muted-foreground py-10">
                              {loading ? "Cargando…" : "Sin resultados."}
                            </TableCell>
                          </TableRow>
                        )}
                        {filtered.map((r) => (
                          <TableRow
                            key={`${r.product_id}-${r.location_id}`}
                            className={
                              r.status === "critical" ? "bg-destructive/5" :
                              r.status === "low" ? "bg-yellow-500/5" : undefined
                            }
                          >
                            <TableCell className="py-2">
                              <div className="font-medium text-sm">{r.product_name}</div>
                              <div className="text-[10px] text-muted-foreground">
                                {r.category ?? "—"}
                                {r.is_bottle && r.capacity_ml ? ` · ${r.capacity_ml}ml` : ""}
                                <span className="lg:hidden"> · {r.location_name}</span>
                              </div>
                            </TableCell>
                            <TableCell className="hidden lg:table-cell text-xs text-muted-foreground py-2">
                              {r.location_name}
                            </TableCell>
                            <TableCell className="text-right text-sm tabular-nums py-2">
                              {formatStock(r)}
                            </TableCell>
                            <TableCell className="text-right text-sm tabular-nums py-2">
                              {formatCLPCompact(r.stock_value)}
                            </TableCell>
                            <TableCell className="py-2">
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
        )}

        <ShiftCountDialog
          open={countOpen}
          onOpenChange={setCountOpen}
          initialLocationId={activeLocation !== "__all__" ? activeLocation : undefined}
          onApplied={() => void refresh()}
        />

        {warehouseId && (
          <UploadInvoiceDialog
            open={invoiceOpen}
            onOpenChange={setInvoiceOpen}
            warehouseLocationId={warehouseId}
            onCreated={(importId) => {
              navigate(`/admin/proveedores/import/${importId}`);
            }}
          />
        )}
      </div>
    </TooltipProvider>
  );
}
