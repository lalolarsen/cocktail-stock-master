import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAppSession } from "@/contexts/AppSessionContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import { Plus, Trash2, Search, Check, Play, ChevronDown, ChevronRight, Loader2, ClipboardList } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

type Location = { id: string; name: string; type: string };
type Cocktail = { id: string; name: string };
type DraftLine = { cocktail_id: string; cocktail_name: string; quantity: number };

type Batch = {
  id: string;
  location_id: string;
  status: string;
  created_at: string;
  applied_at: string | null;
  notes: string | null;
  location_name?: string;
  total_units?: number;
  line_count?: number;
};

const STATUS_BADGE: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  draft: { label: "Borrador", variant: "secondary" },
  confirmed: { label: "Confirmado", variant: "default" },
  applied: { label: "Aplicado", variant: "outline" },
  cancelled: { label: "Cancelado", variant: "destructive" },
};

export function ExternalConsumptionPanel() {
  const { venue, user } = useAppSession();
  const venueId = venue?.id;

  const [locations, setLocations] = useState<Location[]>([]);
  const [cocktails, setCocktails] = useState<Cocktail[]>([]);
  const [loading, setLoading] = useState(true);

  // Draft entry
  const [selectedLocation, setSelectedLocation] = useState("");
  const [draftLines, setDraftLines] = useState<DraftLine[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [saving, setSaving] = useState(false);

  // History
  const [batches, setBatches] = useState<Batch[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    if (!venueId) return;
    loadAll();
  }, [venueId]);

  const loadAll = async () => {
    setLoading(true);
    const [lRes, cRes, bRes] = await Promise.all([
      supabase.from("stock_locations").select("id, name, type").eq("venue_id", venueId!).eq("is_active", true),
      supabase.from("cocktails").select("id, name").eq("venue_id", venueId!).order("name"),
      supabase.from("external_consumption_batches" as any).select("*").eq("venue_id", venueId).order("created_at", { ascending: false }).limit(20),
    ]);

    const locs = (lRes.data || []) as Location[];
    setLocations(locs);
    setCocktails((cRes.data || []) as Cocktail[]);

    // Enrich batches with location names + line counts
    const locMap = new Map(locs.map(l => [l.id, l.name]));
    const rawBatches = (bRes.data || []) as any[];

    // Fetch line counts for batches
    if (rawBatches.length > 0) {
      const batchIds = rawBatches.map(b => b.id);
      const { data: lineData } = await supabase
        .from("external_consumption_lines" as any)
        .select("batch_id, quantity")
        .in("batch_id", batchIds);
      
      const lineMap = new Map<string, { count: number; total: number }>();
      ((lineData || []) as any[]).forEach((l: any) => {
        const existing = lineMap.get(l.batch_id) || { count: 0, total: 0 };
        existing.count++;
        existing.total += Number(l.quantity);
        lineMap.set(l.batch_id, existing);
      });

      setBatches(rawBatches.map(b => ({
        ...b,
        location_name: locMap.get(b.location_id) || "—",
        total_units: lineMap.get(b.id)?.total || 0,
        line_count: lineMap.get(b.id)?.count || 0,
      })));
    } else {
      setBatches([]);
    }

    // Auto-select first bar location
    const bars = locs.filter(l => l.type === "bar");
    if (bars.length > 0 && !selectedLocation) {
      setSelectedLocation(bars[0].id);
    }

    setLoading(false);
  };

  const filteredCocktails = useMemo(() => {
    if (!searchTerm.trim()) return cocktails;
    const term = searchTerm.toLowerCase();
    return cocktails.filter(c => c.name.toLowerCase().includes(term));
  }, [cocktails, searchTerm]);

  const addLine = (cocktail: Cocktail) => {
    const existing = draftLines.find(l => l.cocktail_id === cocktail.id);
    if (existing) {
      setDraftLines(draftLines.map(l =>
        l.cocktail_id === cocktail.id ? { ...l, quantity: l.quantity + 1 } : l
      ));
    } else {
      setDraftLines([...draftLines, { cocktail_id: cocktail.id, cocktail_name: cocktail.name, quantity: 1 }]);
    }
  };

  const updateQuantity = (cocktailId: string, qty: number) => {
    if (qty <= 0) {
      setDraftLines(draftLines.filter(l => l.cocktail_id !== cocktailId));
    } else {
      setDraftLines(draftLines.map(l =>
        l.cocktail_id === cocktailId ? { ...l, quantity: qty } : l
      ));
    }
  };

  const removeLine = (cocktailId: string) => {
    setDraftLines(draftLines.filter(l => l.cocktail_id !== cocktailId));
  };

  const totalUnits = draftLines.reduce((s, l) => s + l.quantity, 0);

  const handleSaveDraft = async () => {
    if (!selectedLocation || draftLines.length === 0) {
      toast.error("Selecciona ubicación y agrega al menos un producto");
      return;
    }
    setSaving(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const { data: batch, error: batchErr } = await supabase
        .from("external_consumption_batches" as any)
        .insert({
          venue_id: venueId,
          location_id: selectedLocation,
          period_start: today,
          period_end: today,
          source_type: "cover_manual",
          created_by: user?.id,
          status: "draft",
        } as any)
        .select("id")
        .single();

      if (batchErr || !batch) throw batchErr;

      const lines = draftLines.map(l => ({
        batch_id: (batch as any).id,
        cocktail_id: l.cocktail_id,
        quantity: l.quantity,
      }));

      const { error: lineErr } = await supabase
        .from("external_consumption_lines" as any)
        .insert(lines as any);

      if (lineErr) throw lineErr;

      toast.success(`Borrador guardado: ${totalUnits} unidades`);
      setDraftLines([]);
      loadAll();
    } catch (err: any) {
      toast.error(err?.message || "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmAndApply = async () => {
    if (!selectedLocation || draftLines.length === 0) {
      toast.error("Agrega al menos un producto");
      return;
    }
    setSaving(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const { data: batch, error: batchErr } = await supabase
        .from("external_consumption_batches" as any)
        .insert({
          venue_id: venueId,
          location_id: selectedLocation,
          period_start: today,
          period_end: today,
          source_type: "cover_manual",
          created_by: user?.id,
          status: "confirmed",
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString(),
        } as any)
        .select("id")
        .single();

      if (batchErr || !batch) throw batchErr;

      const lines = draftLines.map(l => ({
        batch_id: (batch as any).id,
        cocktail_id: l.cocktail_id,
        quantity: l.quantity,
      }));

      const { error: lineErr } = await supabase
        .from("external_consumption_lines" as any)
        .insert(lines as any);
      if (lineErr) throw lineErr;

      // Apply
      const { data, error: applyErr } = await supabase.rpc(
        "apply_external_consumption_batch",
        { p_batch_id: (batch as any).id } as any
      );
      if (applyErr) throw applyErr;

      toast.success(`Aplicado: ${(data as any)?.movements_created || 0} movimientos de stock`);
      setDraftLines([]);
      loadAll();
    } catch (err: any) {
      toast.error(err?.message || "Error al aplicar");
    } finally {
      setSaving(false);
    }
  };

  const applyBatch = async (batchId: string) => {
    const { data, error } = await supabase.rpc("apply_external_consumption_batch", { p_batch_id: batchId } as any);
    if (error) { toast.error(error.message || "Error al aplicar"); return; }
    toast.success(`Aplicado: ${(data as any)?.movements_created || 0} movimientos`);
    loadAll();
  };

  const barLocations = locations.filter(l => l.type === "bar");

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold">Consumo Externo</h2>
        <p className="text-sm text-muted-foreground">
          Registra consumos de tickets/covers externos para descuento de inventario
        </p>
      </div>

      {/* Quick entry card */}
      <Card>
        <CardContent className="p-4 space-y-4">
          {/* Location selector */}
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium shrink-0">Ubicación:</span>
            <Select value={selectedLocation} onValueChange={setSelectedLocation}>
              <SelectTrigger className="w-[200px] h-9">
                <SelectValue placeholder="Seleccionar barra" />
              </SelectTrigger>
              <SelectContent>
                {barLocations.map(l => (
                  <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Search + quick add */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Buscar producto de carta…"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-8 h-9"
            />
          </div>

          {/* Cocktail grid — quick tap to add */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5 max-h-[200px] overflow-y-auto">
            {filteredCocktails.map(c => {
              const inDraft = draftLines.find(l => l.cocktail_id === c.id);
              return (
                <button
                  key={c.id}
                  onClick={() => addLine(c)}
                  className={`text-left px-2.5 py-2 rounded-md border text-sm transition-colors ${
                    inDraft
                      ? "bg-primary/10 border-primary/30 text-primary font-medium"
                      : "bg-card border-border hover:bg-muted/50"
                  }`}
                >
                  <span className="truncate block">{c.name}</span>
                  {inDraft && (
                    <span className="text-xs text-primary/70">×{inDraft.quantity}</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Draft lines table */}
          {draftLines.length > 0 && (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    <TableHead className="w-24 text-center">Cantidad</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {draftLines.map(l => (
                    <TableRow key={l.cocktail_id}>
                      <TableCell className="text-sm">{l.cocktail_name}</TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={1}
                          value={l.quantity}
                          onChange={e => updateQuantity(l.cocktail_id, parseInt(e.target.value) || 0)}
                          className="h-8 text-center w-20 mx-auto"
                        />
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeLine(l.cocktail_id)}>
                          <Trash2 className="w-3.5 h-3.5 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="flex items-center justify-between px-4 py-3 bg-muted/30 border-t">
                <span className="text-sm">
                  <strong>{totalUnits}</strong> unidades en {draftLines.length} productos
                </span>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={handleSaveDraft} disabled={saving}>
                    {saving && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
                    Guardar borrador
                  </Button>
                  <Button size="sm" onClick={handleConfirmAndApply} disabled={saving}>
                    {saving && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
                    <Play className="w-3.5 h-3.5 mr-1" />
                    Confirmar y aplicar
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* History */}
      <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
        <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
          {historyOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          Historial de lotes ({batches.length})
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2">
          {batches.length === 0 ? (
            <Card>
              <CardContent className="py-6 text-center text-sm text-muted-foreground">
                <ClipboardList className="h-8 w-8 mx-auto mb-2 opacity-50" />
                No hay lotes registrados
              </CardContent>
            </Card>
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Ubicación</TableHead>
                    <TableHead className="text-right">Unidades</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="w-20" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {batches.map(b => {
                    const badge = STATUS_BADGE[b.status] || STATUS_BADGE.draft;
                    return (
                      <TableRow key={b.id}>
                        <TableCell className="text-xs font-mono">
                          {format(new Date(b.created_at), "dd/MM/yy HH:mm", { locale: es })}
                        </TableCell>
                        <TableCell className="text-sm">{b.location_name}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{b.total_units || 0}</TableCell>
                        <TableCell>
                          <Badge variant={badge.variant} className="text-[10px]">{badge.label}</Badge>
                        </TableCell>
                        <TableCell>
                          {b.status === "confirmed" && (
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => applyBatch(b.id)}>
                              <Play className="w-3 h-3 mr-1" /> Aplicar
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>
          )}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
