import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Check, X, Loader2, GlassWater, Zap, AlertCircle, Settings } from "lucide-react";
import { useMixerCatalog, type MixerProduct } from "@/hooks/useMixerCatalog";
import { cn } from "@/lib/utils";

// ── Legacy MixerSlot type (kept for compatibility with Bar.tsx) ────────────────
export interface MixerSlot {
  slot_index: number;
  label: string;
  default_product_id: string;
  default_product_name: string;
  quantity: number;
  available_options: { id: string; name: string }[];
}

interface MixerSelectionDialogProps {
  /** How many mixer units the recipe requires (for display) */
  mixerSlots: MixerSlot[];
  /** Bar location id — used to show per-location stock */
  locationId?: string;
  /** Venue id — used to scope product catalog */
  venueId?: string;
  onConfirm: (selections: { slot_index: number; product_id: string }[]) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

// ── Individual product card ────────────────────────────────────────────────────
function MixerCard({
  product,
  selected,
  onSelect,
}: {
  product: MixerProduct;
  selected: boolean;
  onSelect: () => void;
}) {
  const outOfStock = product.stock === 0;

  return (
    <button
      type="button"
      disabled={outOfStock}
      onClick={onSelect}
      className={cn(
        "relative flex flex-col items-start gap-1 w-full rounded-xl border-2 p-4 text-left transition-all",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        selected
          ? "border-primary bg-primary/10 shadow-md"
          : outOfStock
          ? "border-border bg-muted/30 opacity-50 cursor-not-allowed"
          : "border-border bg-card hover:border-primary/50 hover:bg-primary/5 cursor-pointer"
      )}
    >
      {selected && (
        <span className="absolute top-3 right-3">
          <Check className="h-5 w-5 text-primary" />
        </span>
      )}

      <span className={cn("text-base font-semibold leading-tight", selected && "text-primary")}>
        {product.name}
      </span>

      {product.stock >= 0 && (
        <span
          className={cn(
            "text-xs font-medium",
            outOfStock ? "text-destructive" : "text-muted-foreground"
          )}
        >
          {outOfStock ? "Sin stock" : `${product.stock} en barra`}
        </span>
      )}
    </button>
  );
}

// ── Empty state ────────────────────────────────────────────────────────────────
function EmptyMixers({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <AlertCircle className="h-10 w-10 text-muted-foreground/50" />
      <p className="text-muted-foreground font-medium">Sin productos en "{label}"</p>
      <p className="text-xs text-muted-foreground max-w-xs">
        Agrega productos a esa categoría en{" "}
        <span className="font-semibold text-foreground">/productos</span> para que aparezcan aquí.
      </p>
      <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground border border-dashed rounded-lg px-3 py-2">
        <Settings className="h-3 w-3" />
        <span>Productos → subcategoría correspondiente</span>
      </div>
    </div>
  );
}

// ── Main dialog ────────────────────────────────────────────────────────────────
export function MixerSelectionDialog({
  mixerSlots,
  locationId = "",
  venueId = "",
  onConfirm,
  onCancel,
  isLoading = false,
}: MixerSelectionDialogProps) {
  const { tradicionales, redbull, loading } = useMixerCatalog(locationId, venueId);

  // One selection per slot — we use slot_index 0 for the mixer (unified)
  const [selectedId, setSelectedId] = useState<string>("");

  const handleConfirm = () => {
    if (!selectedId) return;
    // Map selection to all mixer slots that need it
    const selections = mixerSlots.map(slot => ({
      slot_index: slot.slot_index,
      product_id: selectedId,
    }));
    onConfirm(selections);
  };

  const canConfirm = !!selectedId && !isLoading;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="shrink-0 bg-primary text-primary-foreground px-5 py-4 flex items-center gap-3 shadow-md">
        <GlassWater className="h-7 w-7 shrink-0" />
        <div className="min-w-0">
          <h1 className="text-xl font-bold leading-tight">Seleccionar Mixer</h1>
          <p className="text-sm opacity-80">
            {mixerSlots.length > 0
              ? `${mixerSlots[0].label} · ${mixerSlots[0].quantity}ml`
              : "¿Con qué bebida lo preparo?"}
          </p>
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <Tabs defaultValue="tradicionales" className="flex-1 flex flex-col overflow-hidden">
            {/* Tab triggers */}
            <div className="shrink-0 px-4 pt-4">
              <TabsList className="w-full h-14 grid grid-cols-2 text-base">
                <TabsTrigger value="tradicionales" className="h-full gap-2 text-base font-semibold">
                  <GlassWater className="h-4 w-4" />
                  Mixers tradicionales
                  {tradicionales.length > 0 && (
                    <Badge variant="secondary" className="ml-1 text-xs">
                      {tradicionales.length}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="redbull" className="h-full gap-2 text-base font-semibold">
                  <Zap className="h-4 w-4" />
                  Red Bull
                  {redbull.length > 0 && (
                    <Badge variant="secondary" className="ml-1 text-xs">
                      {redbull.length}
                    </Badge>
                  )}
                </TabsTrigger>
              </TabsList>
            </div>

            {/* Tradicionales tab */}
            <TabsContent
              value="tradicionales"
              className="flex-1 overflow-y-auto px-4 pb-4 mt-4 data-[state=active]:flex data-[state=active]:flex-col"
            >
              {tradicionales.length === 0 ? (
                <EmptyMixers label="Mixers tradicionales" />
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {tradicionales.map(p => (
                    <MixerCard
                      key={p.id}
                      product={p}
                      selected={selectedId === p.id}
                      onSelect={() => setSelectedId(p.id)}
                    />
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Red Bull tab */}
            <TabsContent
              value="redbull"
              className="flex-1 overflow-y-auto px-4 pb-4 mt-4 data-[state=active]:flex data-[state=active]:flex-col"
            >
              {redbull.length === 0 ? (
                <EmptyMixers label="Redbull" />
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {redbull.map(p => (
                    <MixerCard
                      key={p.id}
                      product={p}
                      selected={selectedId === p.id}
                      onSelect={() => setSelectedId(p.id)}
                    />
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <div className="shrink-0 px-4 py-4 border-t bg-muted/30 flex gap-3">
        <Button
          variant="outline"
          onClick={onCancel}
          disabled={isLoading}
          className="flex-1 h-14 text-base"
        >
          <X className="h-5 w-5 mr-2" />
          Cancelar
        </Button>
        <Button
          onClick={handleConfirm}
          disabled={!canConfirm}
          className="flex-1 h-14 text-base"
        >
          {isLoading ? (
            <Loader2 className="h-5 w-5 mr-2 animate-spin" />
          ) : (
            <Check className="h-5 w-5 mr-2" />
          )}
          Confirmar
        </Button>
      </div>
    </div>
  );
}
