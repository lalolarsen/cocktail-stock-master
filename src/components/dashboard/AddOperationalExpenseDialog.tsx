import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useAppSession } from "@/contexts/AppSessionContext";
import { DEFAULT_VENUE_ID } from "@/lib/venue";
import { formatCLP } from "@/lib/currency";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export const OPEX_CATEGORIES = [
  { value: "personal", label: "Personal" },
  { value: "operacion_local", label: "Operación local" },
  { value: "insumos_operativos", label: "Insumos operativos" },
  { value: "marketing", label: "Marketing" },
  { value: "administracion", label: "Administración" },
  { value: "tecnologia", label: "Tecnología" },
  { value: "transporte", label: "Transporte" },
  { value: "mantencion", label: "Mantención" },
  { value: "otros", label: "Otros" },
  { value: "ajustes", label: "Ajustes" },
] as const;

export type OpexCategoryValue = typeof OPEX_CATEGORIES[number]["value"];

export function getCategoryLabel(value: string): string {
  return OPEX_CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function AddOperationalExpenseDialog({ open, onOpenChange, onSuccess }: Props) {
  const { user } = useAppSession();
  const [saving, setSaving] = useState(false);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [netAmount, setNetAmount] = useState("");
  const [category, setCategory] = useState<string>("");
  const [description, setDescription] = useState("");
  const [vatApplies, setVatApplies] = useState(false);
  const [vatRate, setVatRate] = useState("19");
  const [specificTax, setSpecificTax] = useState("");
  const [taxNotes, setTaxNotes] = useState("");

  const computed = useMemo(() => {
    const net = Number(netAmount) || 0;
    const rate = Number(vatRate) || 0;
    const vat = vatApplies ? Math.round(net * rate / 100) : 0;
    const spec = Number(specificTax) || 0;
    return { net, vat, spec, total: net + vat + spec };
  }, [netAmount, vatApplies, vatRate, specificTax]);

  const resetForm = () => {
    setNetAmount("");
    setCategory("");
    setDescription("");
    setVatApplies(false);
    setVatRate("19");
    setSpecificTax("");
    setTaxNotes("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) return;
    if (!netAmount || !category || !description) {
      toast.error("Completa monto neto, categoría y descripción");
      return;
    }

    setSaving(true);
    const { error } = await supabase.from("operational_expenses").insert({
      venue_id: DEFAULT_VENUE_ID,
      expense_date: date,
      amount: computed.total,
      net_amount: computed.net,
      vat_rate: vatApplies ? Number(vatRate) : 0,
      vat_amount: computed.vat,
      specific_tax_amount: computed.spec,
      total_amount: computed.total,
      category,
      description: description || null,
      supplier_source: "manual",
      tax_notes: taxNotes || null,
      created_by: user.id,
    });

    setSaving(false);
    if (error) {
      console.error(error);
      toast.error("Error al guardar gasto");
      return;
    }

    toast.success("Gasto registrado");
    resetForm();
    onOpenChange(false);
    onSuccess();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Agregar gasto operacional</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Date */}
          <div className="space-y-1.5">
            <Label>Fecha</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>

          {/* Category */}
          <div className="space-y-1.5">
            <Label>Categoría</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar categoría" />
              </SelectTrigger>
              <SelectContent>
                {OPEX_CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label>Descripción</Label>
            <Input
              placeholder="Detalle del gasto"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />
          </div>

          {/* Net amount */}
          <div className="space-y-1.5">
            <Label>Monto neto (CLP)</Label>
            <Input
              type="number"
              min="0"
              step="1"
              placeholder="0"
              value={netAmount}
              onChange={(e) => setNetAmount(e.target.value)}
              required
            />
          </div>

          {/* VAT toggle */}
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">¿Aplica IVA?</p>
              <p className="text-xs text-muted-foreground">Se calculará automáticamente</p>
            </div>
            <Switch checked={vatApplies} onCheckedChange={setVatApplies} />
          </div>

          {vatApplies && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Tasa IVA (%)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.1"
                  value={vatRate}
                  onChange={(e) => setVatRate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>IVA calculado</Label>
                <Input value={formatCLP(computed.vat)} readOnly className="bg-muted" />
              </div>
            </div>
          )}

          {/* Specific taxes */}
          <div className="space-y-1.5">
            <Label>Impuestos específicos (CLP)</Label>
            <Input
              type="number"
              min="0"
              step="1"
              placeholder="0"
              value={specificTax}
              onChange={(e) => setSpecificTax(e.target.value)}
            />
          </div>

          {/* Total */}
          <div className="rounded-lg border bg-muted/50 p-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Neto</span>
              <span>{formatCLP(computed.net)}</span>
            </div>
            {computed.vat > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">IVA</span>
                <span>{formatCLP(computed.vat)}</span>
              </div>
            )}
            {computed.spec > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Imp. específicos</span>
                <span>{formatCLP(computed.spec)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm font-bold mt-1 pt-1 border-t">
              <span>Total</span>
              <span>{formatCLP(computed.total)}</span>
            </div>
          </div>

          {/* Tax notes */}
          <div className="space-y-1.5">
            <Label>Notas tributarias (opcional)</Label>
            <Textarea
              placeholder="Observaciones sobre impuestos..."
              value={taxNotes}
              onChange={(e) => setTaxNotes(e.target.value)}
              rows={2}
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Guardar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
