import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from "sonner";
import {
  Loader2,
  Ticket,
  Plus,
  Minus,
  CreditCard,
  Wine,
  QrCode,
  Clock,
  Check,
  LogOut,
  Store,
  Banknote,
  ShieldAlert,
  AlertCircle,
  Printer,
  Download,
} from "lucide-react";
import { useActiveVenue } from "@/hooks/useActiveVenue";
import { downloadCashierReport, type CashierReportData } from "@/lib/reporting/jornada-cashier-report";
import { useNavigate } from "react-router-dom";
import { formatCLP } from "@/lib/currency";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useDemoLogging } from "@/hooks/useDemoLogging";
import { useAppSession } from "@/contexts/AppSessionContext";
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
  TicketReceiptDialog,
  type SaleResult as ReceiptSaleResult,
} from "@/components/tickets/TicketReceiptDialog";
import { printTicketSale, type TicketSalePrintData } from "@/lib/printing/ticket-print";
import { getPreferredPaperWidthStorageKey } from "@/lib/printing/qz";
import type { PaperWidth } from "@/lib/printing/qz";

type PaymentMethodType = "cash" | "card";

interface CoverOption {
  cocktail_id: string;
  cocktail_name: string;
  display_order: number;
}

interface TicketType {
  id: string;
  name: string;
  price: number;
  includes_cover: boolean;
  cover_cocktail_id: string | null;
  cover_quantity: number;
  cover_options: CoverOption[];
}

interface CartItem {
  ticketType: TicketType;
  quantity: number;
  /** Length = quantity * cover_quantity. cocktail_id per cover slot. Empty string = pending. */
  coverSelections: string[];
}

interface CoverToken {
  token_id: string;
  token: string;
  short_code?: string | null;
  cocktail_id: string;
  cocktail_name?: string;
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
  total: number;
  payment_method: string;
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
  const { activeJornadaId } = useAppSession();
  const { venue } = useActiveVenue();
  const [reprintingId, setReprintingId] = useState<string | null>(null);

  const [step, setStep] = useState<Step>("select-pos");
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  // POS
  const [posTerminals, setPosTerminals] = useState<POSTerminal[]>([]);
  const [selectedPosId, setSelectedPosId] = useState<string>("");
  const [selectedPosName, setSelectedPosName] = useState<string>("");

  // Catalog & cart
  const [ticketTypes, setTicketTypes] = useState<TicketType[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);

  // Payment — undefined means not selected
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodType | undefined>(undefined);

  // Sale result + receipt dialog
  const [saleResult, setSaleResult] = useState<SaleResult | null>(null);
  const [showReceipt, setShowReceipt] = useState(false);

  // Recent sales
  const [recentSales, setRecentSales] = useState<RecentSale[]>([]);

  /* ─── Load POS terminals ─── */
  useEffect(() => { fetchPosTerminals(); }, []);
  const fetchPosTerminals = async () => {
    try {
      const { data, error } = await supabase
        .from("pos_terminals")
        .select("id, name, pos_type, is_cash_register")
        .eq("is_active", true)
        .eq("pos_type", "ticket_sales")
        .order("name");
      if (!error && data) {
        setPosTerminals(data);
        const savedPosId = localStorage.getItem("selectedTicketPosId");
        if (savedPosId && data.some(p => p.id === savedPosId)) {
          const pos = data.find(p => p.id === savedPosId);
          setSelectedPosId(savedPosId);
          setSelectedPosName(pos?.name || "");
        }
        if (data.length === 1) {
          setSelectedPosId(data[0].id);
          setSelectedPosName(data[0].name);
        }
      }
    } catch (err) {
      console.error("Error fetching POS:", err);
    } finally {
      setLoading(false);
    }
  };

  const confirmPosSelection = () => {
    if (!selectedPosId) return toast.error("Selecciona una caja");
    const pos = posTerminals.find(p => p.id === selectedPosId);
    if (pos) {
      setSelectedPosName(pos.name);
      localStorage.setItem("selectedTicketPosId", pos.id);
    }
    fetchTicketTypes();
    fetchRecentSales();
    setStep("select-tickets");
  };

