import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronDown, ChevronUp, Loader2, Printer } from "lucide-react";
import { toast } from "sonner";
import {
  getPreferredPaperWidthStorageKey,
  printRaw,
  type PaperWidth,
  type ReceiptData,
} from "@/lib/printing/qz";

interface PrintingPanelProps {
  venueName?: string;
  venueId?: string;
  posId?: string;
}

export function PrintingPanel({ venueName, venueId, posId }: PrintingPanelProps) {
  const [paperWidth, setPaperWidth] = useState<PaperWidth>("80mm");
  const [isPrinting, setIsPrinting] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const paperWidthStorageKey = useMemo(
    () => getPreferredPaperWidthStorageKey(venueId, posId),
    [venueId, posId],
  );

  useEffect(() => {
    const saved = localStorage.getItem(paperWidthStorageKey) as PaperWidth | null;
    if (saved === "58mm" || saved === "80mm") setPaperWidth(saved);
  }, [paperWidthStorageKey]);

  const savePaperWidth = useCallback(
    (value: PaperWidth) => {
      setPaperWidth(value);
      localStorage.setItem(paperWidthStorageKey, value);
      toast.success(`Ancho guardado: ${value}`);
    },
    [paperWidthStorageKey],
  );

  const printTest = useCallback(async () => {
    setIsPrinting(true);
    const testData: ReceiptData = {
      saleNumber: "CAJ-TEST-001",
      venueName: venueName || "STOCKIA",
      posName: "Prueba",
      dateTime: new Date().toLocaleString("es-CL"),
      items: [
        { name: "Producto de prueba", quantity: 1, price: 1000 },
        { name: "Otro producto", quantity: 2, price: 2500 },
      ],
      total: 6000,
      paymentMethod: "cash",
      pickupToken: "TEST-QR-TOKEN-12345",
    };

    try {
      const result = await printRaw("", testData, paperWidth);
      if (result.success) {
        toast.success("Ticket enviado a la impresora");
      } else {
        toast.error(result.error || "Error de impresión");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error desconocido");
    } finally {
      setIsPrinting(false);
    }
  }, [paperWidth, venueName]);

  return (
    <Card className="border-border/50">
      <button
        onClick={() => setExpanded((prev) => !prev)}
        className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-muted/30 transition-colors rounded-lg"
      >
        <div className="flex items-center gap-2">
          <Printer className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">Impresión</span>
          <span className="text-[10px] text-muted-foreground">· {paperWidth}</span>
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        )}
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-3 border-t border-border/30 pt-3">
          {/* Paper width */}
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Ancho de papel</p>
            <Select value={paperWidth} onValueChange={(v) => savePaperWidth(v as PaperWidth)}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="58mm" className="text-xs">58mm</SelectItem>
                <SelectItem value="80mm" className="text-xs">80mm</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Test print */}
          <Button
            variant="outline"
            size="sm"
            onClick={printTest}
            disabled={isPrinting}
            className="w-full text-xs"
          >
            {isPrinting ? (
              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            ) : (
              <Printer className="w-3 h-3 mr-1" />
            )}
            Imprimir ticket de prueba
          </Button>
        </div>
      )}
    </Card>
  );
}
