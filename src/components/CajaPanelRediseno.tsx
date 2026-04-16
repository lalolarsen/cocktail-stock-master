import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Minus,
  Plus,
  Trash2,
  ShoppingCart,
  CreditCard,
  Banknote,
  ChevronDown,
  Printer,
  Gift,
  QrCode,
  CheckCircle2,
} from "lucide-react";

// ─── Types (aligned with Supabase schema) ────────────────────────────────────

type PaymentMethod = "cash" | "debit" | "credit" | "transfer" | "card";
type DocumentType = "boleta" | "factura";

interface Cocktail {
  id: string;
  name: string;
  price: number;
  category: string;
  is_available?: boolean;
}

interface CartItem extends Cocktail {
  qty: number;
}

interface RecentSale {
  id: string;
  sale_number: string;
  created_at: string;
  total_amount: number;
  payment_method: PaymentMethod;
  is_courtesy?: boolean;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface CajaPanelProps {
  /** Cocktails list from Supabase query */
  cocktails?: Cocktail[];
  /** Recent sales for this POS/jornada */
  recentSales?: RecentSale[];
  /** Called when operator confirms sale */
  onConfirmSale?: (params: {
    items: CartItem[];
    paymentMethod: PaymentMethod;
    documentType: DocumentType;
    isCourtesy: boolean;
    totalAmount: number;
  }) => Promise<void>;
  /** Show QR for a sale */
  onShowQR?: (saleId: string) => void;
  /** Loading state (e.g. while saving to Supabase) */
  isLoading?: boolean;
  /** Printer connection status */
  printerConnected?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CATEGORIES = ["Todos", "Promociones", "Sin Alcohol", "Otros"];

const fmt = (n: number) =>
  n.toLocaleString("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });

const formatHora = (iso: string) => {
  try {
    return new Date(iso).toLocaleTimeString("es-CL", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
};

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash: "Efectivo",
  debit: "Débito",
  credit: "Crédito",
  transfer: "Transferencia",
  card: "Tarjeta",
};

// ─── Demo data (used when props are not provided) ─────────────────────────────

const DEMO_COCKTAILS: Cocktail[] = [
  { id: "1", name: "ALTO 35 + BEBIDA", price: 5500, category: "Promociones" },
  { id: "2", name: "CHIVAS 12 + BEBIDA", price: 9000, category: "Promociones" },
  { id: "3", name: "JACK DANIELS 7 + BEBIDA", price: 8000, category: "Promociones" },
  { id: "4", name: "JOHNNIE RED + BEBIDA", price: 6500, category: "Promociones" },
  { id: "5", name: "ABSOLUT + BEBIDA", price: 7000, category: "Promociones" },
  { id: "6", name: "RON BACARDÍ + BEBIDA", price: 6000, category: "Promociones" },
  { id: "7", name: "AGUA MINERAL", price: 1500, category: "Sin Alcohol" },
  { id: "8", name: "COCA COLA", price: 1800, category: "Sin Alcohol" },
  { id: "9", name: "RED BULL", price: 3500, category: "Sin Alcohol" },
  { id: "10", name: "JUGO NARANJA", price: 2000, category: "Sin Alcohol" },
  { id: "11", name: "PRUEBA", price: 100, category: "Otros" },
];

const DEMO_RECENT: RecentSale[] = [
  { id: "a", sale_number: "CAJ-260303-001044", created_at: new Date().toISOString(), total_amount: 5500, payment_method: "cash" },
  { id: "b", sale_number: "CAJ-260224-001043", created_at: new Date().toISOString(), total_amount: 9000, payment_method: "card" },
  { id: "c", sale_number: "CAJ-260224-001042", created_at: new Date().toISOString(), total_amount: 6500, payment_method: "cash", is_courtesy: true },
  { id: "d", sale_number: "POS-260224-001041", created_at: new Date().toISOString(), total_amount: 8000, payment_method: "debit" },
  { id: "e", sale_number: "CAJ-260224-001040", created_at: new Date().toISOString(), total_amount: 7000, payment_method: "cash" },
];

// ─── Component ────────────────────────────────────────────────────────────────

export function CajaPanelRediseno({
  cocktails = DEMO_COCKTAILS,
  recentSales = DEMO_RECENT,
  onConfirmSale,
  onShowQR,
  isLoading = false,
  printerConnected = false,
}: CajaPanelProps) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [category, setCategory] = useState("Todos");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
  const [documentType, setDocumentType] = useState<DocumentType>("boleta");
  const [isCourtesy, setIsCourtesy] = useState(false);
  const [historialOpen, setHistorialOpen] = useState(false);
  const [cobrado, setCobrado] = useState(false);

  const addToCart = (cocktail: Cocktail) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.id === cocktail.id);
      if (existing) {
        return prev.map((i) => (i.id === cocktail.id ? { ...i, qty: i.qty + 1 } : i));
      }
      return [...prev, { ...cocktail, qty: 1 }];
    });
  };

  const changeQty = (id: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((i) => (i.id === id ? { ...i, qty: i.qty + delta } : i))
        .filter((i) => i.qty > 0)
    );
  };

  const clearCart = () => {
    setCart([]);
    setIsCourtesy(false);
  };

  const total = isCourtesy ? 0 : cart.reduce((sum, i) => sum + i.price * i.qty, 0);
  const cartCount = cart.reduce((sum, i) => sum + i.qty, 0);

  const filteredProducts = cocktails.filter(
    (c) => c.is_available !== false && (category === "Todos" || c.category === category)
  );

  const handleCobrar = async () => {
    if (cart.length === 0 || isLoading) return;
    if (!paymentMethod) {
      return;
    }
    if (onConfirmSale) {
      await onConfirmSale({ items: cart, paymentMethod, documentType, isCourtesy, totalAmount: total });
    }
    setCobrado(true);
    setTimeout(() => {
      setCobrado(false);
      clearCart();
      setPaymentMethod(null);
    }, 1600);
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[hsl(var(--background))] font-mono text-[hsl(var(--foreground))]">
      {/* LEFT: Product Grid */}
      <div className="flex flex-1 flex-col overflow-hidden border-r border-border">
        <div className="flex gap-2 border-b border-border bg-card px-3 py-2.5">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={cn(
                "rounded px-3 py-1.5 text-xs font-semibold tracking-wide transition-colors",
                category === cat
                  ? "border border-primary bg-primary/10 text-primary"
                  : "border border-border bg-transparent text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground"
              )}
            >
              {cat}
            </button>
          ))}
        </div>

        <ScrollArea className="flex-1">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(155px,1fr))] gap-2 p-3">
            {filteredProducts.map((p) => (
              <button
                key={p.id}
                onClick={() => addToCart(p)}
                className="flex flex-col gap-1.5 rounded-md border border-border bg-card p-3 text-left transition-colors hover:border-primary/40 hover:bg-accent active:scale-[0.97]"
              >
                <span className="text-xs font-semibold leading-tight text-foreground">{p.name}</span>
                <span className="text-sm font-bold text-primary">{fmt(p.price)}</span>
              </button>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* RIGHT: Caja */}
      <div className="flex w-[340px] shrink-0 flex-col overflow-hidden bg-card">
        {/* CARRITO */}
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
            <div className="flex items-center gap-2">
              <ShoppingCart size={14} className="text-muted-foreground" />
              <span className="text-xs font-bold tracking-wide">Carrito</span>
              {cartCount > 0 && (
                <Badge className="h-4 rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                  {cartCount}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setIsCourtesy(!isCourtesy)}
                className={cn(
                  "flex items-center gap-1 rounded border px-2 py-1 text-[10px] font-semibold transition-colors",
                  isCourtesy
                    ? "border-yellow-500/60 bg-yellow-500/10 text-yellow-400"
                    : "border-border text-muted-foreground hover:text-foreground"
                )}
              >
                <Gift size={11} />
                Cortesía
              </button>
              {cart.length > 0 && (
                <button onClick={clearCart} className="rounded p-1 text-muted-foreground hover:text-destructive">
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          </div>

          <ScrollArea className="flex-1">
            {cart.length === 0 ? (
              <div className="flex h-32 flex-col items-center justify-center gap-2 text-muted-foreground">
                <ShoppingCart size={28} strokeWidth={1} />
                <span className="text-xs">Selecciona productos</span>
              </div>
            ) : (
              <div className="py-1">
                {cart.map((item) => (
                  <div key={item.id} className="flex items-center gap-2 border-b border-border/50 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11px] font-semibold text-foreground">{item.name}</p>
                      <p className="text-[10px] text-muted-foreground">{fmt(item.price)} c/u</p>
                    </div>
                    <div className="flex items-center gap-1 rounded bg-muted px-1 py-0.5">
                      <button onClick={() => changeQty(item.id, -1)} className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:text-foreground">
                        <Minus size={11} />
                      </button>
                      <span className="min-w-[18px] text-center text-xs font-bold text-foreground">{item.qty}</span>
                      <button onClick={() => changeQty(item.id, +1)} className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:text-foreground">
                        <Plus size={11} />
                      </button>
                    </div>
                    <span className="min-w-[56px] text-right text-xs font-bold text-primary">
                      {isCourtesy ? <s className="opacity-30">{fmt(item.price * item.qty)}</s> : fmt(item.price * item.qty)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>

        {/* PAGO */}
        <div className="shrink-0 border-t border-border px-3 py-3 space-y-2.5">
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setPaymentMethod("cash")}
              className={cn(
                "flex items-center justify-center gap-1.5 rounded-md border py-2 text-xs font-semibold transition-colors",
                paymentMethod === "cash" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-muted-foreground/40"
              )}
            >
              <Banknote size={13} /> Efectivo
            </button>
            <button
              onClick={() => setPaymentMethod("card")}
              className={cn(
                "flex items-center justify-center gap-1.5 rounded-md border py-2 text-xs font-semibold transition-colors",
                paymentMethod === "card" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-muted-foreground/40"
              )}
            >
              <CreditCard size={13} /> Tarjeta
            </button>
          </div>

          <Select value={documentType} onValueChange={(v) => setDocumentType(v as DocumentType)}>
            <SelectTrigger className="h-8 border-border bg-muted text-xs text-muted-foreground focus:ring-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="border-border bg-card text-xs text-foreground">
              <SelectItem value="boleta">Boleta</SelectItem>
              <SelectItem value="factura">Factura</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex items-baseline justify-between pt-0.5">
            <span className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">Total</span>
            <span className={cn("font-bold tabular-nums tracking-tight", isCourtesy ? "text-lg text-yellow-400" : "text-xl text-primary")}>
              {isCourtesy ? "Cortesía" : fmt(total)}
            </span>
          </div>

          <Button
            onClick={handleCobrar}
            disabled={cart.length === 0 || isLoading || !paymentMethod}
            className={cn(
              "h-11 w-full rounded-lg text-sm font-bold tracking-widest uppercase transition-all",
              cobrado
                ? "bg-blue-600 text-white hover:bg-blue-600"
                : cart.length > 0
                  ? "bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.98]"
                  : "bg-muted text-muted-foreground cursor-not-allowed"
            )}
          >
            {cobrado ? (
              <span className="flex items-center gap-2"><CheckCircle2 size={15} />Cobrado</span>
            ) : isLoading ? "Procesando..." : "Cobrar"}
          </Button>

          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <Printer size={11} />
            <span>Impresión</span>
            <span className={cn("ml-1 inline-block h-1.5 w-1.5 rounded-full", printerConnected ? "bg-green-500" : "bg-yellow-500")} />
            <span className={printerConnected ? "text-green-500" : "text-yellow-500"}>
              {printerConnected ? "Conectada" : "Conectando..."}
            </span>
          </div>
        </div>

        {/* HISTORIAL COLAPSABLE */}
        <Collapsible open={historialOpen} onOpenChange={setHistorialOpen} className="shrink-0 border-t border-border">
          <CollapsibleTrigger className="flex w-full items-center justify-between px-3 py-2.5">
            <div className="flex items-center gap-2 text-[11px] font-semibold tracking-wide">
              <span>Recientes</span>
              <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                {recentSales.length}
              </span>
            </div>
            <ChevronDown size={13} className={cn("transition-transform text-muted-foreground", historialOpen && "rotate-180")} />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ScrollArea className="max-h-[200px]">
              {recentSales.map((sale) => (
                <div key={sale.id} className="flex items-center justify-between border-t border-border/50 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[10px] font-semibold text-muted-foreground">{sale.sale_number}</p>
                    <p className="text-[10px] text-muted-foreground/60">{formatHora(sale.created_at)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <span className="text-xs font-bold text-foreground">
                      {sale.is_courtesy ? <span className="text-yellow-400 text-[10px]">Cortesía</span> : fmt(sale.total_amount)}
                    </span>
                    <span className={cn("rounded border px-1.5 py-0.5 text-[9px]", sale.is_courtesy ? "border-yellow-500/40 text-yellow-400" : "border-border text-muted-foreground")}>
                      {sale.is_courtesy ? "Cortesía" : PAYMENT_LABELS[sale.payment_method]}
                    </span>
                    {onShowQR && (
                      <button onClick={() => onShowQR(sale.id)} className="rounded border border-border p-1 text-muted-foreground hover:text-foreground">
                        <QrCode size={11} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </ScrollArea>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  );
}

export default CajaPanelRediseno;
