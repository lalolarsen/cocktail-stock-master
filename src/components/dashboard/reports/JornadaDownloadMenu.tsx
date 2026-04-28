import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Download, FileText, Printer, Loader2, ChevronDown, Receipt, ListChecks, QrCode } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { printPOSSalesReport, type POSSalesData } from "@/lib/printing/pos-sales-report";
import { generateProductSalesPDF, type POSProductBreakdown } from "@/lib/reporting/product-sales-pdf";

interface Props {
  jornadaId: string;
  jornadaNumber: number;
  fecha: string;
  horario: string;
  isClosed: boolean;
  hasFinancial: boolean;
  onCSV: () => void;
  onEERR: () => void;
  onRedeem?: () => void;
}

export function JornadaDownloadMenu({
  jornadaId, jornadaNumber, fecha, horario, isClosed, hasFinancial, onCSV, onEERR, onRedeem,
}: Props) {
  const [busy, setBusy] = useState<string | null>(null);

  const handlePOS = async () => {
    setBusy("pos");
    try {
      const [salesRes, ticketSalesRes, posRes] = await Promise.all([
        supabase.from("sales").select("total_amount, payment_method, point_of_sale, is_cancelled").eq("jornada_id", jornadaId).eq("is_cancelled", false),
        supabase.from("ticket_sales").select("total, payment_method, pos_id").eq("jornada_id", jornadaId).eq("payment_status", "paid"),
        supabase.from("pos_terminals").select("id, name"),
      ]);
      if (salesRes.error) throw salesRes.error;
      const sales = salesRes.data || [];
      const ticketSales = ticketSalesRes.data || [];
      const posMapNames = new Map((posRes.data || []).map((p) => [p.id, p.name]));
      if (sales.length === 0 && ticketSales.length === 0) {
        toast.info("No hay ventas en esta jornada");
        return;
      }
      const posMap = new Map<string, { cash: number; cashN: number; card: number; cardN: number; other: number; otherN: number }>();
      const acc = (posName: string, pm: string, amt: number) => {
        const e = posMap.get(posName) || { cash: 0, cashN: 0, card: 0, cardN: 0, other: 0, otherN: 0 };
        if (pm === "cash") { e.cash += amt; e.cashN++; }
        else if (pm === "card") { e.card += amt; e.cardN++; }
        else { e.other += amt; e.otherN++; }
        posMap.set(posName, e);
      };
      for (const s of sales) acc(s.point_of_sale || "Sin POS", s.payment_method, Number(s.total_amount));
      for (const t of ticketSales) acc((t.pos_id && posMapNames.get(t.pos_id)) || "Caja Tickets", t.payment_method, Number(t.total));
      const posSummary: POSSalesData["posSummary"] = Array.from(posMap.entries()).map(([posName, d]) => ({
        posName, cashTotal: d.cash, cashCount: d.cashN, cardTotal: d.card, cardCount: d.cardN,
        otherTotal: d.other, otherCount: d.otherN, total: d.cash + d.card + d.other, totalCount: d.cashN + d.cardN + d.otherN,
      })).sort((a, b) => b.total - a.total);
      printPOSSalesReport({
        jornadaNumber, fecha, horario, posSummary,
        grandTotal: posSummary.reduce((s, p) => s + p.total, 0),
        grandCash: posSummary.reduce((s, p) => s + p.cashTotal, 0),
        grandCard: posSummary.reduce((s, p) => s + p.cardTotal, 0),
        grandOther: posSummary.reduce((s, p) => s + p.otherTotal, 0),
        grandCount: posSummary.reduce((s, p) => s + p.totalCount, 0),
      });
    } catch (err) {
      console.error(err);
      toast.error("Error al generar reporte POS");
    } finally {
      setBusy(null);
    }
  };

  const handleCount = async () => {
    setBusy("count");
    try {
      const { data: saleItems, error } = await supabase
        .from("sale_items")
        .select(`cocktail_id, quantity, subtotal, sales!sale_items_sale_id_fkey!inner(jornada_id, is_cancelled, point_of_sale)`)
        .eq("sales.jornada_id", jornadaId)
        .eq("sales.is_cancelled", false);
      if (error) throw error;
      if (!saleItems || saleItems.length === 0) {
        toast.info("No hay productos vendidos en esta jornada");
        return;
      }
      const cocktailIds = [...new Set(saleItems.map((i) => i.cocktail_id))];
      const { data: cocktails } = await supabase.from("cocktails").select("id, name, category").in("id", cocktailIds);
      const cocktailMap = new Map((cocktails || []).map((c) => [c.id, c]));
      const posMap = new Map<string, Map<string, { name: string; category: string; qty: number }>>();
      for (const item of saleItems) {
        const sale = item.sales as unknown as { point_of_sale: string };
        const posName = sale.point_of_sale || "Sin POS";
        const cocktail = cocktailMap.get(item.cocktail_id);
        if (!posMap.has(posName)) posMap.set(posName, new Map());
        const prodMap = posMap.get(posName)!;
        const ex = prodMap.get(item.cocktail_id) || { name: cocktail?.name || "Desconocido", category: cocktail?.category || "otros", qty: 0 };
        ex.qty += Number(item.quantity) || 0;
        prodMap.set(item.cocktail_id, ex);
      }
      const posSections: POSProductBreakdown[] = Array.from(posMap.entries()).map(([posName, prodMap]) => {
        const products = Array.from(prodMap.values())
          .map((p) => ({ cocktailName: p.name, category: p.category, quantity: p.qty }))
          .sort((a, b) => b.quantity - a.quantity);
        return { posName, products, totalUnits: products.reduce((s, p) => s + p.quantity, 0) };
      }).sort((a, b) => b.totalUnits - a.totalUnits);
      generateProductSalesPDF({ jornadaNumber, fecha, horario, posSections, grandTotalUnits: posSections.reduce((s, p) => s + p.totalUnits, 0) });
      toast.success("Reporte de conteo enviado a impresión");
    } catch (err) {
      console.error(err);
      toast.error("Error al generar reporte de conteo");
    } finally {
      setBusy(null);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="text-xs h-8 gap-1">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          Descargar
          <ChevronDown className="h-3 w-3 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="text-xs">Reportes operativos</DropdownMenuLabel>
        <DropdownMenuItem onClick={handlePOS} disabled={!!busy}>
          <Printer className="h-3.5 w-3.5 mr-2" />
          POS térmico
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleCount} disabled={!!busy}>
          <ListChecks className="h-3.5 w-3.5 mr-2" />
          Conteo de productos
        </DropdownMenuItem>
        {onRedeem && (
          <DropdownMenuItem onClick={onRedeem} disabled={!!busy}>
            <QrCode className="h-3.5 w-3.5 mr-2" />
            QRs canjeados
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs">Datos / Contabilidad</DropdownMenuLabel>
        {isClosed && (
          <DropdownMenuItem onClick={onCSV}>
            <FileText className="h-3.5 w-3.5 mr-2" />
            CSV de ventas
          </DropdownMenuItem>
        )}
        {isClosed && hasFinancial && (
          <DropdownMenuItem onClick={onEERR}>
            <Receipt className="h-3.5 w-3.5 mr-2" />
            Estado de Resultados
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
