import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { 
  ArrowLeft, 
  CalendarIcon, 
  CheckCircle2, 
  XCircle, 
  AlertCircle,
  Clock,
  RefreshCw,
  Search,
  ChevronLeft,
  ChevronRight,
  Loader2
} from "lucide-react";
import { useNavigate } from "react-router-dom";

type RedemptionResult = 
  | "success" 
  | "already_redeemed" 
  | "expired" 
  | "invalid" 
  | "unpaid" 
  | "cancelled" 
  | "not_found" 
  | "stock_error" 
  | "timeout";

interface RedemptionLog {
  id: string;
  pickup_token_id: string | null;
  sale_id: string | null;
  bartender_id: string;
  pos_id: string | null;
  result: RedemptionResult;
  redeemed_at: string;
  metadata: {
    sale_number?: string;
    items?: Array<{ name: string; quantity: number }>;
    total_amount?: number;
    error?: string;
    raw_input?: string;
    [key: string]: unknown;
  } | null;
  created_at: string;
  // Joined data
  bartender_name?: string;
  sale_number?: string;
}

const RESULTS_PER_PAGE = 20;

const resultConfig: Record<RedemptionResult, { label: string; variant: "default" | "destructive" | "secondary" | "outline"; icon: typeof CheckCircle2 }> = {
  success: { label: "Entregado", variant: "default", icon: CheckCircle2 },
  already_redeemed: { label: "Ya canjeado", variant: "secondary", icon: AlertCircle },
  expired: { label: "Expirado", variant: "outline", icon: Clock },
  invalid: { label: "Inválido", variant: "destructive", icon: XCircle },
  unpaid: { label: "No pagado", variant: "destructive", icon: XCircle },
  cancelled: { label: "Cancelado", variant: "destructive", icon: XCircle },
  not_found: { label: "No encontrado", variant: "destructive", icon: XCircle },
  stock_error: { label: "Error stock", variant: "destructive", icon: XCircle },
  timeout: { label: "Timeout", variant: "outline", icon: Clock },
};

