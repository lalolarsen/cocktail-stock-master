import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Loader2, Ticket, Plus, Minus, CreditCard, Wine, QrCode, Clock, Check, LogOut, Store, Banknote } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { formatCLP } from "@/lib/currency";
import { QRCodeSVG } from "qrcode.react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { DemoWatermark } from "@/components/DemoWatermark";
import { useDemoLogging } from "@/hooks/useDemoLogging";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type PaymentMethodType = "cash" | "card";
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

interface RecentSale {
  id: string;
  ticket_number: string;
  created_at: string;
  cover_count: number;
}

interface POSTerminal {
  id: string;
  name: string;
  pos_type: string;
  is_cash_register: boolean;
}

type Step = "select-pos" | "select-tickets" | "success";

export default function Tickets() {
  const navigate = useNavigate();
  const { logDemoEvent, isDemoMode } = useDemoLogging();
  const [ticketTypes, setTicketTypes] = useState<TicketType[]>([]);
  const [cart, setCart] = useState<Map<string, CartItem>>(new Map());
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [saleResult, setSaleResult] = useState<SaleResult | null>(null);
  const [activeJornadaId, setActiveJornadaId] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("select-pos");
  
  // POS selection
  const [posTerminals, setPosTerminals] = useState<POSTerminal[]>([]);
  const [selectedPosId, setSelectedPosId] = useState<string>("");
  const [selectedPosName, setSelectedPosName] = useState<string>("");
  
  // Recent sales
  const [recentSales, setRecentSales] = useState<RecentSale[]>([]);
  const [selectedHistorySale, setSelectedHistorySale] = useState<string | null>(null);
  const [historyTokens, setHistoryTokens] = useState<Array<{ id: string; token: string; status: string; cocktail_name?: string }>>([]);
  const [loadingTokens, setLoadingTokens] = useState(false);
  
  // Payment method selection - undefined means not selected (placeholder state)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodType | undefined>(undefined);
  useEffect(() => {
    fetchPosTerminals();
    fetchActiveJornada();
  }, []);

  const fetchPosTerminals = async () => {
    try {
      const { data, error } = await supabase
        .from("pos_terminals")
        .select("id, name, pos_type, is_cash_register")
        .eq("is_active", true)
        .eq("pos_type", "ticket_sales") // Only ticket sales POS for this module
        .order("name");

      if (!error && data) {
        setPosTerminals(data);
        // Restore saved selection
        const savedPosId = localStorage.getItem("selectedTicketPosId");
        if (savedPosId && data.some(p => p.id === savedPosId)) {
          const pos = data.find(p => p.id === savedPosId);
          setSelectedPosId(savedPosId);
          setSelectedPosName(pos?.name || "");
        }
        // Auto-proceed if only one POS
        if (data.length === 1) {
          setSelectedPosId(data[0].id);
          setSelectedPosName(data[0].name);
        }
      }
    } catch (error) {
      console.error("Error fetching POS terminals:", error);
    } finally {
      setLoading(false);
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter" && cart.size > 0 && !processing && step === "select-tickets" && paymentMethod) {
        e.preventDefault();
        handleCheckout();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [cart, processing, step, paymentMethod]);

  const confirmPosSelection = () => {
    if (!selectedPosId) {
      toast.error("Selecciona una caja");
      return;
    }
    const pos = posTerminals.find(p => p.id === selectedPosId);
    if (pos) {
      setSelectedPosName(pos.name);
      localStorage.setItem("selectedTicketPosId", pos.id);
    }
    fetchTicketTypes();
    fetchRecentSales();
    setStep("select-tickets");
  };

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
      .eq("estado", "activa")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    
    setActiveJornadaId(data?.id || null);
  };

  const fetchRecentSales = async () => {
    try {
      const { data, error } = await supabase
        .from("ticket_sales")
        .select("id, ticket_number, created_at")
        .order("created_at", { ascending: false })
        .limit(5);

      if (error) throw error;
      
      // Get cover counts for each sale
      const salesWithCovers = await Promise.all(
        (data || []).map(async (sale) => {
          const { count } = await supabase
            .from("pickup_tokens")
            .select("*", { count: "exact", head: true })
            .eq("ticket_sale_id", sale.id);
          
          return { ...sale, cover_count: count || 0 };
        })
      );
      
      setRecentSales(salesWithCovers);
    } catch (error) {
      console.error("Error fetching recent sales:", error);
    }
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

  /**
   * Calculate total covers that will be generated.
   * Only ticket types with includes_cover=true AND valid cover_cocktail_id generate covers.
   */
  const getTotalCoversIncluded = () => {
    let total = 0;
    cart.forEach(item => {
      // Only count covers if includes_cover=true AND cover_cocktail_id exists
      if (item.ticketType.includes_cover && item.ticketType.cover_cocktail_id) {
        total += (item.ticketType.cover_quantity || 1) * item.quantity;
      }
    });
    return total;
  };

  const handleCheckout = async () => {
    if (cart.size === 0) {
      toast.error("El carrito está vacío");
      return;
    }

    if (!paymentMethod) {
      toast.error("Selecciona un método de pago");
      return;
    }

    setProcessing(true);

    try {
      // Build items payload - only ticket_type_id and quantity
      // Backend will determine covers based on ticket_type configuration
      const items = getCartItems().map(item => ({
        ticket_type_id: item.ticketType.id,
        quantity: item.quantity
      }));

      const { data, error } = await supabase.rpc("create_ticket_sale_with_covers", {
        p_items: items,
        p_payment_method: paymentMethod,
        p_jornada_id: activeJornadaId,
        p_pos_id: selectedPosId || null
      });

      if (error) throw error;
      
      const result = data as unknown as { success: boolean; error?: string; ticket_sale_id?: string; ticket_number?: string; total?: number; cover_tokens?: CoverToken[] };

      if (!result.success) {
        throw new Error(result.error || "Error al procesar venta");
      }

      // Record gross income entry
      const { data: session } = await supabase.auth.getSession();
      if (session.session?.user) {
        await supabase
          .from("gross_income_entries")
          .insert({
            venue_id: "00000000-0000-0000-0000-000000000000", // Will use profile venue
            source_type: "ticket",
            source_id: result.ticket_sale_id,
            amount: result.total!,
            description: `Entrada ${result.ticket_number}`,
            jornada_id: activeJornadaId,
            created_by: session.session.user.id
          });
      }

      toast.success(`Venta completada: ${result.ticket_number}`);
      
      // Log demo event for ticket sale
      if (isDemoMode) {
        const cartItems = getCartItems();
        for (const item of cartItems) {
          const hasCover = item.ticketType.includes_cover && item.ticketType.cover_cocktail_id;
          logDemoEvent({
            event_type: "ticket_sale",
            user_role: "ticket_seller",
            payload: {
              ticket_type: item.ticketType.name,
              quantity: item.quantity,
              cover_included: hasCover,
              cover_type: hasCover ? item.ticketType.cover_cocktail?.name : null,
              ticket_number: result.ticket_number,
              qr_count: hasCover ? (item.ticketType.cover_quantity || 1) * item.quantity : 0,
              qr_status: "generated",
            },
          });
        }
      }
      
      setSaleResult({
        ticket_sale_id: result.ticket_sale_id!,
        ticket_number: result.ticket_number!,
        total: result.total!,
        cover_tokens: result.cover_tokens || []
      });
      
      setStep("success");
      fetchRecentSales();
    } catch (error: any) {
      console.error("Checkout error:", error);
      toast.error(error.message || "Error al procesar la venta");
    } finally {
      setProcessing(false);
    }
  };

  const handleNewSale = () => {
    setCart(new Map());
    setSaleResult(null);
    setStep("select-tickets");
    setSelectedHistorySale(null);
    setPaymentMethod(undefined); // Reset payment method for new sale
  };

  const paymentMethodLabels: Record<PaymentMethodType, { label: string; icon: React.ReactNode }> = {
    cash: { label: "Efectivo", icon: <Banknote className="h-4 w-4" /> },
    card: { label: "Tarjeta", icon: <CreditCard className="h-4 w-4" /> },
  };

  const viewSaleQRs = async (saleId: string) => {
    if (selectedHistorySale === saleId) {
      setSelectedHistorySale(null);
      return;
    }
    
    setLoadingTokens(true);
    setSelectedHistorySale(saleId);
    
    try {
      const { data, error } = await supabase
        .from("pickup_tokens")
        .select(`
          id, 
          token, 
          status,
          cover_cocktail:cocktails(name)
        `)
        .eq("ticket_sale_id", saleId)
        .eq("source_type", "ticket");

      if (error) throw error;
      setHistoryTokens((data || []).map(t => ({
        id: t.id,
        token: t.token,
        status: t.status,
        cocktail_name: (t.cover_cocktail as any)?.name
      })));
    } catch (error) {
      console.error("Error fetching tokens:", error);
    } finally {
      setLoadingTokens(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // POS Selection Screen
  if (step === "select-pos") {
    return (
      <>
        {isDemoMode && <DemoWatermark />}
        <div className={`min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5 p-4 ${isDemoMode ? 'pt-14' : ''}`}>
          <div className="max-w-lg mx-auto space-y-6 pt-12">
            <div className="text-center space-y-2">
              <Ticket className="w-16 h-16 mx-auto text-primary" />
              <h1 className="text-3xl font-bold">Configurar Caja</h1>
              <p className="text-muted-foreground">Selecciona tu punto de venta de tickets</p>
            </div>

            <Card className="p-6 space-y-6">
              <div className="space-y-3">
                <p className="flex items-center gap-2 text-lg font-medium">
                  <Store className="w-5 h-5" />
                  Caja de Tickets
                </p>
                {posTerminals.length === 0 ? (
                  <div className="p-4 bg-muted rounded-lg text-center text-muted-foreground">
                    No hay cajas de tickets disponibles. Contacta al administrador.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {posTerminals.map((pos) => (
                      <Card
                        key={pos.id}
                        onClick={() => setSelectedPosId(pos.id)}
                        className={`p-4 cursor-pointer transition-all hover:scale-105 ${
                          selectedPosId === pos.id
                            ? "border-primary bg-primary/10 ring-2 ring-primary"
                            : "hover:border-primary/50"
                        }`}
                      >
                        <div className="text-center">
                          <Store className={`w-8 h-8 mx-auto mb-2 ${selectedPosId === pos.id ? "text-primary" : "text-muted-foreground"}`} />
                          <p className="font-semibold">{pos.name}</p>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </div>

              <Button
                onClick={confirmPosSelection}
                disabled={!selectedPosId || posTerminals.length === 0}
                className="w-full"
                size="lg"
              >
                Comenzar a Vender
              </Button>

              <Button
                variant="outline"
                onClick={async () => {
                  await supabase.auth.signOut();
                  navigate("/auth");
                }}
                className="w-full gap-2"
              >
                <LogOut className="h-4 w-4" />
                Cerrar Sesión
              </Button>
            </Card>
          </div>
        </div>
      </>
    );
  }

  // Success Screen
  if (step === "success" && saleResult) {
    return (
      <>
        {isDemoMode && <DemoWatermark />}
        <div className={`min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5 p-4 flex items-center justify-center ${isDemoMode ? 'pt-14' : ''}`}>
          <Card className="w-full max-w-lg p-6 text-center space-y-6">
            <div className="flex items-center justify-center gap-2 text-green-600">
              <Check className="h-8 w-8" />
              <span className="text-2xl font-bold">Venta Completada</span>
            </div>
          
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Número de ticket</p>
            <p className="text-3xl font-mono font-bold">{saleResult.ticket_number}</p>
            <p className="text-lg font-semibold text-primary">{formatCLP(saleResult.total)}</p>
          </div>

          {saleResult.cover_tokens.length > 0 && (
            <div className="space-y-4">
              <p className="text-sm font-medium text-muted-foreground">
                Códigos QR de Cover ({saleResult.cover_tokens.length})
              </p>
              <ScrollArea className="h-[300px]">
                <div className="grid gap-4">
                  {saleResult.cover_tokens.map((token) => (
                    <div key={token.token_id} className="p-4 border rounded-lg bg-card">
                      <p className="text-sm font-medium mb-2">{token.ticket_type}</p>
                      <div className="flex justify-center bg-white p-4 rounded-lg">
                        <QRCodeSVG value={token.token} size={150} level="M" />
                      </div>
                      <p className="font-mono text-xs text-muted-foreground mt-2">{token.token}</p>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}

          <Button size="lg" className="w-full" onClick={handleNewSale}>
            Nueva Venta
          </Button>
        </Card>
      </div>
      </>
    );
  }

  // Main ticket selection screen
  const coversIncluded = getTotalCoversIncluded();

  return (
    <>
      {isDemoMode && <DemoWatermark />}
      <div className={`min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5 ${isDemoMode ? 'pt-14' : ''}`}>
        <div className="flex flex-col lg:flex-row min-h-screen">
          {/* Left: Ticket Grid (70%) */}
          <div className="flex-1 lg:w-[70%] p-4 space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Ticket className="h-7 w-7 text-primary" />
                <div>
                  <h1 className="text-2xl font-bold">Venta de Entradas</h1>
                  {selectedPosName && (
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <Store className="h-3 w-3" />
                      {selectedPosName}
                    </p>
                  )}
                </div>
                {isDemoMode && (
                  <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300">
                    Ticket Seller
                  </Badge>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  await supabase.auth.signOut();
                  setCart(new Map());
                  setSaleResult(null);
                  navigate("/auth");
                }}
                className="gap-2"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">Salir</span>
              </Button>
            </div>

          {/* Ticket Types Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            {ticketTypes.map(ticketType => {
              const cartItem = cart.get(ticketType.id);
              const quantity = cartItem?.quantity || 0;
              // Only show cover badge if includes_cover=true AND has a valid cocktail
              const hasCover = ticketType.includes_cover && ticketType.cover_cocktail_id;

              return (
                <Card 
                  key={ticketType.id} 
                  className={`transition-all cursor-pointer hover:shadow-md ${quantity > 0 ? 'ring-2 ring-primary shadow-md' : ''}`}
                  onClick={() => addToCart(ticketType)}
                >
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="font-bold text-lg leading-tight">{ticketType.name}</h3>
                        {hasCover && (
                          <Badge variant="secondary" className="mt-1 text-xs">
                            <Wine className="h-3 w-3 mr-1" />
                            {ticketType.cover_quantity || 1} Cover
                          </Badge>
                        )}
                      </div>
                    </div>
                    
                    <p className="text-2xl font-bold text-primary">
                      {formatCLP(ticketType.price)}
                    </p>
                    
                    {quantity > 0 && (
                      <div className="flex items-center justify-between pt-2 border-t">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-10 w-10"
                          onClick={(e) => { e.stopPropagation(); removeFromCart(ticketType.id); }}
                        >
                          <Minus className="h-5 w-5" />
                        </Button>
                        <span className="text-xl font-bold">{quantity}</span>
                        <Button
                          size="icon"
                          className="h-10 w-10"
                          onClick={(e) => { e.stopPropagation(); addToCart(ticketType); }}
                        >
                          <Plus className="h-5 w-5" />
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {ticketTypes.length === 0 && (
            <Card className="p-8 text-center">
              <Ticket className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No hay tipos de entrada configurados</p>
            </Card>
          )}
        </div>

        {/* Right: Cart & History (30%) */}
        <div className="lg:w-[30%] bg-card border-l p-4 flex flex-col gap-4">
          {/* Cart */}
          <Card className="flex-1">
            <CardContent className="p-4 flex flex-col h-full">
              <h2 className="font-bold text-lg mb-4">Carrito</h2>
              
              {cart.size === 0 ? (
                <div className="flex-1 flex items-center justify-center text-muted-foreground">
                  <p className="text-sm">Toca una entrada para agregar</p>
                </div>
              ) : (
                <>
                  <ScrollArea className="flex-1 mb-4">
                    <div className="space-y-2">
                      {getCartItems().map(item => {
                        const hasCover = item.ticketType.includes_cover && item.ticketType.cover_cocktail_id;
                        return (
                          <div key={item.ticketType.id} className="flex items-center justify-between p-2 bg-muted/50 rounded">
                            <div className="flex-1">
                              <p className="font-medium text-sm">{item.ticketType.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {formatCLP(item.ticketType.price)}
                                {hasCover && (
                                  <span className="ml-1 text-primary">
                                    (+{(item.ticketType.cover_quantity || 1) * item.quantity} QR)
                                  </span>
                                )}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => removeFromCart(item.ticketType.id)}
                              >
                                <Minus className="h-4 w-4" />
                              </Button>
                              <span className="w-6 text-center font-bold">{item.quantity}</span>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => addToCart(item.ticketType)}
                              >
                                <Plus className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>

                  <div className="border-t pt-4 space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Total</span>
                      <span className="text-2xl font-bold">{formatCLP(getCartTotal())}</span>
                    </div>

                    {coversIncluded > 0 && (
                      <p className="text-xs text-center text-primary flex items-center justify-center gap-1">
                        <QrCode className="h-3 w-3" />
                        Incluye {coversIncluded} código{coversIncluded > 1 ? 's' : ''} QR de cover
                      </p>
                    )}

                    {/* Payment Method Selection */}
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Método de Pago *</label>
                      <Select
                        value={paymentMethod ?? ""}
                        onValueChange={(value) => {
                          if (value) {
                            setPaymentMethod(value as PaymentMethodType);
                          }
                        }}
                      >
                        <SelectTrigger className={!paymentMethod ? "text-muted-foreground" : ""}>
                          <SelectValue placeholder="Seleccionar método">
                            {paymentMethod && (
                              <span className="flex items-center gap-2">
                                {paymentMethodLabels[paymentMethod].icon}
                                {paymentMethodLabels[paymentMethod].label}
                              </span>
                            )}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="cash">
                            <span className="flex items-center gap-2">
                              <Banknote className="h-4 w-4" />
                              Efectivo
                            </span>
                          </SelectItem>
                          <SelectItem value="card">
                            <span className="flex items-center gap-2">
                              <CreditCard className="h-4 w-4" />
                              Tarjeta
                            </span>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <Button
                      size="lg"
                      className="w-full h-12"
                      onClick={handleCheckout}
                      disabled={processing || cart.size === 0 || !paymentMethod}
                    >
                      {processing ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <>
                          {paymentMethod ? paymentMethodLabels[paymentMethod].icon : <CreditCard className="h-5 w-5" />}
                          <span className="ml-2">Cobrar</span>
                        </>
                      )}
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Recent Sales */}
          <Card>
            <CardContent className="p-4">
              <h3 className="font-bold text-sm mb-3 flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Ventas Recientes
              </h3>
              
              {recentSales.length === 0 ? (
                <p className="text-xs text-muted-foreground">Sin ventas recientes</p>
              ) : (
                <div className="space-y-2">
                  {recentSales.map(sale => (
                    <div key={sale.id}>
                      <div 
                        className="flex items-center justify-between p-2 rounded hover:bg-muted/50 cursor-pointer text-sm"
                        onClick={() => viewSaleQRs(sale.id)}
                      >
                        <div>
                          <span className="font-mono font-medium">{sale.ticket_number}</span>
                          <span className="text-xs text-muted-foreground ml-2">
                            {format(new Date(sale.created_at), "HH:mm", { locale: es })}
                          </span>
                        </div>
                        {sale.cover_count > 0 && (
                          <Badge variant="outline" className="text-xs">
                            <QrCode className="h-3 w-3 mr-1" />
                            {sale.cover_count}
                          </Badge>
                        )}
                      </div>
                      
                      {/* Expanded QR view */}
                      {selectedHistorySale === sale.id && (
                        <div className="mt-2 p-2 bg-muted/30 rounded">
                          {loadingTokens ? (
                            <div className="flex justify-center py-2">
                              <Loader2 className="h-4 w-4 animate-spin" />
                            </div>
                          ) : historyTokens.length === 0 ? (
                            <p className="text-xs text-muted-foreground text-center">Sin códigos de cover</p>
                          ) : (
                            <div className="space-y-2">
                              {historyTokens.map(token => (
                                <div 
                                  key={token.id}
                                  className={`p-2 bg-card rounded border text-center ${token.status === 'redeemed' ? 'opacity-60' : ''}`}
                                >
                                  <p className="text-xs font-medium mb-1">{token.cocktail_name || "Cover"}</p>
                                  <div className="flex justify-center bg-white p-2 rounded">
                                    <QRCodeSVG value={token.token} size={80} level="L" />
                                  </div>
                                  <Badge 
                                    variant={token.status === 'issued' ? 'default' : 'secondary'}
                                    className="text-xs mt-1"
                                  >
                                    {token.status === 'issued' ? 'Válido' : token.status === 'redeemed' ? 'Usado' : token.status}
                                  </Badge>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
    </>
  );
}
