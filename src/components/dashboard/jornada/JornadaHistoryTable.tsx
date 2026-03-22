import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { 
  Trash2, 
  Square, 
  Download,
  AlertTriangle,
  Eye,
  CheckCircle,
  Loader2,
  Printer,
} from "lucide-react";
import { format, parseISO, differenceInHours } from "date-fns";
import { es } from "date-fns/locale";
import { formatCLP } from "@/lib/currency";
import { printPOSSalesReport, type POSSalesData } from "@/lib/printing/pos-sales-report";
import { generateProductSalesPDF, type POSProductBreakdown, type ProductSalesReportData } from "@/lib/reporting/product-sales-pdf";

interface Jornada {
  id: string;
  numero_jornada: number;
  nombre?: string;
  semana_inicio: string;
  fecha: string;
  hora_apertura: string | null;
  hora_cierre: string | null;
  estado: string;
  created_at: string;
  forced_close?: boolean;
  requires_review?: boolean;
}

interface JornadaStats {
  total_ventas: number;
  cantidad_ventas: number;
  productos_vendidos: number;
  logins: number;
}

interface FinancialSummary {
  id: string;
  jornada_id: string;
  pos_id: string | null;
  gross_sales_total: number;
  transactions_count: number;
  net_sales_total: number;
}

interface JornadaHistoryTableProps {
  jornadas: Jornada[];
  jornadaStats: Record<string, JornadaStats>;
  financialSummaries: Record<string, FinancialSummary>;
  actionLoading: string | null;
  onCloseJornada: (id: string) => void;
  onDeleteJornada: (id: string) => void;
  onForceClose?: (jornada: Jornada) => void;
  onApproveReview?: (jornadaId: string) => void;
  onShowDetail: (jornadaId: string) => void;
  onExportCSV: (jornada: Jornada) => void;
  staleThresholdHours?: number;
}

const STALE_JORNADA_THRESHOLD_HOURS = 24;