export default function PickupRedemptions() {
  const navigate = useNavigate();
  const [page, setPage] = useState(0);
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [resultFilter, setResultFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Fetch redemption logs with filters
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["pickup-redemptions", page, dateFrom, dateTo, resultFilter, searchQuery],
    queryFn: async () => {
      let query = supabase
        .from("pickup_redemptions_log")
        .select(`
          *,
          profiles:bartender_id (full_name),
          sales:sale_id (sale_number)
        `, { count: "exact" })
        .order("redeemed_at", { ascending: false })
        .range(page * RESULTS_PER_PAGE, (page + 1) * RESULTS_PER_PAGE - 1);

      // Apply date filters
      if (dateFrom) {
        query = query.gte("redeemed_at", format(dateFrom, "yyyy-MM-dd"));
      }
      if (dateTo) {
        const nextDay = new Date(dateTo);
        nextDay.setDate(nextDay.getDate() + 1);
        query = query.lt("redeemed_at", format(nextDay, "yyyy-MM-dd"));
      }

      // Apply result filter
      if (resultFilter && resultFilter !== "all") {
        query = query.eq("result", resultFilter as RedemptionResult);
      }

      const { data, error, count } = await query;

      if (error) throw error;

      // Transform data to include joined fields
      const transformedData: RedemptionLog[] = (data || []).map((row: any) => ({
        ...row,
        bartender_name: row.profiles?.full_name || "Desconocido",
        sale_number: row.sales?.sale_number || row.metadata?.sale_number || "-",
      }));

      // Client-side search filter (for sale number)
      const filteredData = searchQuery
        ? transformedData.filter(
            (log) =>
              log.sale_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
              log.bartender_name?.toLowerCase().includes(searchQuery.toLowerCase())
          )
        : transformedData;

      return {
        logs: filteredData,
        totalCount: count || 0,
        totalPages: Math.ceil((count || 0) / RESULTS_PER_PAGE),
      };
    },
  });

  const getItemsSummary = (log: RedemptionLog) => {
    const items = log.metadata?.items;
    if (!items || items.length === 0) return "-";
    
    const total = items.reduce((sum, item) => sum + item.quantity, 0);
    const names = items.map((i) => `${i.quantity}x ${i.name}`).join(", ");
    return `${total} items: ${names}`;
  };

  const clearFilters = () => {
    setDateFrom(undefined);
    setDateTo(undefined);
    setResultFilter("all");
    setSearchQuery("");
    setPage(0);
  };

  const hasActiveFilters = dateFrom || dateTo || resultFilter !== "all" || searchQuery;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b border-border/50 px-6 py-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate("/admin")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Volver
          </Button>
          <h1 className="text-xl font-semibold">Auditoría de Retiros</h1>
        </div>
      </header>

      <main className="p-6 space-y-6 animate-fade-in">
        {/* Filters */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg flex items-center justify-between">
              <span>Filtros</span>
              <div className="flex gap-2">
                {hasActiveFilters && (
                  <Button variant="ghost" size="sm" onClick={clearFilters}>
                    Limpiar filtros
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
                  <RefreshCw className={cn("w-4 h-4 mr-2", isFetching && "animate-spin")} />
                  Actualizar
                </Button>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* Date From */}
              <div className="space-y-2">
                <Label>Desde</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !dateFrom && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dateFrom ? format(dateFrom, "dd/MM/yyyy") : "Seleccionar"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={dateFrom}
                      onSelect={(date) => {
                        setDateFrom(date);
                        setPage(0);
                      }}
                      initialFocus
                      className="p-3 pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* Date To */}
              <div className="space-y-2">
                <Label>Hasta</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !dateTo && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dateTo ? format(dateTo, "dd/MM/yyyy") : "Seleccionar"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={dateTo}
                      onSelect={(date) => {
                        setDateTo(date);
                        setPage(0);
                      }}
                      initialFocus
                      className="p-3 pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* Result Filter */}
              <div className="space-y-2">
                <Label>Resultado</Label>
                <Select
                  value={resultFilter}
                  onValueChange={(value) => {
                    setResultFilter(value);
                    setPage(0);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="success">Entregado</SelectItem>
                    <SelectItem value="already_redeemed">Ya canjeado</SelectItem>
                    <SelectItem value="expired">Expirado</SelectItem>
                    <SelectItem value="not_found">No encontrado</SelectItem>
                    <SelectItem value="unpaid">No pagado</SelectItem>
                    <SelectItem value="cancelled">Cancelado</SelectItem>
                    <SelectItem value="stock_error">Error stock</SelectItem>
                    <SelectItem value="invalid">Inválido</SelectItem>
                    <SelectItem value="timeout">Timeout</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Search */}
              <div className="space-y-2">
                <Label>Buscar</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="# venta o bartender..."
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setPage(0);
                    }}
                    className="pl-9"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Results Table */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg flex items-center justify-between">
              <span>
                Registros de Auditoría
                {data && (
                  <span className="text-sm font-normal text-muted-foreground ml-2">
                    ({data.totalCount} resultados)
                  </span>
                )}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : data?.logs.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                No se encontraron registros
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Fecha/Hora</TableHead>
                        <TableHead># Venta</TableHead>
                        <TableHead>Bartender</TableHead>
                        <TableHead>Resultado</TableHead>
                        <TableHead>Items</TableHead>
                        <TableHead>Detalles</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data?.logs.map((log) => {
                        const config = resultConfig[log.result];
                        const Icon = config.icon;
                        return (
                          <TableRow key={log.id}>
                            <TableCell className="whitespace-nowrap">
                              {format(new Date(log.redeemed_at), "dd/MM/yyyy HH:mm:ss", { locale: es })}
                            </TableCell>
                            <TableCell className="font-mono">{log.sale_number}</TableCell>
                            <TableCell>{log.bartender_name}</TableCell>
                            <TableCell>
                              <Badge variant={config.variant} className="flex items-center gap-1 w-fit">
                                <Icon className="w-3 h-3" />
                                {config.label}
                              </Badge>
                            </TableCell>
                            <TableCell className="max-w-xs truncate" title={getItemsSummary(log)}>
                              {getItemsSummary(log)}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground max-w-xs truncate">
                              {log.metadata?.error || log.metadata?.raw_input || "-"}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                {/* Pagination */}
                {data && data.totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4">
                    <p className="text-sm text-muted-foreground">
                      Página {page + 1} de {data.totalPages}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage((p) => Math.max(0, p - 1))}
                        disabled={page === 0}
                      >
                        <ChevronLeft className="w-4 h-4" />
                        Anterior
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage((p) => p + 1)}
                        disabled={page >= data.totalPages - 1}
                      >
                        Siguiente
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Stats Summary */}
        {data && data.logs.length > 0 && (
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-lg">Resumen</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-4 bg-green-500/10 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">
                    {data.logs.filter((l) => l.result === "success").length}
                  </div>
                  <div className="text-sm text-muted-foreground">Exitosos</div>
                </div>
                <div className="text-center p-4 bg-yellow-500/10 rounded-lg">
                  <div className="text-2xl font-bold text-yellow-600">
                    {data.logs.filter((l) => l.result === "already_redeemed").length}
                  </div>
                  <div className="text-sm text-muted-foreground">Ya canjeados</div>
                </div>
                <div className="text-center p-4 bg-red-500/10 rounded-lg">
                  <div className="text-2xl font-bold text-red-600">
                    {data.logs.filter((l) => !["success", "already_redeemed"].includes(l.result)).length}
                  </div>
                  <div className="text-sm text-muted-foreground">Errores</div>
                </div>
                <div className="text-center p-4 bg-primary/10 rounded-lg">
                  <div className="text-2xl font-bold text-primary">
                    {data.totalCount}
                  </div>
                  <div className="text-sm text-muted-foreground">Total (todos)</div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}