import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useActiveVenue } from "@/hooks/useActiveVenue";
import { useUserRole } from "@/hooks/useUserRole";
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
  Trash2,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Loader2,
  Filter,
  MapPin,
  Package,
  User,
  AlertCircle,
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { WasteRegistrationDialog } from "./WasteRegistrationDialog";

interface WasteRequest {
  id: string;
  venue_id: string;
  location_id: string;
  product_id: string;
  quantity: number;
  unit_type: string;
  reason: string;
  notes: string | null;
  evidence_url: string | null;
  status: string;
  requested_by_user_id: string;
  approved_by_user_id: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  jornada_id: string | null;
  created_at: string;
  // Joined fields
  product_name?: string;
  product_unit?: string;
  product_capacity_ml?: number | null;
  location_name?: string;
  requester_name?: string;
  approver_name?: string;
}

const REASON_LABELS: Record<string, string> = {
  rota: "Rota",
  botada: "Botada",
  derrame: "Derrame",
  caducada: "Caducada",
  devolucion: "Devolución",
  otro: "Otro",
};

const STATUS_CONFIG: Record<
  string,
  {
    label: string;
    variant: "default" | "secondary" | "destructive" | "outline";
    icon: typeof Clock;
    className?: string;
  }
> = {
  PENDING_APPROVAL: {
    label: "Pendiente",
    variant: "secondary",
    icon: Clock,
    className: "bg-warning/20 text-warning border-warning/30",
  },
  APPROVED: {
    label: "Aprobada",
    variant: "default",
    icon: CheckCircle2,
    className: "bg-primary/10 text-primary border-primary/20",
  },
  REJECTED: {
    label: "Rechazada",
    variant: "destructive",
    icon: XCircle,
  },
};

type StatusFilter = "all" | "PENDING_APPROVAL" | "APPROVED" | "REJECTED";

