import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useActiveVenue } from "@/hooks/useActiveVenue";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Trash2, Wine, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

interface WasteProduct {
  id: string;
  name: string;
  code: string;
  unit: string;
  capacity_ml: number | null;
  cost_per_unit: number | null;
}

interface WasteRegistrationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locationId: string;
  locationName: string;
  onWasteRegistered: () => void;
}

const WASTE_REASONS = [
  { value: "rota", label: "Rota" },
  { value: "botada", label: "Botada" },
  { value: "derrame", label: "Derrame" },
  { value: "caducada", label: "Caducada" },
  { value: "devolucion", label: "Devolución" },
] as const;

const PERCENT_OPTIONS = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

type BottleType = "cerrada" | "abierta";

export function WasteRegistrationDialog({
  open,
  onOpenChange,
  locationId,
  locationName,
  onWasteRegistered,
}: WasteRegistrationDialogProps) {
  const { venue } = useActiveVenue();
  const [products, setProducts] = useState<WasteProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [productId, setProductId] = useState("");
  const [bottleType, setBottleType] = useState<BottleType>("cerrada");
  const [percentVisual, setPercentVisual] = useState(100);
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");

  // Fetch products
  useEffect(() => {
    if (!open || !venue?.id) return;
    const fetch = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("products")
        .select("id, name, code, unit, capacity_ml, cost_per_unit")
        .eq("venue_id", venue.id)
        .order("name");
      if (!error) setProducts((data || []) as WasteProduct[]);
      setLoading(false);
    };
    fetch();
  }, [open, venue?.id]);

  // Reset form on close
  useEffect(() => {
    if (!open) {
      setProductId("");
      setBottleType("cerrada");
      setPercentVisual(100);
      setReason("");
      setNotes("");
    }
  }, [open]);

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === productId),
    [products, productId]
  );

  const isVolumetric = selectedProduct?.unit === "ml" && !!selectedProduct.capacity_ml;

  // Calculate ml to deduct
  const calculatedMl = useMemo(() => {
    if (!selectedProduct) return 0;
    if (!isVolumetric) return 1; // 1 unit for non-ml products

    const bottleMl = selectedProduct.capacity_ml!;
    if (bottleType === "cerrada") return bottleMl;
    return Math.round((bottleMl * percentVisual) / 100);
  }, [selectedProduct, isVolumetric, bottleType, percentVisual]);

  // Calculate cost
  const estimatedCost = useMemo(() => {
    if (!selectedProduct?.cost_per_unit) return 0;
    if (!isVolumetric) return selectedProduct.cost_per_unit;
    // cost_per_unit is full bottle cost for volumetric
    const bottleMl = selectedProduct.capacity_ml!;
    const costPerMl = selectedProduct.cost_per_unit / bottleMl;
    return Math.round(costPerMl * calculatedMl);
  }, [selectedProduct, isVolumetric, calculatedMl]);

  const canSave = productId && reason && calculatedMl > 0;

  const handleSave = async () => {
    if (!canSave || !venue?.id) return;
    setSaving(true);

    try {
      const { data: session } = await supabase.auth.getSession();
      const userId = session?.session?.user?.id;

      // Get active jornada if any
      const { data: jornada } = await supabase
        .from("jornadas")
        .select("id")
        .eq("venue_id", venue.id)
        .eq("estado", "abierta")
        .maybeSingle();

      const quantity = isVolumetric ? -calculatedMl : -1;

      const { error } = await supabase.from("stock_movements").insert({
        product_id: productId,
        movement_type: "waste" as any,
        quantity,
        from_location_id: locationId,
        venue_id: venue.id,
        jornada_id: jornada?.id || null,
        notes: `[${reason}] ${notes}`.trim(),
        percent_visual: bottleType === "abierta" ? percentVisual : null,
        unit_cost_snapshot: selectedProduct?.cost_per_unit || null,
        total_cost_snapshot: estimatedCost || null,
        source_type: "waste",
      });

      if (error) throw error;

      // Update stock_balances
      const { data: balance } = await supabase
        .from("stock_balances")
        .select("id, quantity")
        .eq("product_id", productId)
        .eq("location_id", locationId)
        .eq("venue_id", venue.id)
        .maybeSingle();

      if (balance) {
        const newQty = Math.max(0, Number(balance.quantity) + quantity);
        await supabase
          .from("stock_balances")
          .update({ quantity: newQty })
          .eq("id", balance.id);
      }

      toast.success("Merma registrada correctamente");
      onWasteRegistered();
      onOpenChange(false);
    } catch (error) {
      console.error("Error registering waste:", error);
      toast.error("Error al registrar merma");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-destructive" />
            Registrar Merma
          </DialogTitle>
          <DialogDescription>
            Ubicación: <span className="font-medium text-foreground">{locationName}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Product selector */}
          <div className="space-y-2">
            <Label className="text-xs">Producto</Label>
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger>
                <SelectValue placeholder={loading ? "Cargando..." : "Seleccionar producto"} />
              </SelectTrigger>
              <SelectContent>
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    <span className="flex items-center gap-2">
                      {p.name}
                      <span className="text-muted-foreground text-xs">
                        ({p.unit}{p.capacity_ml ? ` · ${p.capacity_ml}ml` : ""})
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Bottle type (only for ml products) */}
          {selectedProduct && isVolumetric && (
            <div className="space-y-2">
              <Label className="text-xs">Tipo de botella</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={bottleType === "cerrada" ? "default" : "outline"}
                  size="sm"
                  className="flex-1"
                  onClick={() => setBottleType("cerrada")}
                >
                  <Wine className="h-4 w-4 mr-1" />
                  Cerrada
                </Button>
                <Button
                  type="button"
                  variant={bottleType === "abierta" ? "default" : "outline"}
                  size="sm"
                  className="flex-1"
                  onClick={() => setBottleType("abierta")}
                >
                  <Wine className="h-4 w-4 mr-1" />
                  Abierta
                </Button>
              </div>
            </div>
          )}

          {/* Visual % selector (only for open bottles) */}
          {selectedProduct && isVolumetric && bottleType === "abierta" && (
            <div className="space-y-2">
              <Label className="text-xs">
                % contenido restante en la botella
              </Label>
              <div className="grid grid-cols-6 gap-1.5">
                {PERCENT_OPTIONS.map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => setPercentVisual(pct)}
                    className={`px-2 py-2 text-xs rounded-md border font-medium transition-colors ${
                      percentVisual === pct
                        ? "bg-destructive text-destructive-foreground border-destructive"
                        : "bg-card text-muted-foreground border-border hover:bg-muted"
                    }`}
                  >
                    {pct}%
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Se descontarán <span className="font-semibold text-foreground">{calculatedMl} ml</span> de {selectedProduct.capacity_ml}ml
              </p>
            </div>
          )}

          {/* Non-volumetric info */}
          {selectedProduct && !isVolumetric && (
            <div className="text-xs text-muted-foreground flex items-center gap-1.5 bg-muted/50 p-2 rounded-md">
              <AlertTriangle className="h-3.5 w-3.5" />
              Se descontará 1 unidad ({selectedProduct.unit})
            </div>
          )}

          {/* Reason */}
          <div className="space-y-2">
            <Label className="text-xs">Motivo *</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar motivo" />
              </SelectTrigger>
              <SelectContent>
                {WASTE_REASONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label className="text-xs">Notas (opcional)</Label>
            <Textarea
              placeholder="Detalle adicional..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="resize-none"
            />
          </div>

          {/* Summary */}
          {selectedProduct && reason && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 space-y-1">
              <p className="text-sm font-medium text-destructive">Resumen de merma</p>
              <p className="text-xs">
                {selectedProduct.name} — {isVolumetric ? `${calculatedMl} ml` : `1 ${selectedProduct.unit}`}
              </p>
              {estimatedCost > 0 && (
                <p className="text-xs text-muted-foreground">
                  Costo estimado: ${estimatedCost.toLocaleString()}
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={handleSave}
            disabled={!canSave || saving}
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Registrar merma
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
