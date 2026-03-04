import * as React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

export type BarWorker = { id: string; full_name: string | null };

type Props = {
  open: boolean;
  workers: BarWorker[];
  loading: boolean;
  maxBartenders?: number;
  onConfirm: (selected: BarWorker[]) => void;
};

export function BartenderSetupDialog({ open, workers, loading, maxBartenders = 3, onConfirm }: Props) {
  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else {
        if (next.size >= maxBartenders) return prev;
        next.add(id);
      }
      return next;
    });
  };

  const chosen = React.useMemo(() => workers.filter(w => selected.has(w.id)), [workers, selected]);
  const canConfirm = chosen.length >= 1 && chosen.length <= maxBartenders && !loading;

  return (
    <Dialog open={open}>
      <DialogContent onPointerDownOutside={e => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Iniciar Turno Barra</DialogTitle>
          <DialogDescription>
            Selecciona los bartenders activos (1 a {maxBartenders})
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="text-sm text-muted-foreground">Cargando trabajadores…</div>
        ) : workers.length === 0 ? (
          <div className="text-sm text-destructive">No hay trabajadores de barra disponibles.</div>
        ) : (
          <div className="space-y-2">
            {workers.map((w) => {
              const checked = selected.has(w.id);
              const disabled = !checked && selected.size >= maxBartenders;
              return (
                <label
                  key={w.id}
                  className={`flex items-center gap-3 rounded-md border px-3 py-2 cursor-pointer transition-colors
                    ${checked ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"}
                    ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
                  onClick={(e) => { e.preventDefault(); if (!disabled) toggle(w.id); }}
                >
                  <Checkbox checked={checked} disabled={disabled} />
                  <span className="text-sm font-medium">{w.full_name || "Sin nombre"}</span>
                </label>
              );
            })}
            {selected.size >= maxBartenders && (
              <div className="text-xs text-amber-500">Máximo {maxBartenders} bartenders</div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            onClick={() => onConfirm(chosen)}
            disabled={!canConfirm}
          >
            Comenzar ({chosen.length} seleccionado{chosen.length !== 1 ? "s" : ""})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
