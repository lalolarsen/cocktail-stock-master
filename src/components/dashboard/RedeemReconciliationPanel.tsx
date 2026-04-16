import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAppSession } from "@/contexts/AppSessionContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Loader2, CheckCircle2, AlertTriangle, Download, QrCode, Search } from "lucide-react";
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
  status: "calza" | "sobrante" | "faltante" | "sin_datos";
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

  // Load jornadas and locations
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
    try {
      // Fetch redemption logs for this jornada + location
      const { data: logs, error } = await supabase
        .from("pickup_redemptions_log")
        .select("theoretical_consumption, items_snapshot, bar_location_id")
        .eq("jornada_id", selectedJornada)
        .eq("result", "success");

      if (error) throw error;

      // Filter by location (bar_location_id or from metadata)
      const locationLogs = (logs || []).filter((l: any) => l.bar_location_id === selectedLocation);

      // Aggregate theoretical consumption by product
      const consumptionMap = new Map<string, { name: string; qty: number; unit: string }>();
      for (const log of locationLogs) {
        const consumption = Array.isArray(log.theoretical_consumption) ? log.theoretical_consumption : [];
        for (const c of consumption) {
          const key = c.product_id || c.product_name;
          const existing = consumptionMap.get(key) || { name: c.product_name || "?", qty: 0, unit: c.unit || "ud" };
          existing.qty += Number(c.quantity) || 0;
          consumptionMap.set(key, existing);
        }
      }

      if (consumptionMap.size === 0) {
        toast.info("No hay consumo teórico registrado para esta jornada y ubicación");
        setRows([]);
        setLoading(false);
        return;
      }

      // Build rows
      const newRows: ReconciliationRow[] = Array.from(consumptionMap.entries())
        .map(([productId, data]) => ({
          product_id: productId,
          product_name: data.name,
          unit: data.unit,
          theoretical_consumption: Math.round(data.qty * 10) / 10,
          status: "sin_datos" as const,
        }))
        .sort((a, b) => b.theoretical_consumption - a.theoretical_consumption);

      setRows(newRows);
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
    lines.push(`CONCILIACIÓN CONSUMO TEÓRICO vs STOCK`);
    lines.push(`Jornada,#${jornada?.numero_jornada || "?"} - ${jornada?.fecha || ""}`);
    lines.push(`Ubicación,${location?.name || "?"}`);
    lines.push("");
    lines.push("Insumo,Consumo teórico,Unidad");
    rows.forEach(r => lines.push(`"${r.product_name}",${r.theoretical_consumption},${r.unit}`));

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
  const totalConsumption = rows.reduce((s, r) => s + r.theoretical_consumption, 0);

  if (initialLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <QrCode className="h-5 w-5 text-primary" />
          Conciliación Canjes vs Stock
        </h2>
        <p className="text-sm text-muted-foreground">
          Compara el consumo teórico de canjes QR con el conteo real por ubicación
        </p>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Jornada:</span>
              <Select value={selectedJornada} onValueChange={setSelectedJornada}>
                <SelectTrigger className="w-[220px] h-9">
                  <SelectValue placeholder="Seleccionar jornada" />
                </SelectTrigger>
                <SelectContent>
                  {jornadas.map(j => (
                    <SelectItem key={j.id} value={j.id}>
                      #{j.numero_jornada} — {format(new Date(j.fecha + "T12:00:00"), "d MMM yyyy", { locale: es })}
                      {j.estado === "abierta" ? " (abierta)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Ubicación:</span>
              <Select value={selectedLocation} onValueChange={setSelectedLocation}>
                <SelectTrigger className="w-[180px] h-9">
                  <SelectValue placeholder="Seleccionar" />
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

            <Button size="sm" onClick={loadReconciliation} disabled={!selectedJornada || !selectedLocation || loading}>
              {loading && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
              Cargar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {rows.length > 0 && (
        <>
          {/* Summary */}
          <div className="flex items-center gap-3 flex-wrap">
            <Badge variant="outline" className="text-xs">
              {totalProducts} insumos consumidos
            </Badge>
            <Badge variant="outline" className="text-xs">
              Total teórico: {Math.round(totalConsumption)} unidades
            </Badge>
            <Button variant="outline" size="sm" className="text-xs h-8 gap-1 ml-auto" onClick={handleExportCSV}>
              <Download className="h-3.5 w-3.5" />
              CSV
            </Button>
          </div>

          {/* Search */}
          <div className="relative max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Buscar insumo…"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-8 h-9"
            />
          </div>

          {/* Table */}
          <Card>
            <div className="overflow-auto max-h-[500px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Insumo</TableHead>
                    <TableHead className="text-right">Consumo teórico</TableHead>
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
                      <TableCell className="text-center text-xs text-muted-foreground">{row.unit}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>

          <p className="text-xs text-muted-foreground">
            💡 Usa el módulo de Cuadre de Inventario para ingresar el conteo real y comparar con este consumo teórico.
          </p>
        </>
      )}

      {!loading && rows.length === 0 && selectedJornada && selectedLocation && (
        <Card className="p-8 text-center">
          <QrCode className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">Selecciona jornada y ubicación, luego presiona "Cargar"</p>
        </Card>
      )}
    </div>
  );
}
