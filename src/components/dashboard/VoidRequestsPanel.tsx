import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { format } from "date-fns";
import { formatCLP } from "@/lib/currency";
import { useActiveVenue } from "@/hooks/useActiveVenue";
import { Loader2, CheckCircle, XCircle, Play, Clock, AlertTriangle } from "lucide-react";

type VoidRequest = {
  id: string;
  sale_id: string;
  request_type: string;
  reason: string;
  notes: string | null;
  requested_by: string;
  requested_at: string;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  execution_mode: string | null;
  executed_at: string | null;
};

export function VoidRequestsPanel() {
  const { venue } = useActiveVenue();
  const venueId = venue?.id;
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("pending");
  const [reviewDialog, setReviewDialog] = useState<{ request: VoidRequest; action: "approved" | "rejected" } | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [executionMode, setExecutionMode] = useState("void_only");

  const { data: requests, isLoading } = useQuery({
    queryKey: ["void-requests", venueId, activeTab],
    enabled: !!venueId,
    queryFn: async () => {
      const statusFilter = activeTab === "pending" ? ["pending"] : activeTab === "approved" ? ["approved"] : ["executed", "rejected", "cancelled"];
      const { data, error } = await supabase
        .from("void_requests" as any)
        .select("*")
        .eq("venue_id", venueId!)
        .in("status", statusFilter)
        .order("requested_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as VoidRequest[];
    },
  });

  // Fetch sale details for displayed requests
  const saleIds = requests?.map((r) => r.sale_id) || [];
  const { data: salesData } = useQuery({
    queryKey: ["void-sales-detail", saleIds],
    enabled: saleIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("sales")
        .select("id, sale_number, total_amount, payment_method, created_at, point_of_sale")
        .in("id", saleIds);
      return data || [];
    },
  });

  // Fetch requester names
  const requesterIds = [...new Set(requests?.map((r) => r.requested_by) || [])];
  const { data: profiles } = useQuery({
    queryKey: ["void-profiles", requesterIds],
    enabled: requesterIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", requesterIds);
      return data || [];
    },
  });

  const salesMap = new Map(salesData?.map((s) => [s.id, s]) || []);
  const profilesMap = new Map(profiles?.map((p) => [p.id, p.full_name]) || []);

  const reviewMutation = useMutation({
    mutationFn: async ({ requestId, action, notes, mode }: { requestId: string; action: string; notes: string; mode: string }) => {
      const { error } = await supabase.rpc("review_void_request", {
        p_request_id: requestId,
        p_action: action,
        p_review_notes: notes || null,
        p_execution_mode: action === "approved" ? mode : null,
      });
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      toast.success(vars.action === "approved" ? "Solicitud aprobada" : "Solicitud rechazada");
      queryClient.invalidateQueries({ queryKey: ["void-requests"] });
      setReviewDialog(null);
      setReviewNotes("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const executeMutation = useMutation({
    mutationFn: async (requestId: string) => {
      const { error } = await supabase.rpc("execute_void_request", {
        p_void_request_id: requestId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Anulación ejecutada correctamente");
      queryClient.invalidateQueries({ queryKey: ["void-requests"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const statusBadge = (status: string) => {
    switch (status) {
      case "pending": return <Badge variant="outline" className="border-yellow-500 text-yellow-600"><Clock className="w-3 h-3 mr-1" />Pendiente</Badge>;
      case "approved": return <Badge variant="outline" className="border-blue-500 text-blue-600"><CheckCircle className="w-3 h-3 mr-1" />Aprobada</Badge>;
      case "rejected": return <Badge variant="outline" className="border-red-500 text-red-600"><XCircle className="w-3 h-3 mr-1" />Rechazada</Badge>;
      case "executed": return <Badge variant="destructive"><CheckCircle className="w-3 h-3 mr-1" />Ejecutada</Badge>;
      default: return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const typeBadge = (type: string) => {
    switch (type) {
      case "pre_redeem": return <Badge variant="secondary" className="text-[10px]">Pre-retiro</Badge>;
      case "post_redeem": return <Badge variant="outline" className="text-[10px] border-orange-500 text-orange-600">Post-retiro</Badge>;
      default: return <Badge variant="secondary" className="text-[10px]">Desconocido</Badge>;
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Solicitudes de Anulación</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-4">
              <TabsTrigger value="pending">Pendientes</TabsTrigger>
              <TabsTrigger value="approved">Aprobadas</TabsTrigger>
              <TabsTrigger value="history">Historial</TabsTrigger>
            </TabsList>

            <TabsContent value={activeTab}>
              {isLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
              ) : requests?.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  {activeTab === "pending" ? "No hay solicitudes pendientes" : activeTab === "approved" ? "No hay solicitudes aprobadas por ejecutar" : "Sin historial"}
                </p>
              ) : (
                <ScrollArea className="max-h-[500px]">
                  <div className="space-y-3">
                    {requests?.map((req) => {
                      const sale = salesMap.get(req.sale_id);
                      return (
                        <Card key={req.id} className="p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="space-y-1.5 min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                {statusBadge(req.status)}
                                {typeBadge(req.request_type)}
                                {sale && (
                                  <span className="text-xs text-muted-foreground">
                                    Venta #{sale.sale_number} · {formatCLP(sale.total_amount)} · {sale.payment_method === "cash" ? "Efectivo" : "Tarjeta"}
                                  </span>
                                )}
                              </div>
                              <p className="text-sm"><strong>Motivo:</strong> {req.reason}</p>
                              {req.notes && <p className="text-xs text-muted-foreground">Notas: {req.notes}</p>}
                              <p className="text-xs text-muted-foreground">
                                Solicitado por {profilesMap.get(req.requested_by) || "—"} · {format(new Date(req.requested_at), "dd/MM HH:mm")}
                              </p>
                              {req.review_notes && (
                                <p className="text-xs text-muted-foreground">Revisión: {req.review_notes}</p>
                              )}
                            </div>
                            <div className="flex gap-2 shrink-0">
                              {req.status === "pending" && (
                                <>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="text-green-600 border-green-300 hover:bg-green-50"
                                    onClick={() => setReviewDialog({ request: req, action: "approved" })}
                                  >
                                    <CheckCircle className="w-3.5 h-3.5 mr-1" />
                                    Aprobar
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="text-red-600 border-red-300 hover:bg-red-50"
                                    onClick={() => setReviewDialog({ request: req, action: "rejected" })}
                                  >
                                    <XCircle className="w-3.5 h-3.5 mr-1" />
                                    Rechazar
                                  </Button>
                                </>
                              )}
                              {req.status === "approved" && (
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => executeMutation.mutate(req.id)}
                                  disabled={executeMutation.isPending}
                                >
                                  {executeMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Play className="w-3.5 h-3.5 mr-1" />}
                                  Ejecutar
                                </Button>
                              )}
                            </div>
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                </ScrollArea>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Review Dialog */}
      <Dialog open={!!reviewDialog} onOpenChange={(o) => !o && setReviewDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {reviewDialog?.action === "approved" ? "Aprobar anulación" : "Rechazar anulación"}
            </DialogTitle>
            <DialogDescription>
              {reviewDialog?.action === "approved"
                ? "La solicitud quedará lista para ejecutar."
                : "Se notificará al solicitante del rechazo."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {reviewDialog?.action === "approved" && reviewDialog.request.request_type === "post_redeem" && (
              <div className="space-y-2">
                <Label>Resolución de inventario</Label>
                <Select value={executionMode} onValueChange={setExecutionMode}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="void_only">Solo anular (sin ajuste)</SelectItem>
                    <SelectItem value="refund_with_inventory_return">Devolver stock</SelectItem>
                    <SelectItem value="refund_with_loss">Registrar como pérdida</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  Esta venta tiene productos ya entregados
                </p>
              </div>
            )}
            <div className="space-y-2">
              <Label>Notas de revisión</Label>
              <Textarea
                placeholder="Notas opcionales..."
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewDialog(null)}>Cancelar</Button>
            <Button
              variant={reviewDialog?.action === "approved" ? "default" : "destructive"}
              onClick={() => {
                if (!reviewDialog) return;
                reviewMutation.mutate({
                  requestId: reviewDialog.request.id,
                  action: reviewDialog.action,
                  notes: reviewNotes,
                  mode: executionMode,
                });
              }}
              disabled={reviewMutation.isPending}
            >
              {reviewMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {reviewDialog?.action === "approved" ? "Confirmar aprobación" : "Confirmar rechazo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
