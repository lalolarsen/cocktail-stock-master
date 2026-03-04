import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { UserCheck } from "lucide-react";
import type { BarWorker } from "./BartenderSetupDialog";

interface DeliveredByDialogProps {
  open: boolean;
  bartenders: BarWorker[];
  onConfirm: (workerId: string) => void;
  onCancel: () => void;
}

export function DeliveredByDialog({ open, bartenders, onConfirm, onCancel }: DeliveredByDialogProps) {
  const [selectedId, setSelectedId] = useState<string>("");

  const handleConfirm = () => {
    if (!selectedId) return;
    onConfirm(selectedId);
    setSelectedId("");
  };

  const handleCancel = () => {
    setSelectedId("");
    onCancel();
  };

  return (
    <Dialog open={open}>
      <DialogContent className="max-w-xs" onPointerDownOutside={e => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCheck className="w-5 h-5" />
            ¿Quién entrega?
          </DialogTitle>
          <DialogDescription>
            Selecciona el bartender que entrega este pedido
          </DialogDescription>
        </DialogHeader>

        <RadioGroup value={selectedId} onValueChange={setSelectedId} className="space-y-2 pt-2">
          {bartenders.map(b => (
            <label
              key={b.id}
              className={`flex items-center gap-3 rounded-lg border px-4 py-3 cursor-pointer transition-colors
                ${selectedId === b.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"}`}
            >
              <RadioGroupItem value={b.id} id={`bt-${b.id}`} />
              <Label htmlFor={`bt-${b.id}`} className="text-sm font-medium cursor-pointer flex-1">
                {b.full_name || "Sin nombre"}
              </Label>
            </label>
          ))}
        </RadioGroup>

        <div className="flex gap-2 pt-2">
          <Button variant="outline" className="flex-1 h-11" onClick={handleCancel}>
            Cancelar
          </Button>
          <Button className="flex-1 h-11" disabled={!selectedId} onClick={handleConfirm}>
            Confirmar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
