import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, ShoppingCart, X, LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

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

export default function Sales() {
  const [cocktails, setCocktails] = useState<Cocktail[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [pointOfSale, setPointOfSale] = useState("");
  const [loading, setLoading] = useState(false);
  const [recentSales, setRecentSales] = useState<any[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    fetchCocktails();
    fetchRecentSales();
  }, []);

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

  const processSale = async () => {
    if (cart.length === 0) {
      toast.error("El carrito está vacío");
      return;
    }

    if (!pointOfSale.trim()) {
      toast.error("Ingresa el punto de venta");
      return;
    }

    setLoading(true);

    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session?.user) throw new Error("No autenticado");

      const saleNumber = `V-${Date.now()}`;
      const totalAmount = calculateTotal();

      // Create sale
      const { data: sale, error: saleError } = await supabase
        .from("sales")
        .insert({
          sale_number: saleNumber,
          seller_id: session.session.user.id,
          total_amount: totalAmount,
          point_of_sale: pointOfSale,
        })
        .select()
        .single();

      if (saleError) throw saleError;

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

      toast.success(`Venta ${saleNumber} registrada exitosamente`);
      setCart([]);
      setPointOfSale("");
      fetchRecentSales();
    } catch (error: any) {
      toast.error(error.message || "Error al procesar la venta");
    } finally {
      setLoading(false);
    }
  };

  const cancelSale = async (saleId: string) => {
    try {
      const { error } = await supabase
        .from("sales")
        .update({ is_cancelled: true })
        .eq("id", saleId);

      if (error) throw error;

      toast.success("Venta cancelada y stock restaurado");
      fetchRecentSales();
    } catch (error: any) {
      toast.error(error.message || "Error al cancelar venta");
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5 p-4">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold gradient-text">Portal de Ventas</h1>
          <Button variant="outline" onClick={handleLogout}>
            <LogOut className="w-4 h-4 mr-2" />
            Salir
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Cocktails List */}
          <Card className="lg:col-span-2 p-6">
            <h2 className="text-xl font-semibold mb-4">Cocteles Disponibles</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {cocktails.map((cocktail) => (
                <Card
                  key={cocktail.id}
                  className="p-4 hover:shadow-lg transition-all cursor-pointer hover:border-primary/50"
                  onClick={() => addToCart(cocktail)}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-semibold">{cocktail.name}</h3>
                      <Badge variant="outline" className="mt-1">
                        {cocktail.category}
                      </Badge>
                    </div>
                    <div className="text-lg font-bold text-primary">
                      ${cocktail.price}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
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
                <ScrollArea className="h-64 mb-4">
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
                            ${item.cocktail.price} c/u
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
                  <div className="space-y-2">
                    <Label htmlFor="pointOfSale">Punto de Venta</Label>
                    <Input
                      id="pointOfSale"
                      placeholder="Ej: Barra Principal"
                      value={pointOfSale}
                      onChange={(e) => setPointOfSale(e.target.value)}
                    />
                  </div>

                  <div className="border-t pt-4">
                    <div className="flex justify-between items-center mb-4">
                      <span className="font-semibold">Total:</span>
                      <span className="text-2xl font-bold text-primary">
                        ${calculateTotal().toFixed(2)}
                      </span>
                    </div>

                    <Button
                      onClick={processSale}
                      disabled={loading}
                      className="w-full"
                      size="lg"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Procesando...
                        </>
                      ) : (
                        "Procesar Venta"
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
                      {sale.point_of_sale} • $
                      {sale.total_amount.toFixed(2)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {sale.is_cancelled ? (
                      <Badge variant="destructive">Cancelada</Badge>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => cancelSale(sale.id)}
                      >
                        Cancelar
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
