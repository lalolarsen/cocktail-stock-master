import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { QRCodeSVG } from "qrcode.react";
import { formatCLP } from "@/lib/currency";
import { Check, Printer, ChevronLeft, ChevronRight, Wine } from "lucide-react";

interface CoverToken {
  token_id: string;
  token: string;
  short_code?: string | null;
  cocktail_id: string;
  cocktail_name?: string;
  ticket_type: string;
}

interface CartLine {
  ticketType: {
    id: string;
    name: string;
    price: number;
    includes_cover: boolean;
  };
  quantity: number;
}

export interface SaleResult {
  ticket_sale_id: string;
  ticket_number: string;
  total: number;
  cover_tokens: CoverToken[];
  /** Optional: cart snapshot used to render the receipt summary */
  __cartItems?: CartLine[];
}

interface TicketReceiptDialogProps {
  open: boolean;
  onClose: () => void;
  saleResult: SaleResult | null;
  /** Optional cart, fallback if SaleResult.__cartItems is absent */
  cartItems?: CartLine[];
  /** Triggered by "Reimprimir" — re-runs the 3-piece print sequence */
  onReprint?: () => void | Promise<void>;
}

export function TicketReceiptDialog({ open, onClose, saleResult, cartItems, onReprint }: TicketReceiptDialogProps) {
  const [currentTokenIndex, setCurrentTokenIndex] = useState(0);
  const [reprinting, setReprinting] = useState(false);

  if (!saleResult) return null;

  const lines: CartLine[] = saleResult.__cartItems || cartItems || [];
  const hasCoverTokens = saleResult.cover_tokens.length > 0;
  const currentToken = hasCoverTokens ? saleResult.cover_tokens[currentTokenIndex] : null;

  const handlePrev = () => setCurrentTokenIndex(p => Math.max(0, p - 1));
  const handleNext = () => setCurrentTokenIndex(p => Math.min(saleResult.cover_tokens.length - 1, p + 1));

  const handleReprint = async () => {
    if (!onReprint) {
      window.print();
      return;
    }
    setReprinting(true);
    try { await onReprint(); } finally { setReprinting(false); }
  };

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Check className="h-5 w-5 text-primary" />
            Venta {saleResult.ticket_number}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <Card className="p-4 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Número</span>
              <span className="font-mono font-bold">{saleResult.ticket_number}</span>
            </div>
            {lines.length > 0 && (
              <div className="border-t pt-3 space-y-2">
                {lines.map(item => (
                  <div key={item.ticketType.id} className="flex justify-between text-sm">
                    <span>{item.quantity}x {item.ticketType.name}</span>
                    <span>{formatCLP(item.ticketType.price * item.quantity)}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="border-t pt-3 flex justify-between font-bold">
              <span>Total</span>
              <span className="text-lg">{formatCLP(saleResult.total)}</span>
            </div>
          </Card>

          {hasCoverTokens && currentToken && (
            <Card className="p-4">
              <div className="text-center space-y-3">
                <div className="flex items-center justify-center gap-2">
                  <Wine className="h-4 w-4 text-primary" />
                  <span className="font-medium">QR Cover</span>
                  <Badge variant="secondary">
                    {currentTokenIndex + 1} / {saleResult.cover_tokens.length}
                  </Badge>
                </div>

                <p className="text-xs text-muted-foreground">
                  {currentToken.cocktail_name || currentToken.ticket_type}
                </p>

                <div className="flex items-center justify-center gap-2">
                  <Button variant="ghost" size="icon" onClick={handlePrev} disabled={currentTokenIndex === 0}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <div className="bg-white p-3 rounded-lg">
                    <QRCodeSVG value={`PICKUP:${currentToken.token}`} size={150} level="M" />
                  </div>
                  <Button variant="ghost" size="icon" onClick={handleNext} disabled={currentTokenIndex === saleResult.cover_tokens.length - 1}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>

                {currentToken.short_code && (
                  <p className="font-mono text-lg tracking-widest font-bold">
                    {currentToken.short_code}
                  </p>
                )}
                <p className="font-mono text-[10px] text-muted-foreground break-all">
                  {currentToken.token}
                </p>
              </div>
            </Card>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cerrar</Button>
          <Button onClick={handleReprint} disabled={reprinting}>
            <Printer className="h-4 w-4 mr-2" />
            {reprinting ? "Imprimiendo…" : "Reimprimir"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