  /* ─── Load ticket types + cover options ─── */
  const fetchTicketTypes = async () => {
    try {
      const { data, error } = await supabase
        .from("ticket_types")
        .select(`
          id, name, price, includes_cover, cover_cocktail_id, cover_quantity,
          ticket_type_cover_options (
            cocktail_id,
            display_order,
            cocktails ( name )
          )
        `)
        .eq("is_active", true)
        .order("price", { ascending: true });
      if (error) throw error;

      const mapped: TicketType[] = (data || []).map((t: any) => {
        const opts: CoverOption[] = (t.ticket_type_cover_options || [])
          .map((o: any) => ({
            cocktail_id: o.cocktail_id,
            cocktail_name: o.cocktails?.name || "Cover",
            display_order: o.display_order ?? 0,
          }))
          .sort((a: CoverOption, b: CoverOption) => a.display_order - b.display_order);
        return {
          id: t.id,
          name: t.name,
          price: t.price,
          includes_cover: t.includes_cover,
          cover_cocktail_id: t.cover_cocktail_id,
          cover_quantity: t.cover_quantity || 1,
          cover_options: opts,
        };
      });
      setTicketTypes(mapped);
    } catch (err: any) {
      console.error(err);
      toast.error("Error al cargar entradas");
    } finally {
      setLoading(false);
    }
  };

  const fetchRecentSales = async () => {
    try {
      let q = supabase
        .from("ticket_sales")
        .select("id, ticket_number, created_at, total, payment_method, pos_id, jornada_id")
        .order("created_at", { ascending: false })
        .limit(10);
      if (activeJornadaId) q = q.eq("jornada_id", activeJornadaId);
      if (selectedPosId) q = q.eq("pos_id", selectedPosId);
      const { data, error } = await q;
      if (error) throw error;
      const withCovers = await Promise.all(
        (data || []).map(async (sale: any) => {
          const { count } = await supabase
            .from("pickup_tokens")
            .select("*", { count: "exact", head: true })
            .eq("ticket_sale_id", sale.id);
          return {
            id: sale.id,
            ticket_number: sale.ticket_number,
            created_at: sale.created_at,
            total: sale.total || 0,
            payment_method: sale.payment_method || "cash",
            cover_count: count || 0,
          };
        })
      );
      setRecentSales(withCovers);
    } catch (err) {
      console.error(err);
    }
  };

