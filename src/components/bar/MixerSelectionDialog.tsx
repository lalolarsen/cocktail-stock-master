import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Check, X, Loader2, GlassWater, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

export interface MixerSlot {
  slot_index: number;
  label: string;
  mixer_category: "latas" | "redbull" | string;
  default_product_id: string;
  default_product_name: string;
  quantity: number;
  available_options: { id: string; name: string; subcategory?: string }[];
}

interface MixerSelectionDialogProps {
  mixerSlots: MixerSlot[];
  onConfirm: (selections: { slot_index: number; product_id: string }[]) => void;
  onCancel: () => void;
  isLoading?: boolean;
  cocktailName?: string;
}

type TabCategory = "latas" | "redbull";

export function MixerSelectionDialog({
  mixerSlots,
  onConfirm,
  onCancel,
  isLoading = false,
  cocktailName,
}: MixerSelectionDialogProps) {
  // Group options across all slots by category
  const hasLatas = mixerSlots.some(
    (s) => s.mixer_category === "latas" || s.available_options.some((o) => o.subcategory === "mixers_tradicionales")
  );
  const hasRedbull = mixerSlots.some(
    (s) => s.mixer_category === "redbull" || s.available_options.some((o) => o.subcategory === "mixers_redbull")
  );

  const defaultTab: TabCategory =
    mixerSlots[0]?.mixer_category === "redbull" ? "redbull" : "latas";
  const [activeTab, setActiveTab] = useState<TabCategory>(defaultTab);

  // Selections: slot_index -> product_id
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

  // Filter slots for current tab
  const slotsForTab = mixerSlots.filter((slot) => {
    if (activeTab === "redbull") {
      return slot.mixer_category === "redbull" ||
        slot.available_options.some((o) => o.subcategory === "mixers_redbull");
    }
    return slot.mixer_category === "latas" ||
      slot.available_options.some((o) => o.subcategory !== "mixers_redbull") ||
      (!slot.mixer_category || slot.mixer_category === "latas");
  });

  // If slot has mixed options, filter options by tab
  const getOptionsForTab = (slot: MixerSlot): { id: string; name: string; subcategory?: string }[] => {
    if (slot.available_options.some((o) => o.subcategory)) {
      return slot.available_options.filter((o) =>
        activeTab === "redbull"
          ? o.subcategory === "mixers_redbull"
          : o.subcategory === "mixers_tradicionales"
      );
    }
    return slot.available_options;
  };

  // When tab changes, if selections are from wrong category, clear them
  const handleTabChange = (tab: TabCategory) => {
    setActiveTab(tab);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "hsl(var(--background))" }}>
      {/* ── Header ── */}
      <div
        className="flex items-center gap-4 p-5 border-b border-border/60"
        style={{ background: "hsl(var(--card))" }}
      >
        <div className="p-3 rounded-xl bg-primary/15 border border-primary/30">
          <GlassWater className="w-7 h-7 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-foreground tracking-tight">
            Selecciona Mixer
          </h1>
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
        <div
          className="flex gap-2 p-1.5 rounded-xl border border-border/60"
          style={{ background: "hsl(var(--muted) / 0.5)" }}
        >
          {hasLatas && (
            <button
              onClick={() => handleTabChange("latas")}
              disabled={isLoading}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-sm font-semibold transition-all duration-150",
                activeTab === "latas"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
            >
              <GlassWater className="w-4 h-4" />
              Bebidas en lata
            </button>
          )}
          {hasRedbull && (
            <button
              onClick={() => handleTabChange("redbull")}
              disabled={isLoading}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-sm font-semibold transition-all duration-150",
                activeTab === "redbull"
                  ? "bg-destructive text-destructive-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
            >
              <Zap className="w-4 h-4" />
              Red Bull
            </button>
          )}
        </div>
      </div>

      {/* ── Product List ── */}
      <ScrollArea className="flex-1 px-4 pt-4">
        <div className="space-y-6 pb-6">
          {mixerSlots.map((slot) => {
            const options = getOptionsForTab(slot);
            if (options.length === 0) return null;

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
                  {options.map((option) => {
                    const isSelected = selections[slot.slot_index] === option.id;
                    const isRedbullItem = option.subcategory === "mixers_redbull";

                    return (
                      <button
                        key={option.id}
                        onClick={() => handleSelect(slot.slot_index, option.id)}
                        disabled={isLoading}
                        className={cn(
                          "relative flex flex-col items-start gap-1 p-3.5 rounded-xl border text-left transition-all duration-150 min-h-[60px]",
                          isSelected
                            ? isRedbullItem
                              ? "border-destructive bg-destructive/10 ring-2 ring-destructive/50"
                              : "border-primary bg-primary/10 ring-2 ring-primary/50"
                            : "border-border/60 bg-card hover:border-primary/40 hover:bg-muted/50 active:scale-[0.98]"
                        )}
                      >
                        {isSelected && (
                          <div
                            className={cn(
                              "absolute top-2.5 right-2.5 rounded-full p-0.5",
                              isRedbullItem ? "bg-destructive" : "bg-primary"
                            )}
                          >
                            <Check className="w-3 h-3 text-white" />
                          </div>
                        )}
                        <span
                          className={cn(
                            "text-sm leading-snug pr-6",
                            isSelected ? "font-semibold text-foreground" : "font-medium text-foreground/80"
                          )}
                        >
                          {option.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {slotsForTab.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <GlassWater className="w-10 h-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">
                No hay productos disponibles en esta categoría
              </p>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* ── Footer ── */}
      <div
        className="p-4 border-t border-border/60 flex gap-3"
        style={{ background: "hsl(var(--card))" }}
      >
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
          disabled={!allSelected || isLoading}
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
