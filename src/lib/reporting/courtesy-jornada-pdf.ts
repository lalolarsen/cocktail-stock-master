/**
 * Reporte de Cortesías por jornada (PDF, plantilla unificada).
 * Fuente: courtesy_redemptions (jornada_id) + courtesy_qr.
 */
import { supabase } from "@/integrations/supabase/client";
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
    supabase.from("courtesy_qr").select("id, product_name, qty, note, created_by").in("id", ids),
    supabase.from("profiles").select("id, full_name"),
  ]);
  const qrMap = new Map((qrRes.data || []).map((q) => [q.id, q]));
  const names = new Map((profRes.data || []).map((p) => [p.id, p.full_name || "—"]));

  const rows = reds.map((r) => {
    const q = qrMap.get(r.courtesy_id as string);
    const { motivo, socio } = parseNote(q?.note ?? null);
    return {
      time: fmtTime.format(new Date(r.redeemed_at)),
      product: q?.product_name || "—",
      qty: Number(q?.qty) || 1,
      motivo, socio,
      by: names.get(q?.created_by || r.redeemed_by || "") || "—",
    };
  });

  const units = rows.reduce((s, r) => s + r.qty, 0);
  const byMotivo = new Map<string, { n: number; u: number }>();
  rows.forEach((r) => {
    const c = byMotivo.get(r.motivo) || { n: 0, u: 0 };
    c.n++; c.u += r.qty; byMotivo.set(r.motivo, c);
  });
  const bySocio = new Map<string, number>();
  rows.filter((r) => r.socio).forEach((r) => bySocio.set(r.socio!, (bySocio.get(r.socio!) || 0) + r.qty));

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
    { label: "Socios", value: String(bySocio.size) },
    { label: "Motivos", value: String(byMotivo.size) },
  ]);
  addTable(ctx, "Por motivo", ["Motivo", "Cortesías", "Unidades"],
    [...byMotivo.entries()].sort((a, b) => b[1].u - a[1].u).map(([m, c]) => [m, c.n, c.u]),
    { rightCols: [1, 2], foot: ["Total", rows.length, units] });
  if (bySocio.size) {
    addTable(ctx, "Por socio", ["Socio", "Unidades"],
      [...bySocio.entries()].sort((a, b) => b[1] - a[1]), { rightCols: [1] });
  }
  addTable(ctx, "Detalle", ["Hora", "Producto", "Cant.", "Motivo", "Emitido por"],
    rows.map((r) => [r.time, r.product, r.qty, r.socio ? `Socio: ${r.socio}` : r.motivo, r.by]),
    { rightCols: [2] });
  addSignature(ctx, "Responsable");
  finishReport(ctx, reportFileName(j.numero_jornada, "cortesias"));
  return "ok";
}
