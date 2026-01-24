import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2, Receipt, TrendingDown, Building2, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { formatCLP } from "@/lib/currency";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface Expense {
  id: string;
  description: string;
  amount: number;
  expense_type: "operacional" | "no_operacional";
  category: string | null;
  jornada_id: string | null;
  created_by: string;
  created_at: string;
  notes: string | null;
}

const EXPENSE_CATEGORIES = {
  operacional: [
    "Insumos",
    "Servicios básicos",
    "Mantenimiento",
    "Limpieza",
    "Transporte",
    "Otros operacionales"
  ],
  no_operacional: [
    "Equipamiento",
    "Marketing",
    "Capacitación",
    "Licencias",
    "Seguros",
    "Otros no operacionales"
  ]
};

const PAGE_SIZE = 25;

export function ExpenseDeclaration() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [expenseType, setExpenseType] = useState<"operacional" | "no_operacional">("operacional");
  const [category, setCategory] = useState("");
  const [notes, setNotes] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card">("cash");
  const [page, setPage] = useState(0);
  
  const queryClient = useQueryClient();

  // Fetch active jornada
  const { data: activeJornada } = useQuery({
    queryKey: ["active-jornada"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("jornadas")
        .select("id, numero_jornada")
        .eq("estado", "activa")
        .maybeSingle();
      
      if (error) throw error;
      return data;
    }
  });

  // Fetch expenses with pagination
  const { data: expensesData, isLoading } = useQuery({
    queryKey: ["expenses", page],
    queryFn: async () => {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const { data, error, count } = await supabase
        .from("expenses")
        .select("id, description, amount, expense_type, category, created_at, notes", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(from, to);
      
      if (error) throw error;
      return { expenses: data as Expense[], totalCount: count || 0 };
    }
  });

  // Fetch totals separately (aggregate query for summary)
  const { data: totals } = useQuery({
    queryKey: ["expenses-totals"],
    queryFn: async () => {
      // Fetch counts and sums grouped by type
      const { data: opData } = await supabase
        .from("expenses")
        .select("amount")
        .eq("expense_type", "operacional");
      
      const { data: noOpData } = await supabase
        .from("expenses")
        .select("amount")
        .eq("expense_type", "no_operacional");

      const totalOperacional = (opData || []).reduce((sum, e) => sum + Number(e.amount), 0);
      const totalNoOperacional = (noOpData || []).reduce((sum, e) => sum + Number(e.amount), 0);
      const countOperacional = opData?.length || 0;
      const countNoOperacional = noOpData?.length || 0;

      return { totalOperacional, totalNoOperacional, countOperacional, countNoOperacional };
    }
  });

  // Create expense mutation
  const createExpense = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No autenticado");

      const { error } = await supabase.from("expenses").insert({
        description,
        amount: parseFloat(amount),
        expense_type: expenseType,
        category,
        payment_method: paymentMethod,
        jornada_id: activeJornada?.id || null,
        created_by: user.id,
        notes: notes || null
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      queryClient.invalidateQueries({ queryKey: ["expenses-totals"] });
      toast.success("Gasto registrado exitosamente");
      resetForm();
      setIsDialogOpen(false);
    },
    onError: (error) => {
      toast.error("Error al registrar gasto: " + error.message);
    }
  });

  // Delete expense mutation
  const deleteExpense = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("expenses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      queryClient.invalidateQueries({ queryKey: ["expenses-totals"] });
      toast.success("Gasto eliminado");
    },
    onError: (error) => {
      toast.error("Error al eliminar: " + error.message);
    }
  });

  const resetForm = () => {
    setDescription("");
    setAmount("");
    setExpenseType("operacional");
    setCategory("");
    setNotes("");
    setPaymentMethod("cash");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!description || !amount || !category) {
      toast.error("Por favor completa todos los campos requeridos");
      return;
    }
    createExpense.mutate();
  };

  const expenses = expensesData?.expenses || [];
  const totalCount = expensesData?.totalCount || 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Declaración de Gastos</h2>
          <p className="text-muted-foreground">Registra y gestiona los gastos operacionales y no operacionales</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Nuevo Gasto
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Registrar Nuevo Gasto</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="expense-type">Tipo de Gasto *</Label>
                <Select value={expenseType} onValueChange={(v: "operacional" | "no_operacional") => {
                  setExpenseType(v);
                  setCategory("");
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="operacional">Operacional</SelectItem>
                    <SelectItem value="no_operacional">No Operacional</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="category">Categoría *</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar categoría" />
                  </SelectTrigger>
                  <SelectContent>
                    {EXPENSE_CATEGORIES[expenseType].map((cat) => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Descripción *</Label>
                <Input
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe el gasto..."
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="amount">Monto (CLP) *</Label>
                <Input
                  id="amount"
                  type="number"
                  min="0"
                  step="1"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="payment-method">Método de Pago *</Label>
                <Select value={paymentMethod} onValueChange={(v: "cash" | "card") => setPaymentMethod(v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar método" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Efectivo</SelectItem>
                    <SelectItem value="card">Tarjeta</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Notas (opcional)</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Información adicional..."
                  rows={3}
                />
              </div>

              {activeJornada && (
                <p className="text-sm text-muted-foreground">
                  Se asociará a la jornada activa #{activeJornada.numero_jornada}
                </p>
              )}

              <div className="flex justify-end gap-2 pt-4">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={createExpense.isPending}>
                  {createExpense.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Registrar Gasto
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Gastos Operacionales</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-500">{formatCLP(totals?.totalOperacional || 0)}</div>
            <p className="text-xs text-muted-foreground">
              {totals?.countOperacional || 0} registros
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Gastos No Operacionales</CardTitle>
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-500">{formatCLP(totals?.totalNoOperacional || 0)}</div>
            <p className="text-xs text-muted-foreground">
              {totals?.countNoOperacional || 0} registros
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Gastos</CardTitle>
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCLP((totals?.totalOperacional || 0) + (totals?.totalNoOperacional || 0))}</div>
            <p className="text-xs text-muted-foreground">
              {totalCount} registros totales
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Expenses Table */}
      <Card>
        <CardHeader>
          <CardTitle>Historial de Gastos</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : expenses.length > 0 ? (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Descripción</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Categoría</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expenses.map((expense) => (
                    <TableRow key={expense.id}>
                      <TableCell className="text-muted-foreground">
                        {format(new Date(expense.created_at), "dd/MM/yyyy HH:mm", { locale: es })}
                      </TableCell>
                      <TableCell>
                        <div>
                          <span className="font-medium">{expense.description}</span>
                          {expense.notes && (
                            <p className="text-xs text-muted-foreground">{expense.notes}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={expense.expense_type === "operacional" ? "default" : "secondary"}>
                          {expense.expense_type === "operacional" ? "Operacional" : "No Operacional"}
                        </Badge>
                      </TableCell>
                      <TableCell>{expense.category}</TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCLP(expense.amount)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteExpense.mutate(expense.id)}
                          disabled={deleteExpense.isPending}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Pagination */}
              {totalCount > PAGE_SIZE && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-muted-foreground">
                    Mostrando {page * PAGE_SIZE + 1} - {Math.min((page + 1) * PAGE_SIZE, totalCount)} de {totalCount}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page === 0 || isLoading}
                      onClick={() => setPage(p => p - 1)}
                    >
                      <ChevronLeft className="h-4 w-4 mr-1" />
                      Anterior
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= totalPages - 1 || isLoading}
                      onClick={() => setPage(p => p + 1)}
                    >
                      Siguiente
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Receipt className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No hay gastos registrados</p>
              <p className="text-sm">Haz clic en "Nuevo Gasto" para comenzar</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
