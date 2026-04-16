import { useState, useEffect, useMemo, useRef } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { useAppSession } from "@/contexts/AppSessionContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import {
  Loader2, CheckCircle2, AlertTriangle, Download, QrCode, Gift,
  Package, Info, BarChart3, Scale, Upload, FileSpreadsheet, Search,
} from "lucide-react";
import { isBottle } from "@/lib/product-type";
import { generateConteoTemplate, type ProductRef, type LocationRef } from "@/lib/excel-inventory-parser";

interface Jornada { id: string; nombre: string; numero_jornada: number; fecha: string; estado: string }
interface Location { id: string; name: string; type: string }

interface ComparisonLine {
  product_id: string;
  product_name: string;
  sku_base: string;
  unit: string;
  capacity_ml: number | null;
  is_bottle: boolean;
  current_stock: number;
  sales_consumption: number;
  courtesy_consumption: number;
  total_consumption: number;
  expected_stock: number;
  real_count: number | null;
  difference: number;
}

interface ParsedExcelRow {
  producto_nombre: string;
  sku_base: string;
  stock_real: number;
  matched_product_id: string | null;
  matched_product_name: string | null;
}

type Step = "select" | "upload" | "preview" | "compare";

export function InventoryComparisonModule() {
  const { venue, user } = useAppSession();
  const venueId = venue?.id;

  const [jornadas, setJornadas] = useState<Jornada[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedJornada, setSelectedJornada] = useState("");
  const [selectedLocation, setSelectedLocation] = useState("");
  const [lines, setLines] = useState<ComparisonLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [redeemCount, setRedeemCount] = useState(0);
  const [courtesyCount, setCourtesyCount] = useState(0);

  // Excel flow state
  const [step, setStep] = useState<Step>("select");
  const [parsedRows, setParsedRows] = useState<ParsedExcelRow[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Products cache for matching
  const [productsCache, setProductsCache] = useState<{ id: string; name: string; code: string; unit: string; capacity_ml: number | null }[]>([]);
  const [balancesCache, setBalancesCache] = useState<{ productId: string; locationId: string; quantity: number }[]>([]);

  // Load jornadas + locations + products
  useEffect(() => {
    if (!venueId) return;
    (async () => {
      const [jRes, lRes, pRes] = await Promise.all([
        supabase.from("jornadas").select("id, nombre, numero_jornada, fecha, estado")
          .eq("venue_id", venueId).order("fecha", { ascending: false }).limit(30),
        supabase.from("stock_locations").select("id, name, type")
          .eq("venue_id", venueId).eq("is_active", true),
        supabase.from("products").select("id, name, code, unit, capacity_ml")
          .eq("venue_id", venueId).order("name"),
      ]);
      setJornadas((jRes.data || []) as Jornada[]);
      setLocations((lRes.data || []) as Location[]);
      setProductsCache((pRes.data || []) as any[]);
      setInitialLoading(false);
    })();
  }, [venueId]);

  // Load balances when location changes
  useEffect(() => {
    if (!venueId || !selectedLocation) return;
    supabase.from("stock_balances").select("product_id, quantity, location_id")
      .eq("venue_id", venueId)
      .eq("location_id", selectedLocation)
      .then(({ data }) => {
        setBalancesCache((data || []).map(b => ({ productId: b.product_id, locationId: b.location_id, quantity: Number(b.quantity) || 0 })));
      });
  }, [venueId, selectedLocation]);

  const resetFlow = () => {
    setStep("select");
    setParsedRows([]);
    setConfirmed(false);
    setLines([]);
    setSearchTerm("");
  };

  // ── Download template ──────────────────────────────────────────────────────
  const handleDownloadTemplate = () => {
    const loc = locations.find(l => l.id === selectedLocation);
    if (!loc) return;
    const prodRefs: ProductRef[] = productsCache.map(p => ({
      id: p.id, code: p.code || "", name: p.name,
      capacity_ml: p.capacity_ml, cost_per_unit: 0, current_stock: 0,
    }));
    const locRef: LocationRef = { id: loc.id, name: loc.name, type: loc.type };
    const wb = generateConteoTemplate(prodRefs, locRef, balancesCache);
    XLSX.writeFile(wb, `plantilla_conteo_${loc.name}.xlsx`);
    toast.success("Plantilla descargada");
  };

  // ── Upload Excel ───────────────────────────────────────────────────────────
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = ev.target?.result;
        if (!data) return;
        const wb = XLSX.read(data, { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rawRows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "" });

        const productByCode = new Map<string, typeof productsCache[0]>();
        const productByName = new Map<string, typeof productsCache[0]>();
        productsCache.forEach(p => {
          if (p.code) productByCode.set(p.code.toLowerCase().trim(), p);
          productByName.set(p.name.toLowerCase().trim(), p);
        });

        const parsed: ParsedExcelRow[] = [];
        for (const raw of rawRows) {
          const nombre = String(raw["producto_nombre"] || raw["producto"] || raw["nombre"] || "").trim();
          const sku = String(raw["sku_base"] || raw["codigo"] || "").trim();
          const stockReal = Number(raw["stock_real"] || raw["real"] || raw["contado"] || 0);

          if (!nombre && !sku) continue;

          // Match product
          let matched: typeof productsCache[0] | undefined;
          if (sku) matched = productByCode.get(sku.toLowerCase());
          if (!matched && nombre) matched = productByName.get(nombre.toLowerCase());

          parsed.push({
            producto_nombre: nombre,
            sku_base: sku,
            stock_real: stockReal,
            matched_product_id: matched?.id || null,
            matched_product_name: matched?.name || null,
          });
        }

        if (parsed.length === 0) {
          toast.error("No se encontraron filas válidas en el Excel");
          return;
        }

        setParsedRows(parsed);
        setStep("preview");
        toast.success(`${parsed.length} filas parseadas`);
      } catch {
        toast.error("Error al leer el archivo Excel");
      }
    };
    reader.readAsArrayBuffer(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ── Confirm & Compare ─────────────────────────────────────────────────────
  const handleConfirm = () => {
    setConfirmed(true);
    toast.success("Conteo confirmado. Puedes comparar ahora.");
  };

  const handleCompare = async () => {
    if (!selectedJornada || !selectedLocation || !venueId) return;
    setLoading(true);
    try {
      // 1. Stock balances for this location
      const { data: balData } = await supabase
        .from("stock_balances")
        .select("product_id, quantity")
        .eq("venue_id", venueId)
        .eq("location_id", selectedLocation);

      // 2. Pickup redemption logs (sales consumption)
      const { data: logs } = await supabase
        .from("pickup_redemptions_log")
        .select("theoretical_consumption, bar_location_id")
        .eq("jornada_id", selectedJornada)
        .eq("result", "success");

      const locationLogs = (logs || []).filter((l: any) => l.bar_location_id === selectedLocation);
      setRedeemCount(locationLogs.length);

      // 3. Courtesy redemptions
      const { data: courtesyLogs } = await supabase
        .from("courtesy_redemptions")
        .select("courtesy_id, result")
        .eq("jornada_id", selectedJornada)
        .eq("result", "success");

      const courtesyIds = (courtesyLogs || []).map((c: any) => c.courtesy_id);
      setCourtesyCount(courtesyIds.length);

      // Build sales consumption map
      const salesMap = new Map<string, number>();
      for (const log of locationLogs) {
        const consumption = Array.isArray(log.theoretical_consumption) ? log.theoretical_consumption : [];
        for (const rawC of consumption) {
          const c = rawC as Record<string, unknown>;
          const key = c.product_id as string;
          if (!key) continue;
          salesMap.set(key, (salesMap.get(key) || 0) + (Number(c.quantity) || 0));
        }
      }

      // Build courtesy consumption map
      const courtesyMap = new Map<string, number>();
      if (courtesyIds.length > 0) {
        const { data: courtesyQrs } = await supabase
          .from("courtesy_qr").select("id, product_id, qty").in("id", courtesyIds);
        if (courtesyQrs && courtesyQrs.length > 0) {
          const cocktailIds = [...new Set(courtesyQrs.map((q: any) => q.product_id))];
          const { data: ingredients } = await supabase
            .from("cocktail_ingredients").select("cocktail_id, product_id, quantity").in("cocktail_id", cocktailIds);
          for (const qr of courtesyQrs as any[]) {
            const recipeItems = (ingredients || []).filter((i: any) => i.cocktail_id === qr.product_id);
            if (recipeItems.length > 0) {
              for (const item of recipeItems) {
                if (!item.product_id) continue;
                courtesyMap.set(item.product_id, (courtesyMap.get(item.product_id) || 0) + (Number(item.quantity) || 0) * (qr.qty || 1));
              }
            } else {
              courtesyMap.set(qr.product_id, (courtesyMap.get(qr.product_id) || 0) + (qr.qty || 1));
            }
          }
        }
      }

      // Build real count map from parsed Excel
      const realCountMap = new Map<string, number>();
      for (const row of parsedRows) {
        if (row.matched_product_id) {
          realCountMap.set(row.matched_product_id, row.stock_real);
        }
      }

      // Merge all
      const balMap = new Map((balData || []).map(b => [b.product_id, Number(b.quantity) || 0]));
      const prodMap = new Map(productsCache.map(p => [p.id, p]));

      const allProductIds = new Set<string>();
      for (const id of balMap.keys()) allProductIds.add(id);
      for (const id of salesMap.keys()) allProductIds.add(id);
      for (const id of courtesyMap.keys()) allProductIds.add(id);
      for (const id of realCountMap.keys()) allProductIds.add(id);

      const newLines: ComparisonLine[] = [];
      for (const pid of allProductIds) {
        const prod = prodMap.get(pid);
        if (!prod) continue;
        const currentStock = balMap.get(pid) || 0;
        const salesCons = Math.round((salesMap.get(pid) || 0) * 10) / 10;
        const courtesyCons = Math.round((courtesyMap.get(pid) || 0) * 10) / 10;
        const totalCons = Math.round((salesCons + courtesyCons) * 10) / 10;
        const expected = Math.round((currentStock - totalCons) * 10) / 10;

        const realCount = realCountMap.has(pid) ? realCountMap.get(pid)! : null;
        const difference = realCount !== null ? Math.round((realCount - expected) * 10) / 10 : 0;

        if (currentStock === 0 && totalCons === 0 && realCount === null) continue;

        newLines.push({
          product_id: pid,
          product_name: prod.name,
          sku_base: prod.code || "",
          unit: prod.unit || "ud",
          capacity_ml: prod.capacity_ml,
          is_bottle: isBottle(prod),
          current_stock: currentStock,
          sales_consumption: salesCons,
          courtesy_consumption: courtesyCons,
          total_consumption: totalCons,
          expected_stock: expected,
          real_count: realCount,
          difference,
        });
      }

      newLines.sort((a, b) => {
        // Products with real count first, then by consumption
        const aHas = a.real_count !== null ? 0 : 1;
        const bHas = b.real_count !== null ? 0 : 1;
        if (aHas !== bHas) return aHas - bHas;
        return b.total_consumption - a.total_consumption || a.product_name.localeCompare(b.product_name);
      });

      setLines(newLines);
      setStep("compare");

      if (newLines.length === 0) toast.info("No hay datos para esta combinación");
    } catch (err: any) {
      console.error("Error loading comparison:", err);
      toast.error("Error al cargar comparación");
    } finally {
      setLoading(false);
    }
  };

  // ── Apply reconciliation ───────────────────────────────────────────────────
  const linesWithDifference = lines.filter(l => l.real_count !== null && l.difference !== 0);
  const linesWithCount = lines.filter(l => l.real_count !== null).length;

  const handleApply = async () => {
    if (linesWithDifference.length === 0) {
      toast.info("No hay diferencias para aplicar");
      return;
    }
    setApplying(true);
    try {
      const { data: jornada } = await supabase
        .from("jornadas").select("id").eq("venue_id", venueId!).eq("estado", "abierta").maybeSingle();

      const movements = linesWithDifference.map(l => ({
        venue_id: venueId,
        product_id: l.product_id,
        movement_type: "reconciliation" as any,
        quantity: Math.abs(l.difference),
        from_location_id: l.difference < 0 ? selectedLocation : null,
        to_location_id: l.difference > 0 ? selectedLocation : null,
        notes: `Comparación inventario: ${l.difference > 0 ? "sobrante" : "faltante"} de ${Math.abs(l.difference)} ${l.unit}`,
        source_type: "reconciliation",
        performed_by: user?.id,
        jornada_id: jornada?.id || null,
      }));

      const { error: movErr } = await supabase.from("stock_movements").insert(movements as any);
      if (movErr) throw movErr;

      for (const line of linesWithDifference) {
        const { error: balErr } = await supabase
          .from("stock_balances")
          .update({ quantity: line.real_count!, updated_at: new Date().toISOString() })
          .eq("venue_id", venueId!)
          .eq("product_id", line.product_id)
          .eq("location_id", selectedLocation);
        if (balErr) throw balErr;
      }

      for (const line of linesWithDifference) {
        const { data: allBals } = await supabase
          .from("stock_balances").select("quantity").eq("venue_id", venueId!).eq("product_id", line.product_id);
        const totalStock = (allBals || []).reduce((s, b) => s + Number(b.quantity), 0);
        await supabase.from("products").update({ current_stock: totalStock } as any).eq("id", line.product_id);
      }

      toast.success(`Cuadre aplicado: ${linesWithDifference.length} productos ajustados`);
      setLines(prev => prev.map(l => ({
        ...l,
        current_stock: l.real_count !== null ? l.real_count + l.total_consumption : l.current_stock,
        expected_stock: l.real_count !== null ? l.real_count : l.expected_stock,
        real_count: null,
        difference: 0,
      })));
    } catch (err: any) {
      toast.error(err?.message || "Error al aplicar cuadre");
    } finally {
      setApplying(false);
    }
  };

  // ── CSV Export ─────────────────────────────────────────────────────────────
  const handleExportCSV = () => {
    if (lines.length === 0) return;
    const jornada = jornadas.find(j => j.id === selectedJornada);
    const location = locations.find(l => l.id === selectedLocation);

    const csvLines: string[] = [];
    csvLines.push("COMPARACIÓN DE INVENTARIO");
    csvLines.push(`Jornada,${jornada?.nombre || "?"}`);
    csvLines.push(`Ubicación,${location?.name || "?"}`);
    csvLines.push(`Canjes QR,${redeemCount}`);
    csvLines.push(`Cortesías,${courtesyCount}`);
    csvLines.push("");
    csvLines.push("Insumo,SKU,Unidad,Stock actual,Consumo ventas,Consumo cortesías,Stock esperado,Conteo real,Diferencia,Estado");
    lines.forEach(l => {
      const estado = l.real_count === null ? "Sin contar" : l.difference === 0 ? "Calza" : l.difference > 0 ? "Sobrante" : "Faltante";
      csvLines.push(`"${l.product_name}","${l.sku_base}",${l.unit},${l.current_stock},${l.sales_consumption},${l.courtesy_consumption},${l.expected_stock},${l.real_count ?? ""},${l.real_count !== null ? l.difference : ""},${estado}`);
    });

    const blob = new Blob(["\uFEFF" + csvLines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `comparacion_${jornada?.nombre}_${location?.name}.csv`;
    link.click();
    toast.success("CSV descargado");
  };

  // ── Display helpers ────────────────────────────────────────────────────────
  const getDisplayQty = (line: ComparisonLine, qty: number) => {
    if (line.is_bottle && line.capacity_ml && line.capacity_ml > 0) {
      const bottles = Math.floor(qty / line.capacity_ml);
      const remainder = Math.round(qty % line.capacity_ml);
      const pct = Math.round((remainder / line.capacity_ml) * 100);
      if (remainder > 0) return `${bottles} bot. +${pct}%`;
      return `${bottles} bot.`;
    }
    return `${qty} ${line.unit}`;
  };

  const filteredLines = useMemo(() => {
    if (!searchTerm.trim()) return lines;
    const term = searchTerm.toLowerCase();
    return lines.filter(l => l.product_name.toLowerCase().includes(term));
  }, [lines, searchTerm]);

  const totalDifferences = linesWithDifference.length;
  const shortageCount = linesWithDifference.filter(l => l.difference < 0).length;
  const surplusCount = linesWithDifference.filter(l => l.difference > 0).length;

  const selectedJornadaObj = jornadas.find(j => j.id === selectedJornada);
  const unmatchedCount = parsedRows.filter(r => !r.matched_product_id).length;

  if (initialLoading) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Scale className="h-5 w-5 text-primary" />
          Comparación de Inventario
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Sube el conteo del bartender en Excel, compara con el consumo teórico y ajusta el inventario.
        </p>
      </div>

      {/* Explainer */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-4">
          <div className="flex gap-3">
            <Info className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div className="space-y-2 text-sm">
              <p className="font-medium text-foreground">¿Cómo funciona?</p>
              <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                <li>Selecciona <strong>jornada</strong> y <strong>ubicación</strong> (barra)</li>
                <li>Descarga la <strong>plantilla Excel</strong> pre-llenada con los productos de esa barra</li>
                <li>El bartender llena la columna <strong>"stock_real"</strong> con lo que queda físicamente</li>
                <li>Sube el Excel completado y <strong>confirma</strong> las cantidades</li>
                <li>Presiona <strong>"Comparar"</strong> para ver diferencias vs consumo teórico</li>
                <li>Aplica el cuadre para actualizar el inventario</li>
              </ol>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Step 1: Select jornada + location */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">1. Parámetros</CardTitle>
          <CardDescription>Selecciona jornada y ubicación</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex items-end gap-3 flex-wrap">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">Jornada</label>
              <Select value={selectedJornada} onValueChange={v => { setSelectedJornada(v); resetFlow(); }}>
                <SelectTrigger className="w-[260px] h-10">
                  <SelectValue placeholder="Seleccionar jornada…" />
                </SelectTrigger>
                <SelectContent>
                  {jornadas.map(j => (
                    <SelectItem key={j.id} value={j.id}>
                      {j.nombre}{j.estado === "abierta" ? " 🟢" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">Ubicación</label>
              <Select value={selectedLocation} onValueChange={v => { setSelectedLocation(v); resetFlow(); }}>
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
          </div>
        </CardContent>
      </Card>

      {/* Step 2: Download template + Upload */}
      {selectedJornada && selectedLocation && step !== "compare" && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">2. Plantilla y Carga</CardTitle>
            <CardDescription>Descarga la plantilla, el bartender la completa, y súbela aquí</CardDescription>
          </CardHeader>
          <CardContent className="pt-0 space-y-4">
            <div className="flex gap-3 flex-wrap">
              <Button variant="outline" onClick={handleDownloadTemplate} className="gap-2">
                <Download className="h-4 w-4" />
                Descargar plantilla
              </Button>
              <div className="relative">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileUpload}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
                <Button variant="secondary" className="gap-2 pointer-events-none">
                  <Upload className="h-4 w-4" />
                  Subir Excel completado
                </Button>
              </div>
            </div>

            {selectedJornadaObj && (
              <p className="text-xs text-muted-foreground">
                Jornada: <strong>{selectedJornadaObj.nombre}</strong> · Ubicación: <strong>{locations.find(l => l.id === selectedLocation)?.name}</strong>
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 3: Preview parsed Excel */}
      {step === "preview" && parsedRows.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-primary" />
              3. Preview del Conteo
              <Badge variant="secondary" className="ml-auto">{parsedRows.length} filas</Badge>
              {unmatchedCount > 0 && (
                <Badge variant="destructive" className="text-xs">{unmatchedCount} sin match</Badge>
              )}
            </CardTitle>
            <CardDescription>Revisa que las cantidades sean correctas antes de confirmar</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="overflow-auto max-h-[400px] border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto (Excel)</TableHead>
                    <TableHead>Producto (Sistema)</TableHead>
                    <TableHead className="text-right">Stock Real</TableHead>
                    <TableHead className="text-center">Match</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedRows.map((row, i) => (
                    <TableRow key={i} className={!row.matched_product_id ? "bg-destructive/5" : ""}>
                      <TableCell className="text-sm">{row.producto_nombre || row.sku_base}</TableCell>
                      <TableCell className="text-sm">
                        {row.matched_product_name || <span className="text-destructive text-xs">No encontrado</span>}
                      </TableCell>
                      <TableCell className="text-right font-mono">{row.stock_real}</TableCell>
                      <TableCell className="text-center">
                        {row.matched_product_id
                          ? <CheckCircle2 className="h-4 w-4 text-primary mx-auto" />
                          : <AlertTriangle className="h-4 w-4 text-destructive mx-auto" />
                        }
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-muted-foreground">
                {parsedRows.filter(r => r.matched_product_id).length} de {parsedRows.length} productos con match
                {unmatchedCount > 0 && " — los sin match serán ignorados"}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => { setStep("select"); setParsedRows([]); }}>
                  Cancelar
                </Button>
                {!confirmed ? (
                  <Button onClick={handleConfirm} className="gap-2">
                    <CheckCircle2 className="h-4 w-4" />
                    Confirmar conteo
                  </Button>
                ) : (
                  <Button onClick={handleCompare} disabled={loading} className="gap-2">
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Scale className="h-4 w-4" />}
                    Comparar
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 4: Comparison results */}
      {step === "compare" && lines.length > 0 && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card><CardContent className="p-4 text-center">
              <QrCode className="h-5 w-5 mx-auto mb-1 text-primary" />
              <p className="text-2xl font-bold">{redeemCount}</p>
              <p className="text-xs text-muted-foreground">Canjes QR</p>
            </CardContent></Card>
            <Card><CardContent className="p-4 text-center">
              <Gift className="h-5 w-5 mx-auto mb-1 text-primary" />
              <p className="text-2xl font-bold">{courtesyCount}</p>
              <p className="text-xs text-muted-foreground">Cortesías</p>
            </CardContent></Card>
            <Card><CardContent className="p-4 text-center">
              <Package className="h-5 w-5 mx-auto mb-1 text-primary" />
              <p className="text-2xl font-bold">{linesWithCount}</p>
              <p className="text-xs text-muted-foreground">Contados</p>
            </CardContent></Card>
            <Card><CardContent className="p-4 text-center">
              <BarChart3 className="h-5 w-5 mx-auto mb-1 text-primary" />
              <p className="text-2xl font-bold">{totalDifferences}</p>
              <p className="text-xs text-muted-foreground">Con diferencia</p>
            </CardContent></Card>
          </div>

          {/* Status badges */}
          <div className="flex gap-3 text-sm flex-wrap">
            <Badge variant="outline">{linesWithCount}/{lines.length} contados</Badge>
            {shortageCount > 0 && (
              <Badge variant="destructive" className="text-xs">
                <AlertTriangle className="h-3 w-3 mr-1" />
                {shortageCount} faltante{shortageCount !== 1 ? "s" : ""}
              </Badge>
            )}
            {surplusCount > 0 && (
              <Badge variant="outline" className="text-xs border-blue-300 text-blue-600">
                {surplusCount} sobrante{surplusCount !== 1 ? "s" : ""}
              </Badge>
            )}
            {linesWithCount > 0 && totalDifferences === 0 && (
              <Badge variant="outline" className="text-xs border-primary/30 text-primary">
                <CheckCircle2 className="h-3 w-3 mr-1" /> Todo cuadra
              </Badge>
            )}
          </div>

          {/* Search + actions */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input placeholder="Buscar insumo…" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-8 h-9" />
            </div>
            <div className="flex gap-2 ml-auto">
              <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExportCSV}>
                <Download className="h-4 w-4" /> CSV
              </Button>
              <Button variant="outline" size="sm" onClick={resetFlow}>
                Nueva comparación
              </Button>
            </div>
          </div>

          {/* Main Table */}
          <Card>
            <div className="overflow-auto max-h-[600px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    <TableHead className="text-right">Stock actual</TableHead>
                    <TableHead className="text-right">Ventas</TableHead>
                    <TableHead className="text-right">Cortesías</TableHead>
                    <TableHead className="text-right font-semibold">Esperado</TableHead>
                    <TableHead className="text-right">Conteo real</TableHead>
                    <TableHead className="text-right w-28">Diferencia</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLines.map(line => (
                    <TableRow
                      key={line.product_id}
                      className={
                        line.real_count !== null && line.difference !== 0
                          ? line.difference < 0 ? "bg-destructive/5" : "bg-blue-500/5"
                          : ""
                      }
                    >
                      <TableCell>
                        <span className="text-sm font-medium">{line.product_name}</span>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {getDisplayQty(line, line.current_stock)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm tabular-nums">
                        {line.sales_consumption > 0 ? line.sales_consumption : "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm tabular-nums">
                        {line.courtesy_consumption > 0 ? line.courtesy_consumption : "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm font-semibold tabular-nums">
                        {getDisplayQty(line, line.expected_stock)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm tabular-nums">
                        {line.real_count !== null ? getDisplayQty(line, line.real_count) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {line.real_count !== null ? (
                          <span className={
                            line.difference < 0 ? "text-destructive font-semibold"
                            : line.difference > 0 ? "text-blue-500 font-semibold"
                            : "text-muted-foreground"
                          }>
                            {line.difference > 0 ? "+" : ""}{line.difference} {line.unit}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Apply bar */}
            {linesWithCount > 0 && (
              <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/30">
                <span className="text-sm text-muted-foreground">
                  {totalDifferences} producto{totalDifferences !== 1 ? "s" : ""} con diferencia
                  {shortageCount > 0 && <span className="text-destructive ml-1">({shortageCount} faltante{shortageCount !== 1 ? "s" : ""})</span>}
                  {surplusCount > 0 && <span className="text-blue-500 ml-1">({surplusCount} sobrante{surplusCount !== 1 ? "s" : ""})</span>}
                </span>
                <Button onClick={handleApply} disabled={applying || totalDifferences === 0}>
                  {applying && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
                  <CheckCircle2 className="h-4 w-4 mr-1" />
                  Aplicar cuadre ({totalDifferences})
                </Button>
              </div>
            )}
          </Card>

          {/* Help footer */}
          <Card className="border-muted bg-muted/30">
            <CardContent className="p-4 text-xs text-muted-foreground space-y-1">
              <p><strong>Faltante (rojo):</strong> El conteo real es menor al esperado → posible merma, robo, o error de registro.</p>
              <p><strong>Sobrante (azul):</strong> El conteo real es mayor al esperado → posible devolución no registrada o error en receta.</p>
              <p><strong>Sin contar:</strong> Productos sin dato en el Excel se asumen correctos (no se ajustan).</p>
              <p><strong>Al aplicar</strong>, el inventario se actualiza al valor del conteo real y se registra un movimiento "reconciliation".</p>
            </CardContent>
          </Card>
        </>
      )}

      {step === "compare" && lines.length === 0 && !loading && (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <Package className="h-8 w-8 mx-auto mb-3 text-muted-foreground/30" />
            <p className="text-muted-foreground font-medium">Sin datos</p>
            <p className="text-sm text-muted-foreground/70 mt-1">No hay stock ni consumo registrado para esta combinación</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
