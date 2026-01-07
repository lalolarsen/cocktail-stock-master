import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, Plus, DollarSign, Receipt, Ticket, FileEdit, ArrowLeft } from "lucide-react";
import { formatCLP } from "@/lib/currency";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useUserRole } from "@/hooks/useUserRole";
import { useNavigate } from "react-router-dom";

interface IncomeEntry {
  id: string;
  source_type: string;
  source_id: string | null;
  amount: number;
  description: string | null;
  jornada_id: string | null;
  created_at: string;
  created_by: string;
}

export default function Income() {
  const { isReadOnly } = useUserRole();
  const navigate = useNavigate();
  const [entries, setEntries] = useState<IncomeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [activeJornadaId, setActiveJornadaId] = useState<string | null>(null);
  
  // Form state
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");

  // Today's stats
  const [todayTotal, setTodayTotal] = useState(0);
  const [todayManual, setTodayManual] = useState(0);

  useEffect(() => {
    fetchEntries();
    fetchActiveJornada();
  }, []);

  const fetchEntries = async () => {
    setLoading(true);
    try {
      const today = new Date().toISOString().split("T")[0];
      
      const { data, error } = await supabase
        .from("gross_income_entries")
        .select("*")
        .gte("created_at", `${today}T00:00:00`)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setEntries(data || []);

      // Calculate today's totals
      const total = (data || []).reduce((sum, e) => sum + e.amount, 0);
      const manual = (data || []).filter(e => e.source_type === 'manual').reduce((sum, e) => sum + e.amount, 0);
      setTodayTotal(total);
      setTodayManual(manual);
    } catch (error: any) {
      console.error("Error fetching income entries:", error);
      toast.error("Error al cargar ingresos");
    } finally {
      setLoading(false);
    }
  };

  const fetchActiveJornada = async () => {
    const { data } = await supabase
      .from("jornadas")
      .select("id")
      .eq("estado", "activa")
      .limit(1)
      .maybeSingle();
    
    setActiveJornadaId(data?.id || null);
  };

  const handleAddIncome = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      toast.error("Ingresa un monto válido");
      return;
    }
    if (!description.trim()) {
      toast.error("Ingresa una descripción");
      return;
    }

    setSubmitting(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session?.user) throw new Error("No autenticado");

      // Get venue_id from profile
      const { data: profile } = await supabase
        .from("profiles")
        .select("venue_id")
        .eq("id", session.session.user.id)
        .single();

      const { error } = await supabase
        .from("gross_income_entries")
        .insert({
          venue_id: profile?.venue_id || "00000000-0000-0000-0000-000000000000",
          source_type: "manual",
          amount: Math.round(parseFloat(amount)),
          description: description.trim(),
          jornada_id: activeJornadaId,
          created_by: session.session.user.id
        });

      if (error) throw error;

      toast.success("Ingreso registrado");
      setShowAddDialog(false);
      setAmount("");
      setDescription("");
      fetchEntries();
    } catch (error: any) {
      console.error("Error adding income:", error);
      toast.error(error.message || "Error al registrar ingreso");
    } finally {
      setSubmitting(false);
    }
  };

  const getSourceIcon = (type: string) => {
    switch (type) {
      case 'sale': return <Receipt className="h-4 w-4" />;
      case 'ticket': return <Ticket className="h-4 w-4" />;
      case 'manual': return <FileEdit className="h-4 w-4" />;
      default: return <DollarSign className="h-4 w-4" />;
    }
  };

  const getSourceLabel = (type: string) => {
    switch (type) {
      case 'sale': return 'Venta barra';
      case 'ticket': return 'Entrada';
      case 'manual': return 'Manual';
      default: return type;
    }
  };

  const getSourceVariant = (type: string): "default" | "secondary" | "outline" => {
    switch (type) {
      case 'sale': return 'default';
      case 'ticket': return 'secondary';
      case 'manual': return 'outline';
      default: return 'outline';
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="flex h-14 items-center gap-4 border-b bg-card px-6">
        <Button variant="ghost" size="sm" onClick={() => navigate("/admin")} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Volver
        </Button>
        <div className="flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold">Ingresos Brutos</h1>
        </div>
      </header>

      <main className="flex-1 p-6 space-y-6 max-w-5xl mx-auto">
        {/* Today's Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Ingresos brutos hoy
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-green-600">{formatCLP(todayTotal)}</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Ingresos manuales
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{formatCLP(todayManual)}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Transacciones
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{entries.length}</p>
            </CardContent>
          </Card>
        </div>

        {/* Add Income Button */}
        {!isReadOnly && (
          <Button onClick={() => setShowAddDialog(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Agregar ingreso
          </Button>
        )}

        {/* Entries List */}
        <Card>
          <CardHeader>
            <CardTitle>Ingresos de hoy</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : entries.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground">
                No hay ingresos registrados hoy
              </p>
            ) : (
              <ScrollArea className="h-[400px]">
                <div className="space-y-2">
                  {entries.map(entry => (
                    <div
                      key={entry.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                    >
                      <div className="flex items-center gap-3">
                        <Badge variant={getSourceVariant(entry.source_type)} className="gap-1">
                          {getSourceIcon(entry.source_type)}
                          {getSourceLabel(entry.source_type)}
                        </Badge>
                        <div>
                          {entry.description && (
                            <p className="text-sm font-medium">{entry.description}</p>
                          )}
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(entry.created_at), "HH:mm", { locale: es })}
                          </p>
                        </div>
                      </div>
                      <p className="font-bold text-green-600">{formatCLP(entry.amount)}</p>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </main>

      {/* Add Income Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agregar ingreso manual</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="amount">Monto (CLP)</Label>
              <Input
                id="amount"
                type="number"
                placeholder="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                min="1"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Descripción</Label>
              <Textarea
                id="description"
                placeholder="Ej: Propina, evento privado..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            {activeJornadaId && (
              <p className="text-sm text-muted-foreground">
                Se asignará a la jornada activa
              </p>
            )}
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
