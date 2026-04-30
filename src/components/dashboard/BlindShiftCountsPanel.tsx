import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ClipboardList, Check, X, Edit3, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

interface PendingCount {
  id: string;
  product_id: string;
  location_id: string;
  jornada_id: string;
  theoretical_qty: number;
  declared_qty: number;
  variance_qty: number;
  variance_pct: number;
  signed_at: string;
  product?: { name: string; sku_base: string | null; capacity_ml: number | null };
  location?: { name: string };
  signer?: { full_name: string | null };
}

type ResolveAction = "approved_waste" | "manual_adjust" | "rejected";

export const BlindShiftCountsPanel = () => {
  const [counts, setCounts] = useState<PendingCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<PendingCount | null>(null);
  const [action, setAction] = useState<ResolveAction>("approved_waste");
  const [manualQty, setManualQty] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchCounts = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("blind_shift_counts")
        .select(
          `id, product_id, location_id, jornada_id, theoretical_qty, declared_qty,
           variance_qty, variance_pct, signed_at, signed_by_user_id,
           product:products(name, sku_base, capacity_ml),
           location:stock_locations(name)`
        )
        .eq("admin_decision", "pending")
        .order("signed_at", { ascending: false });

      if (error) throw error;

      const rows = (data || []) as any[];
      const userIds = Array.from(new Set(rows.map((r) => r.signed_by_user_id).filter(Boolean)));
      let signersMap: Record<string, string | null> = {};
      if (userIds.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", userIds);
        signersMap = Object.fromEntries((profs || []).map((p: any) => [p.id, p.full_name]));
      }

      setCounts(
        rows.map((r) => ({
          ...r,
          signer: { full_name: signersMap[r.signed_by_user_id] || null },
        }))
      );
    } catch (err) {
      console.error("Error fetching pending counts:", err);
      toast.error("Error al cargar conteos pendientes");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCounts();
    const channel = supabase
      .channel("blind-shift-counts-admin")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "blind_shift_counts" },
        () => fetchCounts()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const openResolve = (c: PendingCount) => {
    setSelected(c);
    setAction("approved_waste");
    setManualQty(String(c.declared_qty));
    setNotes("");
  };

  const submitResolve = async () => {
    if (!selected) return;
    if (action === "manual_adjust" && (!manualQty || isNaN(Number(manualQty)))) {
      toast.error("Ingresa una cantidad válida");
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.rpc("admin_resolve_blind_shift_count", {
        p_count_id: selected.id,
        p_decision: action,
        p_notes: notes || null,
        p_manual_qty: action === "manual_adjust" ? Number(manualQty) : null,
      });
      if (error) throw error;
      toast.success("Conteo resuelto");
      setSelected(null);
      fetchCounts();
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || "Error al resolver");
    } finally {
      setSubmitting(false);
    }
  };

  const formatQty = (c: PendingCount) => {
    const isMl = (c.product?.capacity_ml ?? 0) > 0;
    return (n: number) => (isMl ? `${Math.round(n)} ml` : `${n} u`);
  };

  return (
    <Card className="glass-effect shadow-elegant">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ClipboardList className="h-5 w-5 text-primary" />
          <span className="text-xl">Conteos por aprobar</span>
          {counts.length > 0 && (
            <Badge variant="destructive" className="ml-2">
              {counts.length}
            </Badge>
          )}
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          Diferencias declaradas por bartenders al cierre. Resuelve antes de la próxima jornada.
        </p>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : counts.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Check className="h-8 w-8 mx-auto mb-2 text-primary" />
            <p>No hay conteos pendientes 🎉</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead>Barra</TableHead>
                  <TableHead>Bartender</TableHead>
                  <TableHead className="text-right">Teórico</TableHead>
                  <TableHead className="text-right">Declarado</TableHead>
                  <TableHead className="text-right">Diferencia</TableHead>
                  <TableHead className="text-right">Acción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {counts.map((c) => {
                  const fmt = formatQty(c);
                  const negative = c.variance_qty < 0;
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">
                        {c.product?.name || c.product_id}
                        {c.product?.sku_base && (
                          <div className="text-xs text-muted-foreground">{c.product.sku_base}</div>
                        )}
                      </TableCell>
                      <TableCell>{c.location?.name || "—"}</TableCell>
                      <TableCell>{c.signer?.full_name || "—"}</TableCell>
                      <TableCell className="text-right">{fmt(c.theoretical_qty)}</TableCell>
                      <TableCell className="text-right">{fmt(c.declared_qty)}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant={negative ? "destructive" : "secondary"}>
                          {negative ? "" : "+"}
                          {fmt(c.variance_qty)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" onClick={() => openResolve(c)}>
                          Resolver
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Resolver conteo
            </DialogTitle>
            <DialogDescription>
              {selected?.product?.name} — {selected?.location?.name}
            </DialogDescription>
          </DialogHeader>

          {selected && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div className="bg-muted/30 p-2 rounded">
                  <div className="text-xs text-muted-foreground">Teórico</div>
                  <div className="font-semibold">{selected.theoretical_qty}</div>
                </div>
                <div className="bg-muted/30 p-2 rounded">
                  <div className="text-xs text-muted-foreground">Declarado</div>
                  <div className="font-semibold">{selected.declared_qty}</div>
                </div>
                <div className="bg-destructive/10 p-2 rounded">
                  <div className="text-xs text-muted-foreground">Diferencia</div>
                  <div className="font-semibold">
                    {selected.variance_qty > 0 ? "+" : ""}
                    {selected.variance_qty}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setAction("approved_waste")}
                  className={`w-full text-left p-3 rounded-lg border transition ${
                    action === "approved_waste"
                      ? "border-primary bg-primary/10"
                      : "border-border hover:bg-muted/30"
                  }`}
                >
                  <div className="flex items-center gap-2 font-medium">
                    <Check className="h-4 w-4" /> Aprobar como merma
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Acepta la cantidad declarada y registra la diferencia como merma/ajuste.
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setAction("manual_adjust")}
                  className={`w-full text-left p-3 rounded-lg border transition ${
                    action === "manual_adjust"
                      ? "border-primary bg-primary/10"
                      : "border-border hover:bg-muted/30"
                  }`}
                >
                  <div className="flex items-center gap-2 font-medium">
                    <Edit3 className="h-4 w-4" /> Ajuste manual
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Define manualmente la cantidad real correcta.
                  </div>
                  {action === "manual_adjust" && (
                    <Input
                      type="number"
                      step="any"
                      value={manualQty}
                      onChange={(e) => setManualQty(e.target.value)}
                      placeholder="Cantidad real"
                      className="mt-2"
                    />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setAction("rejected")}
                  className={`w-full text-left p-3 rounded-lg border transition ${
                    action === "rejected"
                      ? "border-destructive bg-destructive/10"
                      : "border-border hover:bg-muted/30"
                  }`}
                >
                  <div className="flex items-center gap-2 font-medium">
                    <X className="h-4 w-4" /> Rechazar (recontar)
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    No ajusta stock. Descarta el conteo (bartender deberá recontar).
                  </div>
                </button>
              </div>

              <Textarea
                placeholder="Notas / motivo (opcional)"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setSelected(null)} disabled={submitting}>
              Cancelar
            </Button>
            <Button onClick={submitResolve} disabled={submitting}>
              {submitting ? "Guardando..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};
