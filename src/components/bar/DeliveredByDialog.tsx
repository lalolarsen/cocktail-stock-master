import * as React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { BarWorker } from "./BartenderSetupDialog";

type Props = {
  open: boolean;
  bartenders: BarWorker[];
  onConfirm: (workerId: string) => void;
  onCancel: () => void;
};

export function DeliveredByDialog({ open, bartenders, onConfirm, onCancel }: Props) {
  const [selectedId, setSelectedId] = React.useState("");

  React.useEffect(() => {
    if (!open) setSelectedId("");
  }, [open]);

  const canConfirm = !!selectedId;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <DialogContent onPointerDownOutside={e => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>¿Quién entrega?</DialogTitle>
          <DialogDescription>Selecciona el bartender responsable de esta entrega</DialogDescription>
        </DialogHeader>

        <RadioGroup value={selectedId} onValueChange={setSelectedId} className="space-y-2">
          {bartenders.map((b) => (
            <label key={b.id} className="flex items-center gap-3 rounded-md border px-3 py-2 cursor-pointer transition-colors hover:bg-muted/50">
              <RadioGroupItem value={b.id} />
              <span className="text-sm font-medium">{b.full_name || "Sin nombre"}</span>
            </label>
          ))}
        </RadioGroup>

        <DialogFooter>
          <Button variant="outline" type="button" onClick={onCancel}>Cancelar</Button>
          <Button type="button" onClick={() => onConfirm(selectedId)} disabled={!canConfirm}>
            Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
