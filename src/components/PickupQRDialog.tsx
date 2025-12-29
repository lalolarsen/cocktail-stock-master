import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { QRCodeSVG } from "qrcode.react";
import { formatCLP } from "@/lib/currency";
import { Printer, X } from "lucide-react";
import { useRef } from "react";

type PickupQRDialogProps = {
  open: boolean;
  onClose: () => void;
  token: string;
  saleNumber: string;
  expiresAt: string;
  items: Array<{ name: string; quantity: number; price: number }>;
  total: number;
};

export default function PickupQRDialog({
  open,
  onClose,
  token,
  saleNumber,
  expiresAt,
  items,
  total,
}: PickupQRDialogProps) {
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    const printContent = printRef.current;
    if (!printContent) return;

    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const expiresDate = new Date(expiresAt);
    const formattedExpires = expiresDate.toLocaleString("es-CL", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>QR Retiro - ${saleNumber}</title>
          <style>
            @page { size: 80mm auto; margin: 5mm; }
            body {
              font-family: 'Courier New', monospace;
              text-align: center;
              padding: 10px;
              max-width: 80mm;
              margin: 0 auto;
            }
            .qr-container { margin: 15px 0; }
            .sale-number { font-size: 18px; font-weight: bold; margin: 10px 0; }
            .items { text-align: left; margin: 10px 0; font-size: 12px; }
            .total { font-size: 16px; font-weight: bold; margin: 10px 0; }
            .expires { font-size: 10px; color: #666; margin-top: 10px; }
            .instruction { 
              font-size: 11px; 
              margin-top: 15px; 
              padding: 8px;
              border: 1px dashed #333;
            }
            svg { max-width: 100%; height: auto; }
          </style>
        </head>
        <body>
          <div class="sale-number">${saleNumber}</div>
          <div class="qr-container">
            ${document.getElementById("qr-code-svg")?.outerHTML || ""}
          </div>
          <div class="items">
            ${items.map((item) => `<div>${item.quantity}x ${item.name}</div>`).join("")}
          </div>
          <div class="total">Total: ${formatCLP(total)}</div>
          <div class="expires">Válido hasta: ${formattedExpires}</div>
          <div class="instruction">
            Presenta este QR en la barra para retirar tu pedido
          </div>
        </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  };

  const expiresDate = new Date(expiresAt);
  const formattedExpires = expiresDate.toLocaleString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-center">QR de Retiro</DialogTitle>
        </DialogHeader>

        <div ref={printRef} className="flex flex-col items-center space-y-4 py-4">
          <p className="text-2xl font-bold">{saleNumber}</p>

          <div className="bg-white p-4 rounded-lg">
            <QRCodeSVG
              id="qr-code-svg"
              value={token}
              size={200}
              level="H"
              includeMargin
            />
          </div>

          <div className="text-center space-y-1">
            {items.map((item, index) => (
              <p key={index} className="text-sm text-muted-foreground">
                {item.quantity}x {item.name}
              </p>
            ))}
          </div>

          <p className="text-xl font-bold text-primary">{formatCLP(total)}</p>

          <p className="text-xs text-muted-foreground">
            Válido hasta: {formattedExpires}
          </p>

          <div className="bg-muted/50 p-3 rounded-lg text-center text-sm">
            Presenta este QR en la barra para retirar tu pedido
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose} className="flex-1">
            <X className="w-4 h-4 mr-2" />
            Cerrar
          </Button>
          <Button onClick={handlePrint} className="flex-1">
            <Printer className="w-4 h-4 mr-2" />
            Imprimir
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
