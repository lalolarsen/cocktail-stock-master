import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BulkStockIntakeGrid } from "./BulkStockIntakeGrid";

interface Product {
  id: string;
  name: string;
  code: string;
  category: string;
  unit: string;
}

interface ManualStockEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  warehouseId: string;
  products: Product[];
  onStockUpdated: () => void;
}

export function ManualStockEntryDialog({
  open,
  onOpenChange,
  warehouseId,
  products,
  onStockUpdated,
}: ManualStockEntryDialogProps) {
  const handleStockUpdated = () => {
    onStockUpdated();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-full h-[95vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b flex-shrink-0">
          <DialogTitle className="text-lg">Ingreso manual a bodega</DialogTitle>
          <DialogDescription className="text-sm">
            Ingresa varios productos tipo Excel. IVA (19%) e impuesto específico se calculan automáticamente.
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-auto p-6">
          <BulkStockIntakeGrid
            warehouseId={warehouseId}
            products={products}
            onStockUpdated={handleStockUpdated}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
