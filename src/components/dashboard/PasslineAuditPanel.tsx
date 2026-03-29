import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { passlineAuditSessionsTable, passlineAuditItemsTable } from "@/lib/db-tables";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Monitor,
  FileBarChart2,
  X,
  PackageCheck,
  Package,
} from "lucide-react";
import { useActiveVenue } from "@/hooks/useActiveVenue";
import { useAppSession } from "@/contexts/AppSessionContext";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CatalogProduct {
  id: string;
  name: string;
  type: "cocktail" | "product";
  capacity_ml: number | null;
}

interface AuditItem {
  id?: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  total_amount: number;
  cocktail_id: string | null;
  product_id: string | null;
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
  status: "pending" | "reconciled" | "discrepancy";
  notes: string | null;
  created_at: string;
  jornada_id: string | null;
  items?: AuditItem[];
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
    label: "Confirmado",
    icon: CheckCircle2,
    className: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  },
  discrepancy: {
    label: "Discrepancia",
    icon: AlertTriangle,
    className: "bg-red-500/15 text-red-600 border-red-500/30",
  },
};

function StatusBadge({ status }: { status: AuditSession["status"] }) {
  const cfg = STATUS_CONFIG[status];
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${cfg.className}`}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  );
}

function SummaryCard({ label, value, sub, icon: Icon }: { label: string; value: string; sub?: string; icon: typeof Package }) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
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
  const [catalog, setCatalog] = useState<CatalogProduct[]>([]);
  const [jornadas, setJornadas] = useState<Jornada[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const catalogMap = useMemo(() => new Map(catalog.map((c) => [c.id, c])), [catalog]);

  // New session dialog
  const [showDialog, setShowDialog] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [form, setForm] = useState({
    totem_number: "",
    report_number: "",
    session_date: new Date().toISOString().split("T")[0],
    jornada_id: activeJornadaId || "",
    notes: "",
  });
  const [items, setItems] = useState<AuditItem[]>([makeEmptyItem()]);

  // Confirm dialog
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [confirmSession, setConfirmSession] = useState<AuditSession | null>(null);
  const [confirmStatus, setConfirmStatus] = useState<"reconciled" | "discrepancy">("reconciled");
  const [confirmNotes, setConfirmNotes] = useState("");
  const [confirming, setConfirming] = useState(false);

  function makeEmptyItem(): AuditItem {
    return {
      product_name: "",
      quantity: 1,
      unit_price: 0,
      total_amount: 0,
      cocktail_id: null,
      product_id: null,
      stock_applied: false,
      income_applied: false,
    };
  }

  // ── Load data ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (venue?.id) {
      fetchSessions();
      fetchCatalog();
      fetchJornadas();
    }
  }, [venue?.id]);

  const fetchSessions = async () => {
    setLoading(true);
    try {
      const { data, error } = await passlineAuditSessionsTable()
        .select("*")
        .eq("venue_id", venue!.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      setSessions((data ?? []) as unknown as AuditSession[]);
    } catch {
      toast.error("Error al cargar auditorías Passline");
    } finally {
      setLoading(false);
    }
  };

  const fetchSessionItems = async (sessionId: string) => {
    const { data, error } = await passlineAuditItemsTable()
      .select("*")
      .eq("session_id", sessionId)
      .order("created_at");
    if (!error && data) {
      setSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, items: data as unknown as AuditItem[] } : s))
      );
    }
  };

  const fetchCatalog = async () => {
    const [cocktailsRes, productsRes] = await Promise.all([
      supabase
        .from("cocktails")
        .select("id, name")
        .eq("venue_id", venue!.id)
        .order("name"),
      supabase
        .from("products")
        .select("id, name, capacity_ml, category")
        .eq("venue_id", venue!.id)
        .eq("is_active_in_sales", true)
        .order("name"),
    ]);

    const merged: CatalogProduct[] = [];

    for (const c of cocktailsRes.data || []) {
      merged.push({ id: c.id, name: c.name, type: "cocktail", capacity_ml: null });
    }

    for (const p of productsRes.data || []) {
      merged.push({ id: p.id, name: p.name, type: "product", capacity_ml: p.capacity_ml });
    }

    setCatalog(merged);
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

  const computed = useMemo(() => {
    const confirmed = sessions.filter((s) => s.status === "reconciled");
    const pending = sessions.filter((s) => s.status === "pending");
    return {
      totalConfirmadas: confirmed.length,
      pendingCount: pending.length,
      totalSessions: sessions.length,
      totalDiscrepancies: sessions.filter((s) => s.status === "discrepancy").length,
    };
  }, [sessions]);

  // ── Item row helpers ───────────────────────────────────────────────────────

  const selectCatalogProduct = (idx: number, catalogId: string) => {
    const product = catalogMap.get(catalogId);
    if (!product) return;

    setItems((prev) => {
      const next = [...prev];
      next[idx] = {
        ...next[idx],
        product_name: product.name,
        cocktail_id: product.type === "cocktail" ? product.id : null,
        product_id: product.type === "product" ? product.id : null,
      };
      return next;
    });
  };

  const updateItemField = (idx: number, field: keyof AuditItem, value: any) => {
    setItems((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  };

  const addItem = () => setItems((prev) => [...prev, makeEmptyItem()]);
  const removeItem = (idx: number) => setItems((prev) => prev.filter((_, i) => i !== idx));

  // ── Submit new session ─────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (!form.totem_number.trim()) return toast.error("Ingresa el número de totem");
    if (!form.report_number.trim()) return toast.error("Ingresa el número de informe");

    const validItems = items.filter((i) => i.cocktail_id || i.product_id);
    if (validItems.length === 0) return toast.error("Todos los productos deben estar vinculados a la carta");

    setSubmitting(true);
    try {
      const { data: authData } = await supabase.auth.getSession();
      const userId = authData.session?.user.id;
      if (!userId) throw new Error("No autenticado");

      const sessionPayload: any = {
        venue_id: venue!.id,
        jornada_id: form.jornada_id || null,
        totem_number: form.totem_number.trim(),
        report_number: form.report_number.trim(),
        session_date: form.session_date,
        total_amount: 0,
        total_txns: validItems.reduce((a, i) => a + i.quantity, 0),
        net_amount: 0,
        iva_amount: 0,
        cogs_total: 0,
        notes: form.notes || null,
        status: "pending",
        created_by: userId,
      };

      const { data: newSession, error: sessionError } = await passlineAuditSessionsTable()
        .insert(sessionPayload)
        .select()
        .single();
      if (sessionError) throw sessionError;

      const sessionId = (newSession as unknown as { id: string }).id;

      const itemsPayload = validItems.map((i) => ({
        session_id: sessionId,
        venue_id: venue!.id,
        product_name: i.product_name.trim(),
        quantity: i.quantity,
        unit_price: 0,
        total_amount: 0,
        cocktail_id: i.cocktail_id || null,
        product_id: i.product_id || null,
        stock_applied: false,
        income_applied: false,
      }));

      const { error: itemsError } = await passlineAuditItemsTable().insert(itemsPayload);
      if (itemsError) throw itemsError;

      toast.success("Descuento de inventario registrado");
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
      notes: "",
    });
    setItems([makeEmptyItem()]);
  };

  // ── Confirm (reconcile + stock deduction only) ────────────────────────────

  const openConfirm = (session: AuditSession) => {
    setConfirmSession(session);
    setConfirmStatus("reconciled");
    setConfirmNotes("");
    setShowConfirmDialog(true);
    if (!session.items) fetchSessionItems(session.id);
  };

  const handleConfirm = async () => {
    if (!confirmSession) return;
    setConfirming(true);

    try {
      const { data: authData } = await supabase.auth.getSession();
      const userId = authData.session?.user.id;
      if (!userId) throw new Error("No autenticado");

      let sessionItems = confirmSession.items;
      if (!sessionItems) {
        const { data } = await passlineAuditItemsTable()
          .select("*")
          .eq("session_id", confirmSession.id);
        sessionItems = (data || []) as unknown as AuditItem[];
      }

      if (confirmStatus === "reconciled") {
        // Get the first bar location for stock deduction
        const { data: locations } = await supabase
          .from("stock_locations")
          .select("id")
          .eq("venue_id", venue!.id)
          .eq("type", "bar" as any)
          .eq("is_active", true)
          .limit(1);

        const barLocationId = locations?.[0]?.id;
        if (!barLocationId) throw new Error("No hay barra activa para descontar stock");

        // Process each item — stock deduction only
        for (const item of sessionItems) {
          if (item.cocktail_id) {
            // Cocktail — get recipe and deduct each ingredient
            const { data: ingredients } = await supabase
              .from("cocktail_ingredients")
              .select("product_id, quantity")
              .eq("cocktail_id", item.cocktail_id)
              .eq("venue_id", venue!.id);

            for (const ing of (ingredients || []).filter((i: any) => i.product_id)) {
              const { data: prod } = await supabase
                .from("products")
                .select("capacity_ml, cost_per_unit")
                .eq("id", ing.product_id)
                .single();

              if (!prod) continue;

              const ingQtyPerServing = Number(ing.quantity);
              const totalIngQty = ingQtyPerServing * item.quantity;
              const costPerUnit = Number(prod.cost_per_unit) || 0;

              // Create stock_movement
              await supabase.from("stock_movements").insert({
                product_id: ing.product_id,
                venue_id: venue!.id,
                movement_type: "salida",
                quantity: -totalIngQty,
                unit_cost: costPerUnit,
                source_type: "passline_totem",
                from_location_id: barLocationId,
                jornada_id: confirmSession.jornada_id || null,
                notes: `[TOTEM] #${confirmSession.totem_number} — ${item.product_name} x${item.quantity}`,
              });

              // Update stock_balances
              const { data: currentBalance } = await supabase
                .from("stock_balances")
                .select("quantity")
                .eq("product_id", ing.product_id)
                .eq("location_id", barLocationId)
                .single();
              if (currentBalance) {
                await supabase
                  .from("stock_balances")
                  .update({ quantity: Math.max(0, Number(currentBalance.quantity) - totalIngQty) })
                  .eq("product_id", ing.product_id)
                  .eq("location_id", barLocationId);
              }
            }
          } else if (item.product_id) {
            // Unit product — deduct directly
            const prod = catalogMap.get(item.product_id);
            const capacityMl = prod?.capacity_ml || 0;
            const deductQty = capacityMl && capacityMl > 0 ? item.quantity * capacityMl : item.quantity;

            await supabase.from("stock_movements").insert({
              product_id: item.product_id,
              venue_id: venue!.id,
              movement_type: "salida",
              quantity: -deductQty,
              unit_cost: 0,
              source_type: "passline_totem",
              from_location_id: barLocationId,
              jornada_id: confirmSession.jornada_id || null,
              notes: `[TOTEM] #${confirmSession.totem_number} — ${item.product_name} x${item.quantity}`,
            });

            // Update stock_balances
            const { data: currentBalance } = await supabase
              .from("stock_balances")
              .select("quantity")
              .eq("product_id", item.product_id)
              .eq("location_id", barLocationId)
              .single();
            if (currentBalance) {
              await supabase
                .from("stock_balances")
                .update({ quantity: Math.max(0, Number(currentBalance.quantity) - deductQty) })
                .eq("product_id", item.product_id)
                .eq("location_id", barLocationId);
            }
          }
        }

        // Mark items as stock applied
        await passlineAuditItemsTable()
          .update({ stock_applied: true })
          .eq("session_id", confirmSession.id);
      }

      // Update session status
      await passlineAuditSessionsTable()
        .update({
          status: confirmStatus,
          notes: confirmNotes || null,
        })
        .eq("id", confirmSession.id);

      toast.success(
        confirmStatus === "reconciled"
          ? "✓ Stock descontado correctamente"
          : "⚠ Discrepancia registrada"
      );
      setShowConfirmDialog(false);
      fetchSessions();
    } catch (err: any) {
      toast.error(err.message || "Error al confirmar");
    } finally {
      setConfirming(false);
    }
  };

  // ── Delete ────────────────────────────────────────────────────────────────

  const handleDelete = async (sessionId: string) => {
    if (!confirm("¿Eliminar esta auditoría? Esta acción no se puede deshacer.")) return;
    const { error } = await passlineAuditSessionsTable().delete().eq("id", sessionId);
    if (error) toast.error("Error al eliminar");
    else {
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

  const getItemCatalogId = (item: AuditItem) => item.cocktail_id || item.product_id || "";

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Monitor className="w-5 h-5 text-primary" />
            Descuento de Inventario — Totems
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Registra ventas de totems externos y descuenta stock automáticamente
          </p>
        </div>
        <Button onClick={() => setShowDialog(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          Registrar Jornada
        </Button>
      </div>

      {/* Summary cards — inventory focused */}
      <div className="grid grid-cols-3 gap-4">
        <SummaryCard
          label="Confirmadas"
          value={String(computed.totalConfirmadas)}
          sub="stock descontado"
          icon={CheckCircle2}
        />
        <SummaryCard
          label="Pendientes"
          value={String(computed.pendingCount)}
          sub="por confirmar"
          icon={Clock}
        />
        <SummaryCard
          label="Total Registros"
          value={String(computed.totalSessions)}
          sub={computed.totalDiscrepancies > 0 ? `${computed.totalDiscrepancies} discrepancias` : undefined}
          icon={Package}
        />
      </div>

      {/* Sessions list */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileBarChart2 className="w-4 h-4" />
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
              <p className="text-xs mt-1">Registra el reporte del totem al cierre de cada jornada.</p>
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
                      {expandedId === session.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>

                    <div className="flex-1 min-w-0 grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-0.5">
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Totem</p>
                        <p className="text-sm font-semibold">#{session.totem_number}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Informe</p>
                        <p className="text-sm font-mono">{session.report_number}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Fecha</p>
                        <p className="text-sm">
                          {new Date(session.session_date + "T12:00:00").toLocaleDateString("es-CL", {
                            day: "2-digit",
                            month: "short",
                            year: "2-digit",
                          })}
                        </p>
                      </div>
                      <div className="flex items-center">
                        <StatusBadge status={session.status} />
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {session.status === "pending" && (
                        <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => openConfirm(session)}>
                          <PackageCheck className="w-3 h-3" />
                          Confirmar
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
                                <TableHead className="text-xs text-center w-20">Stock</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {session.items.map((item, idx) => (
                                <TableRow key={item.id || idx}>
                                  <TableCell className="text-xs py-2 font-medium">{item.product_name}</TableCell>
                                  <TableCell className="text-right text-xs py-2">{item.quantity}</TableCell>
                                  <TableCell className="text-center py-2">
                                    {item.stock_applied ? (
                                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mx-auto" />
                                    ) : (
                                      <X className="w-3.5 h-3.5 text-muted-foreground/40 mx-auto" />
                                    )}
                                  </TableCell>
                                </TableRow>
                              ))}
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
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Monitor className="w-5 h-5 text-primary" />
              Registrar Descuento de Inventario — Totem
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
                  value={form.jornada_id || "none"}
                  onValueChange={(v) => setForm((f) => ({ ...f, jornada_id: v === "none" ? "" : v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar jornada" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin jornada</SelectItem>
                    {jornadas.map((j) => (
                      <SelectItem key={j.id} value={j.id}>
                        {j.fecha} {j.estado === "activa" || j.estado === "abierta" ? "✓ Activa" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Products from catalog */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs">Productos vendidos (de la carta)</Label>
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={addItem}>
                  <Plus className="w-3 h-3" />
                  Agregar fila
                </Button>
              </div>

              <div className="rounded-lg border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead className="text-xs w-[65%]">Producto de la Carta *</TableHead>
                      <TableHead className="text-xs w-24">Cantidad</TableHead>
                      <TableHead className="w-8" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="py-1.5">
                          <Select
                            value={getItemCatalogId(item) || "__none__"}
                            onValueChange={(v) => {
                              if (v !== "__none__") selectCatalogProduct(idx, v);
                            }}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder="Seleccionar producto..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__" disabled>
                                Seleccionar producto...
                              </SelectItem>
                              {catalog.filter((c) => c.type === "cocktail").length > 0 && (
                                <>
                                  <div className="px-2 py-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                                    Cocktails
                                  </div>
                                  {catalog
                                    .filter((c) => c.type === "cocktail")
                                    .map((c) => (
                                      <SelectItem key={c.id} value={c.id}>
                                        🍸 {c.name}
                                      </SelectItem>
                                    ))}
                                </>
                              )}
                              {catalog.filter((c) => c.type === "product").length > 0 && (
                                <>
                                  <div className="px-2 py-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wider mt-1">
                                    Productos
                                  </div>
                                  {catalog
                                    .filter((c) => c.type === "product")
                                    .map((c) => (
                                      <SelectItem key={c.id} value={c.id}>
                                        📦 {c.name}
                                      </SelectItem>
                                    ))}
                                </>
                              )}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="py-1.5">
                          <Input
                            className="h-7 text-xs text-right"
                            type="number"
                            min={1}
                            value={item.quantity}
                            onChange={(e) => updateItemField(idx, "quantity", Number(e.target.value))}
                          />
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

              <p className="text-xs text-muted-foreground mt-2">
                {items.filter(i => i.cocktail_id || i.product_id).length} producto(s) vinculado(s)
              </p>
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
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={submitting} className="gap-2">
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              Guardar Registro
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Confirm Dialog ──────────────────────────────────────────────────── */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PackageCheck className="w-5 h-5 text-primary" />
              Confirmar Descuento de Stock
            </DialogTitle>
          </DialogHeader>

          {confirmSession && (
            <div className="space-y-4 py-2">
              <div className="bg-muted/40 rounded-lg p-4 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Totem:</span>
                  <span className="font-semibold">#{confirmSession.totem_number}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Informe:</span>
                  <span className="font-mono">{confirmSession.report_number}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Productos:</span>
                  <span className="font-semibold">{confirmSession.total_txns} unidades</span>
                </div>
              </div>

              {/* Status */}
              <div className="space-y-1.5">
                <Label className="text-xs">Resultado</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmStatus("reconciled")}
                    className={`flex items-center gap-2 p-3 rounded-lg border-2 text-sm transition-all ${
                      confirmStatus === "reconciled"
                        ? "border-emerald-500 bg-emerald-500/10 text-emerald-700 font-medium"
                        : "border-muted hover:border-emerald-500/50"
                    }`}
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Confirmar OK
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmStatus("discrepancy")}
                    className={`flex items-center gap-2 p-3 rounded-lg border-2 text-sm transition-all ${
                      confirmStatus === "discrepancy"
                        ? "border-red-500 bg-red-500/10 text-red-700 font-medium"
                        : "border-muted hover:border-red-500/50"
                    }`}
                  >
                    <AlertTriangle className="w-4 h-4" />
                    Discrepancia
                  </button>
                </div>
              </div>

              {confirmStatus === "reconciled" && (
                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3 text-xs text-emerald-700 space-y-1">
                  <p className="font-medium">Al confirmar se ejecutará:</p>
                  <ul className="list-disc list-inside space-y-0.5">
                    <li>Descuento de stock de cada producto/ingrediente</li>
                    <li>Actualización de balances de inventario</li>
                  </ul>
                </div>
              )}

              <div className="space-y-1.5">
                <Label className="text-xs">Notas (opcional)</Label>
                <Textarea
                  placeholder="Observaciones..."
                  value={confirmNotes}
                  onChange={(e) => setConfirmNotes(e.target.value)}
                  className="resize-none text-sm"
                  rows={2}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirmDialog(false)}>Cancelar</Button>
            <Button
              onClick={handleConfirm}
              disabled={confirming}
              className={`gap-2 ${confirmStatus === "discrepancy" ? "bg-red-500 hover:bg-red-600 text-white" : ""}`}
            >
              {confirming && <Loader2 className="w-4 h-4 animate-spin" />}
              {confirmStatus === "reconciled" ? "Confirmar y Descontar Stock" : "Marcar Discrepancia"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
