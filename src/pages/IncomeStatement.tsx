import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Download,
  Loader2,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Receipt,
  Ticket,
  FileEdit,
  ShoppingCart,
  Wallet,
} from "lucide-react";
import { formatCLP } from "@/lib/currency";
import { format, startOfDay, endOfDay, startOfMonth, endOfMonth } from "date-fns";
import { es } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import { DateRange } from "react-day-picker";

interface Jornada {
  id: string;
  numero_jornada: number;
  fecha: string;
  estado: string;
}

interface IncomeBreakdown {
  sale: number;
  ticket: number;
  manual: number;
  total: number;
}

interface CostOfSales {
  total_cost: number;
  products_count: number;
  items_count: number;
}

interface Expense {
  id: string;
  description: string;
  amount: number;
  expense_type: string;
  category: string | null;
  created_at: string;
}

interface FrozenSummary {
  gross_sales_total: number;
  net_sales_total: number;
  expenses_total: number;
  expenses_by_type: { operacional?: number; no_operacional?: number };
  net_operational_result: number;
  closed_at: string;
}

export default function IncomeStatement() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [jornadas, setJornadas] = useState<Jornada[]>([]);
  const [selectedJornadaId, setSelectedJornadaId] = useState<string>("");
  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
    const today = new Date();
    return { from: startOfDay(today), to: endOfDay(today) };
  });

  // Data
  const [incomeBreakdown, setIncomeBreakdown] = useState<IncomeBreakdown>({ sale: 0, ticket: 0, manual: 0, total: 0 });
  const [costOfSales, setCostOfSales] = useState<CostOfSales>({ total_cost: 0, products_count: 0, items_count: 0 });
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [incomeEntries, setIncomeEntries] = useState<any[]>([]);
  const [frozenSummary, setFrozenSummary] = useState<FrozenSummary | null>(null);

  // Collapsible sections
  const [incomeOpen, setIncomeOpen] = useState(false);
  const [costOpen, setCostOpen] = useState(false);
  const [expensesOpen, setExpensesOpen] = useState(false);

  useEffect(() => {
    fetchJornadas();
  }, []);

  useEffect(() => {
    if (dateRange?.from && dateRange?.to) {
      fetchData();
    }
  }, [dateRange, selectedJornadaId]);

  const fetchJornadas = async () => {
    const { data } = await supabase
      .from("jornadas")
      .select("id, numero_jornada, fecha, estado")
      .order("fecha", { ascending: false })
      .limit(50);
    setJornadas(data || []);
  };

  const fetchData = async () => {
    if (!dateRange?.from || !dateRange?.to) return;
    setLoading(true);
    setFrozenSummary(null);

    try {
      const fromDate = format(dateRange.from, "yyyy-MM-dd");
      const toDate = format(dateRange.to, "yyyy-MM-dd");
      const fromTimestamp = startOfDay(dateRange.from).toISOString();
      const toTimestamp = endOfDay(dateRange.to).toISOString();

      // If a specific closed jornada is selected, try to get the frozen summary
      if (selectedJornadaId) {
        const selectedJornada = jornadas.find((j) => j.id === selectedJornadaId);
        if (selectedJornada?.estado === "cerrada") {
          const { data: summaryData } = await supabase
            .from("jornada_financial_summary")
            .select("*")
            .eq("jornada_id", selectedJornadaId)
            .is("pos_id", null)
            .maybeSingle();

          if (summaryData) {
            // Cast to the new schema (types.ts may not be updated yet)
            const summary = summaryData as unknown as FrozenSummary;
            setFrozenSummary(summary);
            // Still fetch expenses for detail view
            const { data: expensesData } = await supabase
              .from("expenses")
              .select("*")
              .eq("jornada_id", selectedJornadaId)
              .order("created_at", { ascending: false });
            
            // Set breakdown from frozen data
            setIncomeBreakdown({ sale: 0, ticket: 0, manual: 0, total: summary.gross_sales_total });
            setCostOfSales({ total_cost: 0, products_count: 0, items_count: 0 });
            setExpenses([{ 
              id: 'frozen', 
              description: 'Gastos (snapshot)', 
              amount: summary.expenses_total, 
              expense_type: 'operacional', 
              category: null, 
              created_at: summary.closed_at 
            }]);
            setLoading(false);
            return;
          }
        }
      }

      // Fetch live data for non-closed jornadas or date ranges
      let incomeQuery = supabase
        .from("gross_income_entries")
        .select("*")
        .gte("created_at", fromTimestamp)
        .lte("created_at", toTimestamp);

      if (selectedJornadaId) {
        incomeQuery = incomeQuery.eq("jornada_id", selectedJornadaId);
      }

      const { data: incomeData } = await incomeQuery;
      setIncomeEntries(incomeData || []);

      // Calculate income breakdown by source
      const breakdown: IncomeBreakdown = { sale: 0, ticket: 0, manual: 0, total: 0 };
      (incomeData || []).forEach((entry) => {
        const amount = entry.amount || 0;
        breakdown.total += amount;
        if (entry.source_type === "sale") breakdown.sale += amount;
        else if (entry.source_type === "ticket") breakdown.ticket += amount;
        else if (entry.source_type === "manual") breakdown.manual += amount;
      });
      setIncomeBreakdown(breakdown);

      // Fetch cost of sales using the function
      const { data: costData } = await supabase.rpc("get_cost_of_sales_by_date_range", {
        p_from_date: fromDate,
        p_to_date: toDate,
      });
      
      if (costData && costData.length > 0) {
        setCostOfSales({
          total_cost: costData[0].total_cost || 0,
          products_count: costData[0].products_count || 0,
          items_count: costData[0].items_count || 0,
        });
      } else {
        setCostOfSales({ total_cost: 0, products_count: 0, items_count: 0 });
      }

      // Fetch expenses
      let expensesQuery = supabase
        .from("expenses")
        .select("*")
        .gte("created_at", fromTimestamp)
        .lte("created_at", toTimestamp)
        .order("created_at", { ascending: false });

      if (selectedJornadaId) {
        expensesQuery = expensesQuery.eq("jornada_id", selectedJornadaId);
      }

      const { data: expensesData } = await expensesQuery;
      setExpenses(expensesData || []);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  // Calculated values
  const totalExpenses = useMemo(() => expenses.reduce((sum, e) => sum + e.amount, 0), [expenses]);
  const grossProfit = useMemo(() => incomeBreakdown.total - costOfSales.total_cost, [incomeBreakdown, costOfSales]);
  const grossMargin = useMemo(() => 
    incomeBreakdown.total > 0 ? (grossProfit / incomeBreakdown.total) * 100 : 0,
  [grossProfit, incomeBreakdown]);
  const netResult = useMemo(() => grossProfit - totalExpenses, [grossProfit, totalExpenses]);

  // Use frozen data if available for display
  const displayIngresos = frozenSummary ? frozenSummary.gross_sales_total : incomeBreakdown.total;
  const displayCosto = frozenSummary ? (frozenSummary.gross_sales_total - frozenSummary.net_sales_total) : costOfSales.total_cost;
  const displayGastos = frozenSummary ? frozenSummary.expenses_total : totalExpenses;
  const displayUtilidad = frozenSummary ? frozenSummary.net_sales_total : grossProfit;
  const displayMargen = frozenSummary 
    ? (frozenSummary.gross_sales_total > 0 ? ((frozenSummary.net_sales_total / frozenSummary.gross_sales_total) * 100) : 0) 
    : grossMargin;
  const displayResultado = frozenSummary ? frozenSummary.net_operational_result : netResult;

  // Presets
  const setPreset = (preset: "today" | "currentJornada" | "currentMonth") => {
    const today = new Date();
    setSelectedJornadaId("");
    
    switch (preset) {
      case "today":
        setDateRange({ from: startOfDay(today), to: endOfDay(today) });
        break;
      case "currentJornada":
        const activeJornada = jornadas.find((j) => j.estado === "activa");
        if (activeJornada) {
          setSelectedJornadaId(activeJornada.id);
          setDateRange({ from: new Date(activeJornada.fecha), to: new Date(activeJornada.fecha) });
        }
        break;
      case "currentMonth":
        setDateRange({ from: startOfMonth(today), to: endOfMonth(today) });
        break;
    }
  };

  const handleJornadaSelect = (jornadaId: string) => {
    if (jornadaId === "none") {
      setSelectedJornadaId("");
      return;
    }
    const jornada = jornadas.find((j) => j.id === jornadaId);
    if (jornada) {
      setSelectedJornadaId(jornadaId);
      setDateRange({ from: new Date(jornada.fecha), to: new Date(jornada.fecha) });
    }
  };

  const exportToCSV = () => {
    const rows = [
      ["Estado de Resultados"],
      [`Período: ${dateRange?.from ? format(dateRange.from, "dd/MM/yyyy", { locale: es }) : ""} - ${dateRange?.to ? format(dateRange.to, "dd/MM/yyyy", { locale: es }) : ""}`],
      frozenSummary ? ["(Datos congelados de jornada cerrada)"] : [],
      [""],
      ["Concepto", "Monto (CLP)"],
      ["Ingresos Brutos", displayIngresos],
      ["  - Ventas Barra", frozenSummary ? "" : incomeBreakdown.sale],
      ["  - Entradas", frozenSummary ? "" : incomeBreakdown.ticket],
      ["  - Manuales", frozenSummary ? "" : incomeBreakdown.manual],
      [""],
      ["Costo de Ventas", -displayCosto],
      [""],
      ["Utilidad Bruta", displayUtilidad],
      [`Margen Bruto`, `${displayMargen.toFixed(1)}%`],
      [""],
      ["Gastos Operacionales", -displayGastos],
      ...expenses.map((e) => [`  - ${e.description}`, -e.amount]),
      [""],
      ["Resultado del Período", displayResultado],
    ].filter(row => row.length > 0);

    const csv = rows.map((row) => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    
    // Generate filename based on context
    const dateStr = format(new Date(), "yyyy-MM-dd");
    const filename = selectedJornadaId && frozenSummary
      ? `cierre_jornada_${selectedJornadaId.slice(0, 8)}.csv`
      : `estado_resultados_${dateStr}.csv`;
    
    link.download = filename;
    link.click();
  };

  const getSourceIcon = (type: string) => {
    switch (type) {
      case "sale": return <Receipt className="h-4 w-4" />;
      case "ticket": return <Ticket className="h-4 w-4" />;
      case "manual": return <FileEdit className="h-4 w-4" />;
      default: return <DollarSign className="h-4 w-4" />;
    }
  };

  const getSourceLabel = (type: string) => {
    switch (type) {
      case "sale": return "Venta barra";
      case "ticket": return "Entrada";
      case "manual": return "Manual";
      default: return type;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="flex h-14 items-center gap-4 border-b bg-card px-6">
        <Button variant="ghost" size="sm" onClick={() => navigate("/admin")} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Volver
        </Button>
        <div className="flex-1">
          <h1 className="text-lg font-semibold">Estado de Resultados</h1>
        </div>
        <Button variant="outline" size="sm" onClick={exportToCSV} className="gap-2">
          <Download className="h-4 w-4" />
          Exportar CSV
        </Button>
      </header>

      <main className="p-6 space-y-6 max-w-6xl mx-auto">
        {/* Filters */}
        <Card className="card-minimal">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setPreset("today")}>
                  Hoy
                </Button>
                <Button variant="outline" size="sm" onClick={() => setPreset("currentJornada")}>
                  Jornada actual
                </Button>
                <Button variant="outline" size="sm" onClick={() => setPreset("currentMonth")}>
                  Mes actual
                </Button>
              </div>

              <Separator orientation="vertical" className="h-8" />

              <DateRangePicker
                dateRange={dateRange}
                onDateRangeChange={setDateRange}
                className="w-auto"
              />

              <Select value={selectedJornadaId || "none"} onValueChange={handleJornadaSelect}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Seleccionar jornada" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin filtro de jornada</SelectItem>
                  {jornadas.map((j) => (
                    <SelectItem key={j.id} value={j.id}>
                      J{j.numero_jornada} - {format(new Date(j.fecha), "dd/MM/yyyy", { locale: es })}
                      {j.estado === "activa" && " (activa)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && (
          <>
            {/* KPI Summary */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {/* Frozen Summary Banner */}
              {frozenSummary && (
                <Card className="card-minimal bg-muted/30 col-span-full">
                  <CardContent className="p-3 flex items-center gap-2">
                    <Badge variant="secondary">Datos congelados</Badge>
                    <span className="text-sm text-muted-foreground">
                      Esta jornada fue cerrada el {format(new Date(frozenSummary.closed_at), "dd/MM/yyyy HH:mm", { locale: es })}. Los valores son inmutables.
                    </span>
                  </CardContent>
                </Card>
              )}

              <Card className="card-minimal">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <p className="kpi-label">Ingresos Brutos</p>
                  <p className="kpi-value text-primary">{formatCLP(displayIngresos)}</p>
                </CardContent>
              </Card>

              <Card className="card-minimal">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <p className="kpi-label">Costo de Ventas</p>
                  <p className="kpi-value text-destructive">{formatCLP(displayCosto)}</p>
                </CardContent>
              </Card>

              <Card className="card-minimal">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <p className="kpi-label">Utilidad Bruta</p>
                  <p className={`kpi-value ${displayUtilidad >= 0 ? "text-primary" : "text-destructive"}`}>
                    {formatCLP(displayUtilidad)}
                  </p>
                </CardContent>
              </Card>

              <Card className="card-minimal">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    {displayMargen >= 50 ? (
                      <TrendingUp className="h-4 w-4 text-primary" />
                    ) : (
                      <TrendingDown className="h-4 w-4 text-destructive" />
                    )}
                  </div>
                  <p className="kpi-label">Margen Bruto</p>
                  <p className={`kpi-value ${displayMargen >= 50 ? "text-primary" : "text-destructive"}`}>
                    {displayMargen.toFixed(1)}%
                  </p>
                </CardContent>
              </Card>

              <Card className="card-minimal">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Wallet className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <p className="kpi-label">Gastos Operacionales</p>
                  <p className="kpi-value text-destructive">{formatCLP(displayGastos)}</p>
                </CardContent>
              </Card>

              <Card className={`card-minimal ${displayResultado >= 0 ? "border-primary/30" : "border-destructive/30"}`}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    {displayResultado >= 0 ? (
                      <TrendingUp className="h-4 w-4 text-primary" />
                    ) : (
                      <TrendingDown className="h-4 w-4 text-destructive" />
                    )}
                  </div>
                  <p className="kpi-label">Resultado del Período</p>
                  <p className={`kpi-value ${displayResultado >= 0 ? "text-primary" : "text-destructive"}`}>
                    {formatCLP(displayResultado)}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Detail Sections */}
            <div className="space-y-4">
              {/* Ingresos Section */}
              <Collapsible open={incomeOpen} onOpenChange={setIncomeOpen}>
                <Card className="card-minimal">
                  <CollapsibleTrigger asChild>
                    <CardHeader className="cursor-pointer hover:bg-muted/50 transition-fast">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {incomeOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          <CardTitle className="text-base font-medium">Ingresos</CardTitle>
                        </div>
                        <span className="text-lg font-semibold text-primary">{formatCLP(displayIngresos)}</span>
                      </div>
                    </CardHeader>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <CardContent className="pt-0">
                      <Separator className="mb-4" />
                      {frozenSummary ? (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          Desglose no disponible para jornadas cerradas
                        </p>
                      ) : (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/30">
                            <div className="flex items-center gap-2">
                              <Receipt className="h-4 w-4 text-muted-foreground" />
                              <span className="text-sm">Ventas Barra</span>
                            </div>
                            <span className="font-medium">{formatCLP(incomeBreakdown.sale)}</span>
                          </div>
                          <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/30">
                            <div className="flex items-center gap-2">
                              <Ticket className="h-4 w-4 text-muted-foreground" />
                              <span className="text-sm">Entradas</span>
                            </div>
                            <span className="font-medium">{formatCLP(incomeBreakdown.ticket)}</span>
                          </div>
                          <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/30">
                            <div className="flex items-center gap-2">
                              <FileEdit className="h-4 w-4 text-muted-foreground" />
                              <span className="text-sm">Manuales</span>
                            </div>
                            <span className="font-medium">{formatCLP(incomeBreakdown.manual)}</span>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>

              {/* Costo de Ventas Section */}
              <Collapsible open={costOpen} onOpenChange={setCostOpen}>
                <Card className="card-minimal">
                  <CollapsibleTrigger asChild>
                    <CardHeader className="cursor-pointer hover:bg-muted/50 transition-fast">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {costOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          <CardTitle className="text-base font-medium">Costo de Ventas</CardTitle>
                        </div>
                        <span className="text-lg font-semibold text-destructive">-{formatCLP(displayCosto)}</span>
                      </div>
                    </CardHeader>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <CardContent className="pt-0">
                      <Separator className="mb-4" />
                      <div className="space-y-3">
                        <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/30">
                          <span className="text-sm">Total productos consumidos</span>
                          <Badge variant="outline">{costOfSales.products_count} productos</Badge>
                        </div>
                        <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/30">
                          <span className="text-sm">Total unidades consumidas</span>
                          <Badge variant="outline">{costOfSales.items_count} items</Badge>
                        </div>
                        <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/30">
                          <span className="text-sm font-medium">Costo total de insumos</span>
                          <span className="font-semibold text-destructive">{formatCLP(displayCosto)}</span>
                        </div>
                      </div>
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>

              {/* Gastos Section */}
              <Collapsible open={expensesOpen} onOpenChange={setExpensesOpen}>
                <Card className="card-minimal">
                  <CollapsibleTrigger asChild>
                    <CardHeader className="cursor-pointer hover:bg-muted/50 transition-fast">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {expensesOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          <CardTitle className="text-base font-medium">Gastos Operacionales</CardTitle>
                        </div>
                        <span className="text-lg font-semibold text-destructive">-{formatCLP(displayGastos)}</span>
                      </div>
                    </CardHeader>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <CardContent className="pt-0">
                      <Separator className="mb-4" />
                      {expenses.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          Sin gastos registrados en este período
                        </p>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Fecha</TableHead>
                              <TableHead>Descripción</TableHead>
                              <TableHead>Tipo</TableHead>
                              <TableHead className="text-right">Monto</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {expenses.map((expense) => (
                              <TableRow key={expense.id}>
                                <TableCell className="text-sm text-muted-foreground">
                                  {format(new Date(expense.created_at), "dd/MM HH:mm", { locale: es })}
                                </TableCell>
                                <TableCell className="font-medium">{expense.description}</TableCell>
                                <TableCell>
                                  <Badge variant="outline">{expense.expense_type}</Badge>
                                </TableCell>
                                <TableCell className="text-right font-medium text-destructive">
                                  -{formatCLP(expense.amount)}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            </div>

            {/* Summary Footer */}
            <Card className={`card-minimal ${displayResultado >= 0 ? "bg-primary/5 border-primary/20" : "bg-destructive/5 border-destructive/20"}`}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Resultado del Período</p>
                    <p className="text-sm text-muted-foreground">
                      {dateRange?.from && dateRange?.to
                        ? `${format(dateRange.from, "dd/MM/yyyy", { locale: es })} - ${format(dateRange.to, "dd/MM/yyyy", { locale: es })}`
                        : ""}
                    </p>
                    {frozenSummary && (
                      <Badge variant="secondary" className="mt-1">Congelado</Badge>
                    )}
                  </div>
                  <div className="text-right">
                    <p className={`text-3xl font-bold ${displayResultado >= 0 ? "text-primary" : "text-destructive"}`}>
                      {formatCLP(displayResultado)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {displayResultado >= 0 ? "Utilidad" : "Pérdida"}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
