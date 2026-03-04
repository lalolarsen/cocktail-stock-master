import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { toast } from "sonner";
import {
  Plus,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Trash2,
  ChevronDown,
  ChevronUp,
  Link2,
  DollarSign,
  ShoppingBag,
  Monitor,
  FileBarChart2,
  X,
  PackageCheck,
} from "lucide-react";
import { formatCLP } from "@/lib/currency";
import { useActiveVenue } from "@/hooks/useActiveVenue";
import { useAppSession } from "@/contexts/AppSessionContext";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuditItem {
  id?: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  total_amount: number;
  cocktail_id: string | null;
  stock_applied: boolean;
  income_applied: boolean;
}

interface AuditSession {
  id: string;
  totem_number: string;
  report_number: string;
  session_date: string;
  total_amount: number;
  total_txns: number;
  payment_debito: number;
  payment_visa: number;
  payment_amex: number;
  payment_diners: number;
  payment_mastercard: number;
  payment_otras: number;
  status: "pending" | "reconciled" | "discrepancy";
  notes: string | null;
  created_at: string;
  jornada_id: string | null;
  items?: AuditItem[];
}

interface Cocktail {
  id: string;
  name: string;
  price: number;
}

interface Jornada {
  id: string;
  fecha: string;
  estado: string;
  hora_apertura: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  pending: {
    label: "Pendiente",
    icon: Clock,
    className: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  },
  reconciled: {
    label: "Conciliado",
    icon: CheckCircle2,
    className: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  },
  discrepancy: {
    label: "Discrepancia",
    icon: AlertTriangle,
    className: "bg-red-500/15 text-red-600 border-red-500/30",
  },
};

