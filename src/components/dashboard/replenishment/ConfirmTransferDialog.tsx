import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { formatCLP } from "@/lib/currency";
import type { TransferLine } from "./types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lines: TransferLine[];
  barName: string;
  onConfirm: () => void;
  submitting: boolean;
}

export function ConfirmTransferDialog({ open, onOpenChange, lines, barName, onConfirm, submitting }: Props) {
  const totalQty = lines.reduce((s, l) => s + l.quantity, 0);
  const totalCost = lines.reduce((s, l) => s + l.estimatedCost, 0);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Confirmar transferencia</AlertDialogTitle>
          <AlertDialogDescription>
            Resumen de la reposición a <strong>{barName}</strong>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-3 max-h-60 overflow-y-auto">
          {lines.map((line, i) => (
            <div key={i} className="flex items-center justify-between p-2 border rounded-lg text-sm">
              <div>
                <p className="font-medium">{line.product.name}</p>
                <p className="text-muted-foreground">
                  {line.quantity} {line.product.unit}
                </p>
              </div>
              <span className="font-semibold">{formatCLP(line.estimatedCost)}</span>
            </div>
          ))}
        </div>

        <div className="flex justify-between p-3 bg-muted/50 rounded-lg text-sm font-medium">
          <span>{lines.length} producto{lines.length !== 1 ? "s" : ""}</span>
          <span>Total: {formatCLP(totalCost)}</span>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={submitting}>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={submitting}>
            {submitting ? "Procesando..." : "Confirmar envío"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
