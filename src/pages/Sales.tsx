import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, ShoppingCart, X, LogOut, FileText, CreditCard, Banknote, Smartphone, QrCode, MapPin, Store } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatCLP } from "@/lib/currency";
import WorkerPinDialog from "@/components/WorkerPinDialog";
import PickupQRDialog from "@/components/PickupQRDialog";
import { issueDocument, type DocumentType } from "@/lib/invoicing/index";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Cocktail = {
  id: string;
  name: string;
  price: number;
  category: string;
};

type CartItem = {
  cocktail: Cocktail;
  quantity: number;
};

type POSTerminal = {
  id: string;
  name: string;
  location_id: string;
  is_active: boolean;
};

type BarLocation = {
  id: string;
  name: string;
  type: string;
};

export default function Sales() {
  const [cocktails, setCocktails] = useState<Cocktail[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [pointOfSale, setPointOfSale] = useState("");
  const [loading, setLoading] = useState(false);
  const [issuingDocument, setIssuingDocument] = useState(false);
  const [recentSales, setRecentSales] = useState<any[]>([]);
  const [isVerified, setIsVerified] = useState(true);
  const [showPinDialog, setShowPinDialog] = useState(false);
  const [shouldRedirect, setShouldRedirect] = useState(false);
  const [documentType, setDocumentType] = useState<DocumentType>("boleta");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "debit" | "credit" | "transfer">("cash");
  
  // Multi-POS and bar selection
  const [posTerminals, setPosTerminals] = useState<POSTerminal[]>([]);
  const [barLocations, setBarLocations] = useState<BarLocation[]>([]);
  const [selectedPosId, setSelectedPosId] = useState<string>("");
  const [selectedBarId, setSelectedBarId] = useState<string>("");
  const [showPosSelection, setShowPosSelection] = useState(true);
  
  // Pickup QR state
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

  useEffect(() => {
    if (shouldRedirect) {
      navigate("/auth", { replace: true });
    }
  }, [shouldRedirect, navigate]);

  // Fetch POS terminals and bar locations on mount
  useEffect(() => {
    fetchPosTerminals();
    fetchBarLocations();
    
    // Restore last used selections from localStorage
    const savedPosId = localStorage.getItem("selectedPosId");
    const savedBarId = localStorage.getItem("selectedBarId");
    if (savedPosId) setSelectedPosId(savedPosId);
    if (savedBarId) setSelectedBarId(savedBarId);
  }, []);

  useEffect(() => {
    if (isVerified && !showPosSelection) {
      fetchCocktails();
      fetchRecentSales();
      fetchUserPointOfSale();
    }
  }, [isVerified, showPosSelection]);

  // Save selections to localStorage
  useEffect(() => {
    if (selectedPosId) localStorage.setItem("selectedPosId", selectedPosId);
    if (selectedBarId) localStorage.setItem("selectedBarId", selectedBarId);
  }, [selectedPosId, selectedBarId]);

  const fetchPosTerminals = async () => {
    const { data, error } = await supabase
      .from("pos_terminals")
      .select("*")
      .eq("is_active", true)
      .order("name");
    
    if (!error && data) {
      setPosTerminals(data);
      // Auto-select if only one POS
      if (data.length === 1) {
        setSelectedPosId(data[0].id);
      }
      // Check if saved POS is still valid
      const savedPosId = localStorage.getItem("selectedPosId");
      if (savedPosId && data.some(p => p.id === savedPosId)) {
        setSelectedPosId(savedPosId);
      }
    }
  };

  const fetchBarLocations = async () => {
    const { data, error } = await supabase
      .from("stock_locations")
      .select("*")
      .eq("type", "bar")
      .eq("is_active", true)
      .order("name");
    
    if (!error && data) {
      setBarLocations(data);
      // Auto-select if only one bar
      if (data.length === 1) {
        setSelectedBarId(data[0].id);
      }
      // Check if saved bar is still valid
      const savedBarId = localStorage.getItem("selectedBarId");
      if (savedBarId && data.some(b => b.id === savedBarId)) {
        setSelectedBarId(savedBarId);
      }
    }
  };

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

  const fetchCocktails = async () => {
    const { data, error } = await supabase
      .from("cocktails")
      .select("*")
      .order("name");

    if (error) {
      toast.error("Error al cargar cocteles");
      return;
    }

    setCocktails(data || []);
  };

  const fetchRecentSales = async () => {
    const { data: session } = await supabase.auth.getSession();
    if (!session.session?.user) return;

    const { data, error } = await supabase
      .from("sales")
      .select(`
        *,
        sale_items(
          *,
          cocktails(name)
        )
      `)
      .eq("seller_id", session.session.user.id)
      .order("created_at", { ascending: false })
      .limit(5);

    if (!error && data) {
      setRecentSales(data);
    }
  };

  const addToCart = (cocktail: Cocktail) => {
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
      setCart([...cart, { cocktail, quantity: 1 }]);
    }
    toast.success(`${cocktail.name} agregado`);
  };

  const removeFromCart = (cocktailId: string) => {
    setCart(cart.filter((item) => item.cocktail.id !== cocktailId));
  };

  const updateQuantity = (cocktailId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(cocktailId);
      return;
    }
    setCart(
      cart.map((item) =>
        item.cocktail.id === cocktailId ? { ...item, quantity } : item
      )
    );
  };

  const calculateTotal = () => {
    return cart.reduce(
      (sum, item) => sum + item.cocktail.price * item.quantity,
      0
    );
  };

  const confirmPosSelection = () => {
    if (!selectedPosId) {
      toast.error("Selecciona una caja");
      return;
    }
    if (!selectedBarId) {
      toast.error("Selecciona una barra destino");
      return;
    }
    
    // Get POS name for point_of_sale field
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

    if (!selectedBarId) {
      toast.error("Selecciona una barra destino");
      return;
    }

    setLoading(true);
    setIssuingDocument(true);

    // Store cart items for QR display before clearing
    const cartItemsForQR = cart.map((item) => ({
      name: item.cocktail.name,
      quantity: item.quantity,
      price: item.cocktail.price,
    }));
    const totalForQR = calculateTotal();
    const selectedBarName = barLocations.find(b => b.id === selectedBarId)?.name;

    let saleId: string | null = null;

    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session?.user) throw new Error("No autenticado");

      // Generate unique sale number with POS prefix
      const selectedPos = posTerminals.find(p => p.id === selectedPosId);
      const posPrefix = selectedPos?.name.substring(0, 3).toUpperCase() || "POS";
      const saleNumber = `${posPrefix}-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      const totalAmount = calculateTotal();

      // Create sale with pos_id and bar_location_id
      const { data: sale, error: saleError } = await supabase
        .from("sales")
        .insert({
          sale_number: saleNumber,
          seller_id: session.session.user.id,
          total_amount: totalAmount,
          point_of_sale: pointOfSale || selectedPos?.name || "POS",
          payment_method: paymentMethod,
          payment_status: "paid",
          pos_id: selectedPosId,
          bar_location_id: selectedBarId,
        })
        .select()
        .single();

      if (saleError) throw saleError;
      saleId = sale.id;

      // Create sale items
      const saleItems = cart.map((item) => ({
        sale_id: sale.id,
        cocktail_id: item.cocktail.id,
        quantity: item.quantity,
        unit_price: item.cocktail.price,
        subtotal: item.cocktail.price * item.quantity,
      }));

      const { error: itemsError } = await supabase
        .from("sale_items")
        .insert(saleItems);

      if (itemsError) throw itemsError;

      // Issue electronic document (provider-agnostic)
      const docResult = await issueDocument(sale.id, documentType);
      const docLabel = documentType === "boleta" ? "Boleta" : "Factura";
      
      if (docResult.success) {
        toast.success(`Venta ${saleNumber} registrada. ${docLabel}: ${docResult.folio}`);
      } else {
        toast.warning(`Venta ${saleNumber} registrada. ${docLabel} pendiente: ${docResult.errorMessage}`);
      }

      // Generate pickup QR token
      const { data: tokenResult, error: tokenError } = await supabase.rpc(
        "generate_pickup_token",
        { p_sale_id: sale.id }
      );

      if (tokenError) {
        console.error("Error generating pickup token:", tokenError);
        toast.warning("Venta registrada pero no se pudo generar QR de retiro");
      } else if (tokenResult) {
        const result = tokenResult as { success: boolean; token?: string; sale_number?: string; expires_at?: string; bar_name?: string };
        if (result.success && result.token) {
          // Show pickup QR dialog
          setPickupQRData({
            token: result.token,
            saleNumber: result.sale_number || saleNumber,
            expiresAt: result.expires_at || new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
            items: cartItemsForQR,
            total: totalForQR,
            barName: result.bar_name || selectedBarName,
          });
          setShowPickupQR(true);
        }
      }

      setCart([]);
      fetchRecentSales();
    } catch (error: any) {
      toast.error(error.message || "Error al procesar la venta");
    } finally {
      setLoading(false);
      setIssuingDocument(false);
    }
  };

  const cancelSale = async (saleId: string) => {
    try {
      const { error } = await supabase
        .from("sales")
        .update({ is_cancelled: true })
        .eq("id", saleId);

      if (error) throw error;

      toast.success("Venta cancelada");
      fetchRecentSales();
    } catch (error: any) {
      toast.error(error.message || "Error al cancelar venta");
    }
  };

  const reprintQR = async (sale: any) => {
    try {
      const { data: tokenResult, error: tokenError } = await supabase.rpc(
        "generate_pickup_token",
        { p_sale_id: sale.id }
      );

      if (tokenError) throw tokenError;
      
      if (tokenResult) {
        const result = tokenResult as { success: boolean; token?: string; expires_at?: string; error_code?: string; message?: string; bar_name?: string };
        if (result.success && result.token) {
          // Build items from sale_items
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
            <p className="text-muted-foreground">Selecciona tu punto de venta y barra destino</p>
          </div>

          <Card className="p-6 space-y-6">
            {/* POS Terminal Selection */}
            <div className="space-y-3">
              <Label className="flex items-center gap-2 text-lg">
                <Store className="w-5 h-5" />
                Caja (POS)
              </Label>
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

            {/* Bar Location Selection */}
            <div className="space-y-3">
              <Label className="flex items-center gap-2 text-lg">
                <MapPin className="w-5 h-5" />
                Barra Destino
              </Label>
              {barLocations.length === 0 ? (
                <div className="p-4 bg-muted rounded-lg text-center text-muted-foreground">
                  No hay barras disponibles. Contacta al administrador.
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {barLocations.map((bar) => (
                    <Card
                      key={bar.id}
                      onClick={() => setSelectedBarId(bar.id)}
                      className={`p-4 cursor-pointer transition-all hover:scale-105 ${
                        selectedBarId === bar.id
                          ? "border-primary bg-primary/10 ring-2 ring-primary"
                          : "hover:border-primary/50"
                      }`}
                    >
                      <div className="text-center">
                        <MapPin className={`w-8 h-8 mx-auto mb-2 ${selectedBarId === bar.id ? "text-primary" : "text-muted-foreground"}`} />
                        <p className="font-semibold">{bar.name}</p>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>

            <Button
              onClick={confirmPosSelection}
              disabled={!selectedPosId || !selectedBarId}
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
  const selectedBarName = barLocations.find(b => b.id === selectedBarId)?.name;

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5 p-4">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold gradient-text">Portal de Ventas</h1>
            <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Store className="w-4 h-4" />
                {selectedPosName}
              </span>
              <span className="flex items-center gap-1">
                <MapPin className="w-4 h-4" />
                {selectedBarName}
              </span>
              <Button variant="link" size="sm" className="h-auto p-0" onClick={changePosSelection}>
                Cambiar
              </Button>
            </div>
          </div>
          <Button variant="outline" onClick={handleLogout}>
            <LogOut className="w-4 h-4 mr-2" />
            Salir
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Cocktails List */}
          <Card className="lg:col-span-2 p-6">
            <h2 className="text-xl font-semibold mb-4">Menú de Cocteles</h2>
            <ScrollArea className="h-[calc(100vh-200px)]">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 pr-4">
                {cocktails.map((cocktail) => (
                  <Card
                    key={cocktail.id}
                    className="p-4 hover:shadow-lg transition-all cursor-pointer hover:border-primary/50 hover:scale-105"
                    onClick={() => addToCart(cocktail)}
                  >
                    <div className="text-center space-y-2">
                      <h3 className="font-semibold text-lg">{cocktail.name}</h3>
                      <Badge variant="secondary" className="text-xs">
                        {cocktail.category}
                      </Badge>
                      <div className="text-2xl font-bold text-primary">
                        {formatCLP(cocktail.price)}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          </Card>

          {/* Cart */}
          <Card className="p-6 h-fit sticky top-4">
            <div className="flex items-center gap-2 mb-4">
              <ShoppingCart className="w-5 h-5" />
              <h2 className="text-xl font-semibold">Carrito</h2>
            </div>

            {cart.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                Carrito vacío
              </p>
            ) : (
              <>
                <ScrollArea className="h-48 mb-4">
                  <div className="space-y-2">
                    {cart.map((item) => (
                      <div
                        key={item.cocktail.id}
                        className="flex justify-between items-center gap-2 p-2 border rounded"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">
                            {item.cocktail.name}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {formatCLP(item.cocktail.price)} c/u
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) =>
                              updateQuantity(
                                item.cocktail.id,
                                parseInt(e.target.value)
                              )
                            }
                            className="w-16"
                          />
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => removeFromCart(item.cocktail.id)}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>

                <div className="space-y-4">
                  {/* Bar destination display */}
                  <div className="flex items-center gap-2 p-2 bg-primary/10 rounded-lg text-sm">
                    <MapPin className="w-4 h-4 text-primary" />
                    <span>Retiro en: <strong>{selectedBarName}</strong></span>
                  </div>

                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Banknote className="w-4 h-4" />
                      Método de Pago
                    </Label>
                    <Select
                      value={paymentMethod}
                      onValueChange={(value: "cash" | "debit" | "credit" | "transfer") => setPaymentMethod(value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar método" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">
                          <span className="flex items-center gap-2">
                            <Banknote className="w-4 h-4" />
                            Efectivo
                          </span>
                        </SelectItem>
                        <SelectItem value="debit">
                          <span className="flex items-center gap-2">
                            <CreditCard className="w-4 h-4" />
                            Débito
                          </span>
                        </SelectItem>
                        <SelectItem value="credit">
                          <span className="flex items-center gap-2">
                            <CreditCard className="w-4 h-4" />
                            Crédito
                          </span>
                        </SelectItem>
                        <SelectItem value="transfer">
                          <span className="flex items-center gap-2">
                            <Smartphone className="w-4 h-4" />
                            Transferencia
                          </span>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <FileText className="w-4 h-4" />
                      Tipo de Documento
                    </Label>
                    <Select
                      value={documentType}
                      onValueChange={(value: DocumentType) => setDocumentType(value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar tipo" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="boleta">Boleta Electrónica</SelectItem>
                        <SelectItem value="factura">Factura Electrónica</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="border-t pt-4">
                    <div className="flex justify-between items-center mb-4">
                      <span className="font-semibold">Total:</span>
                      <span className="text-2xl font-bold text-primary">
                        {formatCLP(calculateTotal())}
                      </span>
                    </div>

                    <Button
                      onClick={processSale}
                      disabled={loading || issuingDocument}
                      className="w-full"
                      size="lg"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          {issuingDocument ? "Emitiendo documento..." : "Procesando..."}
                        </>
                      ) : (
                        <>
                          <FileText className="mr-2 h-4 w-4" />
                          Procesar Venta
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </>
            )}
          </Card>
        </div>

        {/* Recent Sales */}
        {recentSales.length > 0 && (
          <Card className="p-6">
            <h2 className="text-xl font-semibold mb-4">Ventas Recientes</h2>
            <div className="space-y-2">
              {recentSales.map((sale) => (
                <div
                  key={sale.id}
                  className="flex justify-between items-center p-4 border rounded"
                >
                  <div>
                    <p className="font-semibold">{sale.sale_number}</p>
                    <p className="text-sm text-muted-foreground">
                      {sale.point_of_sale} • {formatCLP(sale.total_amount)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {sale.is_cancelled ? (
                      <Badge variant="destructive">Cancelada</Badge>
                    ) : (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => reprintQR(sale)}
                        >
                          <QrCode className="w-4 h-4 mr-1" />
                          QR
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => cancelSale(sale.id)}
                        >
                          Cancelar
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      {/* Pickup QR Dialog */}
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
    </div>
  );
}
