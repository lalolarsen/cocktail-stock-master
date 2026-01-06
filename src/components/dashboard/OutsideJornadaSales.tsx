import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, AlertTriangle, Calendar, Check } from "lucide-react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { formatCLP } from "@/lib/currency";

interface OutsideJornadaSale {
  id: string;
  sale_number: string;
  total_amount: number;
  created_at: string;
  point_of_sale: string;
  seller_id: string;
  profiles?: { full_name: string | null };
}

interface Jornada {
  id: string;
  numero_jornada: number;
  fecha: string;
  estado: string;
}

export function OutsideJornadaSales() {
  const [sales, setSales] = useState<OutsideJornadaSale[]>([]);
  const [jornadas, setJornadas] = useState<Jornada[]>([]);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState(false);
  const [selectedSale, setSelectedSale] = useState<OutsideJornadaSale | null>(null);
  const [selectedJornadaId, setSelectedJornadaId] = useState<string>("");
  const [showAssignDialog, setShowAssignDialog] = useState(false);

  useEffect(() => {
    fetchOutsideJornadaSales();
    fetchRecentJornadas();
  }, []);

  const fetchOutsideJornadaSales = async () => {
    try {
      // First get sales
      const { data: salesData, error: salesError } = await supabase
        .from("sales")
        .select("id, sale_number, total_amount, created_at, point_of_sale, seller_id")
        .eq("outside_jornada", true)
        .eq("is_cancelled", false)
        .order("created_at", { ascending: false });

      if (salesError) throw salesError;

      // Then get seller names
      if (salesData && salesData.length > 0) {
        const sellerIds = [...new Set(salesData.map(s => s.seller_id))];
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", sellerIds);

        const profileMap = new Map(profiles?.map(p => [p.id, p.full_name]) || []);
        
        const salesWithProfiles = salesData.map(sale => ({
          ...sale,
          profiles: { full_name: profileMap.get(sale.seller_id) || null }
        }));
        
        setSales(salesWithProfiles);
      } else {
        setSales([]);
      }
    } catch (error) {
      console.error("Error fetching outside jornada sales:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchRecentJornadas = async () => {
    try {
      const { data, error } = await supabase
        .from("jornadas")
        .select("id, numero_jornada, fecha, estado")
        .in("estado", ["activa", "cerrada"])
        .order("fecha", { ascending: false })
        .limit(10);

      if (error) throw error;
      setJornadas(data || []);
    } catch (error) {
      console.error("Error fetching jornadas:", error);
    }
  };

  const openAssignDialog = (sale: OutsideJornadaSale) => {
    setSelectedSale(sale);
    setSelectedJornadaId("");
    setShowAssignDialog(true);
  };

  const assignToJornada = async () => {
    if (!selectedSale || !selectedJornadaId) {
      toast.error("Selecciona una jornada");
      return;
    }

    setAssigning(true);
    try {
      const { error } = await supabase
        .from("sales")
        .update({
          jornada_id: selectedJornadaId,
          outside_jornada: false,
        })
        .eq("id", selectedSale.id);

      if (error) throw error;

      toast.success(`Venta ${selectedSale.sale_number} asignada correctamente`);
      setShowAssignDialog(false);
      fetchOutsideJornadaSales();
    } catch (error: any) {
      toast.error(error.message || "Error al asignar venta");
    } finally {
      setAssigning(false);
    }
  };

  const assignAllToJornada = async (jornadaId: string) => {
    if (sales.length === 0) return;

    setAssigning(true);
    try {
      const { error } = await supabase
        .from("sales")
        .update({
          jornada_id: jornadaId,
          outside_jornada: false,
        })
        .eq("outside_jornada", true)
        .eq("is_cancelled", false);

      if (error) throw error;

      toast.success(`${sales.length} ventas asignadas correctamente`);
      fetchOutsideJornadaSales();
    } catch (error: any) {
      toast.error(error.message || "Error al asignar ventas");
    } finally {
      setAssigning(false);
    }
  };

  if (loading) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center py-4">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      </Card>
    );
  }

  if (sales.length === 0) {
    return null; // Don't show card if no outside_jornada sales
  }

  const activeJornada = jornadas.find(j => j.estado === "activa");

  return (
    <Card className="p-6 border-amber-500/50 bg-amber-500/5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-amber-600" />
          <h3 className="text-lg font-semibold text-amber-800 dark:text-amber-200">
            Ventas Fuera de Jornada
          </h3>
          <Badge variant="outline" className="border-amber-500 text-amber-700">
            {sales.length} pendientes
          </Badge>
        </div>

        {activeJornada && sales.length > 0 && (
          <Button
            size="sm"
            onClick={() => assignAllToJornada(activeJornada.id)}
            disabled={assigning}
          >
            {assigning ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Check className="w-4 h-4 mr-2" />
            )}
            Asignar Todas a Jornada Actual
          </Button>
        )}
      </div>

      <p className="text-sm text-muted-foreground mb-4">
        Estas ventas se realizaron cuando no había jornada activa. Deben asignarse a una jornada antes del cierre final.
      </p>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Venta</TableHead>
            <TableHead>Fecha/Hora</TableHead>
            <TableHead>Vendedor</TableHead>
            <TableHead>POS</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead className="text-right">Acción</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sales.map((sale) => (
            <TableRow key={sale.id}>
              <TableCell className="font-medium">{sale.sale_number}</TableCell>
              <TableCell>
                {format(parseISO(sale.created_at), "dd/MM HH:mm", { locale: es })}
              </TableCell>
              <TableCell>{sale.profiles?.full_name || "—"}</TableCell>
              <TableCell>{sale.point_of_sale}</TableCell>
              <TableCell className="text-right">{formatCLP(sale.total_amount)}</TableCell>
              <TableCell className="text-right">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => openAssignDialog(sale)}
                >
                  <Calendar className="w-4 h-4 mr-1" />
                  Asignar
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Assign Dialog */}
      <Dialog open={showAssignDialog} onOpenChange={setShowAssignDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              Asignar Venta a Jornada
            </DialogTitle>
            <DialogDescription>
              Asigna la venta {selectedSale?.sale_number} a una jornada existente.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <Select value={selectedJornadaId} onValueChange={setSelectedJornadaId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona una jornada" />
              </SelectTrigger>
              <SelectContent>
                {jornadas.map((jornada) => (
                  <SelectItem key={jornada.id} value={jornada.id}>
                    <div className="flex items-center gap-2">
                      <span>Jornada {jornada.numero_jornada}</span>
                      <span className="text-muted-foreground">
                        ({format(parseISO(jornada.fecha), "dd/MM/yyyy")})
                      </span>
                      {jornada.estado === "activa" && (
                        <Badge className="bg-green-500/20 text-green-700 text-xs">Activa</Badge>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAssignDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={assignToJornada} disabled={assigning || !selectedJornadaId}>
              {assigning ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Asignando...
                </>
              ) : (
                "Asignar"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
