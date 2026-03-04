import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Users, AlertCircle } from "lucide-react";

export interface BarWorker {
  id: string;
  full_name: string;
}

interface BartenderSetupDialogProps {
  open: boolean;
  workers: BarWorker[];
  loading: boolean;
  onConfirm: (selected: BarWorker[]) => void;
}

const MAX_BARTENDERS = 3;

export function BartenderSetupDialog({ open, workers, loading, onConfirm }: BartenderSetupDialogProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (next.size >= MAX_BARTENDERS) return prev;
        next.add(id);
      }
      return next;
    });
  };

  const handleConfirm = () => {
    const chosen = workers.filter(w => selected.has(w.id));
    if (chosen.length === 0) return;
    onConfirm(chosen);
  };

  return (
    <Dialog open={open}>
      <DialogContent className="max-w-sm" onPointerDownOutside={e => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Iniciar Turno Barra
          </DialogTitle>
          <DialogDescription>
            Selecciona los bartenders activos (1 a {MAX_BARTENDERS})
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-8 text-center text-muted-foreground text-sm">Cargando trabajadores…</div>
        ) : workers.length === 0 ? (
          <div className="py-8 text-center space-y-2">
            <AlertCircle className="w-8 h-8 text-destructive mx-auto" />
            <p className="text-sm text-muted-foreground">No hay trabajadores con rol de barra disponibles.</p>
          </div>
        ) : (
          <div className="space-y-4 pt-2">
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {workers.map(w => {
                const checked = selected.has(w.id);
                const disabled = !checked && selected.size >= MAX_BARTENDERS;
                return (
                  <label
                    key={w.id}
                    className={`flex items-center gap-3 rounded-lg border px-4 py-3 cursor-pointer transition-colors
                      ${checked ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"}
                      ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    <Checkbox
                      checked={checked}
                      disabled={disabled}
                      onCheckedChange={() => toggle(w.id)}
                    />
                    <span className="text-sm font-medium">{w.full_name || "Sin nombre"}</span>
                  </label>
                );
              })}
            </div>

            {selected.size >= MAX_BARTENDERS && (
              <p className="text-xs text-amber-500 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                Máximo {MAX_BARTENDERS} bartenders
              </p>
            )}

            <Button
              className="w-full h-12 text-base"
              disabled={selected.size === 0}
              onClick={handleConfirm}
            >
              Comenzar ({selected.size} seleccionado{selected.size !== 1 ? "s" : ""})
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
