import { useState, useMemo } from "react";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Package, AlertCircle, CheckCircle2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export interface StockImportRow {
  producto: string;
  formato: number | null;
  cantidad: number;
  subcategoria: string;
  isHeader?: boolean;
  originalIndex: number;
}

interface StockImportPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: StockImportRow[];
  onConfirm: (data: StockImportRow[]) => void;
  isProcessing: boolean;
}

const SUBCATEGORY_OPTIONS = [
  { value: "botellas_1000", label: "Botellas 1000ml" },
  { value: "botellas_750", label: "Botellas 750ml" },
  { value: "botellas_700", label: "Botellas 700ml" },
  { value: "botellines", label: "Botellines" },
  { value: "mixers_latas", label: "Mixers Latas" },
  { value: "mixers_redbull", label: "Mixers Red Bull" },
  { value: "jugos", label: "Jugos" },
  { value: "aguas", label: "Aguas" },
  { value: "bebidas_1500", label: "Bebidas 1.5L" },
];

const detectSubcategory = (producto: string, formato: number | null): string => {
  const lowerProducto = producto.toLowerCase();
  
  // Detect category headers
  if (lowerProducto.includes("botellas 1000") || lowerProducto.includes("botellas 750") || lowerProducto.includes("botellas 700")) {
    return "botellas_750"; // Default for bottles section
  }
  if (lowerProducto.includes("botellines")) return "botellines";
  if (lowerProducto.includes("mixers latas")) return "mixers_latas";
  if (lowerProducto.includes("mixers redbull") || lowerProducto.includes("redbull variedades")) return "mixers_redbull";
  if (lowerProducto.includes("jugos")) return "jugos";
  if (lowerProducto.includes("aguas")) return "aguas";
  if (lowerProducto.includes("bebidas 1,5") || lowerProducto.includes("bebidas 1.5")) return "bebidas_1500";
  
  // Detect by format
  if (formato) {
    if (formato >= 1000) return "botellas_1000";
    if (formato >= 700 && formato < 1000) return formato >= 750 ? "botellas_750" : "botellas_700";
    if (formato >= 1500) return "bebidas_1500";
    if (formato >= 250 && formato <= 500) {
      if (lowerProducto.includes("redbull") || lowerProducto.includes("red bull")) return "mixers_redbull";
      if (lowerProducto.includes("heineken") || lowerProducto.includes("kunstman") || lowerProducto.includes("austral") || lowerProducto.includes("dolbek")) return "botellines";
      return "mixers_latas";
    }
  }
  
  // Detect by product name
  if (lowerProducto.includes("redbull") || lowerProducto.includes("red bull")) return "mixers_redbull";
  if (lowerProducto.includes("coca") || lowerProducto.includes("sprite") || lowerProducto.includes("pepsi") || lowerProducto.includes("ginger") || lowerProducto.includes("tonica")) {
    if (formato && formato >= 1500) return "bebidas_1500";
    return "mixers_latas";
  }
  if (lowerProducto.includes("nectar") || lowerProducto.includes("jugo")) return "jugos";
  if (lowerProducto.includes("agua") || lowerProducto.includes("mineral")) return "aguas";
  if (lowerProducto.includes("heineken") || lowerProducto.includes("kunstman") || lowerProducto.includes("austral") || lowerProducto.includes("dolbek") || lowerProducto.includes("mistral ice")) return "botellines";
  
  return "botellas_750"; // Default
};

export const StockImportPreviewDialog = ({
  open,
  onOpenChange,
  data,
  onConfirm,
  isProcessing,
}: StockImportPreviewDialogProps) => {
  const [editedData, setEditedData] = useState<StockImportRow[]>(data);

  // Sync edited data when new data comes in
  useMemo(() => {
    if (data.length > 0) {
      setEditedData(data);
    }
  }, [data]);

  const updateRow = (index: number, field: keyof StockImportRow, value: any) => {
    setEditedData((prev) =>
      prev.map((row, i) =>
        i === index ? { ...row, [field]: value } : row
      )
    );
  };

  const validRows = editedData.filter((row) => !row.isHeader && row.cantidad > 0);
  const emptyRows = editedData.filter((row) => !row.isHeader && row.cantidad === 0);

  const handleConfirm = () => {
    onConfirm(validRows);
  };

  const getSubcategoryLabel = (value: string) => {
    return SUBCATEGORY_OPTIONS.find((opt) => opt.value === value)?.label || value;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            Confirmar Importación de Stock
          </DialogTitle>
          <DialogDescription>
            Revisa y edita los datos antes de confirmar la importación
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-4 py-2">
          <Badge variant="outline" className="gap-1">
            <CheckCircle2 className="h-3 w-3 text-green-500" />
            {validRows.length} productos con stock
          </Badge>
          {emptyRows.length > 0 && (
            <Badge variant="secondary" className="gap-1">
              <AlertCircle className="h-3 w-3 text-muted-foreground" />
              {emptyRows.length} sin cantidad (se omitirán)
            </Badge>
          )}
        </div>

        <ScrollArea className="flex-1 border rounded-lg">
          <div className="p-4">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-background border-b">
                <tr>
                  <th className="text-left py-2 px-2 font-medium">Producto</th>
                  <th className="text-center py-2 px-2 font-medium w-24">Formato (ml)</th>
                  <th className="text-center py-2 px-2 font-medium w-24">Cantidad</th>
                  <th className="text-left py-2 px-2 font-medium w-40">Subcategoría</th>
                </tr>
              </thead>
              <tbody>
                {editedData.map((row, index) => {
                  if (row.isHeader) {
                    return (
                      <tr key={index} className="bg-muted/50 border-b">
                        <td colSpan={4} className="py-2 px-2 font-semibold text-primary">
                          {row.producto}
                        </td>
                      </tr>
                    );
                  }

                  const hasQuantity = row.cantidad > 0;

                  return (
                    <tr
                      key={index}
                      className={`border-b hover:bg-muted/30 transition-colors ${
                        !hasQuantity ? "opacity-50" : ""
                      }`}
                    >
                      <td className="py-2 px-2">
                        <Input
                          value={row.producto}
                          onChange={(e) => updateRow(index, "producto", e.target.value)}
                          className="h-8 text-sm"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <Input
                          type="number"
                          value={row.formato || ""}
                          onChange={(e) =>
                            updateRow(index, "formato", e.target.value ? Number(e.target.value) : null)
                          }
                          className="h-8 text-sm text-center"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <Input
                          type="number"
                          value={row.cantidad}
                          onChange={(e) =>
                            updateRow(index, "cantidad", Number(e.target.value) || 0)
                          }
                          className="h-8 text-sm text-center font-medium"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <Select
                          value={row.subcategoria}
                          onValueChange={(value) => updateRow(index, "subcategoria", value)}
                        >
                          <SelectTrigger className="h-8 text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {SUBCATEGORY_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </ScrollArea>

        {validRows.length === 0 && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              No hay productos con cantidad mayor a 0. Agrega cantidades para continuar.
            </AlertDescription>
          </Alert>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isProcessing}>
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isProcessing || validRows.length === 0}
            className="primary-gradient"
          >
            {isProcessing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Procesando...
              </>
            ) : (
              <>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Confirmar Importación ({validRows.length})
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export { detectSubcategory };