const EMPTY_ITEM: AuditItem = {
  product_name: "",
  quantity: 1,
  unit_price: 0,
  total_amount: 0,
  cocktail_id: null,
  stock_applied: false,
  income_applied: false,
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: AuditSession["status"] }) {
  const cfg = STATUS_CONFIG[status];
  const Icon = cfg.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${cfg.className}`}
    >
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  );
}

function SummaryCard({
  label,
  value,
  sub,
  icon: Icon,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: typeof DollarSign;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
            {label}
          </p>
          <p className="text-2xl font-bold mt-1">{value}</p>
          {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
        </div>
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Icon className="w-4 h-4 text-primary" />
        </div>
      </div>
    </Card>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function PasslineAuditPanel() {
  const { venue } = useActiveVenue();
  const { activeJornadaId } = useAppSession();

  const [sessions, setSessions] = useState<AuditSession[]>([]);
  const [cocktails, setCocktails] = useState<Cocktail[]>([]);
  const [jornadas, setJornadas] = useState<Jornada[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // New session dialog
  const [showDialog, setShowDialog] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [form, setForm] = useState({
    totem_number: "",
    report_number: "",
    session_date: new Date().toISOString().split("T")[0],
    jornada_id: activeJornadaId || "",
    payment_debito: "",
    payment_visa: "",
    payment_amex: "",
    payment_diners: "",
    payment_mastercard: "",
    payment_otras: "",
    notes: "",
  });
  const [items, setItems] = useState<AuditItem[]>([{ ...EMPTY_ITEM }]);

  // Reconcile dialog
  const [showReconcileDialog, setShowReconcileDialog] = useState(false);
  const [reconcileSession, setReconcileSession] = useState<AuditSession | null>(null);
  const [reconcileStatus, setReconcileStatus] = useState<"reconciled" | "discrepancy">("reconciled");
  const [reconcileNotes, setReconcileNotes] = useState("");
  const [applyToIncome, setApplyToIncome] = useState(true);
  const [applyToStock, setApplyToStock] = useState(false);
  const [reconciling, setReconciling] = useState(false);

  // ── Load data ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (venue?.id) {
      fetchSessions();
      fetchCocktails();
      fetchJornadas();
    }
  }, [venue?.id]);

  const fetchSessions = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("passline_audit_sessions" as any)
        .select("*")
        .eq("venue_id", venue!.id)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      setSessions((data as any[]) || []);
    } catch (err: any) {
      toast.error("Error al cargar auditorías Passline");
    } finally {
      setLoading(false);
    }
  };

  const fetchSessionItems = async (sessionId: string) => {
    const { data, error } = await supabase
      .from("passline_audit_items" as any)
      .select("*")
      .eq("session_id", sessionId)
      .order("created_at");

    if (!error && data) {
      setSessions((prev) =>
        prev.map((s) =>
          s.id === sessionId ? { ...s, items: data as any[] } : s
        )
      );
    }
  };

  const fetchCocktails = async () => {
    const { data } = await supabase
      .from("cocktails")
      .select("id, name, price")
      .eq("venue_id", venue!.id)
      .order("name");
    setCocktails((data as Cocktail[]) || []);
  };

  const fetchJornadas = async () => {
    const { data } = await supabase
      .from("jornadas")
      .select("id, fecha, estado, hora_apertura")
      .order("created_at", { ascending: false })
      .limit(20);
    setJornadas((data as Jornada[]) || []);
  };

  // ── Computed totals ────────────────────────────────────────────────────────

  const computed = {
    totalPendiente: sessions
      .filter((s) => s.status === "pending")
      .reduce((a, s) => a + s.total_amount, 0),
    totalReconciliado: sessions
      .filter((s) => s.status === "reconciled")
      .reduce((a, s) => a + s.total_amount, 0),
    totalSessions: sessions.length,
    totalDiscrepancies: sessions.filter((s) => s.status === "discrepancy").length,
  };

  // ── Item row helpers ───────────────────────────────────────────────────────

  const updateItem = (idx: number, field: keyof AuditItem, value: any) => {
    setItems((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      if (field === "quantity" || field === "unit_price") {
        const q = field === "quantity" ? Number(value) : next[idx].quantity;
        const p = field === "unit_price" ? Number(value) : next[idx].unit_price;
        next[idx].total_amount = q * p;
      }
      return next;
    });
  };

  const addItem = () => setItems((prev) => [...prev, { ...EMPTY_ITEM }]);
  const removeItem = (idx: number) =>
    setItems((prev) => prev.filter((_, i) => i !== idx));

  // Parse items from ticket text (quick-entry helper)
  const pasteItems = (raw: string) => {
    // Expected format lines: "PRODUCT NAME    0001    $ 6.500"
    const parsed: AuditItem[] = [];
    raw.split("\n").forEach((line) => {
      const m = line
        .trim()
        .match(/^(.+?)\s{2,}(\d{4})\s+\$\s*([\d.]+)\s*$/);
      if (m) {
        const name = m[1].trim().toUpperCase();
        const qty = parseInt(m[2], 10);
        const total = parseInt(m[3].replace(/\./g, ""), 10);
        const unit = qty > 0 ? Math.round(total / qty) : total;
        parsed.push({
          product_name: name,
          quantity: qty,
          unit_price: unit,
          total_amount: total,
          cocktail_id: null,
          stock_applied: false,
          income_applied: false,
        });
      }
    });
    if (parsed.length > 0) {
      setItems(parsed);
      toast.success(`${parsed.length} productos detectados del ticket`);
    } else {
      toast.error("No se pudo parsear el texto. Usa el formato del ticket Passline.");
    }
  };

  // ── Submit new session ─────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (!form.totem_number.trim()) {
      toast.error("Ingresa el número de totem");
      return;
    }
    if (!form.report_number.trim()) {
      toast.error("Ingresa el número de informe");
      return;
    }
    if (items.some((i) => !i.product_name.trim())) {
      toast.error("Todos los productos deben tener nombre");
      return;
    }

    setSubmitting(true);
    try {
      const { data: session_data } = await supabase.auth.getSession();
      const userId = session_data.session?.user.id;
      if (!userId) throw new Error("No autenticado");

      const parsedInt = (v: string) => (v ? parseInt(v.replace(/\./g, ""), 10) || 0 : 0);

      const totalAmount = items.reduce((a, i) => a + i.total_amount, 0);
      const totalTxns =
        parsedInt(form.payment_debito) > 0
          ? 1
          : 0 +
            (parsedInt(form.payment_mastercard) > 0 ? 1 : 0) +
            (parsedInt(form.payment_visa) > 0 ? 1 : 0);

      const sessionPayload: any = {
        venue_id: venue!.id,
        jornada_id: form.jornada_id || null,
        totem_number: form.totem_number.trim(),
        report_number: form.report_number.trim(),
        session_date: form.session_date,
        total_amount: totalAmount,
        total_txns: totalTxns,
        payment_debito: parsedInt(form.payment_debito),
        payment_visa: parsedInt(form.payment_visa),
        payment_amex: parsedInt(form.payment_amex),
        payment_diners: parsedInt(form.payment_diners),
        payment_mastercard: parsedInt(form.payment_mastercard),
        payment_otras: parsedInt(form.payment_otras),
        notes: form.notes || null,
        status: "pending",
        created_by: userId,
      };

      const { data: newSession, error: sessionError } = await supabase
        .from("passline_audit_sessions" as any)
        .insert(sessionPayload)
        .select()
        .single();

      if (sessionError) throw sessionError;

      const itemsPayload = items
        .filter((i) => i.product_name.trim())
        .map((i) => ({
          session_id: (newSession as any).id,
          venue_id: venue!.id,
          product_name: i.product_name.trim().toUpperCase(),
          quantity: i.quantity,
          unit_price: i.unit_price,
          total_amount: i.total_amount,
          cocktail_id: i.cocktail_id || null,
          stock_applied: false,
          income_applied: false,
        }));

      const { error: itemsError } = await supabase
        .from("passline_audit_items" as any)
        .insert(itemsPayload);

      if (itemsError) throw itemsError;

      toast.success("Auditoría Passline registrada");
      setShowDialog(false);
      resetForm();
      fetchSessions();
    } catch (err: any) {
      if (err.code === "23505") {
        toast.error("Ya existe un registro con ese número de informe para este totem");
      } else {
        toast.error(err.message || "Error al guardar");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setForm({
      totem_number: "",
      report_number: "",
      session_date: new Date().toISOString().split("T")[0],
      jornada_id: activeJornadaId || "",
      payment_debito: "",
      payment_visa: "",
      payment_amex: "",
      payment_diners: "",
      payment_mastercard: "",
      payment_otras: "",
      notes: "",
    });
    setItems([{ ...EMPTY_ITEM }]);
  };

  // ── Reconcile ─────────────────────────────────────────────────────────────

  const openReconcile = (session: AuditSession) => {
    setReconcileSession(session);
    setReconcileStatus("reconciled");
    setReconcileNotes("");
    setApplyToIncome(true);
    setApplyToStock(false);
    setShowReconcileDialog(true);
    if (!session.items) fetchSessionItems(session.id);
  };

  const handleReconcile = async () => {
    if (!reconcileSession) return;
    setReconciling(true);
    try {
      const { data: authData } = await supabase.auth.getSession();
      const userId = authData.session?.user.id;

      // Update session status
      const { error: updateError } = await supabase
        .from("passline_audit_sessions" as any)
        .update({
          status: reconcileStatus,
          notes: reconcileNotes || null,
        })
        .eq("id", reconcileSession.id);

      if (updateError) throw updateError;

      // Optionally register income in gross_income_entries
      if (applyToIncome) {
        const { error: incomeError } = await supabase
          .from("gross_income_entries")
          .insert({
            venue_id: venue!.id,
            source_type: "passline_totem",
            source_id: reconcileSession.id,
            amount: reconcileSession.total_amount,
            description: `Passline Totem ${reconcileSession.totem_number} — ${reconcileSession.report_number}`,
            jornada_id: reconcileSession.jornada_id || null,
            created_by: userId,
          });

        if (incomeError) {
          toast.warning("Sesión conciliada pero error al registrar ingreso: " + incomeError.message);
        } else {
          // Mark items as income_applied
          await supabase
            .from("passline_audit_items" as any)
            .update({ income_applied: true })
            .eq("session_id", reconcileSession.id);
        }
      }

      toast.success(
        reconcileStatus === "reconciled"
          ? "✓ Sesión conciliada correctamente"
          : "⚠ Discrepancia registrada"
      );
      setShowReconcileDialog(false);
      fetchSessions();
    } catch (err: any) {
      toast.error(err.message || "Error al conciliar");
    } finally {
      setReconciling(false);
    }
  };

  // ── Delete ────────────────────────────────────────────────────────────────

  const handleDelete = async (sessionId: string) => {
    if (!confirm("¿Eliminar esta auditoría? Esta acción no se puede deshacer.")) return;
    const { error } = await supabase
      .from("passline_audit_sessions" as any)
      .delete()
      .eq("id", sessionId);

    if (error) {
      toast.error("Error al eliminar");
    } else {
      toast.success("Auditoría eliminada");
      fetchSessions();
    }
  };

  // ── Toggle expand ─────────────────────────────────────────────────────────

  const toggleExpand = (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
    } else {
      setExpandedId(id);
      const session = sessions.find((s) => s.id === id);
      if (session && !session.items) fetchSessionItems(id);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Monitor className="w-5 h-5 text-primary" />
            Auditoría Passline Totems
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Registra y concilia las ventas de los totems externos contra tu inventario e ingresos
          </p>
        </div>
        <Button onClick={() => setShowDialog(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          Registrar Jornada
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          label="Total Conciliado"
          value={formatCLP(computed.totalReconciliado)}
          sub="ingresado al sistema"
          icon={CheckCircle2}
        />
        <SummaryCard
          label="Pendiente Conciliar"
          value={formatCLP(computed.totalPendiente)}
          sub={`${sessions.filter((s) => s.status === "pending").length} sesiones`}
          icon={Clock}
        />
        <SummaryCard
          label="Sesiones Totales"
          value={String(computed.totalSessions)}
          icon={FileBarChart2}
        />
        <SummaryCard
          label="Discrepancias"
          value={String(computed.totalDiscrepancies)}
          sub="requieren revisión"
          icon={AlertTriangle}
        />
      </div>

      {/* Sessions list */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ShoppingBag className="w-4 h-4" />
            Historial de Jornadas
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
              <Loader2 className="w-5 h-5 animate-spin" />
              Cargando...
            </div>
          ) : sessions.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Monitor className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No hay jornadas registradas aún.</p>
              <p className="text-xs mt-1">
                Registra el reporte del totem al cierre de cada jornada.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {sessions.map((session) => (
                <div key={session.id}>
                  {/* Session row */}
                  <div className="px-4 py-3 flex items-center gap-3 hover:bg-muted/30 transition-colors">
                    <button
                      onClick={() => toggleExpand(session.id)}
                      className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {expandedId === session.id ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </button>

                    <div className="flex-1 min-w-0 grid grid-cols-2 md:grid-cols-5 gap-x-4 gap-y-0.5">
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                          Totem
                        </p>
                        <p className="text-sm font-semibold">
                          #{session.totem_number}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                          Informe
                        </p>
                        <p className="text-sm font-mono">{session.report_number}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                          Fecha
                        </p>
                        <p className="text-sm">
                          {new Date(session.session_date + "T12:00:00").toLocaleDateString(
                            "es-CL",
                            { day: "2-digit", month: "short", year: "2-digit" }
                          )}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                          Total
                        </p>
                        <p className="text-sm font-bold text-primary">
                          {formatCLP(session.total_amount)}
                        </p>
                      </div>
                      <div className="flex items-center">
                        <StatusBadge status={session.status} />
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {session.status === "pending" && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1"
                          onClick={() => openReconcile(session)}
                        >
                          <PackageCheck className="w-3 h-3" />
                          Conciliar
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => handleDelete(session.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {expandedId === session.id && (
                    <div className="bg-muted/20 border-t border-border px-4 py-4 space-y-4">
                      {/* Payment breakdown */}
                      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                        {[
                          { label: "Débito", value: session.payment_debito },
                          { label: "Visa", value: session.payment_visa },
                          { label: "Amex", value: session.payment_amex },
                          { label: "Diners", value: session.payment_diners },
                          { label: "Mastercard", value: session.payment_mastercard },
                          { label: "Otras", value: session.payment_otras },
                        ]
                          .filter((p) => p.value > 0)
                          .map((p) => (
                            <div
                              key={p.label}
                              className="bg-background rounded-lg p-2 text-center border border-border/50"
                            >
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                                {p.label}
                              </p>
                              <p className="text-sm font-semibold">{formatCLP(p.value)}</p>
                            </div>
                          ))}
                      </div>

                      {/* Items table */}
                      {session.items === undefined ? (
                        <div className="flex items-center gap-2 text-muted-foreground text-sm py-2">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Cargando productos...
                        </div>
                      ) : session.items.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Sin productos registrados</p>
                      ) : (
                        <div className="rounded-lg border border-border overflow-hidden">
                          <Table>
                            <TableHeader>
                              <TableRow className="bg-muted/40">
                                <TableHead className="text-xs">Producto</TableHead>
                                <TableHead className="text-xs text-right w-16">Cant.</TableHead>
                                <TableHead className="text-xs text-right w-28">Precio Unit.</TableHead>
                                <TableHead className="text-xs text-right w-28">Total</TableHead>
                                <TableHead className="text-xs text-center w-24">Carta</TableHead>
                                <TableHead className="text-xs text-center w-16">Stock</TableHead>
                                <TableHead className="text-xs text-center w-16">Ingreso</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {session.items.map((item, idx) => {
                                const matchedCocktail = cocktails.find(
                                  (c) => c.id === item.cocktail_id
                                );
                                return (
                                  <TableRow key={item.id || idx}>
                                    <TableCell className="font-mono text-xs py-2">
                                      {item.product_name}
                                    </TableCell>
                                    <TableCell className="text-right text-xs py-2">
                                      {item.quantity}
                                    </TableCell>
                                    <TableCell className="text-right text-xs py-2">
                                      {formatCLP(item.unit_price)}
                                    </TableCell>
                                    <TableCell className="text-right text-xs font-semibold py-2">
                                      {formatCLP(item.total_amount)}
                                    </TableCell>
                                    <TableCell className="text-center py-2">
                                      {matchedCocktail ? (
                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium flex items-center gap-1 justify-center">
                                          <Link2 className="w-2.5 h-2.5" />
                                          {matchedCocktail.name}
                                        </span>
                                      ) : (
                                        <span className="text-[10px] text-muted-foreground">
                                          Sin mapeo
                                        </span>
                                      )}
                                    </TableCell>
                                    <TableCell className="text-center py-2">
                                      {item.stock_applied ? (
                                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mx-auto" />
                                      ) : (
                                        <X className="w-3.5 h-3.5 text-muted-foreground/40 mx-auto" />
                                      )}
                                    </TableCell>
                                    <TableCell className="text-center py-2">
                                      {item.income_applied ? (
                                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mx-auto" />
                                      ) : (
                                        <X className="w-3.5 h-3.5 text-muted-foreground/40 mx-auto" />
                                      )}
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </div>
                      )}

                      {session.notes && (
                        <p className="text-xs text-muted-foreground bg-background rounded-lg p-3 border border-border/50">
                          <span className="font-medium">Notas:</span> {session.notes}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── New Session Dialog ──────────────────────────────────────────────── */}
      <Dialog open={showDialog} onOpenChange={(v) => { setShowDialog(v); if (!v) resetForm(); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Monitor className="w-5 h-5 text-primary" />
              Registrar Jornada de Totem Passline
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Totem info */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Número de Totem *</Label>
                <Input
                  placeholder="Ej: 302"
                  value={form.totem_number}
                  onChange={(e) => setForm((f) => ({ ...f, totem_number: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Número de Informe *</Label>
                <Input
                  placeholder="Ej: V2-513602"
                  value={form.report_number}
                  onChange={(e) => setForm((f) => ({ ...f, report_number: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Fecha</Label>
                <Input
                  type="date"
                  value={form.session_date}
                  onChange={(e) => setForm((f) => ({ ...f, session_date: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Jornada</Label>
                <Select
                  value={form.jornada_id}
                  onValueChange={(v) => setForm((f) => ({ ...f, jornada_id: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar jornada" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Sin jornada</SelectItem>
                    {jornadas.map((j) => (
                      <SelectItem key={j.id} value={j.id}>
                        {j.fecha}{" "}
                        {j.estado === "activa" || j.estado === "abierta" ? "✓ Activa" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Payments */}
            <div>
              <Label className="text-xs mb-2 block">Desglose de Medios de Pago (CLP)</Label>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { key: "payment_debito", label: "Débito" },
                  { key: "payment_visa", label: "Visa" },
                  { key: "payment_amex", label: "Amex" },
                  { key: "payment_diners", label: "Diners" },
                  { key: "payment_mastercard", label: "Mastercard" },
                  { key: "payment_otras", label: "Otras" },
                ].map(({ key, label }) => (
                  <div key={key} className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">{label}</Label>
                    <Input
                      placeholder="0"
                      value={(form as any)[key]}
                      onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Products */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs">Productos vendidos</Label>
                <div className="flex gap-2">
                  <PasteDialog onPaste={pasteItems} />
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={addItem}
                  >
                    <Plus className="w-3 h-3" />
                    Agregar fila
                  </Button>
                </div>
              </div>

              <div className="rounded-lg border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead className="text-xs">Nombre Producto</TableHead>
                      <TableHead className="text-xs w-20">Cant.</TableHead>
                      <TableHead className="text-xs w-28">Precio Unit.</TableHead>
                      <TableHead className="text-xs w-28">Total</TableHead>
                      <TableHead className="text-xs w-40">Mapear a Carta</TableHead>
                      <TableHead className="w-8" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="py-1.5">
                          <Input
                            className="h-7 text-xs"
                            placeholder="NOMBRE PRODUCTO"
                            value={item.product_name}
                            onChange={(e) => updateItem(idx, "product_name", e.target.value)}
                          />
                        </TableCell>
                        <TableCell className="py-1.5">
                          <Input
                            className="h-7 text-xs text-right"
                            type="number"
                            min={1}
                            value={item.quantity}
                            onChange={(e) => updateItem(idx, "quantity", Number(e.target.value))}
                          />
                        </TableCell>
                        <TableCell className="py-1.5">
                          <Input
                            className="h-7 text-xs text-right"
                            type="number"
                            min={0}
                            placeholder="0"
                            value={item.unit_price || ""}
                            onChange={(e) => updateItem(idx, "unit_price", Number(e.target.value))}
                          />
                        </TableCell>
                        <TableCell className="py-1.5">
                          <span className="text-xs font-medium tabular-nums">
                            {formatCLP(item.total_amount)}
                          </span>
                        </TableCell>
                        <TableCell className="py-1.5">
                          <Select
                            value={item.cocktail_id || "__none__"}
                            onValueChange={(v) =>
                              updateItem(idx, "cocktail_id", v === "__none__" ? null : v)
                            }
                          >
                            <SelectTrigger className="h-7 text-xs">
                              <SelectValue placeholder="Sin mapeo" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">Sin mapeo</SelectItem>
                              {cocktails.map((c) => (
                                <SelectItem key={c.id} value={c.id}>
                                  {c.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="py-1.5 pr-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => removeItem(idx)}
                            disabled={items.length === 1}
                          >
                            <X className="w-3.5 h-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Running total */}
              <div className="flex justify-end mt-2 pr-2">
                <span className="text-sm text-muted-foreground">
                  Total productos:{" "}
                  <span className="font-bold text-foreground">
                    {formatCLP(items.reduce((a, i) => a + i.total_amount, 0))}
                  </span>
                </span>
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label className="text-xs">Notas (opcional)</Label>
              <Textarea
                placeholder="Observaciones sobre esta jornada del totem..."
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                className="text-sm resize-none"
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={submitting} className="gap-2">
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              Guardar Auditoría
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Reconcile Dialog ──────────────────────────────────────────────────── */}
      <Dialog open={showReconcileDialog} onOpenChange={setShowReconcileDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PackageCheck className="w-5 h-5 text-primary" />
              Conciliar Jornada
            </DialogTitle>
          </DialogHeader>

          {reconcileSession && (
            <div className="space-y-4 py-2">
              {/* Summary */}
              <div className="bg-muted/40 rounded-lg p-4 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Totem:</span>
                  <span className="font-semibold">#{reconcileSession.totem_number}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Informe:</span>
                  <span className="font-mono">{reconcileSession.report_number}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total:</span>
                  <span className="font-bold text-primary text-base">
                    {formatCLP(reconcileSession.total_amount)}
                  </span>
                </div>
              </div>

              {/* Status */}
              <div className="space-y-1.5">
                <Label className="text-xs">Resultado de la conciliación</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setReconcileStatus("reconciled")}
                    className={`flex items-center gap-2 p-3 rounded-lg border-2 text-sm transition-all ${
                      reconcileStatus === "reconciled"
                        ? "border-emerald-500 bg-emerald-500/10 text-emerald-700 font-medium"
                        : "border-muted hover:border-emerald-500/50"
                    }`}
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Cuadra OK
                  </button>
                  <button
                    type="button"
                    onClick={() => setReconcileStatus("discrepancy")}
                    className={`flex items-center gap-2 p-3 rounded-lg border-2 text-sm transition-all ${
                      reconcileStatus === "discrepancy"
                        ? "border-red-500 bg-red-500/10 text-red-700 font-medium"
                        : "border-muted hover:border-red-500/50"
                    }`}
                  >
                    <AlertTriangle className="w-4 h-4" />
                    Discrepancia
                  </button>
                </div>
              </div>

              {/* Options */}
              <div className="space-y-2">
                <Label className="text-xs">Acciones al conciliar</Label>
                <label className="flex items-start gap-3 p-3 rounded-lg border border-border hover:bg-muted/30 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={applyToIncome}
                    onChange={(e) => setApplyToIncome(e.target.checked)}
                    className="mt-0.5"
                  />
                  <div>
                    <p className="text-sm font-medium">Registrar como ingreso</p>
                    <p className="text-xs text-muted-foreground">
                      Agrega {formatCLP(reconcileSession.total_amount)} a los ingresos brutos de la
                      jornada
                    </p>
                  </div>
                </label>
                <label className="flex items-start gap-3 p-3 rounded-lg border border-border hover:bg-muted/30 cursor-pointer opacity-60">
                  <input
                    type="checkbox"
                    checked={applyToStock}
                    disabled
                    onChange={(e) => setApplyToStock(e.target.checked)}
                    className="mt-0.5"
                  />
                  <div>
                    <p className="text-sm font-medium">Descontar stock (próximamente)</p>
                    <p className="text-xs text-muted-foreground">
                      Descuenta ingredientes de los productos mapeados a la carta
                    </p>
                  </div>
                </label>
              </div>

              {/* Notes */}
              <div className="space-y-1.5">
                <Label className="text-xs">Notas de conciliación</Label>
                <Textarea
                  placeholder="Describe cualquier diferencia encontrada..."
                  value={reconcileNotes}
                  onChange={(e) => setReconcileNotes(e.target.value)}
                  className="resize-none text-sm"
                  rows={2}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReconcileDialog(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleReconcile}
              disabled={reconciling}
              className={`gap-2 ${
                reconcileStatus === "discrepancy"
                  ? "bg-red-500 hover:bg-red-600 text-white"
                  : ""
              }`}
            >
              {reconciling && <Loader2 className="w-4 h-4 animate-spin" />}
              {reconcileStatus === "reconciled" ? "Confirmar Conciliación" : "Marcar Discrepancia"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Paste helper dialog ──────────────────────────────────────────────────────

function PasteDialog({ onPaste }: { onPaste: (text: string) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");

  const handlePaste = () => {
    onPaste(text);
    setText("");
    setOpen(false);
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="h-7 text-xs gap-1"
        onClick={() => setOpen(true)}
      >
        <FileBarChart2 className="w-3 h-3" />
        Pegar desde ticket
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base">Pegar detalle del ticket Passline</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-xs text-muted-foreground">
              Copia las líneas del{" "}
              <strong>DETALLE DE PRODUCTOS</strong> del ticket (formato:{" "}
              <code className="bg-muted px-1 rounded">NOMBRE &nbsp; 0001 &nbsp; $ 6.500</code>)
            </p>
            <Textarea
              placeholder={`RAMAZZOTTI ROSSATO    0001    $ 6.500\nMISTRAL 35 BEBIDA    0001    $ 5.000\nGIN DE VERANO    0001    $ 8.000`}
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="font-mono text-xs resize-none"
              rows={6}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handlePaste} disabled={!text.trim()}>
              Importar productos
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
