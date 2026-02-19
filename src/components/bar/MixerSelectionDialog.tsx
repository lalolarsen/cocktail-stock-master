import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Check, X, Loader2, GlassWater, Zap, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAppSession } from "@/contexts/AppSessionContext";

// ── Types ──────────────────────────────────────────────────────────────────────
export interface MixerSlot {
  slot_index: number;
  label: string;
  mixer_category: "latas" | "redbull" | string;
  default_product_id: string;
  default_product_name: string;
  quantity: number;
  available_options: { id: string; name: string; subcategory?: string }[];
}

interface MixerProduct {
  id: string;
  name: string;
  subcategory: "MIXER_TRADICIONAL" | "REDBULL";
}

interface MixerSelectionDialogProps {
  mixerSlots: MixerSlot[];
  onConfirm: (selections: { slot_index: number; product_id: string }[]) => void;
  onCancel: () => void;
  isLoading?: boolean;
  cocktailName?: string;
}

type TabCategory = "MIXER_TRADICIONAL" | "REDBULL";

const TAB_CONFIG: Record<TabCategory, { label: string; icon: typeof GlassWater; activeClass: string }> = {
  MIXER_TRADICIONAL: { label: "Mixers tradicionales", icon: GlassWater, activeClass: "bg-primary text-primary-foreground" },
  REDBULL:           { label: "Redbull",              icon: Zap,         activeClass: "bg-destructive text-destructive-foreground" },
};