export function JornadaHistoryTable({
  jornadas,
  jornadaStats,
  financialSummaries,
  actionLoading,
  onCloseJornada,
  onDeleteJornada,
  onForceClose,
  onApproveReview,
  onShowDetail,
  onExportCSV,
  staleThresholdHours = STALE_JORNADA_THRESHOLD_HOURS,
}: JornadaHistoryTableProps) {
  const isStaleJornada = (jornada: Jornada): boolean => {
    if (jornada.estado !== "activa") return false;
    const openedAt = new Date(`${jornada.fecha}T${jornada.hora_apertura || "00:00:00"}`);
    return differenceInHours(new Date(), openedAt) >= staleThresholdHours;
  };

  const getStatusBadge = (estado: string, jornada?: Jornada) => {
    if (jornada && isStaleJornada(jornada)) {
      return (
        <Badge className="bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/30">
          <AlertTriangle className="w-3 h-3 mr-1" />
          Obsoleta
        </Badge>
      );
    }
    switch (estado) {
      case "activa":
        return <Badge className="bg-green-500/20 text-green-700 dark:text-green-300 border-green-500/30">Abierta</Badge>;
      case "cerrada":
        return <Badge variant="secondary">Cerrada</Badge>;
      default:
        return <Badge variant="outline">{estado}</Badge>;
    }
  };

  const getForcedBadge = (jornada: Jornada) => {
    if (jornada.forced_close) {
      return (
        <Badge variant="destructive" className="text-[10px] ml-1">
          {jornada.requires_review ? "Pendiente revisión" : "Forzado ✓"}
        </Badge>
      );
    }
    return null;
  };

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>#</TableHead>
            <TableHead>Nombre</TableHead>
            <TableHead>Fecha</TableHead>
            <TableHead>Horario</TableHead>
            <TableHead>Ventas</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {jornadas.map((jornada) => {
            const stats = jornadaStats[jornada.id];
            const summary = financialSummaries[jornada.id];
            
            return (
              <TableRow key={jornada.id} className="hover:bg-muted/50">
                <TableCell className="font-medium text-muted-foreground">
                  {jornada.numero_jornada}
                </TableCell>
                <TableCell className="font-medium">
                  {jornada.nombre || `Jornada ${jornada.numero_jornada}`}
                </TableCell>
                <TableCell className="capitalize text-sm">
                  {format(parseISO(jornada.fecha), "EEE d MMM", { locale: es })}
                </TableCell>
                <TableCell className="text-sm">
                  {jornada.hora_apertura?.slice(0, 5) || "--:--"} — {jornada.hora_cierre?.slice(0, 5) || "--:--"}
                </TableCell>
                <TableCell>
                  {summary
                    ? formatCLP(summary.gross_sales_total)
                    : stats
                      ? formatCLP(stats.total_ventas)
                      : "-"
                  }
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    {getStatusBadge(jornada.estado, jornada)}
                    {getForcedBadge(jornada)}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button size="sm" variant="ghost" onClick={() => onShowDetail(jornada.id)} title="Ver detalle">
                      <Eye className="w-4 h-4" />
                    </Button>
                    <POSReportBtn jornadaId={jornada.id} jornadaNumber={jornada.numero_jornada} fecha={jornada.fecha} horario={`${jornada.hora_apertura?.slice(0, 5) || "--:--"} – ${jornada.hora_cierre?.slice(0, 5) || "--:--"}`} />
                    <ProductPDFBtn jornadaId={jornada.id} jornadaNumber={jornada.numero_jornada} fecha={jornada.fecha} horario={`${jornada.hora_apertura?.slice(0, 5) || "--:--"} – ${jornada.hora_cierre?.slice(0, 5) || "--:--"}`} />
                    {jornada.estado === "cerrada" && summary && (
                      <Button size="sm" variant="ghost" onClick={() => onExportCSV(jornada)} title="Exportar CSV">
                        <Download className="w-4 h-4" />
                      </Button>
                    )}
                    {jornada.forced_close && jornada.requires_review && onApproveReview && (
                      <Button
                        size="sm" variant="ghost"
                        className="text-green-600 hover:text-green-700 hover:bg-green-500/10"
                        onClick={() => onApproveReview(jornada.id)}
                        disabled={actionLoading === jornada.id}
                        title="Aprobar revisión"
                      >
                        <CheckCircle className="w-4 h-4" />
                      </Button>
                    )}
                    {jornada.estado === "activa" && isStaleJornada(jornada) && onForceClose && (
                      <Button
                        size="sm" variant="ghost"
                        className="text-amber-600 hover:text-amber-700 hover:bg-amber-500/10"
                        onClick={() => onForceClose(jornada)}
                        disabled={actionLoading === jornada.id}
                        title="Forzar cierre"
                      >
                        <AlertTriangle className="w-4 h-4" />
                      </Button>
                    )}
                    {jornada.estado === "activa" && (
                      <Button
                        size="sm" variant="ghost"
                        onClick={() => onCloseJornada(jornada.id)}
                        disabled={actionLoading === jornada.id}
                        title="Cerrar jornada"
                      >
                        <Square className="w-4 h-4" />
                      </Button>
                    )}
                    {jornada.estado === "cerrada" && (!stats || stats.cantidad_ventas === 0) && (
                      <Button
                        size="sm" variant="ghost"
                        className="text-destructive hover:text-destructive"
                        onClick={() => onDeleteJornada(jornada.id)}
                        disabled={actionLoading === jornada.id}
                        title="Eliminar jornada"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
          {jornadas.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                No hay jornadas registradas
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

/* ── Inline report buttons ── */

function POSReportBtn({ jornadaId, jornadaNumber, fecha, horario }: { jornadaId: string; jornadaNumber: number; fecha: string; horario: string }) {
  const [loading, setLoading] = useState(false);

  const handle = async () => {
    setLoading(true);
    try {
      const { data: sales, error } = await supabase
        .from("sales")
        .select("total_amount, payment_method, point_of_sale, is_cancelled")
        .eq("jornada_id", jornadaId)
        .eq("is_cancelled", false);

      if (error) throw error;
      if (!sales || sales.length === 0) {
        const { toast } = await import("sonner");
        toast.info("No hay ventas en esta jornada");
        return;
      }

      const posMap = new Map<string, { cash: number; cashN: number; card: number; cardN: number; other: number; otherN: number }>();
      for (const s of sales) {
        const pos = s.point_of_sale || "Sin POS";
        const entry = posMap.get(pos) || { cash: 0, cashN: 0, card: 0, cardN: 0, other: 0, otherN: 0 };
        const amt = Number(s.total_amount);
        if (s.payment_method === "cash") { entry.cash += amt; entry.cashN++; }
        else if (s.payment_method === "card") { entry.card += amt; entry.cardN++; }
        else { entry.other += amt; entry.otherN++; }
        posMap.set(pos, entry);
      }

      const posSummary: POSSalesData["posSummary"] = Array.from(posMap.entries())
        .map(([posName, d]) => ({
          posName, cashTotal: d.cash, cashCount: d.cashN, cardTotal: d.card, cardCount: d.cardN,
          otherTotal: d.other, otherCount: d.otherN, total: d.cash + d.card + d.other, totalCount: d.cashN + d.cardN + d.otherN,
        }))
        .sort((a, b) => b.total - a.total);

      printPOSSalesReport({
        jornadaNumber, fecha, horario, posSummary,
        grandTotal: posSummary.reduce((s, p) => s + p.total, 0),
        grandCash: posSummary.reduce((s, p) => s + p.cashTotal, 0),
        grandCard: posSummary.reduce((s, p) => s + p.cardTotal, 0),
        grandOther: posSummary.reduce((s, p) => s + p.otherTotal, 0),
        grandCount: posSummary.reduce((s, p) => s + p.totalCount, 0),
      });
    } catch (err) {
      console.error("POS report error:", err);
      const { toast } = await import("sonner");
      toast.error("Error al generar reporte POS");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button size="sm" variant="ghost" onClick={handle} disabled={loading} title="Reporte POS (imprimir)">
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
    </Button>
  );
}

function ProductPDFBtn({ jornadaId, jornadaNumber, fecha, horario }: { jornadaId: string; jornadaNumber: number; fecha: string; horario: string }) {
  const [loading, setLoading] = useState(false);

  const handle = async () => {
    setLoading(true);
    try {
      const { data: saleItems, error } = await supabase
        .from("sale_items")
        .select(`
          cocktail_id, quantity, subtotal,
          sales!sale_items_sale_id_fkey!inner(jornada_id, is_cancelled, point_of_sale)
        `)
        .eq("sales.jornada_id", jornadaId)
        .eq("sales.is_cancelled", false);

      if (error) throw error;
      if (!saleItems || saleItems.length === 0) {
        const { toast } = await import("sonner");
        toast.info("No hay productos vendidos en esta jornada");
        return;
      }

      const cocktailIds = [...new Set(saleItems.map((i) => i.cocktail_id))];
      const { data: cocktails } = await supabase.from("cocktails").select("id, name, category").in("id", cocktailIds);
      const cocktailMap = new Map((cocktails || []).map((c) => [c.id, c]));

      const posMap = new Map<string, Map<string, { name: string; category: string; qty: number; revenue: number }>>();
      for (const item of saleItems) {
        const sale = item.sales as unknown as { point_of_sale: string };
        const posName = sale.point_of_sale || "Sin POS";
        const cocktail = cocktailMap.get(item.cocktail_id);
        if (!posMap.has(posName)) posMap.set(posName, new Map());
        const prodMap = posMap.get(posName)!;
        const existing = prodMap.get(item.cocktail_id) || { name: cocktail?.name || "Desconocido", category: cocktail?.category || "otros", qty: 0 };
        existing.qty += Number(item.quantity) || 0;
        prodMap.set(item.cocktail_id, existing);
      }

      const posSections: POSProductBreakdown[] = Array.from(posMap.entries())
        .map(([posName, prodMap]) => {
          const products = Array.from(prodMap.values())
            .map((p) => ({ cocktailName: p.name, category: p.category, quantity: p.qty }))
            .sort((a, b) => b.quantity - a.quantity);
          return { posName, products, totalUnits: products.reduce((s, p) => s + p.quantity, 0) };
        })
        .sort((a, b) => b.totalUnits - a.totalUnits);

      generateProductSalesPDF({
        jornadaNumber, fecha, horario, posSections,
        grandTotalUnits: posSections.reduce((s, p) => s + p.totalUnits, 0),
      });

      const { toast } = await import("sonner");
      toast.success("PDF descargado");
    } catch (err) {
      console.error("Product PDF error:", err);
      const { toast } = await import("sonner");
      toast.error("Error al generar PDF de productos");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button size="sm" variant="ghost" onClick={handle} disabled={loading} title="Descargar PDF productos vendidos">
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
    </Button>
  );
}
