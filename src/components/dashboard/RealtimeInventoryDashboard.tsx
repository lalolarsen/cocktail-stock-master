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
import { Progress } from "@/components/ui/progress";
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

/** Formato de stock: bottles muestran ml + equivalencia en botellas; unidades formato entero. */
function formatStock(r: InventorySnapshotRow): { primary: string; secondary?: string } {
  if (r.is_bottle) {
    const ml = Math.round(Number(r.quantity) || 0);
    const cap = r.capacity_ml || 0;
    if (cap > 0) {
      const bottles = ml / cap;
      // Mostramos ml siempre como entero, equivalencia con 1 decimal sólo si no es entero
      const bottlesLabel = Number.isInteger(bottles)
        ? `${bottles} bot.`
        : `${bottles.toFixed(1).replace(".", ",")} bot.`;
      return { primary: `${intCL(ml)} ml`, secondary: `≈ ${bottlesLabel}` };
    }
    return { primary: `${intCL(ml)} ml` };
  }
  return { primary: `${intCL(r.quantity)} ${r.quantity === 1 ? "ud" : "uds"}` };
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

        {/* Header */}
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
              Última actualización {lastUpdateLabel}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  onClick={() => setInvoiceOpen(true)}
                  disabled={!warehouseId}
                >
                  <Camera className="w-4 h-4 mr-2" />
                  Subir factura
                </Button>
              </TooltipTrigger>
              <TooltipContent>Reemplaza la carga manual. Toma foto y la IA hace el resto.</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" onClick={() => setCountOpen(true)}>
                  <ClipboardCheck className="w-4 h-4 mr-2" />
                  Conteo de cierre
                </Button>
              </TooltipTrigger>
              <TooltipContent>Bartenders cuentan al cierre. Diferencias &gt;10% generan alerta.</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadPDF}
                  disabled={rows.length === 0}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Descargar PDF
                </Button>
              </TooltipTrigger>
              <TooltipContent>Genera un informe profesional del inventario actual.</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>
                  <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Refresh manual (normalmente no es necesario).</TooltipContent>
            </Tooltip>
          </div>
        </div>

        {error && (
          <Card className="border-destructive/40">
            <CardContent className="p-4 text-sm text-destructive">{error}</CardContent>
          </Card>
        )}

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KPI label="Capital inmovilizado" value={formatCLP(totals.totalValue)} icon={DollarSign} accent />
          <KPI label="Productos con stock" value={String(totals.productCount)} icon={Package} />
          <KPI label="Bajo mínimo" value={String(totals.lowCount)} icon={AlertTriangle} tone={totals.lowCount > 0 ? "warning" : undefined} />
          <KPI label="Sin stock" value={String(totals.criticalCount)} icon={XCircle} tone={totals.criticalCount > 0 ? "danger" : undefined} />
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
                  Subí tu primera factura. La IA leerá los productos, cantidades y costos, y los cargará en bodega automáticamente.
                </p>
              </div>
              <Button size="sm" onClick={() => setInvoiceOpen(true)} disabled={!warehouseId}>
                <Camera className="w-4 h-4 mr-2" />
                Subir mi primera factura
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Tabla */}
        {!isEmpty && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between flex-wrap gap-3">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Warehouse className="w-4 h-4" />
                    Stock por ubicación
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">
                    {filtered.length.toLocaleString("es-CL")} {filtered.length === 1 ? "línea" : "líneas"} ·
                    {" "}<span className="font-medium text-foreground">{formatCLP(Math.round(filteredValue))}</span> en vista
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Filtros de estado */}
                  <div className="inline-flex rounded-md border bg-card p-0.5">
                    {([
                      { k: "all", label: "Todos" },
                      { k: "low", label: `Bajos (${totals.lowCount})` },
                      { k: "critical", label: `Sin stock (${totals.criticalCount})` },
                    ] as const).map((opt) => (
                      <button
                        key={opt.k}
                        type="button"
                        onClick={() => setStatusFilter(opt.k)}
                        className={`px-2.5 py-1 text-xs rounded-sm transition-colors ${
                          statusFilter === opt.k
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <div className="relative w-full sm:w-64">
                    <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Buscar producto, SKU o categoría"
                      className="pl-8 h-9"
                    />
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Tabs value={activeLocation} onValueChange={setActiveLocation}>
                <TabsList className="flex flex-wrap h-auto justify-start gap-1 bg-transparent p-0">
                  <TabsTrigger
                    value="__all__"
                    className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-md border h-auto py-1.5 px-3 flex flex-col items-start gap-0"
                  >
                    <span className="text-xs font-medium">Todas</span>
                    <span className="text-[10px] opacity-70 tabular-nums">
                      {totals.productCount} prod · {formatCLP(Math.round(totals.totalValue))}
                    </span>
                  </TabsTrigger>
                  {locations.map((loc) => {
                    const isWarehouse = (loc.type ?? "").toLowerCase().includes("warehouse")
                      || (loc.type ?? "").toLowerCase().includes("bodega");
                    return (
                      <TabsTrigger
                        key={loc.id}
                        value={loc.id}
                        className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-md border h-auto py-1.5 px-3 flex flex-col items-start gap-0"
                      >
                        <span className="text-xs font-medium flex items-center gap-1">
                          {isWarehouse ? <Warehouse className="w-3 h-3" /> : <Box className="w-3 h-3" />}
                          {loc.name}
                          {loc.critical > 0 && (
                            <span className="ml-1 inline-flex items-center justify-center min-w-[1rem] h-3.5 px-1 rounded-full bg-destructive text-destructive-foreground text-[9px] font-semibold">
                              {loc.critical}
                            </span>
                          )}
                        </span>
                        <span className="text-[10px] opacity-70 tabular-nums">
                          {loc.count} · {formatCLP(Math.round(loc.value))}
                        </span>
                      </TabsTrigger>
                    );
                  })}
                </TabsList>

                <TabsContent value={activeLocation} className="mt-4">
                  <div className="rounded-md border overflow-x-auto max-h-[60vh] overflow-y-auto">
                    <Table>
                      <TableHeader className="sticky top-0 bg-background z-10">
                        <TableRow>
                          <TableHead className="min-w-[220px]">Producto</TableHead>
                          <TableHead className="hidden lg:table-cell">Ubicación</TableHead>
                          <TableHead className="text-right">Stock</TableHead>
                          <TableHead className="text-right hidden md:table-cell">Mínimo</TableHead>
                          <TableHead className="text-right hidden sm:table-cell">CPP</TableHead>
                          <TableHead className="text-right">Valor</TableHead>
                          <TableHead className="w-[90px]">Estado</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filtered.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={7} className="text-center text-muted-foreground py-10">
                              {loading ? "Cargando inventario…" : "Sin resultados con los filtros actuales."}
                            </TableCell>
                          </TableRow>
                        )}
                        {filtered.map((r) => {
                          const stock = formatStock(r);
                          const min = Math.round(Number(r.min_quantity) || 0);
                          const qty = Math.round(Number(r.quantity) || 0);
                          // Para barra de progreso vs mínimo (cap a 200%)
                          const pct = min > 0 ? Math.min(200, (qty / min) * 100) : qty > 0 ? 100 : 0;
                          const barColor =
                            r.status === "critical" ? "bg-destructive" :
                            r.status === "low" ? "bg-yellow-500" : "bg-primary";
                          return (
                            <TableRow
                              key={`${r.product_id}-${r.location_id}`}
                              className={
                                r.status === "critical" ? "bg-destructive/5" :
                                r.status === "low" ? "bg-yellow-500/5" : undefined
                              }
                            >
                              <TableCell>
                                <div className="font-medium text-sm flex items-center gap-1.5">
                                  {r.is_bottle ? <Wine className="w-3 h-3 text-muted-foreground" /> : <Box className="w-3 h-3 text-muted-foreground" />}
                                  {r.product_name}
                                </div>
                                <div className="text-[10px] text-muted-foreground mt-0.5">
                                  {r.sku_base ?? "—"} · {r.category ?? "—"}
                                  {r.is_bottle && r.capacity_ml ? ` · ${r.capacity_ml} ml` : ""}
                                  <span className="lg:hidden"> · {r.location_name}</span>
                                </div>
                              </TableCell>
                              <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                                {r.location_name}
                              </TableCell>
                              <TableCell className="text-right font-mono text-sm">
                                <div className="tabular-nums">{stock.primary}</div>
                                {stock.secondary && (
                                  <div className="text-[10px] text-muted-foreground tabular-nums">{stock.secondary}</div>
                                )}
                                {/* Mini barra de progreso vs mínimo */}
                                <div className="mt-1 h-1 rounded-full bg-muted overflow-hidden w-20 ml-auto">
                                  <div className={`h-full ${barColor} transition-all`} style={{ width: `${Math.min(100, pct)}%` }} />
                                </div>
                              </TableCell>
                              <TableCell className="text-right font-mono hidden md:table-cell text-muted-foreground text-sm tabular-nums">
                                {intCL(min)}
                              </TableCell>
                              <TableCell className="text-right font-mono hidden sm:table-cell text-sm tabular-nums">
                                {formatCLP(Math.round(r.cpp))}
                              </TableCell>
                              <TableCell className="text-right font-mono text-sm tabular-nums">
                                {formatCLP(Math.round(r.stock_value))}
                              </TableCell>
                              <TableCell>
                                <StatusBadge status={r.status} />
                              </TableCell>
                            </TableRow>
                          );
                        })}
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