// ── Component ─────────────────────────────────────────────────────────────────
export function MixerSelectionDialog({
  mixerSlots,
  onConfirm,
  onCancel,
  isLoading = false,
  cocktailName,
}: MixerSelectionDialogProps) {
  const { venue } = useAppSession();

  // ── Dynamic mixer products from DB ──────────────────────────────────────────
  const [mixerProducts, setMixerProducts] = useState<MixerProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const fetchMixers = async () => {
      setLoadingProducts(true);
      setLoadError(null);
      try {
        let query = supabase
          .from("products")
          .select("id, name, subcategory")
          .eq("is_mixer", true)
          .eq("is_active_in_sales", true)
          .in("subcategory", ["MIXER_TRADICIONAL", "REDBULL"])
          .order("name");

        if (venue?.id) {
          query = query.eq("venue_id", venue.id);
        }

        const { data, error } = await query;
        if (error) throw error;
        setMixerProducts((data || []) as MixerProduct[]);
      } catch (err: any) {
        setLoadError("No se pudieron cargar los mixers");
        console.error("[MixerSelectionDialog] fetch error:", err);
      } finally {
        setLoadingProducts(false);
      }
    };
    fetchMixers();
  }, [venue?.id]);

  // ── Tab state ────────────────────────────────────────────────────────────────
  const hasTradicional = mixerProducts.some(p => p.subcategory === "MIXER_TRADICIONAL");
  const hasRedbull = mixerProducts.some(p => p.subcategory === "REDBULL");
  const availableTabs = (["MIXER_TRADICIONAL", "REDBULL"] as TabCategory[]).filter(t =>
    t === "MIXER_TRADICIONAL" ? hasTradicional : hasRedbull
  );

  const [activeTab, setActiveTab] = useState<TabCategory>("MIXER_TRADICIONAL");

  // Auto-select first available tab
  useEffect(() => {
    if (availableTabs.length > 0 && !availableTabs.includes(activeTab)) {
      setActiveTab(availableTabs[0]);
    }
  }, [availableTabs.join(",")]);

  // ── Selections per slot ───────────────────────────────────────────────────────
  const [selections, setSelections] = useState<Record<number, string>>(() => {
    const initial: Record<number, string> = {};
    mixerSlots.forEach((slot) => {
      if (slot.default_product_id) initial[slot.slot_index] = slot.default_product_id;
    });
    return initial;
  });

  const handleSelect = (slotIndex: number, productId: string) => {
    setSelections((prev) => ({ ...prev, [slotIndex]: productId }));
  };

  const handleConfirm = () => {
    const result = Object.entries(selections).map(([slot_index, product_id]) => ({
      slot_index: parseInt(slot_index),
      product_id,
    }));
    onConfirm(result);
  };

  const allSelected = mixerSlots.every((slot) => selections[slot.slot_index]);

  // Products for current tab (dynamic, from DB)
  const productsForTab = mixerProducts.filter(p => p.subcategory === activeTab);

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "hsl(var(--background))" }}>
      {/* ── Header ── */}
      <div className="flex items-center gap-4 p-5 border-b border-border/60" style={{ background: "hsl(var(--card))" }}>
        <div className="p-3 rounded-xl bg-primary/15 border border-primary/30">
          <GlassWater className="w-7 h-7 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-foreground tracking-tight">Selecciona Mixer</h1>
          <p className="text-sm text-muted-foreground mt-0.5 truncate">
            {cocktailName
              ? `${cocktailName} · elige una bebida para continuar`
              : "Elige la bebida que acompañará este cóctel"}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onCancel}
          disabled={isLoading}
          className="h-10 w-10 rounded-xl text-muted-foreground hover:text-foreground shrink-0"
        >
          <X className="w-5 h-5" />
        </Button>
      </div>

      {/* ── Category Tabs ── */}
      <div className="px-4 pt-4 pb-0">
        <div className="flex gap-2 p-1.5 rounded-xl border border-border/60" style={{ background: "hsl(var(--muted) / 0.5)" }}>
          {availableTabs.map((tab) => {
            const cfg = TAB_CONFIG[tab];
            const Icon = cfg.icon;
            const isActive = activeTab === tab;
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                disabled={isLoading}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-sm font-semibold transition-all duration-150",
                  isActive ? cfg.activeClass + " shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
              >
                <Icon className="w-4 h-4" />
                {cfg.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Product List ── */}
      <ScrollArea className="flex-1 px-4 pt-4">
        <div className="space-y-6 pb-6">
          {/* Loading state */}
          {loadingProducts && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Loader2 className="w-8 h-8 text-primary animate-spin mb-3" />
              <p className="text-sm text-muted-foreground">Cargando mixers...</p>
            </div>
          )}

          {/* Error state */}
          {!loadingProducts && loadError && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <AlertCircle className="w-10 h-10 text-destructive/60 mb-3" />
              <p className="text-sm text-destructive">{loadError}</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => setLoadError(null)}>
                Reintentar
              </Button>
            </div>
          )}

          {/* Products */}
          {!loadingProducts && !loadError && mixerSlots.map((slot) => {
            if (productsForTab.length === 0) return null;
            return (
              <div key={slot.slot_index}>
                {mixerSlots.length > 1 && (
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {slot.label}
                    </span>
                    <Badge variant="secondary" className="text-xs">
                      {slot.quantity} ml
                    </Badge>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2.5">
                  {productsForTab.map((product) => {
                    const isSelected = selections[slot.slot_index] === product.id;
                    const isRb = product.subcategory === "REDBULL";
                    return (
                      <button
                        key={product.id}
                        onClick={() => handleSelect(slot.slot_index, product.id)}
                        disabled={isLoading}
                        className={cn(
                          "relative flex flex-col items-start gap-1 p-3.5 rounded-xl border text-left transition-all duration-150 min-h-[60px]",
                          isSelected
                            ? isRb
                              ? "border-destructive bg-destructive/10 ring-2 ring-destructive/50"
                              : "border-primary bg-primary/10 ring-2 ring-primary/50"
                            : "border-border/60 bg-card hover:border-primary/40 hover:bg-muted/50 active:scale-[0.98]"
                        )}
                      >
                        {isSelected && (
                          <div className={cn("absolute top-2.5 right-2.5 rounded-full p-0.5", isRb ? "bg-destructive" : "bg-primary")}>
                            <Check className="w-3 h-3 text-white" />
                          </div>
                        )}
                        <span className={cn(
                          "text-sm leading-snug pr-6",
                          isSelected ? "font-semibold text-foreground" : "font-medium text-foreground/80"
                        )}>
                          {product.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Empty state */}
          {!loadingProducts && !loadError && productsForTab.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <GlassWater className="w-10 h-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">
                No hay productos mixer en esta categoría
              </p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Activa productos en el catálogo con tipo "{TAB_CONFIG[activeTab].label}"
              </p>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* ── Footer ── */}
      <div className="p-4 border-t border-border/60 flex gap-3" style={{ background: "hsl(var(--card))" }}>
        <Button
          variant="outline"
          onClick={onCancel}
          disabled={isLoading}
          className="flex-1 h-14 text-base rounded-xl border-border/60"
        >
          <X className="w-5 h-5 mr-2" />
          Cancelar
        </Button>
        <Button
          onClick={handleConfirm}
          disabled={!allSelected || isLoading || loadingProducts}
          className="flex-1 h-14 text-base rounded-xl font-semibold"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              Redimiendo...
            </>
          ) : (
            <>
              <Check className="w-5 h-5 mr-2" />
              Confirmar mixer
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
