import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, ShoppingCart, LogOut, CreditCard, Banknote, MapPin, Store, Plus, Minus, Trash2, Clock, Check, AlertCircle, FileCheck, QrCode, X, Undo2 } from "lucide-react";
import { CategoryProductGrid } from "@/components/sales/CategoryProductGrid";
import { AddonSelector, type SelectedAddon } from "@/components/sales/AddonSelector";
import { useNavigate } from "react-router-dom";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatCLP } from "@/lib/currency";
import WorkerPinDialog from "@/components/WorkerPinDialog";
import PickupQRDialog from "@/components/PickupQRDialog";
import { issueDocument, type DocumentType } from "@/lib/invoicing/index";
import { useAppSession } from "@/contexts/AppSessionContext";
import { useReceiptConfig } from "@/hooks/useReceiptConfig";
import { useActiveVenue } from "@/hooks/useActiveVenue";
import { VenueGuard } from "@/components/VenueGuard";
import { VenueIndicator } from "@/components/VenueIndicator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Cocktail = {
  id: string;
  name: string;
  price: number;
  category: string;
};

type CartItem = {
  cocktail: Cocktail;
  quantity: number;
  addons: SelectedAddon[];
};

type POSTerminal = {
  id: string;
  name: string;
  location_id: string;
  is_active: boolean;
  pos_type: string;
  is_cash_register: boolean;
};

// BarLocation removed - bar is determined at redemption time, not at sale

