import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { passlineAuditSessionsTable, passlineAuditItemsTable } from "@/lib/db-tables";
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
  DollarSign,
  ShoppingBag,
  Monitor,
  FileBarChart2,
  X,
  PackageCheck,
  TrendingUp,
} from "lucide-react";
import { formatCLP } from "@/lib/currency";
import { useActiveVenue } from "@/hooks/useActiveVenue";
import { useAppSession } from "@/contexts/AppSessionContext";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CatalogProduct {
  id: string;
  name: string;
  price: number;
  type: "cocktail" | "product";
  cost_per_unit: number;
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
  // Local-only for COGS preview
  _cogs_per_unit?: number;
}

interface AuditSession {
  id: string;
  totem_number: string;
  report_number: string;
  session_date: string;
  total_amount: number;
  total_txns: number;
  cogs_total: number;
  net_amount: number;
  iva_amount: number;
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

interface CocktailIngredient {
  product_id: string;
  quantity: number;
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

const IVA_RATE = 0.19;

function calcNet(gross: number) {
  return Math.round(gross / (1 + IVA_RATE));
}
function calcIva(gross: number) {
  return gross - calcNet(gross);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

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

function SummaryCard({ label, value, sub, icon: Icon }: { label: string; value: string; sub?: string; icon: typeof DollarSign }) {
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
    // Fetch cocktails AND products in parallel
    const [cocktailsRes, productsRes] = await Promise.all([
      supabase
        .from("cocktails")
        .select("id, name, price")
        .eq("venue_id", venue!.id)
        .order("name"),
      supabase
        .from("products")
        .select("id, name, cost_per_unit, capacity_ml, category")
        .eq("venue_id", venue!.id)
        .eq("is_active_in_sales", true)
        .order("name"),
    ]);

    const merged: CatalogProduct[] = [];

    // Cocktails — cost will be calculated from ingredients on confirm
    for (const c of cocktailsRes.data || []) {
      merged.push({
        id: c.id,
        name: c.name,
        price: c.price,
        type: "cocktail",
        cost_per_unit: 0, // calculated from recipe
        capacity_ml: null,
      });
    }

    // Products (unitarios y botellas activos en ventas)
    for (const p of productsRes.data || []) {
      merged.push({
        id: p.id,
        name: p.name,
        price: 0, // products don't have a fixed sale price in this table
        type: "product",
        cost_per_unit: Number(p.cost_per_unit) || 0,
        capacity_ml: p.capacity_ml,
      });
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
      totalConfirmado: confirmed.reduce((a, s) => a + s.total_amount, 0),
      totalPendiente: pending.reduce((a, s) => a + s.total_amount, 0),
      totalCOGS: confirmed.reduce((a, s) => a + (s.cogs_total || 0), 0),
      totalSessions: sessions.length,
      totalDiscrepancies: sessions.filter((s) => s.status === "discrepancy").length,
      pendingCount: pending.length,
    };
  }, [sessions]);

  // ── Item row helpers ───────────────────────────────────────────────────────

  const selectCatalogProduct = (idx: number, catalogId: string) => {
    const product = catalogMap.get(catalogId);
    if (!product) return;

    setItems((prev) => {
      const next = [...prev];
      const qty = next[idx].quantity || 1;
      const unitPrice = product.price || next[idx].unit_price;
      next[idx] = {
        ...next[idx],
        product_name: product.name,
        unit_price: unitPrice,
        total_amount: qty * unitPrice,
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
      if (field === "quantity" || field === "unit_price") {
        const q = field === "quantity" ? Number(value) : next[idx].quantity;
        const p = field === "unit_price" ? Number(value) : next[idx].unit_price;
        next[idx].total_amount = q * p;
      }
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

      const totalAmount = validItems.reduce((a, i) => a + i.total_amount, 0);
      const netAmount = calcNet(totalAmount);
      const ivaAmount = calcIva(totalAmount);

      const sessionPayload: any = {
        venue_id: venue!.id,
        jornada_id: form.jornada_id || null,
        totem_number: form.totem_number.trim(),
        report_number: form.report_number.trim(),
        session_date: form.session_date,
        total_amount: totalAmount,
        total_txns: validItems.reduce((a, i) => a + i.quantity, 0),
        net_amount: netAmount,
        iva_amount: ivaAmount,
        cogs_total: 0, // calculated on confirm
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
        unit_price: i.unit_price,
        total_amount: i.total_amount,
        cocktail_id: i.cocktail_id || null,
        product_id: i.product_id || null,
        stock_applied: false,
        income_applied: false,
      }));

      const { error: itemsError } = await passlineAuditItemsTable().insert(itemsPayload);
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
      notes: "",
    });
    setItems([makeEmptyItem()]);
  };

