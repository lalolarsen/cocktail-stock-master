import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useActiveVenue } from "@/hooks/useActiveVenue";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Trash2,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Loader2,
  Wine,
  Filter,
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { formatCLP } from "@/lib/currency";
import { toast } from "sonner";
import { WasteRegistrationDialog } from "./WasteRegistrationDialog";

interface WasteRequest {
  id: string;
  product_id: string;
  location_id: string;
  requested_by: string;
  bottle_type: string;
  percent_visual: number | null;
  calculated_quantity: number;
  reason: string;
  notes: string | null;
  estimated_cost: number;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  created_at: string;
  jornada_id: string | null;
  // Joined
  product_name?: string;
  product_unit?: string;
  product_capacity_ml?: number | null;
  location_name?: string;
  requester_name?: string;
  reviewer_name?: string;
}

const REASON_LABELS: Record<string, string> = {
  rota: "Rota",
  botada: "Botada",
  derrame: "Derrame",
  caducada: "Caducada",
  devolucion: "Devolución",
};

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive"; icon: typeof Clock }> = {
  pending: { label: "Pendiente", variant: "secondary", icon: Clock },
  approved: { label: "Aprobada", variant: "default", icon: CheckCircle2 },
  rejected: { label: "Rechazada", variant: "destructive", icon: XCircle },
};

type StatusFilter = "all" | "pending" | "approved" | "rejected";

