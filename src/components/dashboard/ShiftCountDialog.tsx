import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Loader2, ClipboardCheck, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAppSession } from "@/contexts/AppSessionContext";
import { toast } from "sonner";
import { isBottle } from "@/lib/product-type";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialLocationId?: string;
  jornadaId?: string | null;
  onApplied?: () => void;
}

interface LocationRow { id: string; name: string; type: string | null }
interface CountRow {
  product_id: string;
  product_name: string;
  capacity_ml: number | null;
  unit: string;
  theoretical: number;
  real: string; // user input as string for free typing
}

const VARIANCE_THRESHOLD = 10;

export function ShiftCountDialog({ open, onOpenChange, initialLocationId, jornadaId, onApplied }: Props) {
  const { venue } = useAppSession();
  const venueId = venue?.id;

  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [locationId, setLocationId] = useState<string>(initialLocationId ?? "");
  const [rows, setRows] = useState<CountRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (!open || !venueId) return;
    void (async () => {
      const { data } = await supabase
        .from("stock_locations")
        .select("id,name,type")
        .eq("venue_id", venueId)
        .order("name");
      setLocations((data ?? []) as LocationRow[]);
      if (!locationId && data && data.length > 0) {
        setLocationId(initialLocationId ?? data[0].id);
      }
    })();
  }, [open, venueId, initialLocationId, locationId]);

  useEffect(() => {
    if (!open || !venueId || !locationId) return;
    void loadProducts();
  }, [open, venueId, locationId]);

  async function loadProducts() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("stock_balances")
        .select("product_id,quantity,products(id,name,unit,capacity_ml)")
        .eq("venue_id", venueId)
        .eq("location_id", locationId);
      if (error) throw error;
      const mapped: CountRow[] = (data ?? [])
        .filter((r: any) => r.products)
        .map((r: any) => ({
          product_id: r.product_id,
          product_name: r.products.name as string,
          capacity_ml: r.products.capacity_ml ?? null,
          unit: r.products.unit ?? "u",
          theoretical: Number(r.quantity ?? 0),
          real: "",
        }))
        .sort((a, b) => a.product_name.localeCompare(b.product_name));
      setRows(mapped);
    } catch (e: any) {
      toast.error(e?.message ?? "Error cargando productos");
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    let base = showAll ? rows : rows.filter((r) => r.theoretical > 0);
    if (s) base = base.filter((r) => r.product_name.toLowerCase().includes(s));
    return base;
  }, [rows, search, showAll]);

  const filledCount = rows.filter((r) => r.real.trim() !== "").length;

  const previewVariances = useMemo(() => {
    return rows
      .filter((r) => r.real.trim() !== "")
      .map((r) => {
        const real = Number(r.real);
        const delta = real - r.theoretical;
        const pct = r.theoretical === 0 ? (real === 0 ? 0 : 100) : Math.abs(delta) / r.theoretical * 100;
        return { ...r, delta, pct, willAlert: pct >= VARIANCE_THRESHOLD && Math.abs(delta) > 0 };
      });
  }, [rows]);

  const alertCount = previewVariances.filter((v) => v.willAlert).length;

  function setReal(productId: string, value: string) {
    setRows((prev) =>
      prev.map((r) => (r.product_id === productId ? { ...r, real: value.replace(/[^0-9.]/g, "") } : r))
    );
  }

  async function handleSubmit() {
    if (!venueId || !locationId) return;
    if (filledCount === 0) {
      toast.error("Ingresa al menos un conteo");
      return;
    }
    setSubmitting(true);
    try {
      const counts = rows
        .filter((r) => r.real.trim() !== "")
        .map((r) => ({ product_id: r.product_id, real_qty: Number(r.real) }));

      const { data, error } = await supabase.rpc("apply_shift_count", {
        p_venue_id: venueId,
        p_location_id: locationId,
        p_jornada_id: jornadaId ?? null,
        p_counts: counts,
        p_notes: null,
        p_threshold_pct: VARIANCE_THRESHOLD,
      });
      if (error) throw error;

      const alerts = (data ?? []).filter((d: any) => d.alerted).length;
      toast.success(
        alerts > 0
          ? `Conteo aplicado. ${alerts} alerta(s) generadas para admin.`
          : "Conteo aplicado correctamente"
      );
      onApplied?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Error aplicando conteo");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5 text-primary" />
            Conteo de cierre
          </DialogTitle>
          <DialogDescription>
            Cuenta físicamente tu barra. Diferencias mayores al {VARIANCE_THRESHOLD}% generan alerta para admin.
          </DialogDescription>
        </DialogHeader>

        {/* Pasos */}
        <div className="flex items-center gap-1.5 text-[11px] flex-wrap">
          <span className="px-2 py-1 rounded bg-primary/15 text-primary font-medium">1. Elegí ubicación</span>
          <span className="text-muted-foreground">→</span>
          <span className="px-2 py-1 rounded bg-muted text-muted-foreground">2. Contá y escribí</span>
          <span className="text-muted-foreground">→</span>
          <span className="px-2 py-1 rounded bg-muted text-muted-foreground">3. Aplicar</span>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <Select value={locationId} onValueChange={setLocationId}>
              <SelectTrigger className="sm:w-64">
                <SelectValue placeholder="Selecciona ubicación" />
              </SelectTrigger>
              <SelectContent>
                {locations.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder="Buscar producto…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1"
            />
          </div>

          <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
            <Badge variant="secondary">{filledCount} / {filtered.length} contados</Badge>
            {alertCount > 0 && (
              <Badge className="bg-yellow-500/15 text-yellow-500 hover:bg-yellow-500/20 gap-1">
                <AlertTriangle className="w-3 h-3" /> {alertCount} sobre umbral
              </Badge>
            )}
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="ml-auto text-[11px] underline-offset-2 hover:underline"
            >
              {showAll ? "Ocultar productos sin stock" : "Mostrar todos los productos"}
            </button>
          </div>

          <ScrollArea className="h-[50vh] border rounded-md">
            {loading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando…
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center text-muted-foreground py-8 text-sm">Sin productos en esta ubicación.</div>
            ) : (
              <div className="divide-y">
                {filtered.map((r) => {
                  const realNum = Number(r.real);
                  const hasReal = r.real.trim() !== "" && !isNaN(realNum);
                  const delta = hasReal ? realNum - r.theoretical : 0;
                  const pct =
                    !hasReal ? 0 :
                    r.theoretical === 0 ? (realNum === 0 ? 0 : 100) :
                    Math.abs(delta) / r.theoretical * 100;
                  const overThreshold = hasReal && pct >= VARIANCE_THRESHOLD && Math.abs(delta) > 0;
                  const bottle = isBottle({ capacity_ml: r.capacity_ml } as any);
                  const unitLabel = bottle ? "ml" : r.unit;

                  const extreme = hasReal && pct >= 30 && Math.abs(delta) > 0;
                  const rowBg = extreme ? "bg-destructive/10" : overThreshold ? "bg-yellow-500/10" : "";

                  return (
                    <div key={r.product_id} className={`flex items-center gap-3 px-3 py-2 ${rowBg}`}>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{r.product_name}</div>
                        <div className="text-xs text-muted-foreground">
                          Teórico: {r.theoretical.toLocaleString("es-CL")} {unitLabel}
                          {extreme && <span className="ml-2 text-destructive font-medium">⚠ varianza muy alta</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Input
                          inputMode="decimal"
                          value={r.real}
                          onChange={(e) => setReal(r.product_id, e.target.value)}
                          placeholder="Real"
                          className="w-24 h-9 text-right font-mono"
                        />
                        {hasReal && (
                          <Badge
                            variant={overThreshold ? "destructive" : "secondary"}
                            className="font-mono w-20 justify-center"
                          >
                            {delta > 0 ? "+" : ""}{Math.round(delta)}
                          </Badge>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </div>

        {filledCount > 0 && (
          <div className="text-[11px] text-muted-foreground bg-muted/40 rounded px-3 py-2">
            Vas a registrar <strong className="text-foreground">{filledCount}</strong> productos contados.
            {alertCount > 0 && (
              <> <strong className="text-yellow-500">{alertCount}</strong> generarán alerta para admin.</>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || filledCount === 0}>
            {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Aplicar conteo ({filledCount})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
