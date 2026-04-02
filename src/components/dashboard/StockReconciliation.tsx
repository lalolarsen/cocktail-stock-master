import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAppSession } from "@/contexts/AppSessionContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Search, Loader2, CheckCircle2, AlertTriangle, X } from "lucide-react";
import { isBottle } from "@/lib/product-type";

type Location = { id: string; name: string; type: string };
type Product = { id: string; name: string; code: string; category: string; unit: string; capacity_ml: number | null; cost_per_unit: number | null };

interface ReconciliationLine {
  product_id: string;
  product_name: string;
  product_code: string;
  unit: string;
  theoretical: number;
  real: number | null;
  difference: number;
  is_bottle: boolean;
  capacity_ml: number | null;
}

export function StockReconciliation() {
  const { venue, user } = useAppSession();
  const venueId = venue?.id;

  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedLocation, setSelectedLocation] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [balances, setBalances] = useState<{ product_id: string; quantity: number }[]>([]);
  const [lines, setLines] = useState<ReconciliationLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [dataLoaded, setDataLoaded] = useState(false);

  useEffect(() => {
    if (!venueId) return;
    loadLocations();
  }, [venueId]);

  const loadLocations = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("stock_locations")
      .select("id, name, type")
      .eq("venue_id", venueId!)
      .eq("is_active", true);
    const locs = (data || []) as Location[];
    setLocations(locs);
    const warehouse = locs.find(l => l.type === "warehouse");
    if (warehouse) setSelectedLocation(warehouse.id);
    setLoading(false);
  };

  const loadStockForLocation = async () => {
    if (!selectedLocation || !venueId) return;
    setLoading(true);
    const [pRes, bRes] = await Promise.all([
      supabase.from("products").select("id, name, code, category, unit, capacity_ml, cost_per_unit").eq("venue_id", venueId).order("name"),
      supabase.from("stock_balances").select("product_id, quantity").eq("venue_id", venueId).eq("location_id", selectedLocation),
    ]);

    const prods = (pRes.data || []) as Product[];
    const bals = (bRes.data || []) as { product_id: string; quantity: number }[];
    setProducts(prods);
    setBalances(bals);

    const balMap = new Map(bals.map(b => [b.product_id, Number(b.quantity)]));
    const newLines: ReconciliationLine[] = prods
      .filter(p => (balMap.get(p.id) || 0) > 0) // Only show products with stock
      .map(p => {
        const theoretical = balMap.get(p.id) || 0;
        return {
          product_id: p.id,
          product_name: p.name,
          product_code: p.code,
          unit: p.unit,
          theoretical,
          real: null,
          difference: 0,
          is_bottle: isBottle(p as any),
          capacity_ml: p.capacity_ml,
        };
      });

    setLines(newLines);
    setDataLoaded(true);
    setLoading(false);
  };

  const updateRealValue = (productId: string, value: string) => {
    const numVal = value === "" ? null : parseFloat(value);
    setLines(prev => prev.map(l => {
      if (l.product_id !== productId) return l;
      const real = numVal;
      const difference = real !== null ? real - l.theoretical : 0;
      return { ...l, real, difference };
    }));
  };

  const filteredLines = useMemo(() => {
    if (!searchTerm.trim()) return lines;
    const term = searchTerm.toLowerCase();
    return lines.filter(l => l.product_name.toLowerCase().includes(term) || l.product_code.toLowerCase().includes(term));
  }, [lines, searchTerm]);

  const linesWithDifference = lines.filter(l => l.real !== null && l.difference !== 0);
  const totalDifferences = linesWithDifference.length;
  const linesEdited = lines.filter(l => l.real !== null).length;

  const getDisplayQuantity = (line: ReconciliationLine, qty: number) => {
    if (line.is_bottle && line.capacity_ml && line.capacity_ml > 0) {
      const bottles = Math.floor(qty / line.capacity_ml);
      const remainder = Math.round(qty % line.capacity_ml);
      const pct = Math.round((remainder / line.capacity_ml) * 100);
      if (remainder > 0) return `${bottles} bot. +${pct}%`;
      return `${bottles} bot.`;
    }
    return `${qty} ${line.unit}`;
  };

  const handleApply = async () => {
    if (linesWithDifference.length === 0) {
      toast.info("No hay diferencias para aplicar");
      return;
    }

    setApplying(true);
    try {
      // Get active jornada for reference
      const { data: jornada } = await supabase
        .from("jornadas")
        .select("id")
        .eq("venue_id", venueId!)
        .eq("estado", "abierta")
        .maybeSingle();

      const movements = linesWithDifference.map(l => ({
        venue_id: venueId,
        product_id: l.product_id,
        movement_type: "reconciliation" as any,
        quantity: Math.abs(l.difference),
        from_location_id: l.difference < 0 ? selectedLocation : null,
        to_location_id: l.difference > 0 ? selectedLocation : null,
        notes: `Cuadre de inventario: ${l.difference > 0 ? "sobrante" : "faltante"} de ${Math.abs(l.difference)} ${l.unit}`,
        source_type: "reconciliation",
        performed_by: user?.id,
        jornada_id: jornada?.id || null,
      }));

      const { error: movErr } = await supabase
        .from("stock_movements")
        .insert(movements as any);
      if (movErr) throw movErr;

      // Update stock_balances to match real values
      for (const line of linesWithDifference) {
        const { error: balErr } = await supabase
          .from("stock_balances")
          .update({ quantity: line.real!, updated_at: new Date().toISOString() })
          .eq("venue_id", venueId!)
          .eq("product_id", line.product_id)
          .eq("location_id", selectedLocation);
        if (balErr) throw balErr;
      }

      // Update products.current_stock cache
      for (const line of linesWithDifference) {
        const { data: allBals } = await supabase
          .from("stock_balances")
          .select("quantity")
          .eq("venue_id", venueId!)
          .eq("product_id", line.product_id);
        const totalStock = (allBals || []).reduce((s, b) => s + Number(b.quantity), 0);
        await supabase
          .from("products")
          .update({ current_stock: totalStock } as any)
          .eq("id", line.product_id);
      }

      toast.success(`Cuadre aplicado: ${linesWithDifference.length} productos ajustados`);
      setLines(prev => prev.map(l => ({ ...l, theoretical: l.real !== null ? l.real : l.theoretical, real: null, difference: 0 })));
    } catch (err: any) {
      toast.error(err?.message || "Error al aplicar cuadre");
    } finally {
      setApplying(false);
    }
  };

  if (loading && !dataLoaded) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Cuadre de Inventario</h2>
        <p className="text-sm text-muted-foreground">
          Ingresa el conteo real para ajustar las diferencias con el stock teórico
        </p>
      </div>

      {/* Location + load */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm font-medium">Ubicación:</span>
            <Select value={selectedLocation} onValueChange={setSelectedLocation}>
              <SelectTrigger className="w-[200px] h-9">
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
            <Button size="sm" onClick={loadStockForLocation} disabled={!selectedLocation || loading}>
              {loading && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
              Cargar stock
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Reconciliation table */}
      {dataLoaded && (
        <>
          {/* Search */}
          <div className="relative max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Buscar producto…"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-8 h-9"
            />
          </div>

          {/* Stats */}
          <div className="flex gap-3 text-sm">
            <Badge variant="outline">{linesEdited}/{lines.length} editados</Badge>
            {totalDifferences > 0 && (
              <Badge variant="destructive" className="text-xs">
                <AlertTriangle className="h-3 w-3 mr-1" />
                {totalDifferences} diferencias
              </Badge>
            )}
            {linesEdited > 0 && totalDifferences === 0 && (
              <Badge variant="outline" className="text-xs border-primary/30 text-primary">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Todo cuadra
              </Badge>
            )}
          </div>

          <Card>
            <div className="overflow-auto max-h-[500px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    <TableHead className="text-right">Teórico</TableHead>
                    <TableHead className="text-center w-28">Conteo Real</TableHead>
                    <TableHead className="text-right w-24">Diferencia</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLines.map(line => (
                    <TableRow
                      key={line.product_id}
                      className={
                        line.real !== null && line.difference !== 0
                          ? line.difference < 0
                            ? "bg-destructive/5"
                            : "bg-blue-500/5"
                          : ""
                      }
                    >
                      <TableCell>
                        <div>
                          <span className="text-sm font-medium">{line.product_name}</span>
                          <span className="text-[10px] text-muted-foreground ml-2">{line.product_code}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {getDisplayQuantity(line, line.theoretical)}
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={0}
                          step="any"
                          value={line.real !== null ? line.real : ""}
                          onChange={e => updateRealValue(line.product_id, e.target.value)}
                          placeholder={String(line.theoretical)}
                          className="h-8 text-center w-24 mx-auto font-mono"
                        />
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {line.real !== null ? (
                          <span className={
                            line.difference < 0
                              ? "text-destructive font-semibold"
                              : line.difference > 0
                                ? "text-blue-500 font-semibold"
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
            {linesEdited > 0 && (
              <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/30">
                <span className="text-sm text-muted-foreground">
                  {totalDifferences} producto{totalDifferences !== 1 ? "s" : ""} con diferencia
                </span>
                <Button onClick={handleApply} disabled={applying || totalDifferences === 0}>
                  {applying && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
                  <CheckCircle2 className="h-4 w-4 mr-1" />
                  Aplicar cuadre ({totalDifferences})
                </Button>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
