import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PILOT_VENUE_ID } from "@/lib/venue";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Check, X, Clock, Loader2, Package, MapPin, MessageSquare } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface ReplenishmentRequest {
  id: string;
  venue_id: string;
  location_id: string;
  product_id: string;
  requested_quantity: number;
  requested_by_user_id: string;
  status: string;
  notes: string | null;
  reviewed_by_user_id: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  created_at: string;
  // joined
  product_name?: string;
  product_capacity_ml?: number | null;
  location_name?: string;
  requester_name?: string;
}

export function ReplenishmentRequestsPanel({ onApproved }: { onApproved?: () => void }) {
  const [requests, setRequests] = useState<ReplenishmentRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});

  const fetchRequests = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("replenishment_requests" as never)
      .select("*")
      .eq("venue_id", PILOT_VENUE_ID)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error(error);
      setLoading(false);
      return;
    }

    const rows = (data || []) as unknown as ReplenishmentRequest[];

    // Enrich with product names, location names, requester names
    const productIds = [...new Set(rows.map((r) => r.product_id))];
    const locationIds = [...new Set(rows.map((r) => r.location_id))];
    const userIds = [...new Set(rows.map((r) => r.requested_by_user_id))];

    const [productsRes, locationsRes, profilesRes] = await Promise.all([
      productIds.length > 0
        ? supabase.from("products").select("id, name, capacity_ml").in("id", productIds)
        : Promise.resolve({ data: [] }),
      locationIds.length > 0
        ? supabase.from("stock_locations").select("id, name").in("id", locationIds)
        : Promise.resolve({ data: [] }),
      userIds.length > 0
        ? supabase.from("profiles").select("id, full_name").in("id", userIds)
        : Promise.resolve({ data: [] }),
    ]);

    const productMap = new Map((productsRes.data || []).map((p: any) => [p.id, p]));
    const locationMap = new Map((locationsRes.data || []).map((l: any) => [l.id, l]));
    const profileMap = new Map((profilesRes.data || []).map((p: any) => [p.id, p]));

    for (const r of rows) {
      const prod = productMap.get(r.product_id);
      r.product_name = prod?.name || "Producto";
      r.product_capacity_ml = prod?.capacity_ml || null;
      r.location_name = locationMap.get(r.location_id)?.name || "Ubicación";
      r.requester_name = profileMap.get(r.requested_by_user_id)?.full_name || "Usuario";
    }

    setRequests(rows);
    setLoading(false);
  };

  useEffect(() => {
    fetchRequests();

    // Realtime
    const channel = supabase
      .channel("replenishment-requests")
      .on("postgres_changes", { event: "*", schema: "public", table: "replenishment_requests" }, () => {
        fetchRequests();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const handleApprove = async (req: ReplenishmentRequest) => {
    setProcessingId(req.id);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No autenticado");

      // Get warehouse
      const { data: warehouse } = await supabase
        .from("stock_locations")
        .select("id")
        .eq("venue_id", PILOT_VENUE_ID)
        .eq("type", "warehouse")
        .maybeSingle();

      if (!warehouse) throw new Error("No hay bodega configurada");

      // Get product cost
      const { data: product } = await supabase
        .from("products")
        .select("cost_per_unit, capacity_ml")
        .eq("id", req.product_id)
        .maybeSingle();

      const costPerUnit = Number(product?.cost_per_unit) || 0;
      const capacityMl = Number(product?.capacity_ml) || 0;

      // Calculate cost snapshot
      const costSnapshot = capacityMl > 0 ? costPerUnit / capacityMl : costPerUnit;
      const totalCost = req.requested_quantity * costSnapshot;

      // 1. transfer_out from warehouse
      await supabase.from("stock_movements").insert({
        product_id: req.product_id,
        quantity: req.requested_quantity,
        movement_type: "transfer_out" as never,
        from_location_id: warehouse.id,
        to_location_id: req.location_id,
        source_type: "replenishment",
        unit_cost_snapshot: costSnapshot,
        total_cost_snapshot: totalCost,
        notes: `Reposición solicitada → ${req.location_name}`,
        venue_id: PILOT_VENUE_ID,
      });

      // 2. transfer_in to bar
      await supabase.from("stock_movements").insert({
        product_id: req.product_id,
        quantity: req.requested_quantity,
        movement_type: "transfer_in" as never,
        from_location_id: warehouse.id,
        to_location_id: req.location_id,
        source_type: "replenishment",
        unit_cost_snapshot: costSnapshot,
        total_cost_snapshot: totalCost,
        notes: `Recepción ← Bodega (solicitud)`,
        venue_id: PILOT_VENUE_ID,
      });

      // 3. Update warehouse balance (decrease)
      const { data: whBal } = await supabase
        .from("stock_balances")
        .select("quantity")
        .eq("location_id", warehouse.id)
        .eq("product_id", req.product_id)
        .maybeSingle();
      const whQty = Number(whBal?.quantity) || 0;
      await supabase
        .from("stock_balances")
        .update({ quantity: whQty - req.requested_quantity, updated_at: new Date().toISOString() })
        .eq("location_id", warehouse.id)
        .eq("product_id", req.product_id);

      // 4. Update or create bar balance (increase)
      const { data: barBal } = await supabase
        .from("stock_balances")
        .select("id, quantity")
        .eq("location_id", req.location_id)
        .eq("product_id", req.product_id)
        .maybeSingle();

      if (barBal) {
        await supabase
          .from("stock_balances")
          .update({ quantity: Number(barBal.quantity) + req.requested_quantity, updated_at: new Date().toISOString() })
          .eq("id", barBal.id);
      } else {
        await supabase.from("stock_balances").insert({
          location_id: req.location_id,
          product_id: req.product_id,
          quantity: req.requested_quantity,
          venue_id: PILOT_VENUE_ID,
        });
      }

      // 5. Sync products.current_stock
      const { data: allBalances } = await supabase
        .from("stock_balances")
        .select("quantity")
        .eq("product_id", req.product_id);
      const realTotal = (allBalances || []).reduce((s, b) => s + (Number(b.quantity) || 0), 0);
      await supabase.from("products").update({ current_stock: realTotal }).eq("id", req.product_id);

      // 6. Mark request as approved
      await supabase
        .from("replenishment_requests" as never)
        .update({
          status: "approved",
          reviewed_by_user_id: user.id,
          reviewed_at: new Date().toISOString(),
          review_notes: reviewNotes[req.id] || null,
        } as never)
        .eq("id", req.id);

      toast.success(`Reposición aprobada: ${req.product_name}`);
      onApproved?.();
      fetchRequests();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Error al aprobar");
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (req: ReplenishmentRequest) => {
    setProcessingId(req.id);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      await supabase
        .from("replenishment_requests" as never)
        .update({
          status: "rejected",
          reviewed_by_user_id: user?.id,
          reviewed_at: new Date().toISOString(),
          review_notes: reviewNotes[req.id] || null,
        } as never)
        .eq("id", req.id);

      toast.success(`Solicitud rechazada: ${req.product_name}`);
      fetchRequests();
    } catch (err: any) {
      toast.error(err.message || "Error al rechazar");
    } finally {
      setProcessingId(null);
    }
  };

  const pending = requests.filter((r) => r.status === "pending");
  const resolved = requests.filter((r) => r.status !== "pending");

  if (loading) {
    return <Skeleton className="h-32" />;
  }

  return (
    <div className="space-y-4">
      {/* Pending requests */}
      {pending.length === 0 ? (
        <Card className="border-border/50">
          <CardContent className="py-8 text-center">
            <Clock className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No hay solicitudes pendientes</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-500" />
            Pendientes ({pending.length})
          </h3>
          {pending.map((req) => {
            const displayQty = req.product_capacity_ml
              ? req.requested_quantity / req.product_capacity_ml
              : req.requested_quantity;
            const unitLabel = req.product_capacity_ml ? "bot." : "uds";
            return (
              <Card key={req.id} className="border-amber-500/30">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm">{req.product_name}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                        <MapPin className="w-3 h-3" />
                        <span>{req.location_name}</span>
                        <span>·</span>
                        <span>{req.requester_name}</span>
                        <span>·</span>
                        <span>{format(new Date(req.created_at), "dd MMM HH:mm", { locale: es })}</span>
                      </div>
                    </div>
                    <Badge variant="secondary" className="shrink-0 text-sm font-bold tabular-nums">
                      {displayQty} {unitLabel}
                    </Badge>
                  </div>
                  {req.notes && (
                    <div className="flex items-start gap-1.5 text-xs text-muted-foreground bg-muted/30 rounded p-2">
                      <MessageSquare className="w-3 h-3 mt-0.5 shrink-0" />
                      <span>{req.notes}</span>
                    </div>
                  )}
                  <div className="space-y-2">
                    <Textarea
                      placeholder="Nota de revisión (opcional)"
                      value={reviewNotes[req.id] || ""}
                      onChange={(e) => setReviewNotes((p) => ({ ...p, [req.id]: e.target.value }))}
                      className="h-12 resize-none text-xs"
                    />
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 gap-1 text-destructive hover:text-destructive"
                        onClick={() => handleReject(req)}
                        disabled={processingId === req.id}
                      >
                        <X className="w-3.5 h-3.5" />
                        Rechazar
                      </Button>
                      <Button
                        size="sm"
                        className="flex-1 gap-1"
                        onClick={() => handleApprove(req)}
                        disabled={processingId === req.id}
                      >
                        {processingId === req.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Check className="w-3.5 h-3.5" />
                        )}
                        Aprobar y Transferir
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Resolved history */}
      {resolved.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground">Historial reciente</h3>
          {resolved.slice(0, 10).map((req) => {
            const displayQty = req.product_capacity_ml
              ? req.requested_quantity / req.product_capacity_ml
              : req.requested_quantity;
            const unitLabel = req.product_capacity_ml ? "bot." : "uds";
            return (
              <div key={req.id} className="flex items-center justify-between py-2 px-3 rounded-md bg-muted/20 text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <Badge variant={req.status === "approved" ? "default" : "destructive"} className="text-[10px] shrink-0">
                    {req.status === "approved" ? "Aprobada" : "Rechazada"}
                  </Badge>
                  <span className="truncate font-medium">{req.product_name}</span>
                  <span className="text-muted-foreground text-xs">{displayQty} {unitLabel}</span>
                </div>
                <span className="text-xs text-muted-foreground shrink-0">
                  {req.location_name} · {format(new Date(req.created_at), "dd/MM HH:mm")}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