  /* ─── Reprint a past sale by id ─── */
  const reprintSale = async (saleId: string) => {
    setReprintingId(saleId);
    try {
      const [saleRes, itemsRes, tokensRes] = await Promise.all([
        supabase
          .from("ticket_sales")
          .select("id, ticket_number, total, payment_method, created_at")
          .eq("id", saleId)
          .single(),
        supabase
          .from("ticket_sale_items")
          .select("quantity, unit_price, ticket_type_id, ticket_types(name)")
          .eq("ticket_sale_id", saleId),
        supabase
          .from("pickup_tokens")
          .select("token, short_code, metadata, cover_cocktail_id, cocktails:cover_cocktail_id(name)")
          .eq("ticket_sale_id", saleId),
      ]);
      if (saleRes.error) throw saleRes.error;
      if (itemsRes.error) throw itemsRes.error;
      if (tokensRes.error) throw tokensRes.error;

      const sale = saleRes.data;
      const items = (itemsRes.data || []).map((it: any) => ({
        name: it.ticket_types?.name || "Entrada",
        quantity: it.quantity,
        price: it.unit_price,
      }));

      const allTokens = (tokensRes.data || []) as any[];
      // entries vs covers via metadata.kind (fallback: covers if has cocktail)
      const entryTokens: TicketSalePrintData["entryTokens"] = [];
      const coverTokens: TicketSalePrintData["coverTokens"] = [];
      for (const t of allTokens) {
        const kind = t.metadata?.kind;
        const ticketTypeName = t.metadata?.ticket_type_name || "Entrada";
        if (kind === "cover" || t.cover_cocktail_id) {
          coverTokens.push({
            token: t.token,
            short_code: t.short_code || null,
            ticket_type: ticketTypeName,
            cocktail_name: t.cocktails?.name || null,
          });
        } else {
          entryTokens.push({
            token: t.token,
            short_code: t.short_code || null,
            ticket_type: ticketTypeName,
          });
        }
      }

      // Fallback: synthesize entry pieces if backend didn't emit entry tokens
      if (entryTokens.length === 0) {
        for (const it of itemsRes.data || []) {
          for (let i = 0; i < (it.quantity || 0); i++) {
            entryTokens.push({
              token: sale.ticket_number,
              short_code: null,
              ticket_type: (it as any).ticket_types?.name || "Entrada",
            });
          }
        }
      }

      const paperKey = getPreferredPaperWidthStorageKey();
      const paperWidth = (localStorage.getItem(paperKey) as PaperWidth) || "80mm";

      const printData: TicketSalePrintData = {
        saleNumber: sale.ticket_number,
        posName: selectedPosName,
        dateTime: format(new Date(sale.created_at), "dd/MM/yyyy HH:mm", { locale: es }),
        items,
        total: sale.total,
        paymentMethod: sale.payment_method,
        entryTokens,
        coverTokens,
      };
      await printTicketSale(printData, paperWidth);
      toast.success("Reimprimiendo venta " + sale.ticket_number);
    } catch (err: any) {
      console.error("Reprint error:", err);
      toast.error(err.message || "Error al reimprimir");
    } finally {
      setReprintingId(null);
    }
  };

  /* ─── Download cashier session results PDF ─── */
  const handleDownloadJornadaReport = async () => {
    if (!activeJornadaId) return toast.error("No hay jornada activa");
    if (!selectedPosId) return toast.error("Selecciona una caja primero");
    try {
      const { data: jornada } = await supabase
        .from("jornadas")
        .select("numero_jornada, fecha")
        .eq("id", activeJornadaId)
        .single();

      const { data: sales } = await supabase
        .from("ticket_sales")
        .select("total, payment_method")
        .eq("jornada_id", activeJornadaId)
        .eq("pos_id", selectedPosId);

      const cashSales = (sales || []).filter((s: any) => s.payment_method === "cash");
      const cardSales = (sales || []).filter((s: any) => s.payment_method === "card");

      const reportData: CashierReportData = {
        venueName: venue?.name || "",
        posName: selectedPosName || "Caja Tickets",
        jornadaNumber: jornada?.numero_jornada || 0,
        fecha: jornada?.fecha || new Date().toISOString().slice(0, 10),
        downloadTime: new Date().toLocaleString("es-CL"),
        cashTotal: cashSales.reduce((s, r: any) => s + (r.total || 0), 0),
        cashCount: cashSales.length,
        cardTotal: cardSales.reduce((s, r: any) => s + (r.total || 0), 0),
        cardCount: cardSales.length,
        grandTotal: (sales || []).reduce((s, r: any) => s + (r.total || 0), 0),
        grandCount: (sales || []).length,
      };
      downloadCashierReport(reportData);
      toast.success("Reporte descargado");
    } catch (err: any) {
      console.error(err);
      toast.error("Error al generar reporte");
    }
  };

