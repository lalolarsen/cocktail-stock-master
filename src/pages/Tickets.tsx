import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Ticket, Plus, Minus, CreditCard, History, Wine, QrCode } from "lucide-react";
import { formatCLP } from "@/lib/currency";
import { TicketReceiptDialog } from "@/components/tickets/TicketReceiptDialog";
import { TicketHistoryDialog } from "@/components/tickets/TicketHistoryDialog";

interface TicketType {
  id: string;
  name: string;
  price: number;
  includes_cover: boolean;
  cover_cocktail_id: string | null;
  cover_quantity: number;
  cover_cocktail?: { name: string } | null;
}

interface CartItem {
  ticketType: TicketType;
  quantity: number;
}

interface CoverToken {
  token_id: string;
  token: string;
  cocktail_id: string;
  ticket_type: string;
}

interface SaleResult {
  ticket_sale_id: string;
  ticket_number: string;
  total: number;
  cover_tokens: CoverToken[];
}

export default function Tickets() {
  const [ticketTypes, setTicketTypes] = useState<TicketType[]>([]);
  const [cart, setCart] = useState<Map<string, CartItem>>(new Map());
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [saleResult, setSaleResult] = useState<SaleResult | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [activeJornadaId, setActiveJornadaId] = useState<string | null>(null);

  useEffect(() => {
    fetchTicketTypes();
    fetchActiveJornada();
  }, []);

  const fetchTicketTypes = async () => {
    try {
      const { data, error } = await supabase
        .from("ticket_types")
        .select(`
          id,
          name,
          price,
          includes_cover,
          cover_cocktail_id,
          cover_quantity,
          cover_cocktail:cocktails(name)
        `)
        .eq("is_active", true)
        .order("price", { ascending: true });

      if (error) throw error;
      setTicketTypes(data || []);
    } catch (error: any) {
      console.error("Error fetching ticket types:", error);
      toast.error("Error al cargar tipos de entrada");
    } finally {
      setLoading(false);
    }
  };

  const fetchActiveJornada = async () => {
    const { data } = await supabase
      .from("jornadas")
      .select("id")
      .eq("estado", "abierta")
      .limit(1)
      .single();
    
    setActiveJornadaId(data?.id || null);
  };

  const addToCart = (ticketType: TicketType) => {
    setCart(prev => {
      const newCart = new Map(prev);
      const existing = newCart.get(ticketType.id);
      if (existing) {
        newCart.set(ticketType.id, { ...existing, quantity: existing.quantity + 1 });
      } else {
        newCart.set(ticketType.id, { ticketType, quantity: 1 });
      }
      return newCart;
    });
  };

  const removeFromCart = (ticketTypeId: string) => {
    setCart(prev => {
      const newCart = new Map(prev);
      const existing = newCart.get(ticketTypeId);
      if (existing && existing.quantity > 1) {
        newCart.set(ticketTypeId, { ...existing, quantity: existing.quantity - 1 });
      } else {
        newCart.delete(ticketTypeId);
      }
      return newCart;
    });
  };

  const getCartTotal = () => {
    let total = 0;
    cart.forEach(item => {
      total += item.ticketType.price * item.quantity;
    });
    return total;
  };

  const getCartItems = () => {
    return Array.from(cart.values());
  };

  const handleCheckout = async () => {
    if (cart.size === 0) {
      toast.error("El carrito está vacío");
      return;
    }

    setProcessing(true);

    try {
      const items = getCartItems().map(item => ({
        ticket_type_id: item.ticketType.id,
        quantity: item.quantity
      }));

      const { data, error } = await supabase.rpc("create_ticket_sale_with_covers", {
        p_items: items,
        p_payment_method: "cash",
        p_jornada_id: activeJornadaId
      });

      if (error) throw error;
      
      const result = data as unknown as { success: boolean; error?: string; ticket_sale_id?: string; ticket_number?: string; total?: number; cover_tokens?: CoverToken[] };

      if (!result.success) {
        throw new Error(result.error || "Error al procesar venta");
      }

      toast.success(`Venta completada: ${result.ticket_number}`);
      
      setSaleResult({
        ticket_sale_id: result.ticket_sale_id!,
        ticket_number: result.ticket_number!,
        total: result.total!,
        cover_tokens: result.cover_tokens || []
      });
      
      setCart(new Map());
    } catch (error: any) {
      console.error("Checkout error:", error);
      toast.error(error.message || "Error al procesar la venta");
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5 p-4">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Ticket className="h-8 w-8 text-primary" />
            <h1 className="text-2xl font-bold">Venta de Entradas</h1>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowHistory(true)}
          >
            <History className="h-4 w-4 mr-2" />
            Historial
          </Button>
        </div>

        {/* Ticket Types Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {ticketTypes.map(ticketType => {
            const cartItem = cart.get(ticketType.id);
            const quantity = cartItem?.quantity || 0;

            return (
              <Card 
                key={ticketType.id} 
                className={`transition-all ${quantity > 0 ? 'ring-2 ring-primary' : ''}`}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-lg">{ticketType.name}</CardTitle>
                    {ticketType.includes_cover && (
                      <Badge variant="secondary" className="flex items-center gap-1">
                        <Wine className="h-3 w-3" />
                        Cover
                      </Badge>
                    )}
                  </div>
                  {ticketType.includes_cover && ticketType.cover_cocktail && (
                    <p className="text-xs text-muted-foreground">
                      Incluye: {ticketType.cover_quantity}x {ticketType.cover_cocktail.name}
                    </p>
                  )}
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <span className="text-2xl font-bold text-primary">
                      {formatCLP(ticketType.price)}
                    </span>
                    
                    <div className="flex items-center gap-2">
                      {quantity > 0 && (
                        <>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => removeFromCart(ticketType.id)}
                          >
                            <Minus className="h-4 w-4" />
                          </Button>
                          <span className="w-8 text-center font-bold">{quantity}</span>
                        </>
                      )}
                      <Button
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => addToCart(ticketType)}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {ticketTypes.length === 0 && (
          <Card className="p-8 text-center">
            <Ticket className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              No hay tipos de entrada configurados
            </p>
          </Card>
        )}

        {/* Cart Summary */}
        {cart.size > 0 && (
          <Card className="fixed bottom-4 left-4 right-4 max-w-4xl mx-auto shadow-lg border-primary/20">
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">
                    {getCartItems().reduce((sum, item) => sum + item.quantity, 0)} entrada(s)
                  </p>
                  <p className="text-2xl font-bold">{formatCLP(getCartTotal())}</p>
                </div>
                <Button
                  size="lg"
                  onClick={handleCheckout}
                  disabled={processing}
                  className="min-w-[150px]"
                >
                  {processing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <CreditCard className="h-4 w-4 mr-2" />
                      Cobrar
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Spacer for fixed cart */}
        {cart.size > 0 && <div className="h-24" />}
      </div>

      {/* Receipt Dialog */}
      <TicketReceiptDialog
        open={!!saleResult}
        onClose={() => setSaleResult(null)}
        saleResult={saleResult}
        cartItems={getCartItems()}
      />

      {/* History Dialog */}
      <TicketHistoryDialog
        open={showHistory}
        onClose={() => setShowHistory(false)}
      />
    </div>
  );
}
