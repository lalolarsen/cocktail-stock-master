import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCLP } from "@/lib/currency";
import { ArrowRight, Calculator } from "lucide-react";

interface UoMConversionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemName: string;
  extractedUom: string;
  extractedQuantity: number;
  extractedUnitPrice: number;
  productUnit: string; // The base unit of the product (ml, g, un)
  onConfirm: (conversionFactor: number, normalizedQty: number, normalizedCost: number) => void;
}

const COMMON_UOMS = [
  { value: "Unidad", label: "Unidad" },
  { value: "Caja", label: "Caja" },
  { value: "Pack", label: "Pack" },
  { value: "Botella", label: "Botella" },
  { value: "Kg", label: "Kilogramo" },
  { value: "Lt", label: "Litro" },
  { value: "ml", label: "Mililitros" },
  { value: "g", label: "Gramos" },
];

export function UoMConversionDialog({
  open,
  onOpenChange,
  itemName,
  extractedUom,
  extractedQuantity,
  extractedUnitPrice,
  productUnit,
  onConfirm,
}: UoMConversionDialogProps) {
  const [selectedUom, setSelectedUom] = useState(extractedUom);
  const [conversionFactor, setConversionFactor] = useState(1);

  // Calculate normalized values
  const normalizedQuantity = extractedQuantity * conversionFactor;
  const normalizedUnitCost = conversionFactor > 0 ? extractedUnitPrice / conversionFactor : extractedUnitPrice;

  useEffect(() => {
    setSelectedUom(extractedUom);
    // Set default conversion factors based on common units
    if (extractedUom.toLowerCase() === "caja") {
      setConversionFactor(12); // Default: 1 caja = 12 unidades
    } else if (extractedUom.toLowerCase() === "pack") {
      setConversionFactor(6); // Default: 1 pack = 6 unidades
    } else {
      setConversionFactor(1);
    }
  }, [extractedUom, open]);

  const handleConfirm = () => {
    onConfirm(conversionFactor, normalizedQuantity, normalizedUnitCost);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5" />
            Conversión de Unidad de Medida
          </DialogTitle>
          <DialogDescription>
            Configure cómo convertir la unidad de factura a la unidad del producto
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Item info */}
          <div className="p-3 bg-muted rounded-lg">
            <p className="text-sm font-medium">{itemName}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Factura: {extractedQuantity} {extractedUom} × {formatCLP(extractedUnitPrice)}
            </p>
          </div>

          {/* UoM Selection */}
          <div className="space-y-2">
            <Label>Unidad en factura</Label>
            <Select value={selectedUom} onValueChange={setSelectedUom}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COMMON_UOMS.map((uom) => (
                  <SelectItem key={uom.value} value={uom.value}>
                    {uom.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Conversion Factor */}
          <div className="space-y-2">
            <Label>Factor de conversión</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground whitespace-nowrap">
                1 {selectedUom} =
              </span>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={conversionFactor}
                onChange={(e) => setConversionFactor(parseFloat(e.target.value) || 1)}
                className="w-24"
              />
              <span className="text-sm text-muted-foreground whitespace-nowrap">
                {productUnit}
              </span>
            </div>
          </div>

          {/* Preview */}
          <div className="p-4 border rounded-lg bg-primary/5 space-y-2">
            <p className="text-sm font-medium text-primary">Vista previa normalizada:</p>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">
                {extractedQuantity} {selectedUom}
              </span>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">
                {normalizedQuantity.toFixed(2)} {productUnit}
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">
                {formatCLP(extractedUnitPrice)}/{selectedUom}
              </span>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">
                {formatCLP(normalizedUnitCost)}/{productUnit}
              </span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm}>
            Aplicar Conversión
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
