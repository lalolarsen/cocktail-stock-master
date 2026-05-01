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

  const locations = useMemo(() => {
    const map = new Map<string, { id: string; name: string; type: string | null }>();
    for (const r of rows) {
      if (!map.has(r.location_id)) {
        map.set(r.location_id, { id: r.location_id, name: r.location_name, type: r.location_type });
      }
    }
    return Array.from(map.values()).sort((a, b) => {
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
                  <div className="rounded-md border overflow-x-auto max-h-[60vh] overflow-y-auto">
                    <Table>
                      <TableHeader className="sticky top-0 bg-background z-10">
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
                          <TableRow
                            key={`${r.product_id}-${r.location_id}`}
                            className={
                              r.status === "critical" ? "bg-destructive/5" :
                              r.status === "low" ? "bg-yellow-500/5" : undefined
                            }
                          >
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
                            <TableCell className="text-right font-mono">{formatCLP(Math.round(r.stock_value))}</TableCell>
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
