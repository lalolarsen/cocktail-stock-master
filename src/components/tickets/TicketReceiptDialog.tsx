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
  cocktail_id: string;
  ticket_type: string;
}

interface CartItem {
  ticketType: {
    id: string;
    name: string;
    price: number;
    includes_cover: boolean;
    cover_cocktail?: { name: string } | null;
  };
  quantity: number;
}

interface SaleResult {
  ticket_sale_id: string;
  ticket_number: string;
  total: number;
  cover_tokens: CoverToken[];
}

interface TicketReceiptDialogProps {
  open: boolean;
  onClose: () => void;
  saleResult: SaleResult | null;
  cartItems: CartItem[];
}

export function TicketReceiptDialog({ open, onClose, saleResult, cartItems }: TicketReceiptDialogProps) {
  const [currentTokenIndex, setCurrentTokenIndex] = useState(0);

  if (!saleResult) return null;

  const hasCoverTokens = saleResult.cover_tokens.length > 0;
  const currentToken = hasCoverTokens ? saleResult.cover_tokens[currentTokenIndex] : null;

  const handlePrevToken = () => {
    setCurrentTokenIndex(prev => Math.max(0, prev - 1));
  };

  const handleNextToken = () => {
    setCurrentTokenIndex(prev => Math.min(saleResult.cover_tokens.length - 1, prev + 1));
  };

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Check className="h-5 w-5 text-green-500" />
            Venta Completada
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Receipt Summary */}
          <Card className="p-4 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Número</span>
              <span className="font-mono font-bold">{saleResult.ticket_number}</span>
            </div>
            
            <div className="border-t pt-3 space-y-2">
              {cartItems.map(item => (
                <div key={item.ticketType.id} className="flex justify-between text-sm">
                  <span>{item.quantity}x {item.ticketType.name}</span>
                  <span>{formatCLP(item.ticketType.price * item.quantity)}</span>
                </div>
              ))}
            </div>

            <div className="border-t pt-3 flex justify-between font-bold">
              <span>Total</span>
              <span className="text-lg">{formatCLP(saleResult.total)}</span>
            </div>
          </Card>

          {/* Cover Tokens QR */}
          {hasCoverTokens && currentToken && (
            <Card className="p-4">
              <div className="text-center space-y-3">
                <div className="flex items-center justify-center gap-2">
                  <Wine className="h-4 w-4 text-purple-500" />
                  <span className="font-medium">QR Cover</span>
                  <Badge variant="secondary">
                    {currentTokenIndex + 1} / {saleResult.cover_tokens.length}
                  </Badge>
                </div>
                
                <p className="text-xs text-muted-foreground">
                  {currentToken.ticket_type}
                </p>

                <div className="flex items-center justify-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handlePrevToken}
                    disabled={currentTokenIndex === 0}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  
                  <div className="bg-white p-3 rounded-lg">
                    <QRCodeSVG
                      value={currentToken.token}
                      size={150}
                      level="M"
                    />
                  </div>
                  
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleNextToken}
                    disabled={currentTokenIndex === saleResult.cover_tokens.length - 1}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>

                <p className="font-mono text-xs text-muted-foreground">
                  {currentToken.token}
                </p>
              </div>
            </Card>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>
            Cerrar
          </Button>
          <Button onClick={() => window.print()}>
            <Printer className="h-4 w-4 mr-2" />
            Imprimir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
