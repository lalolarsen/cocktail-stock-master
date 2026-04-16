import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAppSession } from "@/contexts/AppSessionContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Loader2, Download, QrCode, Search, Gift, Package, Info, BarChart3, ArrowDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface Jornada { id: string; nombre: string; numero_jornada: number; fecha: string; estado: string }
interface Location { id: string; name: string; type: string }

interface ReconciliationRow {
  product_id: string;
  product_name: string;
  unit: string;
  theoretical_consumption: number;
  courtesy_consumption: number;
  total_consumption: number;
}

export function RedeemReconciliationPanel() {
  const { venue } = useAppSession();
  const venueId = venue?.id;

  const [jornadas, setJornadas] = useState<Jornada[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedJornada, setSelectedJornada] = useState("");
  const [selectedLocation, setSelectedLocation] = useState("");
  const [rows, setRows] = useState<ReconciliationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [redeemCount, setRedeemCount] = useState(0);
  const [courtesyCount, setCourtesyCount] = useState(0);
  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    if (!venueId) return;
    (async () => {
      const [jRes, lRes] = await Promise.all([
        supabase
          .from("jornadas")
          .select("id, nombre, numero_jornada, fecha, estado")
          .eq("venue_id", venueId)
          .order("fecha", { ascending: false })
          .limit(30),
        supabase
          .from("stock_locations")
          .select("id, name, type")
          .eq("venue_id", venueId)
          .eq("is_active", true),
      ]);
      setJornadas((jRes.data || []) as Jornada[]);
      setLocations((lRes.data || []) as Location[]);
      setInitialLoading(false);
    })();
  }, [venueId]);

  const loadReconciliation = async () => {
    if (!selectedJornada || !selectedLocation) return;
    setLoading(true);
    setHasLoaded(true);
    try {
      // Fetch pickup redemption logs
      const { data: logs, error } = await supabase
        .from("pickup_redemptions_log")
        .select("theoretical_consumption, items_snapshot, bar_location_id")
        .eq("jornada_id", selectedJornada)
        .eq("result", "success");

      if (error) throw error;

      const locationLogs = (logs || []).filter((l: any) => l.bar_location_id === selectedLocation);
      setRedeemCount(locationLogs.length);

      // Fetch courtesy redemptions for this jornada
      const { data: courtesyLogs, error: cErr } = await supabase
        .from("courtesy_redemptions")
        .select("courtesy_id, result")
        .eq("jornada_id", selectedJornada)
        .eq("result", "success");

      if (cErr) throw cErr;

      // Get courtesy QR details for theoretical consumption
      const courtesyIds = (courtesyLogs || []).map((c: any) => c.courtesy_id);
      setCourtesyCount(courtesyIds.length);

      let courtesyConsumption = new Map<string, { name: string; qty: number; unit: string }>();

      if (courtesyIds.length > 0) {
        const { data: courtesyQrs } = await supabase
          .from("courtesy_qr")
          .select("id, product_id, product_name, qty")
          .in("id", courtesyIds);

        if (courtesyQrs) {
          // Get recipes for courtesy products
          const productIds = [...new Set(courtesyQrs.map((q: any) => q.product_id))];
          const { data: ingredients } = await supabase
            .from("cocktail_ingredients")
            .select("cocktail_id, product_id, quantity, products:product_id(name, unit)")
            .in("cocktail_id", productIds);

          for (const qr of courtesyQrs as any[]) {
            const recipeItems = (ingredients || []).filter((i: any) => i.cocktail_id === qr.product_id);
            if (recipeItems.length > 0) {
              for (const item of recipeItems) {
                const prodInfo = item.products as any;
                const key = item.product_id || prodInfo?.name || "?";
                const existing = courtesyConsumption.get(key) || { name: prodInfo?.name || "?", qty: 0, unit: prodInfo?.unit || "ml" };
                existing.qty += (Number(item.quantity) || 0) * (qr.qty || 1);
                courtesyConsumption.set(key, existing);
              }
            } else {
              // Direct product (no recipe)
              const key = qr.product_id;
              const existing = courtesyConsumption.get(key) || { name: qr.product_name, qty: 0, unit: "ud" };
              existing.qty += qr.qty || 1;
              courtesyConsumption.set(key, existing);
            }
          }
        }
      }

      // Aggregate theoretical consumption from pickup redeems
      const consumptionMap = new Map<string, { name: string; qty: number; courtesyQty: number; unit: string }>();
      for (const log of locationLogs) {
        const consumption = Array.isArray(log.theoretical_consumption) ? log.theoretical_consumption : [];
        for (const rawC of consumption) {
          const c = rawC as Record<string, unknown>;
          const key = (c.product_id as string) || (c.product_name as string) || "?";
          const existing = consumptionMap.get(key) || { name: (c.product_name as string) || "?", qty: 0, courtesyQty: 0, unit: (c.unit as string) || "ud" };
          existing.qty += Number(c.quantity) || 0;
          consumptionMap.set(key, existing);
        }
      }

      // Merge courtesy consumption
      for (const [key, data] of courtesyConsumption) {
        const existing = consumptionMap.get(key) || { name: data.name, qty: 0, courtesyQty: 0, unit: data.unit };
        existing.courtesyQty += data.qty;
        consumptionMap.set(key, existing);
      }

      const newRows: ReconciliationRow[] = Array.from(consumptionMap.entries())
        .map(([productId, data]) => ({
          product_id: productId,
          product_name: data.name,
          unit: data.unit,
          theoretical_consumption: Math.round(data.qty * 10) / 10,
          courtesy_consumption: Math.round(data.courtesyQty * 10) / 10,
          total_consumption: Math.round((data.qty + data.courtesyQty) * 10) / 10,
        }))
        .sort((a, b) => b.total_consumption - a.total_consumption);

      setRows(newRows);

      if (newRows.length === 0) {
        toast.info("No hay consumo teórico registrado para esta combinación");
      }
    } catch (err: any) {
      console.error("Error loading reconciliation:", err);
      toast.error("Error al cargar conciliación");
    } finally {
      setLoading(false);
    }
  };

  const handleExportCSV = () => {
    if (rows.length === 0) return;
    const jornada = jornadas.find(j => j.id === selectedJornada);
    const location = locations.find(l => l.id === selectedLocation);

    const lines: string[] = [];
    lines.push("CONCILIACIÓN CONSUMO TEÓRICO vs STOCK");
    lines.push(`Jornada,#${jornada?.numero_jornada || "?"} - ${jornada?.fecha || ""}`);
    lines.push(`Ubicación,${location?.name || "?"}`);
    lines.push(`Canjes QR,${redeemCount}`);
    lines.push(`Cortesías,${courtesyCount}`);
    lines.push("");
    lines.push("Insumo,Consumo ventas,Consumo cortesías,Consumo total,Unidad");
    rows.forEach(r => lines.push(`"${r.product_name}",${r.theoretical_consumption},${r.courtesy_consumption},${r.total_consumption},${r.unit}`));

    const csvContent = lines.join("\n");
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `conciliacion_j${jornada?.numero_jornada}_${location?.name}_${jornada?.fecha}.csv`;
    link.click();
    toast.success("CSV de conciliación descargado");
  };

  const filteredRows = useMemo(() => {
    if (!searchTerm.trim()) return rows;
    const term = searchTerm.toLowerCase();
    return rows.filter(r => r.product_name.toLowerCase().includes(term));
  }, [rows, searchTerm]);

  const totalProducts = rows.length;
  const totalConsumption = rows.reduce((s, r) => s + r.total_consumption, 0);
  const totalCourtesy = rows.reduce((s, r) => s + r.courtesy_consumption, 0);

  if (initialLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary" />
          Canjes vs Stock — Conciliación
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Compara cuánto insumo se debería haber consumido según los canjes QR contra el conteo real de inventario.
        </p>
      </div>

      {/* Explainer card */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-4">
          <div className="flex gap-3">
            <Info className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div className="space-y-2 text-sm">
              <p className="font-medium text-foreground">¿Cómo funciona?</p>
              <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                <li>Selecciona una <strong>jornada</strong> y una <strong>ubicación</strong> (barra o bodega)</li>
                <li>El sistema calcula cuánto se <strong>debería haber consumido</strong> según los QRs canjeados y las cortesías entregadas</li>
                <li>Descarga el CSV y compáralo con tu <strong>conteo físico real</strong> (Excel)</li>
                <li>Las diferencias te indican <strong>sobrantes o faltantes</strong> por producto</li>
              </ol>
              <p className="text-xs text-muted-foreground/80 pt-1">
                📌 El consumo teórico se calcula según la receta vigente al momento del canje. Incluye ventas y cortesías.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filtros</CardTitle>
          <CardDescription>Selecciona jornada y ubicación para calcular el consumo teórico</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex items-end gap-3 flex-wrap">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">Jornada</label>
              <Select value={selectedJornada} onValueChange={v => { setSelectedJornada(v); setHasLoaded(false); setRows([]); }}>
                <SelectTrigger className="w-[240px] h-10">
                  <SelectValue placeholder="Seleccionar jornada…" />
                </SelectTrigger>
                <SelectContent>
                  {jornadas.map(j => (
                    <SelectItem key={j.id} value={j.id}>
                      #{j.numero_jornada} — {format(new Date(j.fecha + "T12:00:00"), "d MMM yyyy", { locale: es })}
                      {j.estado === "abierta" ? " 🟢" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">Ubicación</label>
              <Select value={selectedLocation} onValueChange={v => { setSelectedLocation(v); setHasLoaded(false); setRows([]); }}>
                <SelectTrigger className="w-[200px] h-10">
                  <SelectValue placeholder="Seleccionar…" />
                </SelectTrigger>
                <SelectContent>
                  {locations.map(l => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name} ({l.type === "warehouse" ? "Bodega" : "Barra"})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button onClick={loadReconciliation} disabled={!selectedJornada || !selectedLocation || loading} className="h-10">
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Search className="h-4 w-4 mr-2" />}
              Calcular consumo
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Empty state - before loading */}
      {!hasLoaded && (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <ArrowDown className="h-8 w-8 mx-auto mb-3 text-muted-foreground/30 animate-bounce" />
            <p className="text-muted-foreground font-medium">Selecciona jornada y ubicación</p>
            <p className="text-sm text-muted-foreground/70 mt-1">
              Luego presiona "Calcular consumo" para ver el desglose teórico
            </p>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {hasLoaded && rows.length > 0 && (
        <>
          {/* KPI summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card>
              <CardContent className="p-4 text-center">
                <QrCode className="h-5 w-5 mx-auto mb-1 text-primary" />
                <p className="text-2xl font-bold">{redeemCount}</p>
                <p className="text-xs text-muted-foreground">Canjes QR</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <Gift className="h-5 w-5 mx-auto mb-1 text-accent-foreground" />
                <p className="text-2xl font-bold">{courtesyCount}</p>
                <p className="text-xs text-muted-foreground">Cortesías</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <Package className="h-5 w-5 mx-auto mb-1 text-secondary-foreground" />
                <p className="text-2xl font-bold">{totalProducts}</p>
                <p className="text-xs text-muted-foreground">Insumos distintos</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <BarChart3 className="h-5 w-5 mx-auto mb-1 text-primary" />
                <p className="text-2xl font-bold">{Math.round(totalConsumption).toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Consumo total (ud)</p>
              </CardContent>
            </Card>
          </div>

          {/* Actions bar */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Buscar insumo…"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="pl-8 h-9"
              />
            </div>
            <Button variant="outline" size="sm" className="gap-1.5 ml-auto" onClick={handleExportCSV}>
              <Download className="h-4 w-4" />
              Descargar CSV
            </Button>
          </div>

          {/* Table */}
          <Card>
            <div className="overflow-auto max-h-[600px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Insumo</TableHead>
                    <TableHead className="text-right">Ventas</TableHead>
                    {totalCourtesy > 0 && <TableHead className="text-right">Cortesías</TableHead>}
                    <TableHead className="text-right font-semibold">Total</TableHead>
                    <TableHead className="text-center w-20">Unidad</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.map(row => (
                    <TableRow key={row.product_id}>
                      <TableCell className="font-medium text-sm">{row.product_name}</TableCell>
                      <TableCell className="text-right font-mono text-sm tabular-nums">
                        {row.theoretical_consumption}
                      </TableCell>
                      {totalCourtesy > 0 && (
                        <TableCell className="text-right font-mono text-sm tabular-nums text-accent-foreground">
                          {row.courtesy_consumption > 0 ? row.courtesy_consumption : "—"}
                        </TableCell>
                      )}
                      <TableCell className="text-right font-mono text-sm tabular-nums font-semibold">
                        {row.total_consumption}
                      </TableCell>
                      <TableCell className="text-center text-xs text-muted-foreground">{row.unit}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>

          {/* Footer help */}
          <Card className="border-muted bg-muted/30">
            <CardContent className="p-4 text-sm text-muted-foreground space-y-2">
              <p className="font-medium text-foreground">📋 ¿Cómo usar este reporte?</p>
              <ul className="list-disc list-inside space-y-1 text-xs">
                <li>Descarga el CSV y ábrelo en Excel junto con tu conteo físico</li>
                <li>Compara la columna <strong>"Total"</strong> (consumo teórico) contra la diferencia entre tu stock inicial y tu conteo final</li>
                <li>Si el consumo teórico es mayor que lo que realmente se gastó → puede haber un <strong>sobrante</strong> (recetas rinden más)</li>
                <li>Si el consumo teórico es menor → puede haber un <strong>faltante</strong> (merma, derrames, porciones extra)</li>
                <li>Las cortesías se muestran separadas para distinguir consumo con y sin ingreso</li>
              </ul>
            </CardContent>
          </Card>
        </>
      )}

      {/* Empty results after loading */}
      {hasLoaded && !loading && rows.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <QrCode className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
            <p className="font-medium text-muted-foreground">Sin consumo teórico</p>
            <p className="text-sm text-muted-foreground/70 mt-1 max-w-md mx-auto">
              No se encontraron canjes QR ni cortesías para esta jornada y ubicación.
              Verifica que la ubicación corresponda a la barra donde se realizaron los canjes.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