  /* ─── Cart helpers ─── */
  const addToCart = (tt: TicketType) => {
    setCart(prev => {
      const idx = prev.findIndex(it => it.ticketType.id === tt.id);
      if (idx >= 0) {
        const next = [...prev];
        const item = next[idx];
        const newQty = item.quantity + 1;
        const totalCovers = newQty * (tt.cover_quantity || 1);
        // Auto-assign if only 1 option, else leave empty (pending)
        const autoId = tt.includes_cover && tt.cover_options.length === 1
          ? tt.cover_options[0].cocktail_id
          : "";
        const newSelections = tt.includes_cover
          ? [...item.coverSelections, ...Array(totalCovers - item.coverSelections.length).fill(autoId)]
          : [];
        next[idx] = { ...item, quantity: newQty, coverSelections: newSelections };
        return next;
      }
      const totalCovers = (tt.cover_quantity || 1);
      const autoId = tt.includes_cover && tt.cover_options.length === 1
        ? tt.cover_options[0].cocktail_id
        : "";
      return [
        ...prev,
        {
          ticketType: tt,
          quantity: 1,
          coverSelections: tt.includes_cover ? Array(totalCovers).fill(autoId) : [],
        },
      ];
    });
  };

  const removeFromCart = (ticketTypeId: string) => {
    setCart(prev => {
      const idx = prev.findIndex(it => it.ticketType.id === ticketTypeId);
      if (idx < 0) return prev;
      const item = prev[idx];
      if (item.quantity <= 1) return prev.filter(it => it.ticketType.id !== ticketTypeId);
      const next = [...prev];
      const newQty = item.quantity - 1;
      const totalCovers = newQty * (item.ticketType.cover_quantity || 1);
      next[idx] = {
        ...item,
        quantity: newQty,
        coverSelections: item.coverSelections.slice(0, totalCovers),
      };
      return next;
    });
  };

  const updateCoverSelection = (ticketTypeId: string, slotIndex: number, cocktailId: string) => {
    setCart(prev => prev.map(item => {
      if (item.ticketType.id !== ticketTypeId) return item;
      const sel = [...item.coverSelections];
      sel[slotIndex] = cocktailId;
      return { ...item, coverSelections: sel };
    }));
  };

  const getCartTotal = () => cart.reduce((s, i) => s + i.ticketType.price * i.quantity, 0);
  const getTotalCoversIncluded = () =>
    cart.reduce((s, i) => i.ticketType.includes_cover ? s + i.coverSelections.length : s, 0);
  const getPendingCoversCount = () =>
    cart.reduce((s, i) => s + i.coverSelections.filter(x => !x).length, 0);

  /* ─── Checkout ─── */
  const handleCheckout = async () => {
    if (cart.length === 0) return toast.error("Carrito vacío");
    if (!paymentMethod) return toast.error("Selecciona un método de pago");
    if (!activeJornadaId) return toast.error("No hay jornada activa");
    if (getPendingCoversCount() > 0) return toast.error("Hay covers sin asignar");

    setProcessing(true);
    try {
      const items = cart.map(it => ({
        ticket_type_id: it.ticketType.id,
        quantity: it.quantity,
      }));
      // cover_selections is parallel array of arrays: position matches items[]
      const cover_selections = cart.map(it =>
        it.ticketType.includes_cover ? it.coverSelections : []
      );

      const { data, error } = await supabase.rpc("create_ticket_sale_with_covers", {
        p_items: items,
        p_payment_method: paymentMethod,
        p_jornada_id: activeJornadaId,
        p_pos_id: selectedPosId || null,
        p_cover_selections: cover_selections,
      });
      if (error) throw error;

      const result = data as unknown as {
        success: boolean;
        error?: string;
        ticket_sale_id?: string;
        ticket_number?: string;
        total?: number;
        cover_tokens?: CoverToken[];
      };
      if (!result.success) throw new Error(result.error || "Error al procesar venta");

      // Gross income
      const { data: session } = await supabase.auth.getSession();
      if (session.session?.user) {
        await supabase.from("gross_income_entries").insert({
          venue_id: "00000000-0000-0000-0000-000000000000",
          source_type: "ticket",
          source_id: result.ticket_sale_id,
          amount: result.total!,
          description: `Entrada ${result.ticket_number}`,
          jornada_id: activeJornadaId,
          created_by: session.session.user.id,
        });
      }

      const sale: SaleResult = {
        ticket_sale_id: result.ticket_sale_id!,
        ticket_number: result.ticket_number!,
        total: result.total!,
        cover_tokens: result.cover_tokens || [],
      };
      setSaleResult(sale);

      toast.success(`Venta ${result.ticket_number}`);

      // Demo logging
      if (isDemoMode) {
        for (const it of cart) {
          logDemoEvent({
            event_type: "ticket_sale",
            user_role: "ticket_seller",
            payload: {
              ticket_type: it.ticketType.name,
              quantity: it.quantity,
              cover_included: it.ticketType.includes_cover,
              ticket_number: result.ticket_number,
              qr_count: it.coverSelections.length,
              qr_status: "generated",
            },
          });
        }
      }

      // Auto-print 3 piezas
      await autoPrintSale(sale);

      setStep("success");
      setShowReceipt(true);
      fetchRecentSales();
    } catch (err: any) {
      console.error("Checkout:", err);
      toast.error(err.message || "Error al procesar la venta");
    } finally {
      setProcessing(false);
    }
  };

