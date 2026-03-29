import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, ShoppingCart, LogOut, CreditCard, Banknote, MapPin, Store, Plus, Minus, Trash2, Clock, Check, CheckCircle, AlertCircle, FileCheck, QrCode, X, Undo2, Gift, Printer, Settings2, Package } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CategoryProductGrid } from "@/components/sales/CategoryProductGrid";
import { AddonSelector, type SelectedAddon } from "@/components/sales/AddonSelector";
import { CourtesyRedeemDialog } from "@/components/sales/CourtesyRedeemDialog";
import { HybridPostSaleWizard } from "@/components/sales/HybridPostSaleWizard";
import { HybridQRScannerPanel } from "@/components/sales/HybridQRScannerPanel";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatCLP } from "@/lib/currency";
import WorkerPinDialog from "@/components/WorkerPinDialog";
import PickupQRDialog from "@/components/PickupQRDialog";
import { issueDocument, type DocumentType } from "@/lib/invoicing/index";
import { useAppSession } from "@/contexts/AppSessionContext";
import { useReceiptConfig } from "@/hooks/useReceiptConfig";
import { useAutoPrintReceipt } from "@/hooks/useAutoPrintReceipt";
import type { ReceiptData } from "@/lib/printing/qz";
import { useActiveVenue } from "@/hooks/useActiveVenue";
import { VenueGuard } from "@/components/VenueGuard";
import { VenueIndicator } from "@/components/VenueIndicator";
import { Skeleton } from "@/components/ui/skeleton";
import { usePersistedCart, type Cocktail, type CartItem } from "@/hooks/usePersistedCart";
import { PrintingPanel } from "@/components/sales/PrintingPanel";
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

type POSTerminal = {
  id: string;
  name: string;
  location_id: string;
  is_active: boolean;
  pos_type: string;
  is_cash_register: boolean;
  auto_redeem: boolean;
  bar_location_id: string | null;
  bar_location?: { id: string; name: string } | null;
  auto_print_enabled?: boolean;
  printer_name?: string | null;
};

function PrinterConfigPopover({
  autoPrintEnabled,
  printerName,
  onUpdate,
}: {
  autoPrintEnabled: boolean;
  printerName: string;
  onUpdate: (field: "auto_print_enabled" | "printer_name", value: any) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Impresión automática</p>
          <p className="text-xs text-muted-foreground">
            Se abrirá el diálogo de impresión del navegador
          </p>
        </div>
        <Switch
          checked={autoPrintEnabled}
          onCheckedChange={(v) => onUpdate("auto_print_enabled", v)}
        />
      </div>
      {autoPrintEnabled && (
        <div className="space-y-2">
          <Label className="text-xs">Etiqueta de impresora (opcional)</Label>
          <Input
            placeholder="Ej: Caja 1, Barra Norte"
            defaultValue={printerName}
            className="text-sm h-8"
            onBlur={(e) => {
              if (e.target.value !== printerName) {
                onUpdate("printer_name", e.target.value || null);
              }
            }}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          />
        </div>
      )}
    </div>
  );
}

// BarLocation removed - bar is determined at redemption time, not at sale