export function WasteManagement({ isReadOnly = false }: { isReadOnly?: boolean }) {
  const { venue } = useActiveVenue();
  const [requests, setRequests] = useState<WasteRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");

  // Review dialog
  const [reviewRequest, setReviewRequest] = useState<WasteRequest | null>(null);
  const [reviewAction, setReviewAction] = useState<"approve" | "reject" | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [processing, setProcessing] = useState(false);

  // Waste request dialog (for creating new requests from admin)
  const [showNewRequest, setShowNewRequest] = useState(false);
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState("");

  useEffect(() => {
    if (venue?.id) {
      fetchRequests();
      fetchLocations();
    }
  }, [venue?.id]);

  // Realtime subscription
  useEffect(() => {
    if (!venue?.id) return;
    const channel = supabase
      .channel("waste-requests-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "waste_requests" }, () => fetchRequests())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [venue?.id]);

  const fetchLocations = async () => {
    if (!venue?.id) return;
    const { data } = await supabase
      .from("stock_locations")
      .select("id, name")
      .eq("venue_id", venue.id)
      .eq("is_active", true)
      .order("name");
    setLocations(data || []);
    if (data && data.length > 0) setSelectedLocationId(data[0].id);
  };

  const fetchRequests = async () => {
    if (!venue?.id) return;
    try {
      setLoading(true);

      const { data: reqData, error } = await supabase
        .from("waste_requests")
        .select("*")
        .eq("venue_id", venue.id)
        .order("created_at", { ascending: false })
        .limit(200);

      if (error) throw error;

      // Enrich with product/location/profile names
      const productIds = [...new Set((reqData || []).map((r: any) => r.product_id))];
      const locationIds = [...new Set((reqData || []).map((r: any) => r.location_id))];
      const userIds = [...new Set([
        ...(reqData || []).map((r: any) => r.requested_by),
        ...(reqData || []).filter((r: any) => r.reviewed_by).map((r: any) => r.reviewed_by),
      ])];

      const [prodRes, locRes, profRes] = await Promise.all([
        productIds.length > 0
          ? supabase.from("products").select("id, name, unit, capacity_ml").in("id", productIds)
          : { data: [] },
        locationIds.length > 0
          ? supabase.from("stock_locations").select("id, name").in("id", locationIds)
          : { data: [] },
        userIds.length > 0
          ? supabase.from("profiles").select("id, full_name").in("id", userIds)
          : { data: [] },
      ]);

      const prodMap = new Map((prodRes.data || []).map((p: any) => [p.id, p]));
      const locMap = new Map((locRes.data || []).map((l: any) => [l.id, l.name]));
      const profMap = new Map((profRes.data || []).map((p: any) => [p.id, p.full_name]));

      const enriched: WasteRequest[] = (reqData || []).map((r: any) => {
        const prod = prodMap.get(r.product_id);
        return {
          ...r,
          product_name: prod?.name || "—",
          product_unit: prod?.unit || "ud",
          product_capacity_ml: prod?.capacity_ml || null,
          location_name: locMap.get(r.location_id) || "—",
          requester_name: profMap.get(r.requested_by) || "—",
          reviewer_name: r.reviewed_by ? profMap.get(r.reviewed_by) || "—" : null,
        };
      });

      setRequests(enriched);
    } catch (error) {
      console.error("Error fetching waste requests:", error);
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    if (statusFilter === "all") return requests;
    return requests.filter((r) => r.status === statusFilter);
  }, [requests, statusFilter]);

  const pendingCount = useMemo(() => requests.filter((r) => r.status === "pending").length, [requests]);

  const handleReview = async (action: "approve" | "reject") => {
    if (!reviewRequest || !venue?.id) return;
    setProcessing(true);

    try {
      const { data: session } = await supabase.auth.getSession();
      const userId = session?.session?.user?.id;

      // Update request status
      const { error: updateError } = await supabase
        .from("waste_requests")
        .update({
          status: action === "approve" ? "approved" : "rejected",
          reviewed_by: userId,
          reviewed_at: new Date().toISOString(),
          review_notes: reviewNotes || null,
        })
        .eq("id", reviewRequest.id);

      if (updateError) throw updateError;

      // If approved, execute the stock deduction
      if (action === "approve") {
        const quantity = -Math.abs(reviewRequest.calculated_quantity);

        const { error: movError } = await supabase.from("stock_movements").insert({
          product_id: reviewRequest.product_id,
          movement_type: "waste" as any,
          quantity,
          from_location_id: reviewRequest.location_id,
          venue_id: venue.id,
          jornada_id: reviewRequest.jornada_id || null,
          notes: `[MERMA APROBADA] [${reviewRequest.reason}] ${reviewRequest.notes || ""}`.trim(),
          percent_visual: reviewRequest.percent_visual,
          unit_cost_snapshot: reviewRequest.estimated_cost > 0 ? reviewRequest.estimated_cost : null,
          total_cost_snapshot: reviewRequest.estimated_cost > 0 ? reviewRequest.estimated_cost : null,
          source_type: "waste",
        });

        if (movError) throw movError;

        // Update stock_balances
        const { data: balance } = await supabase
          .from("stock_balances")
          .select("id, quantity")
          .eq("product_id", reviewRequest.product_id)
          .eq("location_id", reviewRequest.location_id)
          .eq("venue_id", venue.id)
          .maybeSingle();

        if (balance) {
          const newQty = Math.max(0, Number(balance.quantity) + quantity);
          await supabase
            .from("stock_balances")
            .update({ quantity: newQty })
            .eq("id", balance.id);
        }

        toast.success("Merma aprobada y stock descontado");
      } else {
        toast.success("Solicitud de merma rechazada");
      }

      setReviewRequest(null);
      setReviewAction(null);
      setReviewNotes("");
      fetchRequests();
    } catch (error) {
      console.error("Error processing waste request:", error);
      toast.error("Error al procesar la solicitud");
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Merma / Pérdida</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Autorización de descarte de producto
          </p>
        </div>
        <div className="flex items-center gap-3">
          {pendingCount > 0 && (
            <Badge variant="destructive" className="text-sm px-3 py-1">
              {pendingCount} pendiente{pendingCount > 1 ? "s" : ""}
            </Badge>
          )}
          {!isReadOnly && (
            <Button onClick={() => setShowNewRequest(true)} size="sm">
              <Trash2 className="h-4 w-4 mr-1" />
              Nueva solicitud
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        {(["all", "pending", "approved", "rejected"] as StatusFilter[]).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${
              statusFilter === s
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-muted-foreground border-border hover:bg-muted"
            }`}
          >
            {s === "all" ? "Todas" : s === "pending" ? "Pendientes" : s === "approved" ? "Aprobadas" : "Rechazadas"}
          </button>
        ))}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Trash2 className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground">
              {statusFilter === "pending"
                ? "No hay solicitudes pendientes"
                : "No hay solicitudes con este filtro"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((req) => {
            const config = STATUS_CONFIG[req.status] || STATUS_CONFIG.pending;
            const StatusIcon = config.icon;
            const isVolumetric = req.product_unit === "ml" && !!req.product_capacity_ml;

            return (
              <Card key={req.id} className="border-border hover:bg-muted/30 transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-semibold text-sm">{req.product_name}</h4>
                        <Badge variant={config.variant} className="text-[10px]">
                          <StatusIcon className="h-3 w-3 mr-1" />
                          {config.label}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">
                          {REASON_LABELS[req.reason] || req.reason}
                        </Badge>
                      </div>

                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>📍 {req.location_name}</span>
                        <span>
                          {req.bottle_type === "cerrada" ? "🍾 Cerrada" : `🍾 Abierta (${req.percent_visual}%)`}
                        </span>
                        <span className="font-medium text-foreground">
                          {isVolumetric
                            ? `${Math.abs(req.calculated_quantity)} ml`
                            : `${Math.abs(req.calculated_quantity)} ${req.product_unit}`}
                        </span>
                        {req.estimated_cost > 0 && (
                          <span>{formatCLP(req.estimated_cost)}</span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                        <span>Solicitado por: <span className="text-foreground">{req.requester_name}</span></span>
                        <span>{format(new Date(req.created_at), "dd MMM HH:mm", { locale: es })}</span>
                        {req.notes && <span className="italic">"{req.notes}"</span>}
                      </div>

                      {req.status !== "pending" && req.reviewer_name && (
                        <div className="text-[11px] text-muted-foreground">
                          {req.status === "approved" ? "✅" : "❌"} por {req.reviewer_name}
                          {req.reviewed_at && ` — ${format(new Date(req.reviewed_at), "dd MMM HH:mm", { locale: es })}`}
                          {req.review_notes && ` — "${req.review_notes}"`}
                        </div>
                      )}
                    </div>

                    {/* Actions for pending */}
                    {req.status === "pending" && !isReadOnly && (
                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          size="sm"
                          variant="default"
                          className="h-8"
                          onClick={() => { setReviewRequest(req); setReviewAction("approve"); setReviewNotes(""); }}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                          Aprobar
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          className="h-8"
                          onClick={() => { setReviewRequest(req); setReviewAction("reject"); setReviewNotes(""); }}
                        >
                          <XCircle className="h-3.5 w-3.5 mr-1" />
                          Rechazar
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Review confirmation dialog */}
      <Dialog open={!!reviewRequest && !!reviewAction} onOpenChange={(o) => { if (!o) { setReviewRequest(null); setReviewAction(null); } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {reviewAction === "approve" ? (
                <CheckCircle2 className="h-5 w-5 text-primary" />
              ) : (
                <XCircle className="h-5 w-5 text-destructive" />
              )}
              {reviewAction === "approve" ? "Aprobar merma" : "Rechazar merma"}
            </DialogTitle>
            <DialogDescription>
              {reviewRequest?.product_name} — {reviewRequest?.product_unit === "ml"
                ? `${Math.abs(reviewRequest?.calculated_quantity || 0)} ml`
                : `${Math.abs(reviewRequest?.calculated_quantity || 0)} uds`}
            </DialogDescription>
          </DialogHeader>

          {reviewAction === "approve" && (
            <div className="bg-warning/10 border border-warning/20 rounded-lg p-3 text-xs">
              <div className="flex items-center gap-2 text-warning font-medium mb-1">
                <AlertTriangle className="h-3.5 w-3.5" />
                Se descontará stock
              </div>
              <p className="text-muted-foreground">
                Al aprobar, se descontará el producto de la ubicación indicada inmediatamente.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">Notas (opcional)</label>
            <Textarea
              placeholder="Comentario de revisión..."
              value={reviewNotes}
              onChange={(e) => setReviewNotes(e.target.value)}
              rows={2}
              className="resize-none"
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setReviewRequest(null); setReviewAction(null); }}>
              Cancelar
            </Button>
            <Button
              variant={reviewAction === "approve" ? "default" : "destructive"}
              onClick={() => reviewAction && handleReview(reviewAction)}
              disabled={processing}
            >
              {processing && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {reviewAction === "approve" ? "Confirmar aprobación" : "Confirmar rechazo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New waste request dialog */}
      {showNewRequest && selectedLocationId && (
        <WasteRegistrationDialog
          open={showNewRequest}
          onOpenChange={setShowNewRequest}
          locationId={selectedLocationId}
          locationName={locations.find((l) => l.id === selectedLocationId)?.name || "—"}
          onWasteRegistered={fetchRequests}
        />
      )}
    </div>
  );
}
