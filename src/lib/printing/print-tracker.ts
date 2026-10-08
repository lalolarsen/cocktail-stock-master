/**
 * Registro de impresiones + aviso de respaldo cuando RawBT no se abrió.
 * Cada intento queda en `print_jobs` (source/ref_key/kind) para auditoría y reimpresión única.
 */
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_VENUE_ID } from "@/lib/venue";
import type { RawBtOutcome } from "./rawbt";

export type PrintSource = "ticket" | "courtesy" | "coatcheck";
export type PrintKind = "auto" | "manual" | "reprint" | "reprint_attempt";
/** "browser" = PC con ventana de impresión (no se puede confirmar) */
export type PrintOutcome = RawBtOutcome | "browser" | "skipped";

export interface TrackedPrintOptions {
  source: PrintSource;
  refKey: string;
  label: string;
  jornadaId?: string | null;
  posId?: string | null;
  print: () => Promise<PrintOutcome>;
}

/* ── Aviso de respaldo (estado global simple) ── */
export interface FallbackState {
  label: string;
  attempts: number;
  retry: () => Promise<void>;
}
let fallback: FallbackState | null = null;
const listeners = new Set<(s: FallbackState | null) => void>();
const emit = () => listeners.forEach((l) => l(fallback));
export function subscribeFallback(fn: (s: FallbackState | null) => void) {
  listeners.add(fn);
  fn(fallback);
  return () => listeners.delete(fn);
}
/** Aviso sin registro en auditoría (p. ej. resumen de jornada). */
export function showManualFallback(label: string, retry: () => Promise<void>) {
  const attempts = fallback?.label === label ? fallback.attempts + 1 : 1;
  fallback = { label, attempts, retry };
  emit();
}
export function dismissFallback() {
  fallback = null;
  emit();
}

async function insertJob(opts: TrackedPrintOptions, kind: PrintKind, outcome: PrintOutcome) {
  try {
    const { data: auth } = await supabase.auth.getSession();
    const uid = auth.session?.user.id;
    if (!uid) return;
    const status = outcome === "not_sent" ? "not_sent" : outcome === "sent" ? "sent" : outcome;
    await supabase.from("print_jobs").insert({
      venue_id: DEFAULT_VENUE_ID,
      pos_id: opts.posId || null,
      user_id: uid,
      job_type: opts.source,
      print_status: status,
      printer_name: outcome === "browser" ? "browser" : "rawbt",
      payload: { label: opts.label },
      attempts: 1,
      printed_at: outcome === "sent" || outcome === "browser" ? new Date().toISOString() : null,
      source: opts.source,
      ref_key: opts.refKey,
      kind,
      jornada_id: opts.jornadaId || null,
    });
  } catch (e) {
    console.warn("[print-tracker] log failed", e);
  }
}

/**
 * Imprime y registra. Si RawBT no se abrió, muestra el aviso amarillo
 * "IMPRIMIR AHORA" (ese toque del trabajador nunca es bloqueado por Chrome).
 */
export async function trackedPrint(opts: TrackedPrintOptions, kind: PrintKind = "auto"): Promise<PrintOutcome> {
  const outcome = await opts.print();
  if (outcome === "skipped") return outcome;
  void insertJob(opts, kind, outcome);
  if (outcome === "not_sent") {
    const prevAttempts = fallback?.label === opts.label ? fallback.attempts : 0;
    fallback = {
      label: opts.label,
      attempts: prevAttempts + 1,
      retry: async () => {
        await trackedPrint(opts, "manual");
      },
    };
    emit();
  } else if (fallback?.label === opts.label) {
    dismissFallback();
  }
  return outcome;
}

/* ── Reimpresión única ── */
export interface ReprintInfo {
  reprintedBy: string | null;
  reprintedAt: string;
}

export async function fetchReprints(source: PrintSource, refKeys: string[]): Promise<Record<string, ReprintInfo>> {
  if (!refKeys.length) return {};
  const { data } = await supabase
    .from("print_jobs")
    .select("ref_key, user_name, created_at")
    .eq("source", source)
    .eq("kind", "reprint")
    .in("ref_key", refKeys)
    .order("created_at", { ascending: false });
  const map: Record<string, ReprintInfo> = {};
  (data || []).forEach((r) => {
    if (r.ref_key && !map[r.ref_key]) map[r.ref_key] = { reprintedBy: r.user_name, reprintedAt: r.created_at };
  });
  return map;
}

/** Valida en servidor (1 reimpresión, admin/gerencia sin límite) y registra. */
export async function registerReprint(opts: {
  source: PrintSource;
  refKey: string;
  label: string;
  jornadaId?: string | null;
  posId?: string | null;
}): Promise<{ ok: boolean; limit?: boolean; error?: string }> {
  const { error } = await supabase.rpc("register_reprint", {
    _venue_id: DEFAULT_VENUE_ID,
    _source: opts.source,
    _ref_key: opts.refKey,
    _jornada_id: opts.jornadaId || null,
    _pos_id: opts.posId || null,
    _payload: { label: opts.label },
  });
  if (error) return { ok: false, limit: error.message.includes("REPRINT_LIMIT"), error: error.message };
  return { ok: true };
}

/** Resumen de impresión de una jornada para reportes. */
export async function fetchPrintSummary(jornadaId: string, posId?: string | null) {
  let q = supabase.from("print_jobs").select("kind, print_status, source, ref_key").eq("jornada_id", jornadaId);
  if (posId) q = q.eq("pos_id", posId);
  const { data } = await q;
  const rows = data || [];
  const reprints = rows.filter((r) => r.kind === "reprint").length;
  const printed = new Set(
    rows.filter((r) => r.print_status === "sent" || r.print_status === "browser").map((r) => `${r.source}:${r.ref_key}`),
  );
  const failed = new Set(rows.filter((r) => r.print_status === "not_sent").map((r) => `${r.source}:${r.ref_key}`));
  const pending = [...failed].filter((k) => !printed.has(k)).length;
  return { reprints, pending };
}
