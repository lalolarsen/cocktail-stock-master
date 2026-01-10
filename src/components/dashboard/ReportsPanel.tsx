import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CalendarIcon, Download, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { formatCLP } from "@/lib/currency";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

type Sale = {
  id: string;
  sale_number: string;
  created_at: string;
  total_amount: number;
  point_of_sale: string;
  is_cancelled: boolean;
  seller_id: string;
};

type SaleWithSeller = Sale & {
  seller: {
    full_name: string | null;
    email: string;
  };
};

const PAGE_SIZE = 25;

export function ReportsPanel() {
  const [sales, setSales] = useState<SaleWithSeller[]>([]);
  const [startDate, setStartDate] = useState<Date>();
  const [endDate, setEndDate] = useState<Date>();
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  
  // Aggregated totals (fetched separately to avoid loading all rows)
  const [totals, setTotals] = useState({ totalSales: 0, totalCancelled: 0, activeCount: 0, cancelledCount: 0 });

  const fetchSales = async () => {
    if (!startDate || !endDate) return;

    setLoading(true);
    try {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      // Fetch paginated sales with only needed columns
      const { data, error, count } = await supabase
        .from("sales")
        .select(`
          id,
          sale_number,
          created_at,
          total_amount,
          point_of_sale,
          is_cancelled,
          seller_id
        `, { count: "exact" })
        .gte("created_at", startDate.toISOString())
        .lte("created_at", endDate.toISOString())
        .order("created_at", { ascending: false })
        .range(from, to);

      if (error) throw error;

      setTotalCount(count || 0);

      // Fetch seller profiles separately
      const sellerIds = [...new Set(data?.map((s) => s.seller_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", sellerIds);

      const profilesMap = new Map(
        profiles?.map((p) => [p.id, p]) || []
      );

      const salesWithSellers = data?.map((sale) => ({
        ...sale,
        seller: profilesMap.get(sale.seller_id) || {
          full_name: null,
          email: "Usuario desconocido",
        },
      })) || [];

      setSales(salesWithSellers);
    } catch (error) {
      console.error("Error fetching sales:", error);
    } finally {
      setLoading(false);
    }
  };

  // Fetch aggregated totals separately (only when dates change)
  const fetchTotals = async () => {
    if (!startDate || !endDate) return;

    try {
      // Fetch active sales total
      const { data: activeData } = await supabase
        .from("sales")
        .select("total_amount")
        .gte("created_at", startDate.toISOString())
        .lte("created_at", endDate.toISOString())
        .eq("is_cancelled", false);

      // Fetch cancelled sales total
      const { data: cancelledData } = await supabase
        .from("sales")
        .select("total_amount")
        .gte("created_at", startDate.toISOString())
        .lte("created_at", endDate.toISOString())
        .eq("is_cancelled", true);

      const totalSales = (activeData || []).reduce((sum, s) => sum + Number(s.total_amount), 0);
      const totalCancelled = (cancelledData || []).reduce((sum, s) => sum + Number(s.total_amount), 0);

      setTotals({
        totalSales,
        totalCancelled,
        activeCount: activeData?.length || 0,
        cancelledCount: cancelledData?.length || 0,
      });
    } catch (error) {
      console.error("Error fetching totals:", error);
    }
  };

  useEffect(() => {
    if (startDate && endDate) {
      fetchSales();
    }
  }, [startDate, endDate, page]);

  useEffect(() => {
    if (startDate && endDate) {
      setPage(0); // Reset page when dates change
      fetchTotals();
    }
  }, [startDate, endDate]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const handleExport = () => {
    if (sales.length === 0) return;
    
    const headers = ["Número", "Fecha", "Vendedor", "Punto de Venta", "Total", "Estado"];
    const rows = sales.map(sale => [
      sale.sale_number,
      format(new Date(sale.created_at), "dd/MM/yyyy HH:mm"),
      sale.seller.full_name || sale.seller.email,
      sale.point_of_sale,
      sale.total_amount.toString(),
      sale.is_cancelled ? "Cancelada" : "Activa"
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(","))
    ].join("\n");

    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `ventas_${format(startDate!, "yyyy-MM-dd")}_${format(endDate!, "yyyy-MM-dd")}.csv`;
    link.click();
  };

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold gradient-text">Reportes de Ventas</h2>

      {/* Filters */}
      <Card className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>Fecha Inicial</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !startDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {startDate ? (
                    format(startDate, "PPP", { locale: es })
                  ) : (
                    <span>Seleccionar fecha</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={startDate}
                  onSelect={setStartDate}
                  initialFocus
                  className="pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-2">
            <Label>Fecha Final</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !endDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {endDate ? (
                    format(endDate, "PPP", { locale: es })
                  ) : (
                    <span>Seleccionar fecha</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={endDate}
                  onSelect={setEndDate}
                  initialFocus
                  className="pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="flex items-end">
            <Button
              onClick={() => { setPage(0); fetchSales(); fetchTotals(); }}
              disabled={!startDate || !endDate || loading}
              className="w-full"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Cargando...
                </>
              ) : (
                "Generar Reporte"
              )}
            </Button>
          </div>
        </div>
      </Card>

      {/* Summary Cards */}
      {(startDate && endDate) && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="p-6">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Total Ventas</p>
              <p className="text-3xl font-bold text-primary">
                {formatCLP(totals.totalSales)}
              </p>
              <p className="text-xs text-muted-foreground">
                {totals.activeCount} ventas activas
              </p>
            </div>
          </Card>

          <Card className="p-6">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Ventas Canceladas
              </p>
              <p className="text-3xl font-bold text-destructive">
                {formatCLP(totals.totalCancelled)}
              </p>
              <p className="text-xs text-muted-foreground">
                {totals.cancelledCount} canceladas
              </p>
            </div>
          </Card>

          <Card className="p-6">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Total General</p>
              <p className="text-3xl font-bold">
                {formatCLP(totals.totalSales + totals.totalCancelled)}
              </p>
              <p className="text-xs text-muted-foreground">
                {totalCount} transacciones
              </p>
            </div>
          </Card>
        </div>
      )}

      {/* Sales Table */}
      {sales.length > 0 && (
        <Card className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-semibold">Detalle de Ventas</h3>
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="w-4 h-4 mr-2" />
              Exportar
            </Button>
          </div>

          <div className="border rounded-lg overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Número</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Vendedor</TableHead>
                  <TableHead>Punto de Venta</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sales.map((sale) => (
                  <TableRow key={sale.id}>
                    <TableCell className="font-medium">
                      {sale.sale_number}
                    </TableCell>
                    <TableCell>
                      {format(
                        new Date(sale.created_at),
                        "dd/MM/yyyy HH:mm",
                        { locale: es }
                      )}
                    </TableCell>
                    <TableCell>
                      {sale.seller.full_name || sale.seller.email}
                    </TableCell>
                    <TableCell>{sale.point_of_sale}</TableCell>
                    <TableCell className="font-semibold">
                      {formatCLP(sale.total_amount)}
                    </TableCell>
                    <TableCell>
                      {sale.is_cancelled ? (
                        <Badge variant="destructive">Cancelada</Badge>
                      ) : (
                        <Badge variant="default">Activa</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

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
                  disabled={page === 0 || loading}
                  onClick={() => setPage(p => p - 1)}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages - 1 || loading}
                  onClick={() => setPage(p => p + 1)}
                >
                  Siguiente
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {!loading && sales.length === 0 && startDate && endDate && (
        <Card className="p-12 text-center">
          <p className="text-muted-foreground">
            No se encontraron ventas en el período seleccionado
          </p>
        </Card>
      )}
    </div>
  );
}