export function WasteManagement({ isReadOnly = false }: { isReadOnly?: boolean }) {
  const { venue } = useActiveVenue();
  const { role } = useUserRole();
  const canApprove = role === "admin" || role === "gerencia";

  const [requests, setRequests] = useState<WasteRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("PENDING_APPROVAL");

  // Review dialog
  const [reviewRequest, setReviewRequest] = useState<WasteRequest | null>(null);
  const [reviewAction, setReviewAction] = useState<"approve" | "reject" | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [processing, setProcessing] = useState(false);
  const [stockError, setStockError] = useState<string | null>(null);

  // New request dialog
  const [showNewRequest, setShowNewRequest] = useState(false);

  useEffect(() => {
    if (venue?.id) fetchRequests();
  }, [venue?.id]);

  // Realtime
  useEffect(() => {
    if (!venue?.id) return;
    const channel = supabase
      .channel("waste-requests-admin")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "waste_requests" },
        () => fetchRequests()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [venue?.id]);

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

      const productIds = [...new Set((reqData || []).map((r: any) => r.product_id))];
      const locationIds = [...new Set((reqData || []).map((r: any) => r.location_id))];
      const userIds = [...new Set([
        ...(reqData || []).map((r: any) => r.requested_by_user_id),
        ...(reqData || []).filter((r: any) => r.approved_by_user_id).map((r: any) => r.approved_by_user_id),
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
          requester_name: profMap.get(r.requested_by_user_id) || "—",
          approver_name: r.approved_by_user_id ? profMap.get(r.approved_by_user_id) || "—" : null,
        };
      });

      setRequests(enriched);
    } catch (err) {
      console.error("Error fetching waste requests:", err);
      toast.error("Error al cargar solicitudes de merma");
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    if (statusFilter === "all") return requests;
    return requests.filter((r) => r.status === statusFilter);
  }, [requests, statusFilter]);

  const pendingCount = useMemo(
    () => requests.filter((r) => r.status === "PENDING_APPROVAL").length,
    [requests]
  );

  const openReview = (req: WasteRequest, action: "approve" | "reject") => {
    setReviewRequest(req);
    setReviewAction(action);
    setRejectionReason("");
    setStockError(null);
  };

  const handleReview = async () => {
    if (!reviewRequest || !venue?.id || !reviewAction) return;
    setProcessing(true);
    setStockError(null);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData?.session?.user?.id;
      if (!userId) throw new Error("Sin sesión");

      if (reviewAction === "approve") {
        // 1. Check current stock in that location
        const { data: balance } = await supabase
          .from("stock_balances")
          .select("quantity")
          .eq("product_id", reviewRequest.product_id)
          .eq("location_id", reviewRequest.location_id)
          .eq("venue_id", venue.id)
          .maybeSingle();

        const currentStock = Number(balance?.quantity ?? 0);
        if (currentStock < reviewRequest.quantity) {
          setStockError(
            `Stock insuficiente en esta ubicación. Stock actual: ${currentStock} ${reviewRequest.unit_type === "ml" ? "ml" : reviewRequest.product_unit || "ud"} — Solicitud: ${reviewRequest.quantity} ${reviewRequest.unit_type === "ml" ? "ml" : reviewRequest.product_unit || "ud"}`
          );
          setProcessing(false);
          return;
        }

        // 2. Get product CPP cost for the snapshot
        const { data: productData } = await supabase
          .from("products")
          .select("cost_per_unit")
          .eq("id", reviewRequest.product_id)
          .maybeSingle();
        const unitCostCpp = Number(productData?.cost_per_unit ?? 0);
        const totalWasteCost = unitCostCpp * Math.abs(reviewRequest.quantity);

        // 3. Create stock movement with cost snapshot
        const { error: movError } = await supabase.from("stock_movements").insert({
          product_id: reviewRequest.product_id,
          movement_type: "waste" as any,
          quantity: -Math.abs(reviewRequest.quantity),
          from_location_id: reviewRequest.location_id,
          venue_id: venue.id,
          jornada_id: reviewRequest.jornada_id || null,
          notes: `[MERMA APROBADA] [${reviewRequest.reason}]${reviewRequest.notes ? ` ${reviewRequest.notes}` : ""}`.trim(),
          source_type: "waste",
          unit_cost_snapshot: unitCostCpp,
          total_cost_snapshot: totalWasteCost,
        });
        if (movError) throw movError;

        // 3. Update stock_balances
        if (balance) {
          const newQty = Math.max(0, currentStock - reviewRequest.quantity);
          await supabase
            .from("stock_balances")
            .update({ quantity: newQty })
            .eq("product_id", reviewRequest.product_id)
            .eq("location_id", reviewRequest.location_id)
            .eq("venue_id", venue.id);
        }

        // 4. Mark request approved
        const { error: updateError } = await supabase
          .from("waste_requests")
          .update({
            status: "APPROVED",
            approved_by_user_id: userId,
            approved_at: new Date().toISOString(),
          })
          .eq("id", reviewRequest.id);
        if (updateError) throw updateError;

        toast.success("✅ Merma aprobada y stock descontado correctamente");
      } else {
        // Reject — rejection reason is required
        if (!rejectionReason.trim()) {
          toast.error("El motivo de rechazo es obligatorio");
          setProcessing(false);
          return;
        }

        const { error: updateError } = await supabase
          .from("waste_requests")
          .update({
            status: "REJECTED",
            approved_by_user_id: userId,
            approved_at: new Date().toISOString(),
            rejection_reason: rejectionReason.trim(),
          })
          .eq("id", reviewRequest.id);
        if (updateError) throw updateError;

        toast.success("Solicitud rechazada");
      }

      setReviewRequest(null);
      setReviewAction(null);
      fetchRequests();
    } catch (err: any) {
      console.error("Error processing waste request:", err);
      toast.error(err.message || "Error al procesar la solicitud");
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
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
            Las solicitudes deben ser aprobadas por Admin o Gerencia para descontar stock
          </p>
        </div>
        <div className="flex items-center gap-3">
          {pendingCount > 0 && (
            <Badge className="text-sm px-3 py-1 bg-warning/20 text-warning border-warning/30">
              {pendingCount} pendiente{pendingCount > 1 ? "s" : ""}
            </Badge>
          )}
          {!isReadOnly && (
            <Button onClick={() => setShowNewRequest(true)} size="sm" variant="outline">
              <Trash2 className="h-4 w-4 mr-1" />
              Nueva solicitud
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
        {(["all", "PENDING_APPROVAL", "APPROVED", "REJECTED"] as StatusFilter[]).map((s) => {
          const labels: Record<StatusFilter, string> = {
            all: "Todas",
            PENDING_APPROVAL: "Pendientes",
            APPROVED: "Aprobadas",
            REJECTED: "Rechazadas",
          };
          return (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${
                statusFilter === s
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-muted-foreground border-border hover:bg-muted"
              }`}
            >
              {labels[s]}
              {s === "PENDING_APPROVAL" && pendingCount > 0 && (
                <span className="ml-1.5 bg-warning/30 text-warning text-[10px] px-1 rounded">
                  {pendingCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Trash2 className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-40" />
            <p className="text-muted-foreground text-sm">
              {statusFilter === "PENDING_APPROVAL"
                ? "No hay solicitudes pendientes de aprobación"
                : "No hay solicitudes con este filtro"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((req) => {
            const config = STATUS_CONFIG[req.status] || STATUS_CONFIG["PENDING_APPROVAL"];
            const StatusIcon = config.icon;

            return (
              <Card
                key={req.id}
                className={`border-border transition-colors ${
                  req.status === "PENDING_APPROVAL" ? "hover:bg-muted/30" : ""
                }`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0 space-y-1.5">
                      {/* Title row */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-semibold text-sm">{req.product_name}</h4>
                        <Badge
                          variant={config.variant}
                          className={`text-[10px] ${config.className || ""}`}
                        >
                          <StatusIcon className="h-3 w-3 mr-1" />
                          {config.label}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">
                          {REASON_LABELS[req.reason] || req.reason}
                        </Badge>
                      </div>

                      {/* Details row */}
                      <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {req.location_name}
                        </span>
                        <span className="flex items-center gap-1">
                          <Package className="h-3 w-3" />
                          <span className="font-medium text-foreground">
                            {req.quantity} {req.unit_type === "ml" ? "ml" : req.product_unit || "ud"}
                          </span>
                        </span>
                      </div>

                      {/* Meta row */}
                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {req.requester_name}
                        </span>
                        <span>{format(new Date(req.created_at), "dd MMM HH:mm", { locale: es })}</span>
                        {req.notes && <span className="italic">"{req.notes}"</span>}
                      </div>

                      {/* Reviewer info */}
                      {req.status !== "PENDING_APPROVAL" && req.approver_name && (
                        <div className="text-[11px] text-muted-foreground">
                          {req.status === "APPROVED" ? "✅ Aprobado" : "❌ Rechazado"} por{" "}
                          <span className="text-foreground">{req.approver_name}</span>
                          {req.approved_at &&
                            ` — ${format(new Date(req.approved_at), "dd MMM HH:mm", { locale: es })}`}
                          {req.rejection_reason && (
                            <span className="italic ml-1 text-destructive">
                              — "{req.rejection_reason}"
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Action buttons — only for pending + can approve */}
                    {req.status === "PENDING_APPROVAL" && canApprove && !isReadOnly && (
                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          size="sm"
                          variant="default"
                          className="h-8 text-xs"
                          onClick={() => openReview(req, "approve")}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                          Aprobar
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          className="h-8 text-xs"
                          onClick={() => openReview(req, "reject")}
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

      {/* Review Dialog */}
      <Dialog
        open={!!reviewRequest && !!reviewAction}
        onOpenChange={(o) => {
          if (!o) {
            setReviewRequest(null);
            setReviewAction(null);
            setStockError(null);
          }
        }}
      >
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
              {reviewRequest?.product_name} —{" "}
              {reviewRequest?.quantity}{" "}
              {reviewRequest?.unit_type === "ml" ? "ml" : reviewRequest?.product_unit || "ud"}
              {" · "}
              <span className="font-medium">{reviewRequest?.location_name}</span>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {reviewAction === "approve" && (
              <div className="bg-warning/10 border border-warning/20 rounded-lg p-3 text-xs">
                <div className="flex items-center gap-2 font-medium text-warning mb-1">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Descuento de stock inmediato
                </div>
                <p className="text-muted-foreground">
                  Al aprobar, se descontará{" "}
                  <strong>
                    {reviewRequest?.quantity}{" "}
                    {reviewRequest?.unit_type === "ml" ? "ml" : reviewRequest?.product_unit || "ud"}
                  </strong>{" "}
                  de <strong>{reviewRequest?.location_name}</strong> inmediatamente.
                </p>
              </div>
            )}

            {/* Stock error */}
            {stockError && (
              <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 text-xs flex gap-2">
                <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                <p className="text-destructive">{stockError}</p>
              </div>
            )}

            {/* Rejection reason — mandatory */}
            {reviewAction === "reject" && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium">
                  Motivo de rechazo *
                </label>
                <Textarea
                  placeholder="Explica el motivo del rechazo (obligatorio)..."
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  rows={3}
                  className="resize-none"
                />
                {!rejectionReason.trim() && (
                  <p className="text-xs text-destructive flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    El motivo es obligatorio para rechazar
                  </p>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setReviewRequest(null);
                setReviewAction(null);
                setStockError(null);
              }}
            >
              Cancelar
            </Button>
            <Button
              variant={reviewAction === "approve" ? "default" : "destructive"}
              onClick={handleReview}
              disabled={
                processing ||
                (reviewAction === "reject" && !rejectionReason.trim())
              }
            >
              {processing && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {reviewAction === "approve" ? "Confirmar aprobación" : "Confirmar rechazo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New waste request dialog */}
      {showNewRequest && (
        <WasteRegistrationDialog
          open={showNewRequest}
          onOpenChange={setShowNewRequest}
          onWasteRegistered={fetchRequests}
        />
      )}
    </div>
  );
}