  // ── Confirm (reconcile + stock deduction + COGS) ──────────────────────────

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

      // Load items if not loaded
      let sessionItems = confirmSession.items;
      if (!sessionItems) {
        const { data } = await passlineAuditItemsTable()
          .select("*")
          .eq("session_id", confirmSession.id);
        sessionItems = (data || []) as unknown as AuditItem[];
      }

      let totalCogs = 0;

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

        // Process each item
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
                .select("cost_per_unit, capacity_ml")
                .eq("id", ing.product_id)
                .single();

              if (!prod) continue;

              const ingQtyPerServing = Number(ing.quantity);
              const totalIngQty = ingQtyPerServing * item.quantity;
              const costPerUnit = Number(prod.cost_per_unit) || 0;
              const capacityMl = Number(prod.capacity_ml) || 0;

              // COGS: (ml / capacity) * cost for bottles, qty * cost for units
              const ingCogs = capacityMl > 0
                ? (totalIngQty / capacityMl) * costPerUnit
                : totalIngQty * costPerUnit;
              totalCogs += ingCogs;

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
                notes: `[PASSLINE] Totem #${confirmSession.totem_number} — ${item.product_name} x${item.quantity}`,
              });

              // Update stock_balances
              // Decrement stock balance directly
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
            const costPerUnit = prod?.cost_per_unit || 0;
            const capacityMl = prod?.capacity_ml || 0;

            const deductQty = capacityMl && capacityMl > 0 ? item.quantity * capacityMl : item.quantity;
            const itemCogs = capacityMl > 0
              ? item.quantity * costPerUnit
              : item.quantity * costPerUnit;
            totalCogs += itemCogs;

            await supabase.from("stock_movements").insert({
              product_id: item.product_id,
              venue_id: venue!.id,
              movement_type: "salida",
              quantity: -deductQty,
              unit_cost: costPerUnit,
              source_type: "passline_totem",
              from_location_id: barLocationId,
              jornada_id: confirmSession.jornada_id || null,
              notes: `[PASSLINE] Totem #${confirmSession.totem_number} — ${item.product_name} x${item.quantity}`,
            });
          }
        }

        // Register gross income
        await supabase.from("gross_income_entries").insert({
          venue_id: venue!.id,
          source_type: "passline_totem",
          source_id: confirmSession.id,
          amount: confirmSession.total_amount,
          description: `Passline Totem #${confirmSession.totem_number} — Informe ${confirmSession.report_number}`,
          jornada_id: confirmSession.jornada_id || null,
          created_by: userId,
        });

        // Mark items as applied
        await passlineAuditItemsTable()
          .update({ stock_applied: true, income_applied: true })
          .eq("session_id", confirmSession.id);
      }

      // Update session
      await passlineAuditSessionsTable()
        .update({
          status: confirmStatus,
          cogs_total: Math.round(totalCogs),
          notes: confirmNotes || null,
        })
        .eq("id", confirmSession.id);

      toast.success(
        confirmStatus === "reconciled"
          ? "✓ Confirmado — stock descontado y COGS registrado"
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

  // ── Helpers for current item selection ID ─────────────────────────────────

  const getItemCatalogId = (item: AuditItem) => item.cocktail_id || item.product_id || "";

  // ─── Render ───────────────────────────────────────────────────────────────

  const itemsTotal = items.reduce((a, i) => a + i.total_amount, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Monitor className="w-5 h-5 text-primary" />
            Ventas por Totems Passline
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Registra ventas de totems externos, descuenta stock y calcula COGS/IVA/Margen
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
          label="Ventas Confirmadas"
          value={formatCLP(computed.totalConfirmado)}
          sub="con stock descontado"
          icon={CheckCircle2}
        />
        <SummaryCard
          label="Pendiente Confirmar"
          value={formatCLP(computed.totalPendiente)}
          sub={`${computed.pendingCount} sesiones`}
          icon={Clock}
        />
        <SummaryCard
          label="COGS Totems"
          value={formatCLP(computed.totalCOGS)}
          sub="costo de ventas terceros"
          icon={ShoppingBag}
        />
        <SummaryCard
          label="Margen Bruto"
          value={
            computed.totalConfirmado > 0
              ? `${(((calcNet(computed.totalConfirmado) - computed.totalCOGS) / calcNet(computed.totalConfirmado)) * 100).toFixed(1)}%`
              : "—"
          }
          sub={formatCLP(calcNet(computed.totalConfirmado) - computed.totalCOGS)}
          icon={TrendingUp}
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

                    <div className="flex-1 min-w-0 grid grid-cols-2 md:grid-cols-6 gap-x-4 gap-y-0.5">
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
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Venta Bruta</p>
                        <p className="text-sm font-bold text-primary">{formatCLP(session.total_amount)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">COGS</p>
                        <p className="text-sm font-semibold text-destructive">
                          {session.cogs_total ? formatCLP(session.cogs_total) : "—"}
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
                      {/* Financial summary */}
                      {session.status === "reconciled" && (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          <div className="bg-background rounded-lg p-2 text-center border border-border/50">
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Venta Neta</p>
                            <p className="text-sm font-semibold">{formatCLP(session.net_amount || calcNet(session.total_amount))}</p>
                          </div>
                          <div className="bg-background rounded-lg p-2 text-center border border-border/50">
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">IVA (19%)</p>
                            <p className="text-sm font-semibold">{formatCLP(session.iva_amount || calcIva(session.total_amount))}</p>
                          </div>
                          <div className="bg-background rounded-lg p-2 text-center border border-border/50">
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">COGS</p>
                            <p className="text-sm font-semibold text-destructive">{formatCLP(session.cogs_total)}</p>
                          </div>
                          <div className="bg-background rounded-lg p-2 text-center border border-border/50">
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Margen</p>
                            <p className="text-sm font-bold text-primary">
                              {formatCLP((session.net_amount || calcNet(session.total_amount)) - (session.cogs_total || 0))}
                            </p>
                          </div>
                        </div>
                      )}

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
                                <TableHead className="text-xs text-right w-28">Precio</TableHead>
                                <TableHead className="text-xs text-right w-28">Total</TableHead>
                                <TableHead className="text-xs text-center w-16">Stock</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {session.items.map((item, idx) => (
                                <TableRow key={item.id || idx}>
                                  <TableCell className="text-xs py-2 font-medium">{item.product_name}</TableCell>
                                  <TableCell className="text-right text-xs py-2">{item.quantity}</TableCell>
                                  <TableCell className="text-right text-xs py-2">{formatCLP(item.unit_price)}</TableCell>
                                  <TableCell className="text-right text-xs font-semibold py-2">{formatCLP(item.total_amount)}</TableCell>
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
                      <TableHead className="text-xs w-[45%]">Producto de la Carta *</TableHead>
                      <TableHead className="text-xs w-20">Cant.</TableHead>
                      <TableHead className="text-xs w-28">Precio Unit.</TableHead>
                      <TableHead className="text-xs w-28">Total</TableHead>
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
                              {catalog.length > 0 && (
                                <>
                                  {catalog.filter((c) => c.type === "cocktail").length > 0 && (
                                    <>
                                      <div className="px-2 py-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                                        Cocktails
                                      </div>
                                      {catalog
                                        .filter((c) => c.type === "cocktail")
                                        .map((c) => (
                                          <SelectItem key={c.id} value={c.id}>
                                            🍸 {c.name} — {formatCLP(c.price)}
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
                        <TableCell className="py-1.5">
                          <Input
                            className="h-7 text-xs text-right"
                            type="number"
                            min={0}
                            placeholder="0"
                            value={item.unit_price || ""}
                            onChange={(e) => updateItemField(idx, "unit_price", Number(e.target.value))}
                          />
                        </TableCell>
                        <TableCell className="py-1.5">
                          <span className="text-xs font-medium tabular-nums">{formatCLP(item.total_amount)}</span>
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

              {/* Running total + IVA preview */}
              <div className="flex justify-end mt-2 pr-2 gap-4">
                <span className="text-xs text-muted-foreground">
                  Neto: <span className="font-semibold text-foreground">{formatCLP(calcNet(itemsTotal))}</span>
                </span>
                <span className="text-xs text-muted-foreground">
                  IVA: <span className="font-semibold text-foreground">{formatCLP(calcIva(itemsTotal))}</span>
                </span>
                <span className="text-sm text-muted-foreground">
                  Total: <span className="font-bold text-foreground">{formatCLP(itemsTotal)}</span>
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
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={submitting} className="gap-2">
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              Guardar Auditoría
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
              Confirmar Jornada de Totem
            </DialogTitle>
          </DialogHeader>

          {confirmSession && (
            <div className="space-y-4 py-2">
              {/* Summary */}
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
                  <span className="text-muted-foreground">Venta Bruta:</span>
                  <span className="font-bold text-primary text-base">{formatCLP(confirmSession.total_amount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Neto (sin IVA):</span>
                  <span className="font-semibold">{formatCLP(calcNet(confirmSession.total_amount))}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">IVA (19%):</span>
                  <span className="font-semibold">{formatCLP(calcIva(confirmSession.total_amount))}</span>
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
                    <li>Descuento de stock (ingredientes de cada producto)</li>
                    <li>Registro de COGS por producto</li>
                    <li>Registro de ingreso bruto</li>
                  </ul>
                </div>
              )}

              {/* Notes */}
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
