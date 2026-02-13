import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Calendar,
  Clock,
  User,
  Store,
  AlertTriangle,
  CheckCircle,
} from "lucide-react";
import { formatCLP } from "@/lib/currency";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

interface JornadaDetailDrawerProps {
  open: boolean;
  onClose: () => void;
  jornadaId: string | null;
}

interface CashClosingDetail {
  pos_id: string;
  pos_name: string;
  opening_cash_amount: number;
  cash_sales_total: number;
  expected_cash: number;
  closing_cash_counted: number;
  difference: number;
  notes: string | null;
}

interface AuditEntry {
  action: string;
  actor_source: string;
  reason: string | null;
  created_at: string;
}

export function JornadaDetailDrawer({ open, onClose, jornadaId }: JornadaDetailDrawerProps) {
  const [loading, setLoading] = useState(true);
  const [jornada, setJornada] = useState<any>(null);
  const [summary, setSummary] = useState<any>(null);
  const [cashClosings, setCashClosings] = useState<CashClosingDetail[]>([]);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);

  useEffect(() => {
    if (open && jornadaId) fetchAll();
  }, [open, jornadaId]);

  const fetchAll = async () => {
    if (!jornadaId) return;
    setLoading(true);
    try {
      const [jornadaRes, summaryRes, closingsRes, posRes, auditRes] = await Promise.all([
        supabase.from("jornadas").select("*").eq("id", jornadaId).single(),
        supabase.from("jornada_financial_summary").select("*").eq("jornada_id", jornadaId).is("pos_id", null).maybeSingle(),
        supabase.from("jornada_cash_closings").select("*").eq("jornada_id", jornadaId),
        supabase.from("pos_terminals").select("id, name"),
        supabase.from("jornada_audit_log").select("action, actor_source, reason, created_at").eq("jornada_id", jornadaId).order("created_at", { ascending: true }),
      ]);

      setJornada(jornadaRes.data);
      setSummary(summaryRes.data);
      setAuditLog((auditRes.data || []) as AuditEntry[]);

      const posMap: Record<string, string> = {};
      (posRes.data || []).forEach((p: any) => { posMap[p.id] = p.name; });

      const closings: CashClosingDetail[] = (closingsRes.data || []).map((c: any) => ({
        pos_id: c.pos_id,
        pos_name: posMap[c.pos_id] || "POS desconocido",
        opening_cash_amount: Number(c.opening_cash_amount),
        cash_sales_total: Number(c.cash_sales_total),
        expected_cash: Number(c.expected_cash),
        closing_cash_counted: Number(c.closing_cash_counted),
        difference: Number(c.difference),
        notes: c.notes,
      }));
      setCashClosings(closings);
    } catch (error) {
      console.error("Error fetching jornada details:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Detalle de Jornada</SheetTitle>
        </SheetHeader>

        {loading ? (
          <div className="space-y-4 mt-6">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : !jornada ? (
          <p className="text-muted-foreground mt-6">No se encontró la jornada.</p>
        ) : (
          <ScrollArea className="h-[calc(100vh-100px)] pr-4 mt-4">
            <div className="space-y-5">
              {/* Header info */}
              <Card className="p-4">
                <h3 className="font-semibold text-lg mb-3">{jornada.nombre || `Jornada ${jornada.numero_jornada}`}</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Calendar className="w-4 h-4" />
                    <span className="capitalize">{format(parseISO(jornada.fecha), "EEEE d MMM yyyy", { locale: es })}</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Clock className="w-4 h-4" />
                    <span>
                      {jornada.hora_apertura?.slice(0, 5) || "--:--"} — {jornada.hora_cierre?.slice(0, 5) || "--:--"}
                    </span>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <Badge variant={jornada.estado === "activa" ? "default" : "secondary"}>
                    {jornada.estado === "activa" ? "Abierta" : "Cerrada"}
                  </Badge>
                  {jornada.forced_close && (
                    <Badge variant="destructive" className="text-xs">Cierre Forzado</Badge>
                  )}
                </div>
              </Card>

              {/* Forced close banner */}
              {jornada.forced_close && (
                <div className="p-4 bg-destructive/10 border border-destructive/30 rounded-lg space-y-2">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
                    <span className="font-semibold text-sm text-destructive">Jornada cerrada de forma forzada</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Incluye ajuste manual por diferencia de caja. Requiere revisión administrativa.
                  </p>
                  {jornada.forced_reason && (
                    <p className="text-xs p-2 bg-muted rounded italic text-muted-foreground">
                      <strong>Motivo:</strong> {jornada.forced_reason}
                    </p>
                  )}
                </div>
              )}

              {/* Sales summary */}
              {summary && (
                <>
                  <Separator />
                  <div>
                    <h4 className="font-medium text-sm text-muted-foreground mb-3">Resumen de Ventas</h4>
                    <div className="grid grid-cols-2 gap-2">
                      <MiniCard label="Ventas Brutas" value={formatCLP(summary.gross_sales_total)} />
                      <MiniCard label="Ventas Netas" value={formatCLP(summary.net_sales_total)} />
                      <MiniCard label="Transacciones" value={String(summary.transactions_count)} />
                      <MiniCard label="Resultado" value={formatCLP(summary.net_operational_result)} highlight={summary.net_operational_result >= 0} />
                    </div>
                  </div>
                </>
              )}

              {/* Cash closings */}
              {cashClosings.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <h4 className="font-medium text-sm text-muted-foreground mb-3">Arqueo por POS</h4>
                    <div className="space-y-3">
                      {cashClosings.map((c) => {
                        const hasDiff = Math.abs(c.difference) > 0.01;
                        return (
                          <Card key={c.pos_id} className={`p-3 ${hasDiff ? "border-amber-500/30" : ""}`}>
                            <div className="flex items-center gap-2 mb-2">
                              <Store className="w-4 h-4 text-muted-foreground" />
                              <span className="font-medium text-sm">{c.pos_name}</span>
                              {hasDiff ? (
                                <Badge variant="destructive" className="ml-auto text-xs">
                                  <AlertTriangle className="w-3 h-3 mr-1" />
                                  {c.difference >= 0 ? "+" : ""}{formatCLP(c.difference)}
                                </Badge>
                              ) : (
                                <Badge className="ml-auto text-xs bg-green-500/20 text-green-700 border-green-500/30">
                                  <CheckCircle className="w-3 h-3 mr-1" />
                                  Cuadra
                                </Badge>
                              )}
                            </div>
                            <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                              <span>Apertura: {formatCLP(c.opening_cash_amount)}</span>
                              <span>Esperado: {formatCLP(c.expected_cash)}</span>
                              <span>Contado: {formatCLP(c.closing_cash_counted)}</span>
                            </div>
                            {c.notes && (
                              <p className="text-xs mt-2 p-2 bg-muted rounded text-muted-foreground italic">
                                {c.notes}
                              </p>
                            )}
                          </Card>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}

              {/* Audit log */}
              {auditLog.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <h4 className="font-medium text-sm text-muted-foreground mb-3">Auditoría</h4>
                    <div className="space-y-2">
                      {auditLog.map((entry, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs">
                          <User className="w-3 h-3 mt-0.5 text-muted-foreground shrink-0" />
                          <div>
                            <span className="font-medium capitalize">{entry.action}</span>
                            <span className="text-muted-foreground"> — {format(new Date(entry.created_at), "dd/MM HH:mm")}</span>
                            {entry.reason && <p className="text-muted-foreground mt-0.5">{entry.reason}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </ScrollArea>
        )}
      </SheetContent>
    </Sheet>
  );
}

function MiniCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="p-2 rounded-lg bg-muted/30 text-center">
      <p className={`font-bold text-sm ${highlight === true ? "text-primary" : highlight === false ? "text-destructive" : ""}`}>{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
