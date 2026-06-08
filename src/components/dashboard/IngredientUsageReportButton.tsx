import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/supabase-batch";
import { Button } from "@/components/ui/button";
import { Loader2, Beaker } from "lucide-react";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface Props {
  jornadaId: string;
  jornadaNumber: number;
  fecha: string;
}

interface SaleRow { id: string }
interface SaleItemRow { sale_id: string; cocktail_id: string; quantity: number }
interface CocktailIng { cocktail_id: string; product_id: string | null; quantity: number; is_mixer_slot: boolean }
interface ProductRow { id: string; name: string; code: string; unit: string; category: string }
interface CocktailRow { id: string; name: string }
interface CourtesyRow { courtesy_id: string | null; courtesy_qr: { product_id: string; qty: number } | null }

export function IngredientUsageReportButton({ jornadaId, jornadaNumber, fecha }: Props) {
  const [loading, setLoading] = useState(false);

  const handleExport = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setLoading(true);
    try {
      // 1. Sales of the jornada (exclude cancelled)
      const sales = await fetchAllRows<SaleRow>(() =>
        supabase
          .from("sales")
          .select("id")
          .eq("jornada_id", jornadaId)
          .eq("is_cancelled", false)
      );

      // 2. Sale items
      const saleIds = sales.map((s) => s.id);
      let saleItems: SaleItemRow[] = [];
      if (saleIds.length > 0) {
        saleItems = await fetchAllRows<SaleItemRow>(() =>
          supabase
            .from("sale_items")
            .select("sale_id, cocktail_id, quantity")
            .in("sale_id", saleIds)
        );
      }

      // 3. Courtesy redemptions of the jornada (counts as consumption)
      const { data: courtesyRedemptions } = await supabase
        .from("courtesy_redemptions")
        .select("courtesy_id, courtesy_qr:courtesy_id(product_id, qty)")
        .eq("jornada_id", jornadaId)
        .eq("result", "success");

      const courtesyItems: { cocktail_id: string; quantity: number }[] = [];
      ((courtesyRedemptions || []) as any[]).forEach((r) => {
        const cq = r.courtesy_qr;
        if (cq?.product_id) {
          courtesyItems.push({ cocktail_id: cq.product_id, quantity: Number(cq.qty) || 1 });
        }
      });

      // 4. Aggregate cocktail demand
      const cocktailDemand = new Map<string, { sales: number; courtesy: number }>();
      saleItems.forEach((si) => {
        const d = cocktailDemand.get(si.cocktail_id) || { sales: 0, courtesy: 0 };
        d.sales += Number(si.quantity) || 0;
        cocktailDemand.set(si.cocktail_id, d);
      });
      courtesyItems.forEach((ci) => {
        const d = cocktailDemand.get(ci.cocktail_id) || { sales: 0, courtesy: 0 };
        d.courtesy += Number(ci.quantity) || 0;
        cocktailDemand.set(ci.cocktail_id, d);
      });

      const cocktailIds = [...cocktailDemand.keys()];
      if (cocktailIds.length === 0) {
        toast.info("No hay ventas ni cortesías en esta jornada");
        return;
      }

      // 5. Cocktail names + ingredients
      const [{ data: cocktailsData }, ingredients] = await Promise.all([
        supabase.from("cocktails").select("id, name").in("id", cocktailIds),
        fetchAllRows<CocktailIng>(() =>
          supabase
            .from("cocktail_ingredients")
            .select("cocktail_id, product_id, quantity, is_mixer_slot")
            .in("cocktail_id", cocktailIds)
        ),
      ]);

      const cocktails = (cocktailsData || []) as CocktailRow[];
      const cocktailNameMap = new Map(cocktails.map((c) => [c.id, c.name]));

      // 6. Resolve product names
      const productIds = [
        ...new Set(ingredients.map((i) => i.product_id).filter(Boolean) as string[]),
      ];
      const { data: products } = productIds.length
        ? await supabase
            .from("products")
            .select("id, name, code, unit, category")
            .in("id", productIds)
        : { data: [] };
      const productMap = new Map(((products || []) as ProductRow[]).map((p) => [p.id, p]));

      // 7. Explode into product totals
      type Totals = { product: ProductRow; salesQty: number; courtesyQty: number };
      const productTotals = new Map<string, Totals>();
      ingredients.forEach((ing) => {
        if (!ing.product_id || ing.is_mixer_slot) return;
        const prod = productMap.get(ing.product_id);
        if (!prod) return;
        const demand = cocktailDemand.get(ing.cocktail_id);
        if (!demand) return;
        const ex = productTotals.get(prod.id) || {
          product: prod,
          salesQty: 0,
          courtesyQty: 0,
        };
        ex.salesQty += demand.sales * Number(ing.quantity);
        ex.courtesyQty += demand.courtesy * Number(ing.quantity);
        productTotals.set(prod.id, ex);
      });

      const totalsArr = [...productTotals.values()].sort(
        (a, b) => (b.salesQty + b.courtesyQty) - (a.salesQty + a.courtesyQty)
      );

      // 8. Cocktail breakdown (units sold)
      const cocktailRows = [...cocktailDemand.entries()]
        .map(([id, d]) => ({
          name: cocktailNameMap.get(id) || "?",
          sales: d.sales,
          courtesy: d.courtesy,
          total: d.sales + d.courtesy,
        }))
        .sort((a, b) => b.total - a.total);

      // ── PDF ──
      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const pageW = doc.internal.pageSize.getWidth();
      const margin = 40;
      let y = margin;

      doc.setFillColor(15, 23, 42);
      doc.rect(0, 0, pageW, 70, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.text("GASTO TEÓRICO DE INSUMOS", margin, 32);
      doc.setFontSize(11);
      doc.setFont("helvetica", "normal");
      doc.text(`Jornada #${jornadaNumber}  •  ${fecha}`, margin, 52);
      doc.setFontSize(9);
      doc.text(
        `Generado: ${new Date().toLocaleString("es-CL", { timeZone: "America/Santiago" })}`,
        pageW - margin,
        52,
        { align: "right" }
      );
      y = 90;

      // KPI cards
      const totalCocktails = cocktailRows.reduce((s, r) => s + r.total, 0);
      const salesCocktails = cocktailRows.reduce((s, r) => s + r.sales, 0);
      const courtesyCocktails = cocktailRows.reduce((s, r) => s + r.courtesy, 0);
      const distinctInsumos = totalsArr.length;

      doc.setTextColor(0, 0, 0);
      const kpis = [
        { label: "Ítems vendidos", value: String(salesCocktails), color: [34, 197, 94] },
        { label: "Cortesías", value: String(courtesyCocktails), color: [234, 179, 8] },
        { label: "Total consumido", value: String(totalCocktails), color: [59, 130, 246] },
        { label: "Insumos distintos", value: String(distinctInsumos), color: [168, 85, 247] },
      ];
      const cardW = (pageW - margin * 2 - 30) / 4;
      kpis.forEach((k, i) => {
        const x = margin + i * (cardW + 10);
        doc.setFillColor(248, 250, 252);
        doc.setDrawColor(226, 232, 240);
        doc.roundedRect(x, y, cardW, 60, 6, 6, "FD");
        doc.setFillColor(k.color[0], k.color[1], k.color[2]);
        doc.rect(x, y, 4, 60, "F");
        doc.setFontSize(9);
        doc.setTextColor(100, 116, 139);
        doc.setFont("helvetica", "normal");
        doc.text(k.label, x + 12, y + 20);
        doc.setFontSize(20);
        doc.setTextColor(15, 23, 42);
        doc.setFont("helvetica", "bold");
        doc.text(k.value, x + 12, y + 46);
      });
      y += 80;

      const section = (title: string) => {
        if (y > 720) {
          doc.addPage();
          y = margin;
        }
        doc.setFillColor(15, 23, 42);
        doc.rect(margin, y, pageW - margin * 2, 22, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.text(title, margin + 10, y + 15);
        y += 28;
      };

      // Productos consumidos
      section("CONSUMO TEÓRICO POR INSUMO");
      autoTable(doc, {
        startY: y,
        head: [["Código", "Insumo", "Categoría", "Por ventas", "Por cortesías", "Total", "Unidad"]],
        body: totalsArr.map((t) => [
          t.product.code,
          t.product.name,
          t.product.category,
          t.salesQty.toFixed(1),
          t.courtesyQty.toFixed(1),
          (t.salesQty + t.courtesyQty).toFixed(1),
          t.product.unit,
        ]),
        headStyles: { fillColor: [34, 197, 94], textColor: 255, fontStyle: "bold" },
        styles: { fontSize: 9, cellPadding: 5 },
        margin: { left: margin, right: margin },
      });
      y = (doc as any).lastAutoTable.finalY + 20;

      // Productos vendidos
      section("ÍTEMS VENDIDOS / CORTESÍA (CARTA)");
      autoTable(doc, {
        startY: y,
        head: [["Producto de carta", "Vendidos", "Cortesía", "Total"]],
        body: cocktailRows.map((r) => [r.name, String(r.sales), String(r.courtesy), String(r.total)]),
        headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: "bold" },
        styles: { fontSize: 9, cellPadding: 5 },
        margin: { left: margin, right: margin },
      });

      // Footer
      const pageCount = (doc as any).internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text(
          `STOCKIA • Página ${i}/${pageCount}`,
          pageW - margin,
          doc.internal.pageSize.getHeight() - 20,
          { align: "right" }
        );
      }

      doc.save(`gasto_insumos_jornada_${jornadaNumber}_${fecha}.pdf`);
      toast.success("Reporte de gasto de insumos generado");
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || "Error al generar reporte");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      className="h-8 gap-1.5"
      onClick={handleExport}
      disabled={loading}
      title="Reporte de gasto de insumos"
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Beaker className="h-3.5 w-3.5" />}
      <span className="text-xs">Insumos</span>
    </Button>
  );
}
