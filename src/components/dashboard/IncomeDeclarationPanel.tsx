import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, Plus, DollarSign, FileEdit, Receipt, Ticket } from "lucide-react";
import { formatCLP } from "@/lib/currency";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { useUserRole } from "@/hooks/useUserRole";
import { useAppSession } from "@/contexts/AppSessionContext";

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

interface IncomeEntry {
  id: string;
  source_type: string;
  amount: number;
  description: string | null;
  entry_date: string | null;
  created_at: string;
}

function getSourceLabel(type: string) {
  switch (type) {
    case "sale": return "Venta barra";
    case "ticket": return "Entrada";
    case "manual": return "Manual";
    default: return type;
  }
}

function getSourceVariant(type: string): "default" | "secondary" | "outline" {
  switch (type) {
    case "sale": return "default";
    case "ticket": return "secondary";
    case "manual": return "outline";
    default: return "outline";
  }
}

function getSourceIcon(type: string) {
  switch (type) {
    case "sale": return <Receipt className="h-3 w-3" />;
    case "ticket": return <Ticket className="h-3 w-3" />;
    case "manual": return <FileEdit className="h-3 w-3" />;
    default: return <DollarSign className="h-3 w-3" />;
  }
}

export function IncomeDeclarationPanel() {
  const { isReadOnly } = useUserRole();
  const { user, venue } = useAppSession();
  const venueId = venue?.id;
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());
  const [selectedYear] = useState(now.getFullYear());

  const [entries, setEntries] = useState<IncomeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [entryDate, setEntryDate] = useState(() => new Date().toISOString().slice(0, 10));

  const fetchEntries = useCallback(async () => {
    if (!venueId) return;
    setLoading(true);
    const start = `${selectedYear}-${String(selectedMonth + 1).padStart(2, "0")}-01`;
    const lastDay = new Date(selectedYear, selectedMonth + 1, 0).getDate();
    const end = `${selectedYear}-${String(selectedMonth + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

    try {
      const { data, error } = await supabase
        .from("gross_income_entries")
        .select("id, source_type, amount, description, created_at")
        .eq("venue_id", venueId)
        .gte("created_at", `${start}T00:00:00`)
        .lte("created_at", `${end}T23:59:59`)
        .order("created_at", { ascending: false });

      if (error) throw error;

      setEntries((data || []).map((e) => ({
        ...e,
        entry_date: e.created_at.slice(0, 10),
      })));
    } catch (err: any) {
      console.error("Error fetching income entries:", err);
      toast.error("Error al cargar ingresos");
    } finally {
      setLoading(false);
    }
  }, [selectedMonth, selectedYear, venueId]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const handleAddIncome = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      toast.error("Ingresa un monto válido");
      return;
    }
    if (!description.trim()) {
      toast.error("Ingresa el motivo del ingreso");
      return;
    }
    if (!user?.id || !venueId) return;

    setSubmitting(true);
    try {
      const { error } = await supabase
        .from("gross_income_entries")
        .insert({
          venue_id: venueId,
          source_type: "manual",
          amount: Math.round(parseFloat(amount)),
          description: description.trim(),
          created_by: user.id,
        } as any);

      if (error) throw error;

      toast.success("Ingreso declarado");
      setShowAddDialog(false);
      setAmount("");
      setDescription("");
      setEntryDate(new Date().toISOString().slice(0, 10));
      fetchEntries();
    } catch (err: any) {
      console.error("Error adding income:", err);
      toast.error(err.message || "Error al declarar ingreso");
    } finally {
      setSubmitting(false);
    }
  };

  const totalGross = entries.reduce((s, e) => s + e.amount, 0);
  const totalManual = entries.filter((e) => e.source_type === "manual").reduce((s, e) => s + e.amount, 0);
  const totalSales = entries.filter((e) => e.source_type === "sale").reduce((s, e) => s + e.amount, 0);
  const totalTickets = entries.filter((e) => e.source_type === "ticket").reduce((s, e) => s + e.amount, 0);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Ingresos Brutos</h1>
          <p className="text-sm text-muted-foreground">
            Declaración de ingresos con motivo — reflejados en el estado de resultados
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={String(selectedMonth)} onValueChange={(v) => setSelectedMonth(Number(v))}>
            <SelectTrigger className="w-[160px] h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTHS.map((m, i) => (
                <SelectItem key={i} value={String(i)}>
                  {m} {selectedYear}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!isReadOnly && (
            <Button onClick={() => setShowAddDialog(true)} size="sm">
              <Plus className="w-4 h-4 mr-1.5" />
              Declarar ingreso
            </Button>
          )}
        </div>
      </div>

      {/* Summary cards */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-5 space-y-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-6 w-28" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-5">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium mb-1">
                Total bruto
              </p>
              <p className="text-2xl font-bold text-green-600 tabular-nums">{formatCLP(totalGross)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium mb-1">
                Manuales declarados
              </p>
              <p className="text-xl font-bold tabular-nums">{formatCLP(totalManual)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium mb-1">
                Ventas barra
              </p>
              <p className="text-xl font-bold tabular-nums">{formatCLP(totalSales)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium mb-1">
                Entradas / Tickets
              </p>
              <p className="text-xl font-bold tabular-nums">{formatCLP(totalTickets)}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Entries table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Registro de ingresos — {MONTHS[selectedMonth]} {selectedYear}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : entries.length === 0 ? (
            <p className="text-center py-10 text-muted-foreground text-sm">
              No hay ingresos registrados en este periodo
            </p>
          ) : (
            <div className="space-y-2">
              {entries.map((entry) => {
                const dateStr = entry.entry_date ?? entry.created_at.slice(0, 10);
                return (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50 gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Badge variant={getSourceVariant(entry.source_type)} className="gap-1 shrink-0">
                        {getSourceIcon(entry.source_type)}
                        {getSourceLabel(entry.source_type)}
                      </Badge>
                      <div className="min-w-0">
                        {entry.description && (
                          <p className="text-sm font-medium truncate">{entry.description}</p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          {format(parseISO(dateStr), "d MMM yyyy", { locale: es })}
                        </p>
                      </div>
                    </div>
                    <p className="font-bold text-green-600 tabular-nums shrink-0">
                      {formatCLP(entry.amount)}
                    </p>
                  </div>
                );
              })}

              {/* Total row */}
              <div className="flex items-center justify-between p-3 rounded-lg border-t mt-2 pt-3">
                <p className="text-sm font-semibold">Total del periodo</p>
                <p className="font-bold tabular-nums text-green-600">{formatCLP(totalGross)}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add income dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Declarar ingreso bruto</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="entry-date">Fecha</Label>
              <Input
                id="entry-date"
                type="date"
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="income-amount">Monto bruto (CLP)</Label>
              <Input
                id="income-amount"
                type="number"
                placeholder="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                min="1"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="income-description">Motivo</Label>
              <Textarea
                id="income-description"
                placeholder="Ej: Evento privado, propinas, ingreso atípico..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
              <p className="text-xs text-muted-foreground">
                Describe el origen de este ingreso. Quedará registrado en el estado de resultados.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleAddIncome} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