export default function Sales() {
  const { activeJornadaId, hasActiveJornada } = useAppSession();
  const { receiptMode, isLoading: isLoadingConfig } = useReceiptConfig();
  const { venue } = useActiveVenue();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [lastRemovedItem, setLastRemovedItem] = useState<CartItem | null>(null);
  const [pointOfSale, setPointOfSale] = useState("");
  const [loading, setLoading] = useState(false);
  const [issuingDocument, setIssuingDocument] = useState(false);
  const [recentSales, setRecentSales] = useState<any[]>([]);
  const [isVerified, setIsVerified] = useState(true);
  const [showPinDialog, setShowPinDialog] = useState(false);
  const [shouldRedirect, setShouldRedirect] = useState(false);
  const [documentType, setDocumentType] = useState<DocumentType>("boleta");
  // Simplified to card (external POS) or cash (internal receipt)
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card">("cash");
  
  // Multi-POS selection (bar is determined at redemption, not sale)
  const [posTerminals, setPosTerminals] = useState<POSTerminal[]>([]);
  const [selectedPosId, setSelectedPosId] = useState<string>("");
  const [showPosSelection, setShowPosSelection] = useState(true);
  
  // Clear cart confirmation
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  
  // Success screen state
  const [showSuccessScreen, setShowSuccessScreen] = useState(false);
  const [lastSaleData, setLastSaleData] = useState<{
    saleNumber: string;
    total: number;
    pickupData?: {
      token: string;
      expiresAt: string;
      items: Array<{ name: string; quantity: number; price: number }>;
      barName?: string;
    };
  } | null>(null);
  
  // Pickup QR state (for viewing recent sales QR)
  const [showPickupQR, setShowPickupQR] = useState(false);
  const [pickupQRData, setPickupQRData] = useState<{
    token: string;
    saleNumber: string;
    expiresAt: string;
    items: Array<{ name: string; quantity: number; price: number }>;
    total: number;
    barName?: string;
  } | null>(null);
  
  const navigate = useNavigate();
  const cartScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (shouldRedirect) {
      navigate("/auth", { replace: true });
    }
  }, [shouldRedirect, navigate]);

  // Fetch POS terminals on mount
  useEffect(() => {
    fetchPosTerminals();
    
    // Restore last used POS selection from localStorage
    const savedPosId = localStorage.getItem("selectedPosId");
    if (savedPosId) setSelectedPosId(savedPosId);
  }, []);

  useEffect(() => {
    if (isVerified && !showPosSelection && venue?.id) {
      fetchRecentSales();
      fetchUserPointOfSale();
    }
  }, [isVerified, showPosSelection, venue?.id]);

  // Save POS selection to localStorage
  useEffect(() => {
    if (selectedPosId) localStorage.setItem("selectedPosId", selectedPosId);
  }, [selectedPosId]);

  // Auto-scroll to last added item
  useEffect(() => {
    if (cartScrollRef.current && cart.length > 0) {
      cartScrollRef.current.scrollTop = cartScrollRef.current.scrollHeight;
    }
  }, [cart.length]);

  // Keyboard shortcuts
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Don't trigger if user is typing in an input or dialog is open
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) {
      return;
    }
    
    if (e.key === "Enter" && cart.length > 0 && !loading && !showSuccessScreen) {
      e.preventDefault();
      processSale();
    }
    
    if (e.key === "Escape" && cart.length > 0 && !loading && !showSuccessScreen) {
      e.preventDefault();
      setShowClearConfirm(true);
    }
  }, [cart.length, loading, showSuccessScreen]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const fetchPosTerminals = async () => {
    const { data, error } = await supabase
      .from("pos_terminals")
      .select("*")
      .eq("is_active", true)
      .eq("pos_type", "alcohol_sales") // Only alcohol sales POS for this module
      .order("name");
    
    if (!error && data) {
      setPosTerminals(data);
      if (data.length === 1) {
        setSelectedPosId(data[0].id);
      }
      const savedPosId = localStorage.getItem("selectedPosId");
      // Only restore if it's an alcohol_sales POS
      if (savedPosId && data.some(p => p.id === savedPosId)) {
        setSelectedPosId(savedPosId);
      } else if (data.length > 0 && !savedPosId) {
        // If no saved selection but terminals exist, don't auto-select
      }
    }
  };

  // Bar is determined at redemption time, not at sale
  const fetchUserPointOfSale = async () => {
    const { data: session } = await supabase.auth.getSession();
    if (!session.session?.user) return;

    const { data, error } = await supabase
      .from("profiles")
      .select("point_of_sale")
      .eq("id", session.session.user.id)
      .single();

    if (!error && data?.point_of_sale) {
      setPointOfSale(data.point_of_sale);
    }
  };

  // Cached cocktails query
  const { data: cocktails = [] } = useQuery({
    queryKey: ["cocktails-pos", venue?.id],
    queryFn: async () => {
      if (!venue?.id) return [];
      const { data, error } = await supabase
        .from("cocktails")
        .select("*")
        .eq("venue_id", venue.id)
        .order("name");
      if (error) {
        toast.error("Error al cargar productos");
        return [];
      }
      return (data || []) as Cocktail[];
    },
    enabled: !!venue?.id && isVerified && !showPosSelection,
    staleTime: 5 * 60 * 1000, // 5 min cache
  });

  const fetchRecentSales = async () => {
    const { data: session } = await supabase.auth.getSession();
    if (!session.session?.user) return;

    const { data, error } = await supabase
      .from("sales")
      .select(`
        id,
        sale_number,
        created_at,
        total_amount,
        payment_method,
        receipt_source,
        sale_items(
          quantity,
          unit_price,
          cocktails(name)
        ),
        sales_documents(
          id,
          status,
          document_type
        )
      `)
      .eq("seller_id", session.session.user.id)
      .eq("is_cancelled", false)
      .order("created_at", { ascending: false })
      .limit(5);

    if (!error && data) {
      setRecentSales(data);
    }
  };

  const addToCart = (cocktail: Cocktail) => {
    // Don't add products without price
    if (!cocktail.price || cocktail.price <= 0) return;
    setLastRemovedItem(null); // clear undo on new add
    const existing = cart.find((item) => item.cocktail.id === cocktail.id);
    if (existing) {
      setCart(
        cart.map((item) =>
          item.cocktail.id === cocktail.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        )
      );
    } else {
      setCart([...cart, { cocktail, quantity: 1, addons: [] }]);
    }
  };

  const updateCartItemAddons = (cocktailId: string, addons: SelectedAddon[]) => {
    setCart(
      cart.map((item) =>
        item.cocktail.id === cocktailId ? { ...item, addons } : item
      )
    );
  };

  const decreaseQuantity = (cocktailId: string) => {
    const item = cart.find((i) => i.cocktail.id === cocktailId);
    if (item && item.quantity > 1) {
      setCart(
        cart.map((i) =>
          i.cocktail.id === cocktailId ? { ...i, quantity: i.quantity - 1 } : i
        )
      );
    } else if (item) {
      setLastRemovedItem(item);
      setCart(cart.filter((i) => i.cocktail.id !== cocktailId));
    }
  };

  const increaseQuantity = (cocktailId: string) => {
    setCart(
      cart.map((item) =>
        item.cocktail.id === cocktailId
          ? { ...item, quantity: item.quantity + 1 }
          : item
      )
    );
  };

  const undoLastRemove = () => {
    if (lastRemovedItem) {
      setCart((prev) => [...prev, lastRemovedItem]);
      setLastRemovedItem(null);
    }
  };

  const clearCart = () => {
    setCart([]);
    setLastRemovedItem(null);
    setShowClearConfirm(false);
  };

  const calculateTotal = () => {
    return cart.reduce((sum, item) => {
      const basePrice = item.cocktail.price * item.quantity;
      const addonsPrice = item.addons.reduce((a, addon) => a + addon.price, 0) * item.quantity;
      return sum + basePrice + addonsPrice;
    }, 0);
  };

  const confirmPosSelection = () => {
    if (!selectedPosId) {
      toast.error("Selecciona una caja");
      return;
    }
    
    const selectedPos = posTerminals.find(p => p.id === selectedPosId);
    if (selectedPos) {
      setPointOfSale(selectedPos.name);
    }
    
    setShowPosSelection(false);
  };

  const processSale = async () => {
    if (cart.length === 0) {
      toast.error("El carrito está vacío");
      return;
    }

    if (!selectedPosId) {
      toast.error("Selecciona una caja");
      return;
    }

    // CRITICAL: Block sales if no open jornada (jornada_id is now NOT NULL)
    if (!hasActiveJornada || !activeJornadaId) {
      toast.error("No hay jornada abierta. Contacta a un administrador.");
      return;
    }

    setLoading(true);
    setIssuingDocument(true);

    const cartItemsForQR = cart.map((item) => ({
      name: item.cocktail.name,
      quantity: item.quantity,
      price: item.cocktail.price,
      addons: item.addons.map(a => a.name),
    }));

    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session?.user) throw new Error("No autenticado");

      const selectedPos = posTerminals.find(p => p.id === selectedPosId);
      const posPrefix = selectedPos?.name.substring(0, 3).toUpperCase() || "POS";
      
      const { data: saleNumberData, error: seqError } = await supabase.rpc("generate_sale_number", { p_pos_prefix: posPrefix });
      if (seqError) throw seqError;
      const saleNumber = saleNumberData as string;
      const totalAmount = calculateTotal();

      // Card = external POS handles receipt in hybrid mode, internal in unified mode
      // Cash = always internal receipt
      const isCardPayment = paymentMethod === "card";
      const shouldIssueInternally = receiptMode === "unified" || !isCardPayment;
      const receiptSource = (isCardPayment && receiptMode === "hybrid") ? "external" : "internal";
      // Payment method is now directly compatible with DB enum (cash | card)
      const dbPaymentMethod = paymentMethod;

      const { data: sale, error: saleError } = await supabase
        .from("sales")
        .insert({
          sale_number: saleNumber,
          seller_id: session.session.user.id,
          total_amount: totalAmount,
          point_of_sale: pointOfSale || selectedPos?.name || "POS",
          payment_method: dbPaymentMethod,
          payment_status: "paid",
          pos_id: selectedPosId,
          bar_location_id: null, // Bar determined at redemption
          jornada_id: activeJornadaId, // Required: NOT NULL
          receipt_source: receiptSource,
          sale_category: "alcohol", // Alcohol sales module
          venue_id: venue?.id!,
        })
        .select()
        .single();

      if (saleError) throw saleError;

      const saleItems = cart.map((item) => ({
        sale_id: sale.id,
        cocktail_id: item.cocktail.id,
        quantity: item.quantity,
        unit_price: item.cocktail.price,
        subtotal: (item.cocktail.price + item.addons.reduce((a, addon) => a + addon.price, 0)) * item.quantity,
        venue_id: venue?.id,
      }));

      const { data: insertedItems, error: itemsError } = await supabase
        .from("sale_items")
        .insert(saleItems)
        .select("id, cocktail_id");

      if (itemsError) throw itemsError;

      // Insert add-ons for each sale item
      const itemAddonsToInsert: Array<{
        sale_item_id: string;
        addon_id: string;
        addon_name: string;
        price_modifier: number;
      }> = [];

      for (const insertedItem of (insertedItems || [])) {
        const cartItem = cart.find(c => c.cocktail.id === insertedItem.cocktail_id);
        if (cartItem && cartItem.addons.length > 0) {
          for (const addon of cartItem.addons) {
            itemAddonsToInsert.push({
              sale_item_id: insertedItem.id,
              addon_id: addon.id,
              addon_name: addon.name,
              price_modifier: addon.price,
            });
          }
        }
      }

      if (itemAddonsToInsert.length > 0) {
        const { error: addonsError } = await supabase
          .from("sale_item_addons")
          .insert(itemAddonsToInsert);
        if (addonsError) {
          console.warn("Error inserting sale item addons:", addonsError);
          // Non-blocking - continue with sale
        }
      }

      // Record gross income entry
      await supabase
        .from("gross_income_entries")
        .insert({
          venue_id: sale.venue_id || "00000000-0000-0000-0000-000000000000",
          source_type: "sale",
          source_id: sale.id,
          amount: Math.round(totalAmount),
          description: `Venta ${saleNumber}`,
          jornada_id: activeJornadaId || null,
          created_by: session.session.user.id
        });

      // Issue receipt based on config mode:
      // - hybrid: only cash issues receipt internally
      // - unified: both cash and card issue receipt internally
      let receiptStatus: "issued" | "pending" | "failed" | "skipped" = "skipped";
      if (shouldIssueInternally) {
        // Attempt to issue receipt (non-blocking)
        const docResult = await issueDocument(sale.id, documentType);
        const docLabel = documentType === "boleta" ? "Boleta" : "Factura";
        
        if (docResult.success) {
          receiptStatus = "issued";
        } else {
          receiptStatus = "failed";
          console.warn(`${docLabel} pendiente: ${docResult.errorMessage}`);
          toast.warning(`${docLabel} no emitida. Puede reintentar desde Documentos.`);
        }
      }

      // Generate pickup QR token
      let pickupData: typeof lastSaleData["pickupData"] = undefined;
      const { data: tokenResult, error: tokenError } = await supabase.rpc(
        "generate_pickup_token",
        { p_sale_id: sale.id }
      );

      if (!tokenError && tokenResult) {
        const result = tokenResult as { success: boolean; token?: string; expires_at?: string; bar_name?: string };
        if (result.success && result.token) {
          pickupData = {
            token: result.token,
            expiresAt: result.expires_at || new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
            items: cartItemsForQR,
            barName: undefined, // Bar determined at redemption
          };
        }
      }

      // Show success screen
      setLastSaleData({
        saleNumber,
        total: totalAmount,
        pickupData,
      });
      setShowSuccessScreen(true);
      setCart([]);
      fetchRecentSales();
    } catch (error: any) {
      toast.error(error.message || "Error al procesar la venta");
    } finally {
      setLoading(false);
      setIssuingDocument(false);
    }
  };

  const handleNewSale = () => {
    setShowSuccessScreen(false);
    setLastSaleData(null);
  };

  const viewSaleQR = async (sale: any) => {
    try {
      const { data: tokenResult, error: tokenError } = await supabase.rpc(
        "generate_pickup_token",
        { p_sale_id: sale.id }
      );

      if (tokenError) throw tokenError;
      
      if (tokenResult) {
        const result = tokenResult as { success: boolean; token?: string; expires_at?: string; bar_name?: string; message?: string };
        if (result.success && result.token) {
          const items = (sale.sale_items || []).map((item: any) => ({
            name: item.cocktails?.name || "Item",
            quantity: item.quantity,
            price: item.unit_price,
          }));

          setPickupQRData({
            token: result.token,
            saleNumber: sale.sale_number,
            expiresAt: result.expires_at || new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
            items,
            total: sale.total_amount,
            barName: result.bar_name,
          });
          setShowPickupQR(true);
        } else {
          toast.error(result.message || "No se pudo generar QR");
        }
      }
    } catch (error: any) {
      toast.error(error.message || "Error al generar QR");
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const handlePinVerified = () => {
    setIsVerified(true);
    setShowPinDialog(false);
  };

  const handlePinCancel = () => {
    void (async () => {
      try {
        await supabase.auth.signOut();
      } catch (e) {
        console.error("Error signing out:", e);
      }
      window.location.assign("/auth");
    })();
  };

  const changePosSelection = () => {
    setShowPosSelection(true);
  };

  // Format time from ISO string
  const formatTime = (isoString: string) => {
    return new Date(isoString).toLocaleTimeString("es-CL", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (!isVerified) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-secondary/5">
        <WorkerPinDialog
          open={showPinDialog}
          onVerified={handlePinVerified}
          onCancel={handlePinCancel}
        />
      </div>
    );
  }

  // POS and Bar Selection Screen
  if (showPosSelection) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5 p-4">
        <div className="max-w-lg mx-auto space-y-6 pt-12">
          <div className="text-center space-y-2">
            <Store className="w-16 h-16 mx-auto text-primary" />
            <h1 className="text-3xl font-bold">Configurar Caja</h1>
            <p className="text-muted-foreground">Selecciona tu punto de venta</p>
          </div>

          <Card className="p-6 space-y-6">
            <div className="space-y-3">
              <p className="flex items-center gap-2 text-lg font-medium">
                <Store className="w-5 h-5" />
                Caja (POS)
              </p>
              {posTerminals.length === 0 ? (
                <div className="p-4 bg-muted rounded-lg text-center text-muted-foreground">
                  No hay cajas disponibles. Contacta al administrador.
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

            <div className="p-4 bg-muted/50 rounded-lg text-center text-sm text-muted-foreground">
              <MapPin className="w-5 h-5 mx-auto mb-2 text-muted-foreground/70" />
              <p>La barra de entrega se determina al escanear el QR</p>
            </div>

            <Button
              onClick={confirmPosSelection}
              disabled={!selectedPosId}
              className="w-full"
              size="lg"
            >
              Comenzar a Vender
            </Button>
          </Card>

          <div className="text-center">
            <Button variant="ghost" onClick={handleLogout}>
              <LogOut className="w-4 h-4 mr-2" />
              Salir
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const selectedPosName = posTerminals.find(p => p.id === selectedPosId)?.name;

  // Success Screen after sale
  if (showSuccessScreen && lastSaleData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-500/10 via-background to-primary/5 flex items-center justify-center p-4">
        <Card className="max-w-md w-full p-8 text-center space-y-6">
          <div className="w-20 h-20 mx-auto bg-green-500/20 rounded-full flex items-center justify-center">
            <Check className="w-10 h-10 text-green-500" />
          </div>
          
          <div className="space-y-2">
            <h1 className="text-3xl font-bold">¡Venta Exitosa!</h1>
            <p className="text-4xl font-bold text-primary">{lastSaleData.saleNumber}</p>
            <p className="text-2xl font-semibold text-muted-foreground">
              {formatCLP(lastSaleData.total)}
            </p>
          </div>

          {lastSaleData.pickupData && (
            <div className="border-t pt-6">
              <PickupQRDialog
                open={true}
                onClose={() => {}}
                token={lastSaleData.pickupData.token}
                saleNumber={lastSaleData.saleNumber}
                expiresAt={lastSaleData.pickupData.expiresAt}
                items={lastSaleData.pickupData.items}
                total={lastSaleData.total}
                barName={lastSaleData.pickupData.barName}
                embedded
              />
            </div>
          )}

          <Button
            onClick={handleNewSale}
            size="lg"
            className="w-full text-lg py-6"
          >
            Nueva Venta
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <VenueGuard>
      <>
      <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
        {/* Compact Header */}
        <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-10">
          <div className="max-w-7xl mx-auto px-4 py-3 flex justify-between items-center">
            <div className="flex items-center gap-4">
              <h1 className="text-xl font-bold">Caja</h1>
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Store className="w-4 h-4" />
                  {selectedPosName}
                </span>
                <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={changePosSelection}>
                  Cambiar
                </Button>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <VenueIndicator variant="header" />
              <Button variant="ghost" size="sm" onClick={handleLogout}>
                <LogOut className="w-4 h-4 mr-2" />
                Salir
              </Button>
            </div>
          </div>
          {!hasActiveJornada && (
            <div className="bg-destructive/10 border border-destructive/30 px-4 py-2 text-sm text-destructive font-medium">
              Ventas bloqueadas — No hay jornada activa.
            </div>
          )}
        </div>

        <div className="max-w-7xl mx-auto p-4">
          <div className="grid grid-cols-1 lg:grid-cols-10 gap-4 h-[calc(100vh-120px)]">
            {/* Product Grid - 70% */}
            <div className="lg:col-span-7 overflow-hidden">
              <Card className="h-full p-4">
                <CategoryProductGrid 
                  cocktails={cocktails} 
                  onAddToCart={addToCart}
                  jornadaId={activeJornadaId}
                />
              </Card>
            </div>

            {/* Cart Panel - 30% */}
            <div className="lg:col-span-3 flex flex-col gap-4">
              {/* Cart */}
              <Card className="flex-1 p-4 flex flex-col min-h-0">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <ShoppingCart className="w-5 h-5" />
                    <h2 className="text-lg font-semibold">Carrito</h2>
                  </div>
                  <div className="flex items-center gap-1">
                    {lastRemovedItem && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground hover:text-primary"
                        onClick={undoLastRemove}
                        title="Deshacer"
                      >
                        <Undo2 className="w-4 h-4" />
                      </Button>
                    )}
                    {cart.length > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => setShowClearConfirm(true)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>

                {cart.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-2">
                    <span>Carrito vacío</span>
                    {lastRemovedItem && (
                      <Button variant="outline" size="sm" onClick={undoLastRemove}>
                        <Undo2 className="w-4 h-4 mr-1" /> Deshacer
                      </Button>
                    )}
                  </div>
                ) : (
                  <>
                    <ScrollArea className="flex-1 min-h-0" ref={cartScrollRef}>
                      <div className="space-y-2 pr-2">
                        {cart.map((item) => {
                          const itemAddonsTotal = item.addons.reduce((a, addon) => a + addon.price, 0);
                          const itemTotal = (item.cocktail.price + itemAddonsTotal) * item.quantity;
                          
                          return (
                            <div
                              key={item.cocktail.id}
                              className="p-3 bg-muted/50 rounded-lg space-y-2"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium truncate">{item.cocktail.name}</p>
                                  <p className="text-sm text-muted-foreground">
                                    {formatCLP(itemTotal)}
                                  </p>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <Button
                                    size="icon"
                                    variant="outline"
                                    className="h-11 w-11 min-w-[44px] min-h-[44px]"
                                    onClick={() => decreaseQuantity(item.cocktail.id)}
                                  >
                                    <Minus className="w-5 h-5" />
                                  </Button>
                                  <span className="w-8 text-center font-bold text-lg">{item.quantity}</span>
                                  <Button
                                    size="icon"
                                    variant="outline"
                                    className="h-11 w-11 min-w-[44px] min-h-[44px]"
                                    onClick={() => increaseQuantity(item.cocktail.id)}
                                  >
                                    <Plus className="w-5 h-5" />
                                  </Button>
                                </div>
                              </div>
                              
                              {/* Add-ons section */}
                              <div className="flex items-center gap-2 flex-wrap">
                                {venue?.id && (
                                  <AddonSelector
                                    cocktailId={item.cocktail.id}
                                    venueId={venue.id}
                                    selectedAddons={item.addons}
                                    onAddonsChange={(addons) => updateCartItemAddons(item.cocktail.id, addons)}
                                  />
                                )}
                                {/* Show selected addons as removable badges */}
                                {item.addons.map(addon => (
                                  <span
                                    key={addon.id}
                                    className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary px-2 py-1 rounded-full cursor-pointer hover:bg-destructive/20 hover:text-destructive"
                                    onClick={() => updateCartItemAddons(
                                      item.cocktail.id,
                                      item.addons.filter(a => a.id !== addon.id)
                                    )}
                                  >
                                    {addon.name}
                                    {addon.price > 0 && ` +${formatCLP(addon.price)}`}
                                    <X className="w-3 h-3" />
                                  </span>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </ScrollArea>

                    <div className="mt-4 space-y-3 border-t pt-4">
                      {/* Payment method: Card (external POS) or Cash */}
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setPaymentMethod("cash")}
                          className={`flex items-center justify-center gap-2 p-3 rounded-lg border-2 transition-all ${
                            paymentMethod === "cash"
                              ? "border-primary bg-primary/10 text-primary font-semibold"
                              : "border-muted hover:border-primary/50"
                          }`}
                        >
                          <Banknote className="w-5 h-5" />
                          <span>Efectivo</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setPaymentMethod("card")}
                          className={`flex items-center justify-center gap-2 p-3 rounded-lg border-2 transition-all ${
                            paymentMethod === "card"
                              ? "border-primary bg-primary/10 text-primary font-semibold"
                              : "border-muted hover:border-primary/50"
                          }`}
                        >
                          <CreditCard className="w-5 h-5" />
                          <span>Tarjeta</span>
                        </button>
                      </div>
                      
                      {/* Document type selector - show for cash, or card in unified mode */}
                      {(paymentMethod === "cash" || receiptMode === "unified") && (
                        <Select
                          value={documentType}
                          onValueChange={(value: DocumentType) => setDocumentType(value)}
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="boleta">Boleta</SelectItem>
                            <SelectItem value="factura">Factura</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                      
                      {/* Info text for card payments in hybrid mode */}
                      {paymentMethod === "card" && receiptMode === "hybrid" && (
                        <p className="text-xs text-muted-foreground text-center">
                          El comprobante se emite desde el POS externo
                        </p>
                      )}

                      {/* Total */}
                      <div className="flex justify-between items-center">
                        <span className="text-lg font-semibold">Total:</span>
                        <span className="text-3xl font-bold text-primary">
                          {formatCLP(calculateTotal())}
                        </span>
                      </div>

                      {/* Cobrar Button */}
                      <Button
                        onClick={processSale}
                        disabled={loading || !hasActiveJornada}
                        className="w-full text-lg py-6"
                        size="lg"
                      >
                        {loading ? (
                          <>
                            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                            {issuingDocument ? "Procesando..." : "Procesando..."}
                          </>
                        ) : (
                          "Cobrar"
                        )}
                      </Button>
                    </div>
                  </>
                )}
              </Card>

              {/* Recent Sales (minimal) */}
              {recentSales.length > 0 && (
                <Card className="p-4 shrink-0">
                  <h3 className="text-sm font-semibold text-muted-foreground mb-2">Recientes</h3>
                  <div className="space-y-1">
                    {recentSales.slice(0, 5).map((sale) => {
                      // Determine receipt status
                      const doc = sale.sales_documents?.[0];
                      const isExternal = sale.receipt_source === "external";
                      const receiptStatus = isExternal 
                        ? "external" 
                        : doc?.status || "pending";
                      
                      return (
                        <div
                          key={sale.id}
                          className="flex items-center justify-between text-sm py-1"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-medium">{sale.sale_number}</span>
                            {/* Receipt status badge */}
                            {receiptStatus === "external" && (
                              <span className="text-xs text-muted-foreground" title="Comprobante externo">
                                <CreditCard className="w-3 h-3" />
                              </span>
                            )}
                            {receiptStatus === "issued" && (
                              <span className="text-xs text-green-600" title="Boleta emitida">
                                <FileCheck className="w-3 h-3" />
                              </span>
                            )}
                            {receiptStatus === "pending" && (
                              <span className="text-xs text-yellow-600" title="Boleta pendiente">
                                <Clock className="w-3 h-3" />
                              </span>
                            )}
                            {receiptStatus === "failed" && (
                              <span className="text-xs text-destructive" title="Boleta fallida">
                                <AlertCircle className="w-3 h-3" />
                              </span>
                            )}
                            <span className="text-muted-foreground flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {formatTime(sale.created_at)}
                            </span>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2"
                            onClick={() => viewSaleQR(sale)}
                          >
                            <QrCode className="w-4 h-4" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Clear Cart Confirmation */}
      <AlertDialog open={showClearConfirm} onOpenChange={setShowClearConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Limpiar carrito?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminarán todos los items del carrito.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={clearCart}>Limpiar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Pickup QR Dialog (for viewing recent sales) */}
      {showPickupQR && pickupQRData && (
        <PickupQRDialog
          open={showPickupQR}
          onClose={() => {
            setShowPickupQR(false);
            setPickupQRData(null);
          }}
          token={pickupQRData.token}
          saleNumber={pickupQRData.saleNumber}
          expiresAt={pickupQRData.expiresAt}
          items={pickupQRData.items}
          total={pickupQRData.total}
          barName={pickupQRData.barName}
        />
      )}
      </>
    </VenueGuard>
  );
}
