/**
 * Reporte de Cortesías por jornada (PDF, plantilla unificada).
 * Fuente: courtesy_redemptions (jornada_id) + courtesy_qr. Valor = precio actual en carta × cantidad.
 */
import { supabase } from "@/integrations/supabase/client";
import { formatCLP } from "@/lib/currency";
import { addKpis, addSignature, addTable, createReport, finishReport, reportFileName } from "./pdf-template";

export const SOCIO_PREFIX = "Socio: ";

const fmtTime = new Intl.DateTimeFormat("es-CL", {
  timeZone: "America/Santiago", hour: "2-digit", minute: "2-digit", hour12: false,
});

function parseNote(note: string | null): { motivo: string; socio: string | null } {
  if (!note) return { motivo: "Sin motivo", socio: null };
  if (note.startsWith(SOCIO_PREFIX)) return { motivo: "Socio", socio: note.slice(SOCIO_PREFIX.length).trim() || null };
  return { motivo: note, socio: null };
}

export async function downloadCourtesyJornadaReport(jornadaId: string): Promise<"ok" | "empty"> {
  const [jRes, redRes] = await Promise.all([
    supabase.from("jornadas").select("numero_jornada, fecha, hora_apertura, hora_cierre").eq("id", jornadaId).single(),
    supabase.from("courtesy_redemptions").select("courtesy_id, redeemed_at, redeemed_by, result")
      .eq("jornada_id", jornadaId).eq("result", "success").order("redeemed_at"),
  ]);
  if (jRes.error) throw jRes.error;
  if (redRes.error) throw redRes.error;
  const reds = (redRes.data || []).filter((r) => r.courtesy_id);
  if (reds.length === 0) return "empty";

  const ids = [...new Set(reds.map((r) => r.courtesy_id as string))];
  const [qrRes, profRes] = await Promise.all([
    supabase.from("courtesy_qr").select("id, product_id, product_name, qty, note, created_by").in("id", ids),
    supabase.from("profiles").select("id, full_name"),
  ]);
  const qrMap = new Map((qrRes.data || []).map((q) => [q.id, q]));
  const names = new Map((profRes.data || []).map((p) => [p.id, p.full_name || "—"]));

  const productIds = [...new Set((qrRes.data || []).map((q) => q.product_id).filter(Boolean) as string[])];
  const priceRes = productIds.length
    ? await supabase.from("cocktails").select("id, price").in("id", productIds)
    : { data: [] as { id: string; price: number | null }[] };
  const prices = new Map((priceRes.data || []).map((c) => [c.id, Number(c.price) || 0]));

  const rows = reds.map((r) => {
    const q = qrMap.get(r.courtesy_id as string);
    const { motivo, socio } = parseNote(q?.note ?? null);
    const qty = Number(q?.qty) || 1;
    const unit = q?.product_id ? prices.get(q.product_id) ?? null : null;
    return {
      time: fmtTime.format(new Date(r.redeemed_at)),
      product: q?.product_name || "—",
      qty, unit,
      value: unit ? Math.round(unit * qty) : 0,
      motivo, socio,
      by: names.get(q?.created_by || r.redeemed_by || "") || "—",
    };
  });

  const units = rows.reduce((s, r) => s + r.qty, 0);
  const total = rows.reduce((s, r) => s + r.value, 0);
  const byMotivo = new Map<string, { n: number; u: number; v: number }>();
  rows.forEach((r) => {
    const c = byMotivo.get(r.motivo) || { n: 0, u: 0, v: 0 };
    c.n++; c.u += r.qty; c.v += r.value; byMotivo.set(r.motivo, c);
  });
  const bySocio = new Map<string, { u: number; v: number }>();
  rows.filter((r) => r.socio).forEach((r) => {
    const c = bySocio.get(r.socio!) || { u: 0, v: 0 };
    c.u += r.qty; c.v += r.value; bySocio.set(r.socio!, c);
  });

  const j = jRes.data;
  const ctx = createReport({
    title: "Reporte de Cortesías",
    jornadaNumber: j.numero_jornada,
    fecha: j.fecha,
    horario: `${j.hora_apertura?.slice(0, 5) || "--:--"} – ${j.hora_cierre?.slice(0, 5) || "--:--"}`,
  });
  addKpis(ctx, [
    { label: "Cortesías", value: String(rows.length) },
    { label: "Unidades", value: String(units) },
    { label: "Valor entregado", value: formatCLP(total) },
    { label: "Socios", value: String(bySocio.size) },
  ]);
  addTable(ctx, "Por motivo", ["Motivo", "Cortesías", "Unidades", "Valor"],
    [...byMotivo.entries()].sort((a, b) => b[1].v - a[1].v).map(([m, c]) => [m, c.n, c.u, formatCLP(c.v)]),
    { rightCols: [1, 2, 3], foot: ["Total", rows.length, units, formatCLP(total)] });
  if (bySocio.size) {
    addTable(ctx, "Por socio", ["Socio", "Unidades", "Valor"],
      [...bySocio.entries()].sort((a, b) => b[1].v - a[1].v).map(([s, c]) => [s, c.u, formatCLP(c.v)]),
      { rightCols: [1, 2] });
  }
  addTable(ctx, "Detalle", ["Hora", "Producto", "Cant.", "Precio unit.", "Valor", "Motivo", "Emitido por"],
    rows.map((r) => [r.time, r.product, r.qty, r.unit ? formatCLP(r.unit) : "—", r.unit ? formatCLP(r.value) : "—",
      r.socio ? `Socio: ${r.socio}` : r.motivo, r.by]),
    { rightCols: [2, 3, 4], foot: ["Total", "", units, "", formatCLP(total), "", ""] });
  addSignature(ctx, "Responsable");
  finishReport(ctx, reportFileName(j.numero_jornada, "cortesias"));
  return "ok";
}
