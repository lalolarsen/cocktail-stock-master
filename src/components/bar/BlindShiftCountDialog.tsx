import { useEffect, useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Loader2, ClipboardCheck, EyeOff, ShieldCheck, Wine, Package, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { isBottle } from "@/lib/product-type";

interface ConsumedProduct {
  product_id: string;
  product_name: string;
  unit: string;
  capacity_ml: number | null;
  category: string | null;
  source: "consumed" | "closed_bottle" | "both";
}

interface DeclaredRow extends ConsumedProduct {
  /** Para abiertas (botellas con salida): ml restantes en la botella en uso */
  openMl: number;
  /** Para cerradas: cantidad de botellas cerradas en barra */
  closedQty: string;
  /** Para unitarios: cantidad restante */
  unitQty: string;
  filled: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  jornadaId: string | null;
  locationId: string | null;
  locationName: string;
  onSubmitted?: () => void;
}

/**
 * Conteo de cierre CIEGO v2.
 * - Botellas con salida (abiertas) → slider visual 0-100% (ml restantes).
 * - Botellas cerradas en barra → contador de unidades.
 * - Unitarios consumidos → cantidad restante.
 * - Si nada consumido y nada cerrado → botón "Sin consumos hoy".
 * - NUNCA muestra teórico al bartender.
 */
export function BlindShiftCountDialog({
  open, onOpenChange, jornadaId, locationId, locationName, onSubmitted,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [rows, setRows] = useState<DeclaredRow[]>([]);

  useEffect(() => {
    if (!open || !jornadaId || !locationId) return;
    void load();
  }, [open, jornadaId, locationId]);

  async function load() {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_shift_consumed_products", {
        p_jornada_id: jornadaId,
        p_location_id: locationId,
      });
      if (error) throw error;
      setRows(
        ((data ?? []) as ConsumedProduct[]).map((p) => ({
          ...p,
          openMl: 0,
          closedQty: "",
          unitQty: "",
          filled: false,
        }))
      );
    } catch (e: any) {
      toast.error(e?.message ?? "Error cargando insumos");
    } finally {
      setLoading(false);
    }
  }

  // Clasificación
  const openBottles = useMemo(
    () => rows.filter((r) => isBottle({ capacity_ml: r.capacity_ml } as any) && (r.source === "consumed" || r.source === "both")),
    [rows]
  );
  const closedBottles = useMemo(
    () => rows.filter((r) => isBottle({ capacity_ml: r.capacity_ml } as any) && (r.source === "closed_bottle" || r.source === "both")),
    [rows]
  );
  const unitItems = useMemo(
    () => rows.filter((r) => !isBottle({ capacity_ml: r.capacity_ml } as any)),
    [rows]
  );

  const updateOpen = (productId: string, ml: number) => {
    setRows((prev) =>
      prev.map((r) => (r.product_id === productId ? { ...r, openMl: ml, filled: true } : r))
    );
  };
  const updateClosed = (productId: string, value: string) => {
    const clean = value.replace(/[^0-9]/g, "");
    setRows((prev) =>
      prev.map((r) =>
        r.product_id === productId ? { ...r, closedQty: clean, filled: clean !== "" } : r
      )
    );
  };
  const updateUnit = (productId: string, value: string) => {
    const clean = value.replace(/[^0-9.]/g, "");
    setRows((prev) =>
      prev.map((r) =>
        r.product_id === productId ? { ...r, unitQty: clean, filled: clean !== "" } : r
      )
    );
  };

  const totalRows = openBottles.length + closedBottles.length + unitItems.length;
  const filledOpen = openBottles.filter((r) => r.filled).length;
  const filledClosed = closedBottles.filter((r) => r.filled).length;
  const filledUnits = unitItems.filter((r) => r.filled).length;
  const totalFilled = filledOpen + filledClosed + filledUnits;
  const allFilled = totalRows > 0 && totalFilled === totalRows;
  const noActivity = !loading && totalRows === 0;

  async function submit(emptyShift = false) {
    if (!jornadaId || !locationId) return;
    if (!emptyShift && !allFilled) {
      toast.error("Completa todos los insumos antes de firmar");
      return;
    }
    setSubmitting(true);
    try {
      // Construye líneas — para abiertas, ml restantes; para cerradas, qty unidades; para unitarios, qty.
      // El sistema compara contra stock_balances (ml para botellas, ud para unitarios).
      const lines: { product_id: string; declared_qty: number }[] = [];
      if (!emptyShift) {
        openBottles.forEach((r) => lines.push({ product_id: r.product_id, declared_qty: r.openMl }));
        closedBottles.forEach((r) =>
          lines.push({
            product_id: r.product_id,
            // declared en ml: cerradas × capacity_ml
            declared_qty: Number(r.closedQty || 0) * (r.capacity_ml ?? 0),
          })
        );
        unitItems.forEach((r) => lines.push({ product_id: r.product_id, declared_qty: Number(r.unitQty || 0) }));
      }

      const { data, error } = await supabase.rpc("submit_blind_shift_count", {
        p_jornada_id: jornadaId,
        p_location_id: locationId,
        p_lines: lines,
        p_threshold_pct: 0,
      });
      if (error) throw error;
      const accepted = (data as any)?.accepted_count ?? lines.length;
      toast.success(
        emptyShift
          ? "Cierre firmado: sin consumos hoy"
          : `Conteo firmado (${accepted} insumos). El admin lo revisará.`
      );
      onSubmitted?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Error firmando conteo");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[94vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5 text-primary" />
            Conteo de cierre — {locationName}
          </DialogTitle>
          <DialogDescription>
            Declará lo que <strong>realmente</strong> queda en tu barra. El sistema compara después.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-xs">
          <EyeOff className="w-4 h-4 text-primary mt-0.5 shrink-0" />
          <div className="space-y-1">
            <p className="font-medium text-foreground">Conteo a ciegas</p>
            <p className="text-muted-foreground">
              No vas a ver lo que el sistema espera. Cualquier diferencia queda registrada para que el admin la revise.
            </p>
          </div>
        </div>

        {!loading && (
          <div className="flex items-center justify-between text-xs">
            <Badge variant="secondary">{totalFilled} / {totalRows} declarados</Badge>
            <span className="flex items-center gap-1 text-muted-foreground">
              <ShieldCheck className="w-3.5 h-3.5" /> Tu firma queda registrada
            </span>
          </div>
        )}

        <ScrollArea className="flex-1 min-h-[40vh] max-h-[60vh] border rounded-md">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando insumos…
            </div>
          ) : noActivity ? (
            <div className="text-center py-12 px-6 space-y-4">
              <CheckCircle2 className="w-12 h-12 text-primary mx-auto" />
              <div>
                <p className="font-medium text-sm">Sin movimientos en esta barra</p>
                <p className="text-xs text-muted-foreground mt-1">
                  No hay consumos registrados ni botellas cerradas asignadas. Confirmá el cierre.
                </p>
              </div>
            </div>
          ) : (
            <div className="divide-y">
              {/* Sección: botellas abiertas (ml con slider) */}
              {openBottles.length > 0 && (
                <div className="px-3 py-2 bg-muted/30 sticky top-0 z-10 backdrop-blur">
                  <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <Wine className="w-3.5 h-3.5" /> Botellas abiertas en uso ({openBottles.length})
                  </div>
                </div>
              )}
              {openBottles.map((r) => {
                const cap = r.capacity_ml ?? 750;
                const pct = cap > 0 ? Math.round((r.openMl / cap) * 100) : 0;
                return (
                  <div key={`o-${r.product_id}`} className={`px-4 py-3 ${r.filled ? "bg-primary/5" : ""}`}>
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">{r.product_name}</div>
                        <div className="text-[11px] text-muted-foreground">
                          Botella {cap}ml · {r.category ?? "—"}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-lg font-mono font-semibold">{r.openMl}<span className="text-xs text-muted-foreground ml-1">ml</span></div>
                        <div className="text-[10px] text-muted-foreground">{pct}%</div>
                      </div>
                    </div>
                    <Slider
                      value={[r.openMl]}
                      max={cap}
                      step={Math.max(5, Math.round(cap / 50))}
                      onValueChange={(v) => updateOpen(r.product_id, v[0] ?? 0)}
                    />
                    <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                      <span>Vacía</span>
                      <span>½</span>
                      <span>Llena</span>
                    </div>
                  </div>
                );
              })}

              {/* Sección: botellas cerradas (cantidad de unidades) */}
              {closedBottles.length > 0 && (
                <div className="px-3 py-2 bg-muted/30 sticky top-0 z-10 backdrop-blur">
                  <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <Package className="w-3.5 h-3.5" /> Botellas CERRADAS en barra ({closedBottles.length})
                  </div>
                </div>
              )}
              {closedBottles.map((r) => (
                <div key={`c-${r.product_id}`} className={`px-4 py-3 ${r.filled ? "bg-primary/5" : ""}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{r.product_name}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {r.capacity_ml ?? "?"}ml · cuenta cerradas en tu barra
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Input
                        inputMode="numeric"
                        value={r.closedQty}
                        onChange={(e) => updateClosed(r.product_id, e.target.value)}
                        placeholder="0"
                        className="w-24 h-10 text-right font-mono text-base"
                      />
                      <span className="text-xs text-muted-foreground w-10">unid.</span>
                    </div>
                  </div>
                </div>
              ))}

              {/* Sección: unitarios consumidos */}
              {unitItems.length > 0 && (
                <div className="px-3 py-2 bg-muted/30 sticky top-0 z-10 backdrop-blur">
                  <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Unitarios consumidos ({unitItems.length})
                  </div>
                </div>
              )}
              {unitItems.map((r) => (
                <div key={`u-${r.product_id}`} className={`px-4 py-3 ${r.filled ? "bg-primary/5" : ""}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{r.product_name}</div>
                      <div className="text-[11px] text-muted-foreground">{r.category ?? "—"}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Input
                        inputMode="decimal"
                        value={r.unitQty}
                        onChange={(e) => updateUnit(r.product_id, e.target.value)}
                        placeholder="0"
                        className="w-24 h-10 text-right font-mono text-base"
                      />
                      <span className="text-xs text-muted-foreground w-10">{r.unit || "u"}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        {!noActivity && !allFilled && totalRows > 0 && (
          <p className="text-[11px] text-muted-foreground bg-muted/40 rounded px-3 py-2">
            Faltan <strong className="text-foreground">{totalRows - totalFilled}</strong> insumos por declarar.
          </p>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          {noActivity ? (
            <Button onClick={() => submit(true)} disabled={submitting}>
              {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Sin consumos hoy — firmar cierre
            </Button>
          ) : (
            <Button onClick={() => submit(false)} disabled={submitting || !allFilled}>
              {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Firmar y enviar conteo
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