  const autoPrintSale = async (sale: SaleResult) => {
    try {
      // Build entry tokens (1 per ticket unit)
      // Note: backend currently issues only cover tokens; entries don't have separate access tokens.
      // So we print covers + comprobante. If future schema adds entry tokens, expand here.
      const paperKey = getPreferredPaperWidthStorageKey();
      const paperWidth = (localStorage.getItem(paperKey) as PaperWidth) || "80mm";

      const items = cart.map(it => ({
        name: it.ticketType.name,
        quantity: it.quantity,
        price: it.ticketType.price,
      }));

      // Generate one synthetic "entry piece" per ticket sold (uses the cover token if available, else
      // we still print a header-only ticket without QR for access). Strategy: for each ticket unit,
      // emit a piece. If that unit has a cover, reuse its token as access QR; otherwise just header.
      // Simpler & correct: print a comprobante + 1 access piece per unit (without QR, just ticket
      // number + ticket type), and then 1 cover piece per cover token.
      const entryTokens: TicketSalePrintData["entryTokens"] = [];
      for (const it of cart) {
        for (let i = 0; i < it.quantity; i++) {
          // Use a tokenized entry only if there's no cover (so access is via the cover ticket).
          // For simplicity we always emit an entry piece using the sale ticket_number as fallback.
          entryTokens.push({
            token: sale.ticket_number,
            short_code: null,
            ticket_type: it.ticketType.name,
          });
        }
      }

      const coverTokens: TicketSalePrintData["coverTokens"] = (sale.cover_tokens || []).map(t => ({
        token: t.token,
        short_code: t.short_code || null,
        ticket_type: t.ticket_type,
        cocktail_name: t.cocktail_name || null,
      }));

      const printData: TicketSalePrintData = {
        saleNumber: sale.ticket_number,
        posName: selectedPosName,
        dateTime: format(new Date(), "dd/MM/yyyy HH:mm", { locale: es }),
        items,
        total: sale.total,
        paymentMethod: paymentMethod!,
        entryTokens,
        coverTokens,
      };

      await printTicketSale(printData, paperWidth);
    } catch (err) {
      console.error("Auto-print failed:", err);
      toast.warning("Venta OK, pero la impresión falló. Usa 'Reimprimir'.");
    }
  };

  const handleNewSale = () => {
    setCart([]);
    setSaleResult(null);
    setShowReceipt(false);
    setPaymentMethod(undefined);
    setStep("select-tickets");
  };

  const handleReprint = async () => {
    if (!saleResult) return;
    await autoPrintSale(saleResult);
    toast.success("Reimprimiendo");
  };

  const paymentMethodLabels: Record<PaymentMethodType, { label: string; icon: React.ReactNode }> = {
    cash: { label: "Efectivo", icon: <Banknote className="h-4 w-4" /> },
    card: { label: "Tarjeta", icon: <CreditCard className="h-4 w-4" /> },
  };

