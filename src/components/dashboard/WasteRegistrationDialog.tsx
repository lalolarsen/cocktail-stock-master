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
import { Loader2, Trash2, ChevronRight, ChevronLeft, AlertCircle, MapPin, Package, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

interface WasteProduct {
  id: string;
  name: string;
  code: string;
  unit: string;
  capacity_ml: number | null;
  cost_per_unit: number | null;
}

interface StockLocation {
  id: string;
  name: string;
  type: string;
}

export interface WasteRegistrationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-locked location (from Bar page or hybrid POS) */
  lockedLocationId?: string;
  lockedLocationName?: string;
  onWasteRegistered: () => void;
}

const WASTE_REASONS = [
  { value: "rota", label: "Rota" },
  { value: "botada", label: "Botada" },
  { value: "derrame", label: "Derrame" },
  { value: "caducada", label: "Caducada" },
  { value: "devolucion", label: "Devolución" },
  { value: "otro", label: "Otro" },
] as const;

type Step = 1 | 2;

export function WasteRegistrationDialog({
  open,
  onOpenChange,
  lockedLocationId,
  lockedLocationName,
  onWasteRegistered,
}: WasteRegistrationDialogProps) {
  const { venue } = useActiveVenue();
  const [step, setStep] = useState<Step>(1);
  const [products, setProducts] = useState<WasteProduct[]>([]);
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Step 1 form state
  const [locationId, setLocationId] = useState(lockedLocationId || "");
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");

  // Fetch data
  useEffect(() => {
    if (!open || !venue?.id) return;
    const fetchData = async () => {
      setLoading(true);
      const [prodRes, locRes] = await Promise.all([
        supabase
          .from("products")
          .select("id, name, code, unit, capacity_ml, cost_per_unit")
          .eq("venue_id", venue.id)
          .order("name"),
        supabase
          .from("stock_locations")
          .select("id, name, type")
          .eq("venue_id", venue.id)
          .eq("is_active", true)
          .order("name"),
      ]);
      if (!prodRes.error) setProducts((prodRes.data || []) as WasteProduct[]);
      if (!locRes.error) setLocations((locRes.data || []) as StockLocation[]);
      setLoading(false);
    };
    fetchData();
  }, [open, venue?.id]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setStep(1);
      setLocationId(lockedLocationId || "");
      setProductId("");
      setQuantity("");
      setReason("");
      setNotes("");
    }
  }, [open, lockedLocationId]);

  // Sync locked location
  useEffect(() => {
    if (lockedLocationId) setLocationId(lockedLocationId);
  }, [lockedLocationId]);

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === productId),
    [products, productId]
  );

  // Source of truth: capacity_ml (not unit string)
  const isVolumetric = !!(selectedProduct?.capacity_ml && selectedProduct.capacity_ml > 0);
  const unitType = isVolumetric ? "ml" : "unit";

  const selectedLocation = useMemo(
    () => locations.find((l) => l.id === locationId),
    [locations, locationId]
  );

  const resolvedLocationName = lockedLocationName || selectedLocation?.name || "—";

  // Validate step 1
  const qtyNum = parseFloat(quantity);
  const step1Valid =
    locationId.length > 0 &&
    productId.length > 0 &&
    !isNaN(qtyNum) &&
    qtyNum > 0 &&
    reason.length > 0 &&
    (reason !== "otro" || notes.trim().length > 0);

  const handleNext = () => {
    if (step1Valid) setStep(2);
  };

  const handleSave = async () => {
    if (!step1Valid || !venue?.id) return;
    setSaving(true);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData?.session?.user?.id;
      if (!userId) throw new Error("No hay sesión activa");

      // Get active jornada if any
      const { data: jornada } = await supabase
        .from("jornadas")
        .select("id")
        .eq("venue_id", venue.id)
        .eq("estado", "abierta")
        .maybeSingle();

      const { error } = await supabase.from("waste_requests").insert({
        venue_id: venue.id,
        location_id: locationId,
        product_id: productId,
        quantity: qtyNum,
        unit_type: unitType,
        reason,
        notes: notes || null,
        status: "PENDING_APPROVAL",
        requested_by_user_id: userId,
        jornada_id: jornada?.id || null,
        // Legacy audit fields
        bottle_type: isVolumetric ? "abierta" : "cerrada",
        estimated_cost: selectedProduct?.cost_per_unit
          ? isVolumetric
            ? Math.round((selectedProduct.cost_per_unit / (selectedProduct.capacity_ml || 1)) * qtyNum)
            : selectedProduct.cost_per_unit
          : 0,
      });

      if (error) throw error;

      toast.success("Solicitud de merma enviada — pendiente de aprobación");
      onWasteRegistered();
      onOpenChange(false);
    } catch (err: any) {
      console.error("Error registering waste:", err);
      toast.error(err.message || "Error al registrar merma");
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
            Solicitar Merma
          </DialogTitle>
          <DialogDescription className="flex items-center gap-2">
            <span>Paso {step} de 2</span>
            <span>·</span>
            <span>{step === 1 ? "Detalle de la pérdida" : "Confirmar solicitud"}</span>
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex gap-2">
          <div className={`h-1 flex-1 rounded-full transition-colors ${step >= 1 ? "bg-primary" : "bg-muted"}`} />
          <div className={`h-1 flex-1 rounded-full transition-colors ${step >= 2 ? "bg-primary" : "bg-muted"}`} />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : step === 1 ? (
          <div className="space-y-4 py-2">
            {/* Location */}
            <div className="space-y-2">
              <Label className="text-xs flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                Ubicación de inventario *
              </Label>
              {lockedLocationId ? (
                <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted border border-border text-sm">
                  <span className="font-medium">{resolvedLocationName}</span>
                  <Badge variant="secondary" className="text-[10px] ml-auto">Bloqueado</Badge>
                </div>
              ) : (
                <Select value={locationId} onValueChange={setLocationId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar ubicación" />
                  </SelectTrigger>
                  <SelectContent>
                    {locations.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.name}
                        <span className="text-muted-foreground text-xs ml-2">({l.type})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {!locationId && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  La ubicación es obligatoria
                </p>
              )}
            </div>

            {/* Product */}
            <div className="space-y-2">
              <Label className="text-xs flex items-center gap-1">
                <Package className="h-3 w-3" />
                Producto *
              </Label>
              <Select value={productId} onValueChange={setProductId}>
                <SelectTrigger>
                  <SelectValue placeholder="Buscar producto..." />
                </SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                      <span className="text-muted-foreground text-xs ml-2">
                        ({p.unit}{p.capacity_ml ? ` · ${p.capacity_ml}ml/bot.` : ""})
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Quantity */}
            {selectedProduct && (
              <div className="space-y-2">
                <Label className="text-xs">
                  Cantidad a dar de baja *{" "}
                  <span className="text-muted-foreground">
                    ({isVolumetric ? "ml" : selectedProduct.unit})
                  </span>
                </Label>
                <Input
                  type="number"
                  min="0.01"
                  step={isVolumetric ? "1" : "0.01"}
                  placeholder={isVolumetric ? "Ej: 750" : "Ej: 1"}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
                {isVolumetric && selectedProduct.capacity_ml && quantity && !isNaN(qtyNum) && qtyNum > 0 && (
                  <p className="text-xs text-muted-foreground">
                    ≈ {(qtyNum / selectedProduct.capacity_ml).toFixed(2)} botellas de {selectedProduct.capacity_ml}ml
                  </p>
                )}
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

            {/* Notes — mandatory if reason is "otro" */}
            <div className="space-y-2">
              <Label className="text-xs">
                Notas{reason === "otro" ? " *" : " (opcional)"}
              </Label>
              <Textarea
                placeholder={reason === "otro" ? "Descripción obligatoria para motivo 'Otro'..." : "Detalle adicional..."}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="resize-none"
              />
              {reason === "otro" && !notes.trim() && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  Las notas son obligatorias cuando el motivo es "Otro"
                </p>
              )}
            </div>
          </div>
        ) : (
          /* Step 2 — Confirmation */
          <div className="space-y-4 py-2">
            <div className="bg-muted/50 border border-border rounded-lg p-4 space-y-3">
              <h4 className="text-sm font-semibold">Resumen de solicitud</h4>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="text-muted-foreground">Ubicación</div>
                <div className="font-medium flex items-center gap-1">
                  <MapPin className="h-3 w-3 text-muted-foreground" />
                  {resolvedLocationName}
                </div>
                <div className="text-muted-foreground">Producto</div>
                <div className="font-medium">{selectedProduct?.name}</div>
                <div className="text-muted-foreground">Cantidad</div>
                <div className="font-medium">
                  {qtyNum} {isVolumetric ? "ml" : selectedProduct?.unit}
                </div>
                <div className="text-muted-foreground">Motivo</div>
                <div className="font-medium capitalize">{reason}</div>
                {notes && (
                  <>
                    <div className="text-muted-foreground">Notas</div>
                    <div className="font-medium italic">"{notes}"</div>
                  </>
                )}
              </div>
            </div>

            <div className="bg-warning/10 border border-warning/30 rounded-lg p-3 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">Esta solicitud NO descontará stock</span> hasta que
                un administrador o gerente la apruebe.
              </p>
            </div>
          </div>
        )}

        <DialogFooter className="flex-row gap-2">
          {step === 1 ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
                Cancelar
              </Button>
              <Button
                onClick={handleNext}
                disabled={!step1Valid}
                className="flex-1"
              >
                Continuar
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setStep(1)} className="flex-1">
                <ChevronLeft className="h-4 w-4 mr-1" />
                Volver
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving}
                className="flex-1"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                )}
                Enviar a aprobación
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
