import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { formatCLP } from "@/lib/currency";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Loader2, QrCode, Ticket, RefreshCw } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

interface TicketSale {
  id: string;
  ticket_number: string;
  total: number;
  created_at: string;
  payment_status: string;
}

interface TicketHistoryDialogProps {
  open: boolean;
  onClose: () => void;
}

export function TicketHistoryDialog({ open, onClose }: TicketHistoryDialogProps) {
  const [sales, setSales] = useState<TicketSale[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedSale, setSelectedSale] = useState<string | null>(null);
  const [tokens, setTokens] = useState<Array<{ id: string; token: string; status: string }>>([]);
  const [loadingTokens, setLoadingTokens] = useState(false);

  useEffect(() => {
    if (open) {
      fetchSales();
    }
  }, [open]);

  const fetchSales = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("ticket_sales")
        .select("id, ticket_number, total, created_at, payment_status")
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) throw error;
      setSales(data || []);
    } catch (error) {
      console.error("Error fetching sales:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTokens = async (ticketSaleId: string) => {
    setLoadingTokens(true);
    setSelectedSale(ticketSaleId);
    try {
      const { data, error } = await supabase
        .from("pickup_tokens")
        .select("id, token, status")
        .eq("ticket_sale_id", ticketSaleId)
        .eq("source_type", "ticket");

      if (error) throw error;
      setTokens(data || []);
    } catch (error) {
      console.error("Error fetching tokens:", error);
    } finally {
      setLoadingTokens(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-lg max-h-[80vh]">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <Ticket className="h-5 w-5" />
              Historial de Ventas
            </DialogTitle>
            <Button variant="ghost" size="icon" onClick={fetchSales}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </DialogHeader>

        <ScrollArea className="h-[60vh] pr-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : sales.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No hay ventas recientes
            </div>
          ) : (
            <div className="space-y-3">
              {sales.map(sale => (
                <Card key={sale.id} className="p-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-mono font-bold text-sm">{sale.ticket_number}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(sale.created_at), "dd MMM HH:mm", { locale: es })}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold">{formatCLP(sale.total)}</p>
                      <Badge variant={sale.payment_status === "paid" ? "default" : "secondary"}>
                        {sale.payment_status === "paid" ? "Pagado" : sale.payment_status}
                      </Badge>
                    </div>
                  </div>

                  <div className="mt-2 pt-2 border-t">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start"
                      onClick={() => fetchTokens(sale.id)}
                    >
                      <QrCode className="h-4 w-4 mr-2" />
                      Ver códigos QR
                    </Button>

                    {selectedSale === sale.id && (
                      <div className="mt-2 space-y-2">
                        {loadingTokens ? (
                          <div className="flex justify-center py-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                          </div>
                        ) : tokens.length === 0 ? (
                          <p className="text-xs text-muted-foreground text-center py-2">
                            Sin códigos de cover
                          </p>
                        ) : (
                          <div className="grid grid-cols-2 gap-2">
                            {tokens.map(token => (
                              <div 
                                key={token.id} 
                                className={`p-2 rounded border text-center ${
                                  token.status === 'redeemed' ? 'bg-muted opacity-60' : 'bg-background'
                                }`}
                              >
                                <div className="flex justify-center mb-1">
                                  <QRCodeSVG value={token.token} size={60} level="L" />
                                </div>
                                <Badge 
                                  variant={token.status === 'issued' ? 'default' : 'secondary'}
                                  className="text-xs"
                                >
                                  {token.status === 'issued' ? 'Válido' : 
                                   token.status === 'redeemed' ? 'Usado' : token.status}
                                </Badge>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
