import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<string>("");
  const [description, setDescription] = useState("");

  const resetForm = () => {
    setAmount("");
    setCategory("");
    setDescription("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) return;
    if (!amount || !category || !description) {
      toast.error("Completa monto, categoría y descripción");
      return;
    }

    const numAmount = Number(amount) || 0;

    setSaving(true);
    const { error } = await supabase.from("operational_expenses").insert({
      venue_id: DEFAULT_VENUE_ID,
      expense_date: date,
      amount: numAmount,
      net_amount: numAmount,
      vat_rate: 0,
      vat_amount: 0,
      specific_tax_amount: 0,
      total_amount: numAmount,
      category,
      description: description || null,
      supplier_source: "manual",
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
      <DialogContent className="sm:max-w-lg">
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

          {/* Amount */}
          <div className="space-y-1.5">
            <Label>Monto (CLP)</Label>
            <Input
              type="number"
              min="0"
              step="1"
              placeholder="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>

          {/* Total preview */}
          <div className="rounded-lg border bg-muted/50 p-3">
            <div className="flex justify-between text-sm font-bold">
              <span>Total</span>
              <span>{formatCLP(Number(amount) || 0)}</span>
            </div>
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
