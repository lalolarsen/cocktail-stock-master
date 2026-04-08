import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { QRCodeSVG } from "qrcode.react";
import { formatCLP } from "@/lib/currency";
import { Printer, X, Copy, Bug } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

export type PickupQRDialogProps = {
  open: boolean;
  onClose: () => void;
  token: string;
  saleNumber: string;
  expiresAt: string;
  items: Array<{ name: string; quantity: number; price: number }>;
  total: number;
  barName?: string;
  shortCode?: string;
  /** Render inline without dialog wrapper (for success screens) */
  embedded?: boolean;
};

/** Fixed venue title for all printed receipts */
const RECEIPT_VENUE_TITLE = "Berlín Valdivia";

export default function PickupQRDialog({
  open,
  onClose,
  token,
  saleNumber,
  expiresAt,
  items,
  total,
  barName,
  shortCode,
  embedded = false,
}: PickupQRDialogProps) {
  const printRef = useRef<HTMLDivElement>(null);
  const [showDebug, setShowDebug] = useState(false);

  // The actual content encoded in the QR
  const qrContent = `PICKUP:${token}`;

  const handlePrint = () => {
    const qrSvgEl = document.getElementById("qr-code-svg");
    if (!qrSvgEl) return;

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

    const itemsHtml = items
      .map((item) => `<div class="item">${item.quantity}x ${item.name} — $${item.price.toLocaleString("es-CL")}</div>`)
      .join("");

    const shortCodeHtml = shortCode
      ? `<div class="short-code">${shortCode.split("").join(" ")}</div>
         <div class="short-code-label">CÓDIGO DE RETIRO</div>`
      : "";

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>QR Retiro - ${saleNumber}</title>
          <style>
            @page { size: 80mm auto; margin: 5mm; }
            * { color: #000 !important; }
            body {
              font-family: 'Courier New', monospace;
              text-align: center;
              padding: 10px;
              max-width: 80mm;
              margin: 0 auto;
              color: #000;
              background: #fff;
            }
            .venue-name { font-size: 16pt; font-weight: bold; margin-bottom: 8px; }
            .sep { margin: 4px 0; font-size: 10pt; }
            .sale-number { font-size: 14pt; font-weight: bold; margin: 6px 0; }
            .items { text-align: left; margin: 8px 0; font-size: 14pt; font-weight: bold; }
            .item { margin: 3px 0; font-size: 14pt; font-weight: bold; }
            .total { font-size: 14pt; font-weight: bold; margin: 8px 0; }
            .qr-container { margin: 12px 0; }
            .qr-container svg { max-width: 85%; height: auto; }
            .short-code { font-size: 18pt; font-weight: bold; letter-spacing: 6px; margin-top: 8px; }
            .short-code-label { font-size: 9pt; margin-top: 2px; }
            .expires { font-size: 10px; margin-top: 8px; }
            .instruction {
              font-size: 11px;
              margin-top: 12px;
              padding: 8px;
              border: 1px dashed #000;
            }
          </style>
        </head>
        <body>
          <div class="venue-name">${RECEIPT_VENUE_TITLE}</div>
          <div class="sep">================================================</div>
          <div class="sale-number">${saleNumber}</div>
          <div class="sep">================================================</div>
          <div class="items">${itemsHtml}</div>
          <div class="total">Total: ${formatCLP(total)}</div>
          <div class="sep">------------------------------------------------</div>
          <div style="font-weight:bold;margin-bottom:4px;">QR DE RETIRO</div>
          <div class="qr-container">
            ${qrSvgEl.outerHTML}
          </div>
          ${shortCodeHtml}
          <div class="expires">Válido hasta: ${formattedExpires}</div>
          <div class="instruction">
            Presenta este QR o dicta el código en la barra
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

  const content = (
    <div ref={printRef} className="flex flex-col items-center space-y-3">
      <div className="bg-white p-3 rounded-lg">
        <QRCodeSVG
          id="qr-code-svg"
          value={qrContent}
          size={embedded ? 150 : 200}
          level="H"
          includeMargin
          bgColor="#ffffff"
          fgColor="#000000"
        />
      </div>

      {/* Short code display */}
      {shortCode && (
        <div className="text-center space-y-0.5">
          <p className="text-2xl font-bold font-mono tracking-[0.3em]">
            {shortCode}
          </p>
          <p className="text-[10px] uppercase text-muted-foreground font-semibold tracking-wide">
            Código de retiro
          </p>
        </div>
      )}

      <div className="text-center space-y-1">
        {items.map((item, index) => (
          <p key={index} className="text-base font-semibold text-foreground">
            {item.quantity}x {item.name}
          </p>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        Válido hasta: {formattedExpires}
      </p>

      <div className="bg-muted/50 p-2 rounded-lg text-center text-sm">
        {barName ? (
          <>Retiro en <strong>{barName}</strong></>
        ) : (
          "Presenta en barra o dicta el código"
        )}
      </div>

      {!embedded && (
        <Button
          variant="ghost"
          size="sm"
          className="text-xs text-muted-foreground"
          onClick={() => setShowDebug(!showDebug)}
        >
          <Bug className="w-3 h-3 mr-1" />
          {showDebug ? "Ocultar Debug" : "Ver Debug"}
        </Button>
      )}

      {!embedded && showDebug && (
        <div className="w-full bg-muted/50 rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">DEBUG INFO</span>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-xs"
              onClick={() => {
                navigator.clipboard.writeText(`TOKEN: ${token}\nSHORT_CODE: ${shortCode || "N/A"}\nQR_CONTENT: ${qrContent}`);
                toast.success("Debug info copiado");
              }}
            >
              <Copy className="w-3 h-3 mr-1" />
              Copiar
            </Button>
          </div>
          <div className="text-xs font-mono space-y-1">
            <p><span className="text-muted-foreground">TOKEN:</span> {token}</p>
            {shortCode && <p><span className="text-muted-foreground">SHORT_CODE:</span> {shortCode}</p>}
            <p><span className="text-muted-foreground">QR:</span> {qrContent}</p>
          </div>
        </div>
      )}
    </div>
  );

  // Embedded mode: just return the content without Dialog wrapper
  if (embedded) {
    return content;
  }

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-center">QR de Retiro</DialogTitle>
        </DialogHeader>

        <div className="py-4">
          <p className="text-2xl font-bold text-center mb-4">{saleNumber}</p>
          {content}
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
