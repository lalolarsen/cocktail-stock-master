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
import { CalendarIcon, Download } from "lucide-react";
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
  seller: {
    full_name: string | null;
    email: string;
  };
  sale_items: Array<{
    quantity: number;
    unit_price: number;
    subtotal: number;
    cocktails: {
      name: string;
    };
  }>;
};

export function ReportsPanel() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [startDate, setStartDate] = useState<Date>();
  const [endDate, setEndDate] = useState<Date>();
  const [loading, setLoading] = useState(false);

  const fetchSales = async () => {
    if (!startDate || !endDate) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("sales")
        .select(`
          id,
          sale_number,
          created_at,
          total_amount,
          point_of_sale,
          is_cancelled,
          seller_id,
          sale_items(
            quantity,
            unit_price,
            subtotal,
            cocktails(name)
          )
        `)
        .gte("created_at", startDate.toISOString())
        .lte("created_at", endDate.toISOString())
        .order("created_at", { ascending: false });

      if (error) throw error;

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
      }));

      setSales(salesWithSellers || []);
    } catch (error) {
      console.error("Error fetching sales:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (startDate && endDate) {
      fetchSales();
    }
  }, [startDate, endDate]);

  const calculateTotals = () => {
    const activeSales = sales.filter((sale) => !sale.is_cancelled);
    const totalSales = activeSales.reduce(
      (sum, sale) => sum + sale.total_amount,
      0
    );
    const totalCancelled = sales
      .filter((sale) => sale.is_cancelled)
      .reduce((sum, sale) => sum + sale.total_amount, 0);

    return { totalSales, totalCancelled, count: activeSales.length };
  };

  const totals = calculateTotals();

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
              onClick={fetchSales}
              disabled={!startDate || !endDate || loading}
              className="w-full"
            >
              {loading ? "Cargando..." : "Generar Reporte"}
            </Button>
          </div>
        </div>
      </Card>

      {/* Summary Cards */}
      {sales.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="p-6">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Total Ventas</p>
              <p className="text-3xl font-bold text-primary">
                {formatCLP(totals.totalSales)}
              </p>
              <p className="text-xs text-muted-foreground">
                {totals.count} ventas activas
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
                {sales.length - totals.count} canceladas
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
                {sales.length} transacciones
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
            <Button variant="outline" size="sm">
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
                  <TableHead>Items</TableHead>
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
                    <TableCell>
                      <div className="text-sm">
                        {sale.sale_items.map((item, idx) => (
                          <div key={idx}>
                            {item.quantity}x {item.cocktails.name}
                          </div>
                        ))}
                      </div>
                    </TableCell>
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