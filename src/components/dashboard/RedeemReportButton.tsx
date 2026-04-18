import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, QrCode } from "lucide-react";
import { toast } from "sonner";

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
      // Fetch redemption logs for this jornada
      const { data: logs, error: logsErr } = await supabase
        .from("pickup_redemptions_log")
        .select("id, result, redeemed_at, bartender_id, delivered_by_worker_id, bar_location_id, items_snapshot, theoretical_consumption, metadata, pos_id")
        .eq("jornada_id", jornadaId);

      if (logsErr) throw logsErr;
      const allLogs = (logs || []) as RedeemLog[];

      // Fetch tokens issued for this jornada
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

      // Fetch profiles for bartender names
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

      // Fetch location names
      const locationIds = [...new Set(allLogs.map(l => l.bar_location_id).filter(Boolean))] as string[];
      const locationMap = new Map<string, string>();
      if (locationIds.length > 0) {
        const { data: locs } = await supabase
          .from("stock_locations")
          .select("id, name")
          .in("id", locationIds);
        (locs || []).forEach(l => locationMap.set(l.id, l.name));
      }

      // ── Summary counters ──
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

      const SEP = "========================================";
      const SUB = "----------------------------------------";

      // ── Canjes por ubicación ──
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

      // ── Product breakdown from items_snapshot ──
      const productTotals = new Map<string, number>();
      successLogs.filter(l => l.items_snapshot).forEach(l => {
        const items = Array.isArray(l.items_snapshot) ? l.items_snapshot : [];
        items.forEach((item: any) => {
          const name = item.cocktail_name || item.name || "?";
          const qty = Number(item.quantity) || 1;
          productTotals.set(name, (productTotals.get(name) || 0) + qty);
        });
      });

      // ── Ingredient breakdown from theoretical_consumption ──
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

      // ── Build CSV ──
      const lines: string[] = [];
      lines.push(SEP);
      lines.push(`REPORTE DE CANJES`);
      lines.push(`Jornada #${jornadaNumber}  -  ${fecha}`);
      lines.push(SEP);
      lines.push("");

      lines.push("=== RESUMEN GENERAL ===");
      lines.push("Métrica,Valor");
      lines.push(`Emitidos,${issued}`);
      lines.push(`Canjeados,${redeemed}`);
      lines.push(`Tasa de canje (%),${redemptionRate}`);
      lines.push(`Pendientes,${pending}`);
      lines.push(`Duplicados,${duplicates}`);
      lines.push(`Expirados,${expired}`);
      lines.push(`No encontrados,${notFound}`);
      lines.push(`Stock insuficiente (histórico),${insufficientStock}`);
      lines.push(`Cancelados,${cancelled}`);
      lines.push("");

      // Location breakdown — NEW prominent section
      lines.push("=== CANJES POR UBICACIÓN ===");
      lines.push("Ubicación,Canjes (QRs),Items entregados,% del total");
      const sortedLocs = Array.from(locationStats.entries()).sort((a, b) => b[1].redeemed - a[1].redeemed);
      sortedLocs.forEach(([loc, stat]) => {
        const pct = redeemed > 0 ? ((stat.redeemed / redeemed) * 100).toFixed(1) : "0.0";
        lines.push(`"${loc}",${stat.redeemed},${stat.items},${pct}%`);
      });
      lines.push(`TOTAL,${redeemed},${Array.from(locationStats.values()).reduce((s, x) => s + x.items, 0)},100%`);
      lines.push("");

      // Per-location product detail
      lines.push("=== PRODUCTOS CANJEADOS POR UBICACIÓN ===");
      lines.push("Ubicación,Producto,Cantidad");
      sortedLocs.forEach(([loc, stat]) => {
        const sortedProds = Array.from(stat.products.entries()).sort((a, b) => b[1] - a[1]);
        sortedProds.forEach(([name, qty]) => {
          lines.push(`"${loc}","${name}",${qty}`);
        });
        lines.push(SUB);
      });
      lines.push("");

      // Product breakdown (global)
      lines.push("=== DESGLOSE POR PRODUCTO (TOTAL) ===");
      lines.push("Producto,Cantidad canjeada");
      Array.from(productTotals.entries())
        .sort((a, b) => b[1] - a[1])
        .forEach(([name, qty]) => lines.push(`"${name}",${qty}`));
      lines.push("");

      // Ingredient breakdown
      lines.push("=== CONSUMO TEÓRICO POR INSUMO ===");
      lines.push("Insumo,Cantidad,Unidad");
      Array.from(ingredientTotals.entries())
        .sort((a, b) => b[1].qty - a[1].qty)
        .forEach(([name, d]) => lines.push(`"${name}",${d.qty.toFixed(1)},${d.unit}`));
      lines.push("");

      // Detail log
      lines.push("=== DETALLE DE INTENTOS ===");
      lines.push("Fecha/Hora,Resultado,Ubicación,Bartender,Entregado por,Items,POS");
      allLogs
        .sort((a, b) => new Date(a.redeemed_at).getTime() - new Date(b.redeemed_at).getTime())
        .forEach(l => {
          const time = new Date(l.redeemed_at).toLocaleString("es-CL", { timeZone: "America/Santiago" });
          const bartender = l.bartender_id ? (profilesMap.get(l.bartender_id) || "?") : "-";
          const deliveredBy = l.delivered_by_worker_id ? (profilesMap.get(l.delivered_by_worker_id) || "?") : "-";
          const location = l.bar_location_id ? (locationMap.get(l.bar_location_id) || "?") : (l.metadata?.bar || "-");
          const items = l.items_snapshot
            ? (Array.isArray(l.items_snapshot) ? l.items_snapshot.map((i: any) => `${i.cocktail_name || i.name || "?"} x${i.quantity || 1}`).join("; ") : "-")
            : (l.metadata?.deliver?.name || "-");
          const posId = l.pos_id || "-";
          lines.push(`"${time}","${l.result}","${location}","${bartender}","${deliveredBy}","${items}","${posId}"`);
        });

      const csvContent = lines.join("\n");
      const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `canjes_jornada_${jornadaNumber}_${fecha}.csv`;
      link.click();

      toast.success("Reporte de canjes descargado");
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
      Canjes
    </Button>
  );
}