  /* ─── Renders ─── */

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // POS Selection
  if (step === "select-pos") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5 p-4">
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
                  {posTerminals.map(pos => (
                    <Card
                      key={pos.id}
                      onClick={() => setSelectedPosId(pos.id)}
                      className={`p-4 cursor-pointer transition-all hover:scale-105 ${
                        selectedPosId === pos.id ? "border-primary bg-primary/10 ring-2 ring-primary" : "hover:border-primary/50"
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
            <Button onClick={confirmPosSelection} disabled={!selectedPosId || posTerminals.length === 0} className="w-full" size="lg">
              Comenzar a Vender
            </Button>
            <Button variant="outline" onClick={async () => { await supabase.auth.signOut(); navigate("/auth"); }} className="w-full gap-2">
              <LogOut className="h-4 w-4" /> Cerrar Sesión
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  if (!activeJornadaId && step === "select-tickets") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5 p-4">
        <div className="max-w-lg mx-auto space-y-6 pt-12">
          <div className="text-center space-y-2">
            <ShieldAlert className="w-16 h-16 mx-auto text-destructive" />
            <h1 className="text-3xl font-bold">Ventas Bloqueadas</h1>
          </div>
          <Alert variant="destructive">
            <ShieldAlert className="h-5 w-5" />
            <AlertTitle>No hay jornada activa</AlertTitle>
            <AlertDescription>Un administrador debe abrir una jornada para vender entradas.</AlertDescription>
          </Alert>
          <Card className="p-6">
            <Button variant="outline" onClick={async () => { await supabase.auth.signOut(); navigate("/auth"); }} className="w-full gap-2">
              <LogOut className="h-4 w-4" /> Cerrar Sesión
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  // Success
  if (step === "success" && saleResult) {
    const receiptCart: ReceiptSaleResult["__cartItems"] = cart.map(it => ({
      ticketType: { id: it.ticketType.id, name: it.ticketType.name, price: it.ticketType.price, includes_cover: it.ticketType.includes_cover },
      quantity: it.quantity,
    }));
    return (
      <>
        <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5 p-4 flex items-center justify-center">
          <Card className="w-full max-w-lg p-8 text-center space-y-6">
            <div className="flex items-center justify-center gap-2 text-primary">
              <Check className="h-10 w-10" />
              <span className="text-2xl font-bold">Venta Completada</span>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Número de ticket</p>
              <p className="text-3xl font-mono font-bold">{saleResult.ticket_number}</p>
              <p className="text-lg font-semibold text-primary">{formatCLP(saleResult.total)}</p>
              {saleResult.cover_tokens.length > 0 && (
                <p className="text-sm text-muted-foreground">{saleResult.cover_tokens.length} QR de cover generados</p>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowReceipt(true)}>Ver QRs</Button>
              <Button className="flex-1" onClick={handleNewSale}>Nueva Venta</Button>
            </div>
          </Card>
        </div>
        <TicketReceiptDialog
          open={showReceipt}
          onClose={() => setShowReceipt(false)}
          saleResult={saleResult ? { ...saleResult, __cartItems: receiptCart } : null}
          onReprint={handleReprint}
        />
      </>
    );
  }

  // Main selling screen
  const coversIncluded = getTotalCoversIncluded();
  const pendingCovers = getPendingCoversCount();

  return (
    <VenueGuard>
      <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
        <div className="flex flex-col lg:flex-row min-h-screen">
          {/* Left grid */}
          <div className="flex-1 lg:w-[70%] p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Ticket className="h-7 w-7 text-primary" />
                <div>
                  <h1 className="text-2xl font-bold">Venta de Entradas</h1>
                  {selectedPosName && (
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <Store className="h-3 w-3" /> {selectedPosName}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <VenueIndicator variant="header" />
                <Button
                  variant="outline" size="sm"
                  onClick={handleDownloadJornadaReport}
                  disabled={!activeJornadaId || !selectedPosId}
                  title="Descargar resultados de jornada"
                  className="gap-2"
                >
                  <Download className="h-4 w-4" /> <span className="hidden sm:inline">Resultados</span>
                </Button>
                <Button
                  variant="outline" size="sm"
                  onClick={async () => { await supabase.auth.signOut(); setCart([]); setSaleResult(null); navigate("/auth"); }}
                  className="gap-2"
                >
                  <LogOut className="h-4 w-4" /> <span className="hidden sm:inline">Salir</span>
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              {ticketTypes.map(tt => {
                const item = cart.find(c => c.ticketType.id === tt.id);
                const qty = item?.quantity || 0;
                const hasCover = tt.includes_cover && tt.cover_options.length > 0;
                return (
                  <Card
                    key={tt.id}
                    className={`transition-all cursor-pointer hover:shadow-md ${qty > 0 ? "ring-2 ring-primary shadow-md" : ""}`}
                    onClick={() => addToCart(tt)}
                  >
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="font-bold text-lg leading-tight">{tt.name}</h3>
                          {hasCover && (
                            <Badge variant="secondary" className="mt-1 text-xs">
                              <Wine className="h-3 w-3 mr-1" />
                              {tt.cover_quantity}x cover · {tt.cover_options.length} opc.
                            </Badge>
                          )}
                        </div>
                      </div>
                      <p className="text-2xl font-bold text-primary">{formatCLP(tt.price)}</p>
                      {qty > 0 && (
                        <div className="flex items-center justify-between pt-2 border-t">
                          <Button variant="outline" size="icon" className="h-10 w-10"
                            onClick={(e) => { e.stopPropagation(); removeFromCart(tt.id); }}>
                            <Minus className="h-5 w-5" />
                          </Button>
                          <span className="text-xl font-bold">{qty}</span>
                          <Button size="icon" className="h-10 w-10"
                            onClick={(e) => { e.stopPropagation(); addToCart(tt); }}>
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

          {/* Right cart */}
          <div className="lg:w-[30%] bg-card border-l p-4 flex flex-col gap-4">
            <Card className="flex-1">
              <CardContent className="p-4 flex flex-col h-full">
                <h2 className="font-bold text-lg mb-4">Carrito</h2>
                {cart.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center text-muted-foreground">
                    <p className="text-sm">Toca una entrada para agregar</p>
                  </div>
                ) : (
                  <>
                    <ScrollArea className="flex-1 mb-4">
                      <div className="space-y-3">
                        {cart.map(item => {
                          const tt = item.ticketType;
                          const itemPending = item.coverSelections.filter(x => !x).length;
                          return (
                            <div key={tt.id} className="p-2 bg-muted/50 rounded space-y-2">
                              <div className="flex items-center justify-between">
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium text-sm truncate">{tt.name}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {formatCLP(tt.price)}
                                    {tt.includes_cover && (
                                      <span className="ml-1 text-primary">(+{item.coverSelections.length} QR)</span>
                                    )}
                                  </p>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeFromCart(tt.id)}>
                                    <Minus className="h-3.5 w-3.5" />
                                  </Button>
                                  <span className="w-5 text-center text-sm font-bold">{item.quantity}</span>
                                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => addToCart(tt)}>
                                    <Plus className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </div>

                              {/* Cover slot selectors */}
                              {tt.includes_cover && tt.cover_options.length > 1 && (
                                <div className="space-y-1 pl-1 border-l-2 border-primary/30">
                                  {item.coverSelections.map((sel, slotIdx) => {
                                    const selectedOpt = tt.cover_options.find(o => o.cocktail_id === sel);
                                    return (
                                      <Popover key={slotIdx}>
                                        <PopoverTrigger asChild>
                                          <button
                                            type="button"
                                            className={`w-full text-left text-xs px-2 py-1 rounded border transition-colors ${
                                              sel ? "border-border bg-background" : "border-destructive/50 bg-destructive/10 text-destructive font-medium"
                                            }`}
                                          >
                                            <span className="flex items-center gap-1">
                                              <Wine className="h-3 w-3 shrink-0" />
                                              <span className="truncate">
                                                Cover {slotIdx + 1}: {selectedOpt?.cocktail_name || "Elegir cover…"}
                                              </span>
                                            </span>
                                          </button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-56 p-1" align="start">
                                          <div className="space-y-1">
                                            {tt.cover_options.map(opt => (
                                              <button
                                                key={opt.cocktail_id}
                                                type="button"
                                                onClick={() => updateCoverSelection(tt.id, slotIdx, opt.cocktail_id)}
                                                className={`w-full text-left text-sm px-2 py-1.5 rounded hover:bg-muted ${
                                                  sel === opt.cocktail_id ? "bg-primary/10 font-medium" : ""
                                                }`}
                                              >
                                                {opt.cocktail_name}
                                              </button>
                                            ))}
                                          </div>
                                        </PopoverContent>
                                      </Popover>
                                    );
                                  })}
                                  {itemPending > 0 && (
                                    <p className="text-[10px] text-destructive flex items-center gap-1 px-1">
                                      <AlertCircle className="h-3 w-3" />
                                      {itemPending} cover sin elegir
                                    </p>
                                  )}
                                </div>
                              )}
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
                          {coversIncluded} cover{coversIncluded > 1 ? "s" : ""} incluido{coversIncluded > 1 ? "s" : ""}
                        </p>
                      )}

                      <div className="space-y-2">
                        <label className="text-sm font-medium">Método de Pago *</label>
                        <Select
                          value={paymentMethod ?? ""}
                          onValueChange={(v) => v && setPaymentMethod(v as PaymentMethodType)}
                        >
                          <SelectTrigger className={!paymentMethod ? "text-muted-foreground border-destructive/50" : ""}>
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
                              <span className="flex items-center gap-2"><Banknote className="h-4 w-4" /> Efectivo</span>
                            </SelectItem>
                            <SelectItem value="card">
                              <span className="flex items-center gap-2"><CreditCard className="h-4 w-4" /> Tarjeta</span>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        {!paymentMethod && (
                          <p className="text-[11px] text-destructive">Selecciona un método de pago</p>
                        )}
                      </div>

                      {pendingCovers > 0 && (
                        <Alert variant="destructive" className="py-2">
                          <AlertCircle className="h-4 w-4" />
                          <AlertDescription className="text-xs">
                            {pendingCovers} cover{pendingCovers > 1 ? "s" : ""} sin asignar
                          </AlertDescription>
                        </Alert>
                      )}

                      <Button
                        size="lg" className="w-full h-12"
                        onClick={handleCheckout}
                        disabled={processing || cart.length === 0 || !paymentMethod || pendingCovers > 0}
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

            <Card>
              <CardContent className="p-4">
                <h3 className="font-bold text-sm mb-3 flex items-center gap-2">
                  <Clock className="h-4 w-4" /> Ventas Recientes
                </h3>
                {recentSales.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Sin ventas recientes</p>
                ) : (
                  <div className="space-y-1">
                    {recentSales.map(sale => (
                      <div key={sale.id} className="flex items-center justify-between gap-2 p-2 rounded text-sm hover:bg-muted/50">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <span className="font-mono font-medium truncate">{sale.ticket_number}</span>
                          <span className="text-xs text-muted-foreground shrink-0">
                            {format(new Date(sale.created_at), "HH:mm", { locale: es })}
                          </span>
                          <span className="text-xs font-semibold shrink-0">{formatCLP(sale.total)}</span>
                          {sale.cover_count > 0 && (
                            <Badge variant="outline" className="text-xs shrink-0">
                              <QrCode className="h-3 w-3 mr-1" />
                              {sale.cover_count}
                            </Badge>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 shrink-0"
                          onClick={() => reprintSale(sale.id)}
                          disabled={reprintingId === sale.id}
                          title="Reimprimir comprobante + QRs"
                        >
                          {reprintingId === sale.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Printer className="h-3 w-3" />
                          )}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </VenueGuard>
  );
}
