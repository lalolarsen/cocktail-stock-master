import { useEffect, useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Loader2, ClipboardCheck, EyeOff, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { isBottle } from "@/lib/product-type";

interface ConsumedProduct {
  product_id: string;
  product_name: string;
  unit: string;
  capacity_ml: number | null;
  category: string | null;
}

interface DeclaredRow extends ConsumedProduct {
  declared: string;
  noneLeft: boolean;
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
 * Conteo de cierre CIEGO.
 * - Solo muestra los insumos que tuvieron movimiento de salida en la jornada.
 * - NUNCA muestra el stock teórico, ni inicial, ni consumo.
 * - El bartender declara cuánto queda. El sistema calcula la varianza en silencio.
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
          declared: "",
          noneLeft: false,
        }))
      );
    } catch (e: any) {
      toast.error(e?.message ?? "Error cargando insumos");
    } finally {
      setLoading(false);
    }
  }

  function setDeclared(productId: string, value: string) {
    setRows((prev) =>
      prev.map((r) =>
        r.product_id === productId
          ? { ...r, declared: value.replace(/[^0-9.]/g, ""), noneLeft: false }
          : r
      )
    );
  }

  function toggleNone(productId: string, on: boolean) {
    setRows((prev) =>
      prev.map((r) =>
        r.product_id === productId ? { ...r, noneLeft: on, declared: on ? "0" : "" } : r
      )
    );
  }

  const filledCount = rows.filter((r) => r.declared.trim() !== "" || r.noneLeft).length;
  const allFilled = rows.length > 0 && filledCount === rows.length;

  const totalUnits = rows.length;

  async function handleSubmit() {
    if (!jornadaId || !locationId) return;
    if (!allFilled) {
      toast.error("Completa el conteo de todos los insumos antes de firmar");
      return;
    }
    setSubmitting(true);
    try {
      const lines = rows.map((r) => ({
        product_id: r.product_id,
        declared_qty: r.noneLeft ? 0 : Number(r.declared || 0),
      }));
      const { data, error } = await supabase.rpc("submit_blind_shift_count", {
        p_jornada_id: jornadaId,
        p_location_id: locationId,
        p_lines: lines,
        p_threshold_pct: 10,
      });
      if (error) throw error;
      const accepted = (data as any)?.accepted_count ?? lines.length;
      toast.success(`Conteo firmado (${accepted} insumos). El admin lo revisará.`);
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
      <DialogContent className="max-w-xl max-h-[92vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5 text-primary" />
            Conteo de cierre — {locationName}
          </DialogTitle>
          <DialogDescription>
            Declará cuánto queda en tu barra de cada insumo que se utilizó hoy.
          </DialogDescription>
        </DialogHeader>

        {/* Banner explicativo CIEGO */}
        <div className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-xs">
          <EyeOff className="w-4 h-4 text-primary mt-0.5 shrink-0" />
          <div className="space-y-1">
            <p className="font-medium text-foreground">Conteo a ciegas</p>
            <p className="text-muted-foreground">
              No vas a ver lo que el sistema espera. Solo escribí lo que <strong>realmente</strong> queda
              en tu barra ahora. El admin compara después.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <Badge variant="secondary">{filledCount} / {totalUnits} insumos</Badge>
          <span className="flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5" /> Tu firma queda registrada
          </span>
        </div>

        <ScrollArea className="h-[55vh] border rounded-md">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando insumos…
            </div>
          ) : rows.length === 0 ? (
            <div className="text-center text-muted-foreground py-12 text-sm px-6">
              No hay insumos consumidos en esta jornada para tu barra.
              <br />
              Si no se vendió nada, podés cerrar el conteo directo.
            </div>
          ) : (
            <div className="divide-y">
              {rows.map((r) => {
                const bottle = isBottle({ capacity_ml: r.capacity_ml } as any);
                const unitLabel = bottle ? "ml" : r.unit || "u";
                const ready = r.declared.trim() !== "" || r.noneLeft;
                return (
                  <div
                    key={r.product_id}
                    className={`px-3 py-3 ${ready ? "bg-primary/5" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">{r.product_name}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {r.category ?? "—"}{bottle ? ` · botella ${r.capacity_ml ?? ""}ml` : ""}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Input
                          inputMode="decimal"
                          value={r.declared}
                          onChange={(e) => setDeclared(r.product_id, e.target.value)}
                          placeholder="¿cuánto queda?"
                          disabled={r.noneLeft}
                          className="w-28 h-9 text-right font-mono"
                        />
                        <span className="text-xs text-muted-foreground w-6">{unitLabel}</span>
                      </div>
                    </div>
                    <label className="flex items-center gap-2 mt-2 text-[11px] text-muted-foreground cursor-pointer">
                      <Switch
                        checked={r.noneLeft}
                        onCheckedChange={(v) => toggleNone(r.product_id, !!v)}
                      />
                      No queda nada de este insumo
                    </label>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>

        {!allFilled && rows.length > 0 && (
          <p className="text-[11px] text-muted-foreground bg-muted/40 rounded px-3 py-2">
            Faltan <strong className="text-foreground">{totalUnits - filledCount}</strong> insumos por declarar.
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || !allFilled || rows.length === 0}
          >
            {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Firmar y enviar conteo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