export default function Sales() {
  const { activeJornadaId, hasActiveJornada } = useAppSession();
  const { receiptMode, isLoading: isLoadingConfig } = useReceiptConfig();
  const { venue } = useActiveVenue();
  const [pointOfSale, setPointOfSale] = useState("");
  const [loading, setLoading] = useState(false);
  const [issuingDocument, setIssuingDocument] = useState(false);
  const [recentSales, setRecentSales] = useState<any[]>([]);
  const [isVerified, setIsVerified] = useState(true);
  const [showPinDialog, setShowPinDialog] = useState(false);
  const [shouldRedirect, setShouldRedirect] = useState(false);
  const [documentType, setDocumentType] = useState<DocumentType>("boleta");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card">("card");
  const [historialOpen, setHistorialOpen] = useState(false);
  
  // Multi-POS selection (bar is determined at redemption, not sale)
  const [posTerminals, setPosTerminals] = useState<POSTerminal[]>([]);
  const [selectedPosId, setSelectedPosId] = useState<string>(() => localStorage.getItem("selectedPosId") || "");
  const [showPosSelection, setShowPosSelection] = useState(true);

  // ── Persisted cart ──
  const {
    cart,
    isHydrated: cartHydrated,
    lastRemovedItem,
    addToCart,
    increaseQuantity,
    decreaseQuantity,
    updateCartItemAddons,
    undoLastRemove,
    clearCart: clearCartStore,
    calculateTotal,
  } = usePersistedCart({
    venueId: venue?.id,
    posId: selectedPosId,
    jornadaId: activeJornadaId,
  });

  // ── Auto-print hook ──
  const selectedPosObj_forPrint = posTerminals.find(p => p.id === selectedPosId);
  const { autoPrintReceipt, reprintLast, isPrinting, lastPrintStatus, qzAvailable, checkQzStatus, fallbackPrint } = useAutoPrintReceipt({
    venueId: venue?.id,
    posId: selectedPosId,
    userId: "", // Will be set dynamically at print time
    printerName: selectedPosObj_forPrint?.printer_name || "",
    autoPrintEnabled: selectedPosObj_forPrint?.auto_print_enabled || false,
  });

  // Clear cart confirmation
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showCourtesyRedeem, setShowCourtesyRedeem] = useState(false);
  
  // Success screen state
  const [showSuccessScreen, setShowSuccessScreen] = useState(false);
  const [lastSaleData, setLastSaleData] = useState<{
    saleId: string;
    saleNumber: string;
    total: number;
    sellerId: string;
    isHybrid: boolean;
    barLocationId?: string;
    barName?: string;
    pickupData?: {
      token: string;
      shortCode?: string;
      expiresAt: string;
      items: Array<{ name: string; quantity: number; price: number }>;
      barName?: string;
    };
    cartItems: Array<{ name: string; quantity: number; price: number }>;
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
    shortCode?: string;
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
      .select("*, bar_location:stock_locations!pos_terminals_bar_location_id_fkey(id, name)")
      .eq("is_active", true)
      .eq("pos_type", "alcohol_sales")
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
        sale_items!sale_items_sale_id_fkey(
          quantity,
          unit_price,
          cocktails(name)
        ),
        sales_documents!sales_documents_sale_id_fkey(
          id,
          status,
          document_type
        ),
        pickup_tokens!pickup_tokens_sale_id_fkey(
          id,
          token,
          status,
          redeemed_at
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

  const handleCourtesyRedeemed = (item: { cocktailId: string; name: string; qty: number }) => {
    const cocktail = cocktails.find((c) => c.id === item.cocktailId) || {
      id: item.cocktailId,
      name: item.name,
      price: 0,
      category: "cortesia",
    };
    addToCart(cocktail, { isCourtesy: true, overrideQty: item.qty });
    toast.success(`Cortesía agregada: ${item.name} × ${item.qty}`);
  };

  const clearCart = () => {
    clearCartStore();
    setShowClearConfirm(false);
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

    // Block hybrid POS without bar association
    const activePOS = posTerminals.find(p => p.id === selectedPosId);
    if (activePOS?.auto_redeem && !activePOS.bar_location_id) {
      toast.error("Este POS está en modo híbrido, pero no tiene barra asociada. Configúrala en Admin > Puntos de Venta.");
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
      
      // Determine if this is a courtesy sale
      const hasCourtesyItems = cart.some((item) => item.isCourtesy);
      const isFullCourtesy = cart.every((item) => item.isCourtesy);

      // Card = external POS handles receipt in hybrid mode, internal in unified mode
      // Cash = always internal receipt
      const isCardPayment = paymentMethod === "card";
      const shouldIssueInternally = !isFullCourtesy && (receiptMode === "unified" || !isCardPayment);
      const receiptSource = isFullCourtesy ? "internal" : ((isCardPayment && receiptMode === "hybrid") ? "external" : "internal");
      const dbPaymentMethod = isFullCourtesy ? "cash" : paymentMethod;

      const { data: sale, error: saleError } = await supabase
        .from("sales")
        .insert({
          sale_number: saleNumber,
          seller_id: session.session.user.id,
          total_amount: totalAmount,
          net_amount: isFullCourtesy ? 0 : null,
          iva_debit_amount: isFullCourtesy ? 0 : null,
          point_of_sale: pointOfSale || selectedPos?.name || "POS",
          payment_method: dbPaymentMethod,
          payment_status: "paid",
          pos_id: selectedPosId,
          bar_location_id: null,
          jornada_id: activeJornadaId,
          receipt_source: receiptSource,
          sale_category: isFullCourtesy ? "courtesy" : "alcohol",
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

      // Record courtesy redemptions if applicable
      const courtesyItems = cart.filter((item) => item.isCourtesy && item.courtesyCode);
      for (const cItem of courtesyItems) {
        // Update courtesy_qr used_count + status
        const { data: qr, error: qrFetchError } = await supabase
          .from("courtesy_qr")
          .select("id, used_count, max_uses")
          .eq("code", cItem.courtesyCode!)
          .maybeSingle();

        if (qrFetchError) throw new Error(`Error cargando QR cortesía: ${qrFetchError.message}`);

        if (qr) {
          const newUsedCount = (qr.used_count || 0) + 1;
          const newStatus = newUsedCount >= qr.max_uses ? "redeemed" : "active";
          const { error: qrUpdateError } = await supabase
            .from("courtesy_qr")
            .update({ used_count: newUsedCount, status: newStatus })
            .eq("id", qr.id);

          if (qrUpdateError) throw new Error(`Error actualizando QR cortesía: ${qrUpdateError.message}`);

          // Insert redemption record
          const { error: redemptionError } = await supabase
            .from("courtesy_redemptions")
            .insert({
              courtesy_id: qr.id,
              redeemed_by: session.session.user.id,
              pos_id: selectedPosId,
              jornada_id: activeJornadaId!,
              sale_id: sale.id,
              result: "success",
              venue_id: venue?.id!,
            });

          if (redemptionError) throw new Error(`Error registrando cortesía: ${redemptionError.message}`);
        }
      }

      // Record gross income entry (only if non-courtesy amount > 0)
      if (totalAmount > 0) {
        const { error: grossError } = await supabase
          .from("gross_income_entries")
          .insert({
            venue_id: sale.venue_id || "00000000-0000-0000-0000-000000000000",
            source_type: "sale",
            source_id: sale.id,
            amount: Math.round(totalAmount),
            description: isFullCourtesy ? `Cortesía ${saleNumber}` : `Venta ${saleNumber}`,
            jornada_id: activeJornadaId || null,
            created_by: session.session.user.id
          });

        if (grossError) throw new Error(`Error registrando ingreso bruto: ${grossError.message}`);
      }

      // DECISIÓN: Boleta SOLO para pagos en efectivo.
      // Card = proveedor externo (voucher POS), Stockia solo registra venta.
      let receiptStatus: "issued" | "pending" | "failed" | "skipped" | "paid_external" = "skipped";
      const isCashPayment = dbPaymentMethod === "cash";
      
      if (isCashPayment && !isFullCourtesy) {
        // Cash: emit boleta
        receiptStatus = "pending"; // boleta_pending
        const docResult = await issueDocument(sale.id, "boleta");
        if (docResult.success) {
          receiptStatus = "issued"; // boleta_issued
        } else {
          receiptStatus = "failed"; // boleta_failed
          console.warn(`Boleta pendiente: ${docResult.errorMessage}`);
          toast.warning("Boleta no emitida. Puede reintentar desde Documentos.");
        }
      } else if (!isCashPayment) {
        // Card: external POS handles receipt
        receiptStatus = "paid_external";
      }

      // Generate pickup QR token
      let pickupData: typeof lastSaleData["pickupData"] = undefined;
      const { data: tokenResult, error: tokenError } = await supabase.rpc(
        "generate_pickup_token",
        { p_sale_id: sale.id }
      );

      if (!tokenError && tokenResult) {
        const result = tokenResult as { success: boolean; token?: string; short_code?: string; expires_at?: string; bar_name?: string };
        if (result.success && result.token) {
          pickupData = {
            token: result.token,
            shortCode: result.short_code || undefined,
            expiresAt: result.expires_at || new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
            items: cartItemsForQR,
            barName: undefined, // Bar determined at redemption
          };
        }
      }

      // Determine if this is a hybrid POS
      const currentPos = posTerminals.find(p => p.id === selectedPosId);
      const isHybridPOS = !!(currentPos?.auto_redeem && currentPos.bar_location_id);

      // Show success/wizard screen
      setLastSaleData({
        saleId: sale.id,
        saleNumber,
        total: totalAmount,
        sellerId: session.session.user.id,
        isHybrid: isHybridPOS,
        barLocationId: currentPos?.bar_location_id || undefined,
        barName: currentPos?.bar_location?.name || undefined,
        pickupData,
        cartItems: cartItemsForQR,
      });
      setShowSuccessScreen(true);
      clearCartStore();
      fetchRecentSales();

      // ── Auto-print receipt + QR ──
      const preferredPrinterKey =
        venue?.id && selectedPosId
          ? `preferred_printer:${venue.id}:${selectedPosId}`
          : "stockia_printer_name";
      const savedPrinter =
        localStorage.getItem(preferredPrinterKey) || localStorage.getItem("stockia_printer_name");
      const printerToUse = currentPos?.printer_name || savedPrinter;
      const shouldAutoPrint = (currentPos?.auto_print_enabled || !!savedPrinter) && !!printerToUse;
      
      if (shouldAutoPrint && printerToUse) {
        const receiptData: ReceiptData = {
          saleNumber,
          venueName: venue?.name || "Venue",
          posName: currentPos?.name || "POS",
          dateTime: new Date().toLocaleString("es-CL"),
          items: cartItemsForQR,
          total: totalAmount,
          paymentMethod: dbPaymentMethod,
          pickupToken: pickupData?.token,
          shortCode: pickupData?.shortCode,
        };
        // Fire-and-forget with toast feedback
        autoPrintReceipt(receiptData, sale.id).then((result) => {
          if (result.success) {
            toast.success("Impreso OK", { duration: 2000 });
          } else {
            toast.error(`Impresión falló: ${result.error}`, {
              action: {
                label: "Reintentar",
                onClick: () => reprintLast(),
              },
            });
          }
        }).catch((printErr) => {
          console.error("[Sales] autoPrintReceipt error:", printErr);
          toast.error("Error de impresión", {
            action: { label: "Reintentar", onClick: () => reprintLast() },
          });
        });
      }
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
        const result = tokenResult as { success: boolean; token?: string; short_code?: string; expires_at?: string; bar_name?: string; message?: string };
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
            shortCode: result.short_code,
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
                        {pos.auto_redeem && (
                          <p className="text-[10px] mt-1 text-amber-600 font-medium">
                            Híbrido → {pos.bar_location?.name || "Sin barra"}
                          </p>
                        )}
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>

            {/* Show contextual info based on selected POS */}
            {(() => {
              const selPos = posTerminals.find(p => p.id === selectedPosId);
              if (selPos?.auto_redeem) {
                return (
                  <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg text-center text-sm text-amber-700">
                    <MapPin className="w-5 h-5 mx-auto mb-2 text-amber-600" />
                    <p className="font-medium">Modo Híbrido (auto-canje)</p>
                    <p className="text-xs mt-1">Stock se descuenta automáticamente desde <strong>{selPos.bar_location?.name || "barra asociada"}</strong></p>
                  </div>
                );
              }
              return (
                <div className="p-4 bg-muted/50 rounded-lg text-center text-sm text-muted-foreground">
                  <MapPin className="w-5 h-5 mx-auto mb-2 text-muted-foreground/70" />
                  <p>La barra de entrega se determina al escanear el QR</p>
                </div>
              );
            })()}

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
  const selectedPosObj = posTerminals.find(p => p.id === selectedPosId);
  
  // Resolve bar name for hybrid POS header display
  const barNameForHeader = selectedPosObj?.bar_location?.name || "";

  // Success Screen after sale
  if (showSuccessScreen && lastSaleData) {
    // Hybrid POS: show guided wizard (mixer → redeem → deliver)
    if (lastSaleData.isHybrid && lastSaleData.barLocationId && lastSaleData.barName) {
      return (
        <HybridPostSaleWizard
          saleId={lastSaleData.saleId}
          saleNumber={lastSaleData.saleNumber}
          total={lastSaleData.total}
          items={lastSaleData.cartItems}
          barLocationId={lastSaleData.barLocationId}
          barName={lastSaleData.barName}
          sellerId={lastSaleData.sellerId}
          venueId={venue?.id}
          pickupToken={lastSaleData.pickupData?.token}
          pickupExpiresAt={lastSaleData.pickupData?.expiresAt}
          pickupShortCode={lastSaleData.pickupData?.shortCode}
          onComplete={handleNewSale}
        />
      );
    }

    // Normal POS: show classic success screen with QR
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
                shortCode={lastSaleData.pickupData.shortCode}
                embedded
              />
            </div>
          )}

          {/* Print status + reprint */}
          {lastPrintStatus === "success" && (
            <div className="flex items-center justify-center gap-2 text-sm text-green-600">
              <CheckCircle className="w-4 h-4" />
              <span>Impreso correctamente</span>
            </div>
          )}
          {lastPrintStatus === "failed" && (
            <div className="flex items-center justify-center gap-2">
              <span className="text-sm text-destructive flex items-center gap-1">
                <AlertCircle className="w-4 h-4" />
                Impresión falló
              </span>
              <Button variant="outline" size="sm" onClick={() => reprintLast()} disabled={isPrinting}>
                {isPrinting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4 mr-1" />}
                Reimprimir
              </Button>
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
      <div className="h-screen flex flex-col bg-background overflow-hidden">
        {/* Compact Header — fixed */}
        <div className="border-b border-border/50 bg-card shrink-0">
          <div className="px-4 py-2 flex justify-between items-center">
            <div className="flex items-center gap-3">
              <h1 className="text-lg font-bold">Caja</h1>
              <span className="text-sm text-muted-foreground flex items-center gap-1">
                <Store className="w-3.5 h-3.5" />
                {selectedPosName}
              </span>
              {selectedPosObj?.auto_redeem ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 border border-amber-500/30 font-medium">
                    Híbrido · Auto-canje
                  </span>
                  {selectedPosObj.bar_location_id && (
                    <span className="text-[10px] text-muted-foreground">
                      Descuenta desde: <span className="font-medium text-foreground">{barNameForHeader}</span>
                    </span>
                  )}
                </div>
              ) : (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-secondary text-muted-foreground font-medium">
                  Normal · QR pendiente
                </span>
              )}
              <Button variant="link" size="sm" className="h-auto p-0 text-xs text-muted-foreground" onClick={changePosSelection}>
                Cambiar
              </Button>
            </div>
            <div className="flex items-center gap-3">
              {/* Printer config popover */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={`h-8 w-8 p-0 ${selectedPosObj?.auto_print_enabled ? 'text-green-600' : 'text-muted-foreground'}`}
                    title="Configurar impresora"
                  >
                    <Printer className="w-4 h-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80" align="end">
                  <PrinterConfigPopover
                    autoPrintEnabled={selectedPosObj?.auto_print_enabled || false}
                    printerName={selectedPosObj?.printer_name || ""}
                    onUpdate={(field, value) => {
                      // Update local state
                      setPosTerminals(prev => prev.map(p =>
                        p.id === selectedPosId ? { ...p, [field]: value } : p
                      ));
                      // Persist to DB
                      supabase
                        .from("pos_terminals")
                        .update({ [field]: value })
                        .eq("id", selectedPosId)
                        .then(({ error }) => {
                          if (error) toast.error("Error al guardar");
                          else toast.success("Guardado");
                        });
                    }}
                  />
                </PopoverContent>
              </Popover>
              <VenueIndicator variant="header" />
              <Button variant="ghost" size="sm" onClick={handleLogout}>
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          </div>
          {!hasActiveJornada && (
            <div className="bg-destructive/10 border-t border-destructive/30 px-4 py-1.5 text-sm text-destructive font-medium">
              Ventas bloqueadas — No hay jornada activa.
            </div>
          )}
        </div>

        {/* Main content — fills remaining height, 2 columns */}
        <div className="flex-1 min-h-0 flex overflow-hidden">
          {/* LEFT: Product Grid — flexible */}
          <div className="flex-1 min-w-0 p-3 overflow-hidden">
            <div className="h-full rounded-lg border border-border/30 bg-card p-3">
              <CategoryProductGrid
                cocktails={cocktails}
                onAddToCart={addToCart}
                jornadaId={activeJornadaId}
              />
            </div>
          </div>

          {/* RIGHT: Caja Panel — 340px fixed */}
          <div className="w-[340px] shrink-0 p-3 pl-0 flex flex-col overflow-hidden">
            <div className="flex-1 min-h-0 rounded-lg border border-border/30 bg-card/80 flex flex-col overflow-hidden">
              {/* CARRITO header */}
              <div className="flex items-center justify-between px-3 py-2.5 border-b border-border/30 shrink-0">
                <div className="flex items-center gap-2">
                  <ShoppingCart className="w-3.5 h-3.5 text-muted-foreground" />
                  <h2 className="text-xs font-bold tracking-wide">Carrito</h2>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 text-[10px] gap-1 px-2"
                    onClick={() => setShowCourtesyRedeem(true)}
                    disabled={!hasActiveJornada}
                  >
                    <Gift className="w-3 h-3" />
                    Cortesía
                  </Button>
                </div>
                <div className="flex items-center gap-1">
                  {lastRemovedItem && (
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-primary" onClick={undoLastRemove} title="Deshacer">
                      <Undo2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                  {cart.length > 0 && (
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive" onClick={() => setShowClearConfirm(true)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </div>

              {/* CARRITO items — flex-1 with scroll */}
              <div className="flex-1 min-h-0">
                {!cartHydrated ? (
                  <div className="flex h-full items-center justify-center gap-2">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Cargando carrito…</span>
                  </div>
                ) : cart.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center text-muted-foreground gap-2">
                    <ShoppingCart className="w-7 h-7" strokeWidth={1} />
                    <span className="text-xs">Selecciona productos</span>
                    {lastRemovedItem && (
                      <Button variant="outline" size="sm" className="text-xs" onClick={undoLastRemove}>
                        <Undo2 className="w-3.5 h-3.5 mr-1" /> Deshacer
                      </Button>
                    )}
                  </div>
                ) : (
                  <ScrollArea className="h-full" ref={cartScrollRef}>
                    <div className="py-1">
                      {cart.map((item) => {
                        const itemAddonsTotal = item.addons.reduce((a, addon) => a + addon.price, 0);
                        const itemTotal = (item.cocktail.price + itemAddonsTotal) * item.quantity;

                        return (
                          <div
                            key={`${item.cocktail.id}-${item.isCourtesy ? 'c' : 'r'}`}
                            className={`flex items-center gap-2 border-b border-border/30 px-3 py-2 ${item.isCourtesy ? 'bg-primary/10' : ''}`}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1">
                                <p className="truncate text-[11px] font-semibold">{item.cocktail.name}</p>
                                {item.isCourtesy && (
                                  <span className="text-[9px] font-semibold bg-primary/20 text-primary px-1 py-0.5 rounded">CORTESÍA</span>
                                )}
                              </div>
                              <p className="text-[10px] text-muted-foreground">
                                {item.isCourtesy ? "$0" : formatCLP(itemTotal)}
                              </p>
                              {/* Add-ons */}
                              <div className="flex items-center gap-1 flex-wrap mt-0.5">
                                {venue?.id && (
                                  <AddonSelector
                                    cocktailId={item.cocktail.id}
                                    venueId={venue.id}
                                    selectedAddons={item.addons}
                                    onAddonsChange={(addons) => updateCartItemAddons(item.cocktail.id, addons)}
                                  />
                                )}
                                {item.addons.map(addon => (
                                  <span
                                    key={addon.id}
                                    className="inline-flex items-center gap-0.5 text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full cursor-pointer hover:bg-destructive/20 hover:text-destructive"
                                    onClick={() => updateCartItemAddons(item.cocktail.id, item.addons.filter(a => a.id !== addon.id))}
                                  >
                                    {addon.name}
                                    {addon.price > 0 && ` +${formatCLP(addon.price)}`}
                                    <X className="w-2.5 h-2.5" />
                                  </span>
                                ))}
                              </div>
                            </div>
                            <div className="flex items-center gap-1 rounded bg-muted px-1 py-0.5 shrink-0">
                              <button onClick={() => decreaseQuantity(item.cocktail.id)} className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-foreground">
                                <Minus className="w-3 h-3" />
                              </button>
                              <span className="min-w-[18px] text-center text-xs font-bold">{item.quantity}</span>
                              <button onClick={() => increaseQuantity(item.cocktail.id)} className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-foreground">
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                )}
              </div>

              {/* PAGO — shrink-0, always visible */}
              {cart.length > 0 && (
                <div className="shrink-0 border-t border-border px-3 py-3 space-y-2.5">
                  {/* Payment method */}
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setPaymentMethod("cash")}
                      className={`flex items-center justify-center gap-1.5 rounded-md border py-2 text-xs font-semibold transition-colors ${
                        paymentMethod === "cash" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-muted-foreground/40"
                      }`}
                    >
                      <Banknote className="w-3.5 h-3.5" /> Efectivo
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaymentMethod("card")}
                      className={`flex items-center justify-center gap-1.5 rounded-md border py-2 text-xs font-semibold transition-colors ${
                        paymentMethod === "card" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-muted-foreground/40"
                      }`}
                    >
                      <CreditCard className="w-3.5 h-3.5" /> Tarjeta
                    </button>
                  </div>

                  {/* Document type */}
                  {(paymentMethod === "cash" || receiptMode === "unified") && (
                    <Select value={documentType} onValueChange={(value: DocumentType) => setDocumentType(value)}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="boleta">Boleta</SelectItem>
                        <SelectItem value="factura">Factura</SelectItem>
                      </SelectContent>
                    </Select>
                  )}

                  {paymentMethod === "card" && receiptMode === "hybrid" && (
                    <p className="text-[10px] text-muted-foreground text-center">
                      El comprobante se emite desde el POS externo
                    </p>
                  )}

                  {/* Total */}
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">Total</span>
                    <span className="text-xl font-bold text-primary tabular-nums">
                      {formatCLP(calculateTotal())}
                    </span>
                  </div>

                  {/* Cobrar */}
                  <Button
                    onClick={processSale}
                    disabled={loading || !hasActiveJornada}
                    className="w-full h-11 text-sm font-bold tracking-widest uppercase"
                    size="lg"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Procesando...
                      </>
                    ) : (
                      "Cobrar"
                    )}
                  </Button>
                </div>
              )}

              {/* Printing Panel */}
              <div className="shrink-0">
                <PrintingPanel venueName={venue?.name} venueId={venue?.id} posId={selectedPosId} />
              </div>

              {/* QR SCANNER PANEL — solo para caja híbrida */}
              {selectedPosObj?.auto_redeem && selectedPosObj.bar_location_id && (
                <HybridQRScannerPanel
                  barLocationId={selectedPosObj.bar_location_id}
                  barName={barNameForHeader}
                />
              )}

              {/* HISTORIAL COLAPSABLE — shrink-0, at bottom */}
              {recentSales.length > 0 && (
                <Collapsible open={historialOpen} onOpenChange={setHistorialOpen} className="shrink-0 border-t border-border/30">
                  <CollapsibleTrigger className="flex w-full items-center justify-between px-3 py-2.5 hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-2 text-[11px] font-semibold tracking-wide text-muted-foreground">
                      <span>Recientes</span>
                      <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px]">
                        {recentSales.length}
                      </span>
                    </div>
                    <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${historialOpen ? "rotate-180" : ""}`} />
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <ScrollArea className="max-h-[200px]">
                      {recentSales.slice(0, 5).map((sale) => {
                        const doc = sale.sales_documents?.[0];
                        const isExternal = sale.receipt_source === "external";
                        const receiptStatus = isExternal ? "external" : doc?.status || "pending";
                        const pickupToken = sale.pickup_tokens?.[0];
                        const tokenStatus = pickupToken?.status;

                        return (
                          <div key={sale.id} className="flex items-center justify-between border-t border-border/30 px-3 py-1.5">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono text-[10px] font-semibold text-muted-foreground">{sale.sale_number}</span>
                                {receiptStatus === "external" && <CreditCard className="w-2.5 h-2.5 text-muted-foreground" />}
                                {receiptStatus === "issued" && <FileCheck className="w-2.5 h-2.5 text-green-600" />}
                                {receiptStatus === "pending" && <Clock className="w-2.5 h-2.5 text-yellow-600" />}
                                {receiptStatus === "failed" && <AlertCircle className="w-2.5 h-2.5 text-destructive" />}
                              </div>
                              <p className="text-[10px] text-muted-foreground/60">{formatTime(sale.created_at)}</p>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-1.5 gap-1"
                              onClick={() => viewSaleQR(sale)}
                              title={tokenStatus === 'redeemed' ? 'Ya canjeado' : 'Reimprimir QR'}
                            >
                              <QrCode className="w-3 h-3" />
                              <span className="text-[9px]">
                                {tokenStatus === 'redeemed' ? 'Canjeado' : 'QR'}
                              </span>
                              {tokenStatus === 'redeemed' && <Check className="w-2.5 h-2.5 text-green-600" />}
                            </Button>
                          </div>
                        );
                      })}
                    </ScrollArea>
                  </CollapsibleContent>
                </Collapsible>
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
            shortCode={pickupQRData.shortCode}
          />
        )}

        {/* Courtesy Redeem Dialog */}
        <CourtesyRedeemDialog
          open={showCourtesyRedeem}
          onClose={() => setShowCourtesyRedeem(false)}
          onRedeemed={handleCourtesyRedeemed}
        />
      </>
    </VenueGuard>
  );
}
