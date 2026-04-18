import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, QrCode } from "lucide-react";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface RedeemReportButtonProps {
  jornadaId: string;
  jornadaNumber: number;
  fecha: string;
}

interface RedeemLog {
  id: string;
  result: string;
  redeemed_at: string;
  bartender_id: string | null;
  delivered_by_worker_id: string | null;
  bar_location_id: string | null;
  items_snapshot: any;
  theoretical_consumption: any;
  metadata: any;
  pos_id: string | null;
}

export function RedeemReportButton({ jornadaId, jornadaNumber, fecha }: RedeemReportButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleExport = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setLoading(true);
    try {
      const { data: logs, error: logsErr } = await supabase
        .from("pickup_redemptions_log")
        .select("id, result, redeemed_at, bartender_id, delivered_by_worker_id, bar_location_id, items_snapshot, theoretical_consumption, metadata, pos_id")
        .eq("jornada_id", jornadaId);

      if (logsErr) throw logsErr;
      const allLogs = (logs || []) as RedeemLog[];

      const { data: tokens, error: tokErr } = await supabase
        .from("pickup_tokens")
        .select("id, status")
        .eq("jornada_id", jornadaId);

      if (tokErr) throw tokErr;
      const allTokens = tokens || [];

      if (allLogs.length === 0 && allTokens.length === 0) {
        toast.info("No hay datos de canje en esta jornada");
        return;
      }

      const workerIds = [...new Set([
        ...allLogs.map(l => l.bartender_id).filter(Boolean),
        ...allLogs.map(l => l.delivered_by_worker_id).filter(Boolean),
      ])] as string[];

      const profilesMap = new Map<string, string>();
      if (workerIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", workerIds);
        (profiles || []).forEach(p => profilesMap.set(p.id, p.full_name || p.email || "?"));
      }

      const locationIds = [...new Set(allLogs.map(l => l.bar_location_id).filter(Boolean))] as string[];
      const locationMap = new Map<string, string>();
      if (locationIds.length > 0) {
        const { data: locs } = await supabase
          .from("stock_locations")
          .select("id, name")
          .in("id", locationIds);
        (locs || []).forEach(l => locationMap.set(l.id, l.name));
      }

      // ── Counters ──
      const issued = allTokens.length;
      const successLogs = allLogs.filter(l => l.result === "success");
      const redeemed = successLogs.length;
      const pending = allTokens.filter(t => t.status === "issued").length;
      const duplicates = allLogs.filter(l => l.result === "already_redeemed").length;
      const expired = allLogs.filter(l => l.result === "expired").length;
      const notFound = allLogs.filter(l => l.result === "not_found").length;
      const insufficientStock = allLogs.filter(l => l.result === "insufficient_stock").length;
      const cancelled = allLogs.filter(l => l.result === "cancelled").length;
      const redemptionRate = issued > 0 ? ((redeemed / issued) * 100).toFixed(1) : "0.0";

      // ── Por ubicación ──
      type LocStat = { redeemed: number; items: number; products: Map<string, number> };
      const locationStats = new Map<string, LocStat>();
      successLogs.forEach(l => {
        const locName = l.bar_location_id
          ? (locationMap.get(l.bar_location_id) || "Ubicación desconocida")
          : (l.metadata?.bar || "Sin ubicación");
        const stat = locationStats.get(locName) || { redeemed: 0, items: 0, products: new Map() };
        stat.redeemed += 1;
        const items = Array.isArray(l.items_snapshot) ? l.items_snapshot : [];
        items.forEach((item: any) => {
          const name = item.cocktail_name || item.name || "?";
          const qty = Number(item.quantity) || 1;
          stat.items += qty;
          stat.products.set(name, (stat.products.get(name) || 0) + qty);
        });
        locationStats.set(locName, stat);
      });
      const sortedLocs = Array.from(locationStats.entries()).sort((a, b) => b[1].redeemed - a[1].redeemed);
      const totalItems = Array.from(locationStats.values()).reduce((s, x) => s + x.items, 0);

      // ── Productos globales ──
      const productTotals = new Map<string, number>();
      successLogs.filter(l => l.items_snapshot).forEach(l => {
        const items = Array.isArray(l.items_snapshot) ? l.items_snapshot : [];
        items.forEach((item: any) => {
          const name = item.cocktail_name || item.name || "?";
          const qty = Number(item.quantity) || 1;
          productTotals.set(name, (productTotals.get(name) || 0) + qty);
        });
      });

      // ── Insumos ──
      const ingredientTotals = new Map<string, { qty: number; unit: string }>();
      successLogs.filter(l => l.theoretical_consumption).forEach(l => {
        const cons = Array.isArray(l.theoretical_consumption) ? l.theoretical_consumption : [];
        cons.forEach((c: any) => {
          const name = c.product_name || "?";
          const qty = Number(c.quantity) || 0;
          const unit = c.unit || "ud";
          const ex = ingredientTotals.get(name) || { qty: 0, unit };
          ingredientTotals.set(name, { qty: ex.qty + qty, unit });
        });
      });

      // ── PDF ──
      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const pageW = doc.internal.pageSize.getWidth();
      const margin = 40;
      let y = margin;

      // Header
      doc.setFillColor(15, 23, 42); // slate-900
      doc.rect(0, 0, pageW, 70, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.text("REPORTE DE CANJES", margin, 32);
      doc.setFontSize(11);
      doc.setFont("helvetica", "normal");
      doc.text(`Jornada #${jornadaNumber}  •  ${fecha}`, margin, 52);
      doc.setFontSize(9);
      doc.text(`Generado: ${new Date().toLocaleString("es-CL", { timeZone: "America/Santiago" })}`, pageW - margin, 52, { align: "right" });
      y = 90;

      // KPI Cards
      doc.setTextColor(0, 0, 0);
      const kpis = [
        { label: "Emitidos", value: String(issued), color: [59, 130, 246] },
        { label: "Canjeados", value: String(redeemed), color: [34, 197, 94] },
        { label: "Tasa canje", value: `${redemptionRate}%`, color: [168, 85, 247] },
        { label: "Pendientes", value: String(pending), color: [234, 179, 8] },
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

      // Counters secundarios
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 116, 139);
      const secondary = `Duplicados: ${duplicates}  •  Expirados: ${expired}  •  No encontrados: ${notFound}  •  Stock insuf.: ${insufficientStock}  •  Cancelados: ${cancelled}`;
      doc.text(secondary, margin, y);
      y += 20;

      // Section helper
      const section = (title: string) => {
        if (y > 720) { doc.addPage(); y = margin; }
        doc.setFillColor(15, 23, 42);
        doc.rect(margin, y, pageW - margin * 2, 22, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.text(title, margin + 10, y + 15);
        y += 28;
      };

      // ── Canjes por ubicación (DESTACADA) ──
      section("CANJES POR UBICACIÓN");
      autoTable(doc, {
        startY: y,
        head: [["Ubicación", "Canjes (QRs)", "Items entregados", "% del total"]],
        body: [
          ...sortedLocs.map(([loc, stat]) => [
            loc,
            String(stat.redeemed),
            String(stat.items),
            redeemed > 0 ? `${((stat.redeemed / redeemed) * 100).toFixed(1)}%` : "0.0%",
          ]),
          [
            { content: "TOTAL", styles: { fontStyle: "bold", fillColor: [241, 245, 249] } },
            { content: String(redeemed), styles: { fontStyle: "bold", fillColor: [241, 245, 249] } },
            { content: String(totalItems), styles: { fontStyle: "bold", fillColor: [241, 245, 249] } },
            { content: "100%", styles: { fontStyle: "bold", fillColor: [241, 245, 249] } },
          ],
        ],
        headStyles: { fillColor: [34, 197, 94], textColor: 255, fontStyle: "bold" },
        styles: { fontSize: 10, cellPadding: 6 },
        margin: { left: margin, right: margin },
      });
      y = (doc as any).lastAutoTable.finalY + 20;

      // ── Productos por ubicación ──
      section("PRODUCTOS CANJEADOS POR UBICACIÓN");
      const prodLocRows: any[] = [];
      sortedLocs.forEach(([loc, stat]) => {
        const sortedProds = Array.from(stat.products.entries()).sort((a, b) => b[1] - a[1]);
        sortedProds.forEach(([name, qty], idx) => {
          prodLocRows.push([
            idx === 0 ? { content: loc, styles: { fontStyle: "bold" } } : "",
            name,
            String(qty),
          ]);
        });
      });
      autoTable(doc, {
        startY: y,
        head: [["Ubicación", "Producto", "Cantidad"]],
        body: prodLocRows,
        headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: "bold" },
        styles: { fontSize: 9, cellPadding: 5 },
        margin: { left: margin, right: margin },
      });
      y = (doc as any).lastAutoTable.finalY + 20;

      // ── Total por producto ──
      section("DESGLOSE POR PRODUCTO (TOTAL)");
      autoTable(doc, {
        startY: y,
        head: [["Producto", "Cantidad canjeada"]],
        body: Array.from(productTotals.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([name, qty]) => [name, String(qty)]),
        headStyles: { fillColor: [100, 116, 139], textColor: 255, fontStyle: "bold" },
        styles: { fontSize: 9, cellPadding: 5 },
        margin: { left: margin, right: margin },
      });
      y = (doc as any).lastAutoTable.finalY + 20;

      // ── Insumos ──
      if (ingredientTotals.size > 0) {
        section("CONSUMO TEÓRICO POR INSUMO");
        autoTable(doc, {
          startY: y,
          head: [["Insumo", "Cantidad", "Unidad"]],
          body: Array.from(ingredientTotals.entries())
            .sort((a, b) => b[1].qty - a[1].qty)
            .map(([name, d]) => [name, d.qty.toFixed(1), d.unit]),
          headStyles: { fillColor: [100, 116, 139], textColor: 255, fontStyle: "bold" },
          styles: { fontSize: 9, cellPadding: 5 },
          margin: { left: margin, right: margin },
        });
        y = (doc as any).lastAutoTable.finalY + 20;
      }

      // ── Detalle ──
      section("DETALLE DE INTENTOS");
      const detailRows = allLogs
        .sort((a, b) => new Date(a.redeemed_at).getTime() - new Date(b.redeemed_at).getTime())
        .map(l => {
          const time = new Date(l.redeemed_at).toLocaleString("es-CL", { timeZone: "America/Santiago" });
          const bartender = l.bartender_id ? (profilesMap.get(l.bartender_id) || "?") : "-";
          const deliveredBy = l.delivered_by_worker_id ? (profilesMap.get(l.delivered_by_worker_id) || "?") : "-";
          const location = l.bar_location_id ? (locationMap.get(l.bar_location_id) || "?") : (l.metadata?.bar || "-");
          const items = l.items_snapshot
            ? (Array.isArray(l.items_snapshot) ? l.items_snapshot.map((i: any) => `${i.cocktail_name || i.name || "?"} x${i.quantity || 1}`).join("; ") : "-")
            : (l.metadata?.deliver?.name || "-");
          return [time, l.result, location, bartender, deliveredBy, items];
        });
      autoTable(doc, {
        startY: y,
        head: [["Fecha/Hora", "Resultado", "Ubicación", "Bartender", "Entregado por", "Items"]],
        body: detailRows,
        headStyles: { fillColor: [100, 116, 139], textColor: 255, fontStyle: "bold" },
        styles: { fontSize: 7, cellPadding: 3 },
        columnStyles: {
          0: { cellWidth: 75 },
          1: { cellWidth: 55 },
          2: { cellWidth: 70 },
          5: { cellWidth: "auto" },
        },
        didParseCell: (data) => {
          if (data.section === "body" && data.column.index === 1) {
            const v = String(data.cell.raw);
            if (v === "success") data.cell.styles.textColor = [34, 197, 94];
            else if (v === "already_redeemed") data.cell.styles.textColor = [234, 179, 8];
            else data.cell.styles.textColor = [239, 68, 68];
          }
        },
        margin: { left: margin, right: margin },
      });

      // Footer paginación
      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184);
        doc.text(`Página ${i} de ${pageCount}`, pageW - margin, doc.internal.pageSize.getHeight() - 20, { align: "right" });
        doc.text(`Stockia • Reporte de canjes • Jornada #${jornadaNumber}`, margin, doc.internal.pageSize.getHeight() - 20);
      }

      doc.save(`canjes_jornada_${jornadaNumber}_${fecha}.pdf`);
      toast.success("Reporte PDF descargado");
    } catch (err) {
      console.error("Error generating redeem report:", err);
      toast.error("Error al generar reporte de canjes");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button variant="outline" size="sm" className="text-xs h-8 gap-1" onClick={handleExport} disabled={loading}>
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <QrCode className="h-3.5 w-3.5" />}
      Canjes PDF
    </Button>
  );
}
