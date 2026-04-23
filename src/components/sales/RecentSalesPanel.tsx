import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, Search, Undo2, Clock, Ticket } from "lucide-react";
import { formatCLP } from "@/lib/currency";
import { format } from "date-fns";
import { VoidRequestDialog } from "./VoidRequestDialog";
import { useActiveVenue } from "@/hooks/useActiveVenue";

interface RecentSalesPanelProps {
  jornadaId: string | null;
  posId: string | null;
}

interface UnifiedSale {
  id: string;
  source: "alcohol" | "ticket";
  sale_number: string | null;
  total_amount: number;
  payment_method: string | null;
  created_at: string;
  is_cancelled: boolean;
  pos_id: string | null;
}

export function RecentSalesPanel({ jornadaId, posId }: RecentSalesPanelProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [voidSaleId, setVoidSaleId] = useState<string | null>(null);
  const { venue } = useActiveVenue();
  const venueId = venue?.id;

  const { data: sales, refetch } = useQuery({
    queryKey: ["recent-sales-unified", jornadaId, posId, venueId],
    enabled: !!jornadaId && !!venueId && open,
    queryFn: async (): Promise<UnifiedSale[]> => {
      // Alcohol sales
      let alcoholQ = supabase
        .from("sales")
        .select("id, sale_number, total_amount, payment_method, created_at, is_cancelled, pos_id")
        .eq("venue_id", venueId!)
        .eq("jornada_id", jornadaId!)
        .order("created_at", { ascending: false })
        .limit(30);
      if (posId) alcoholQ = alcoholQ.eq("pos_id", posId);

      // Ticket sales
      let ticketQ = supabase
        .from("ticket_sales")
        .select("id, sale_number, total, payment_method, created_at, payment_status, pos_id")
        .eq("venue_id", venueId!)
        .eq("jornada_id", jornadaId!)
        .order("created_at", { ascending: false })
        .limit(30);
      if (posId) ticketQ = ticketQ.eq("pos_id", posId);

      const [alcoholRes, ticketRes] = await Promise.all([alcoholQ, ticketQ]);
      if (alcoholRes.error) throw alcoholRes.error;
      if (ticketRes.error) throw ticketRes.error;

      const merged: UnifiedSale[] = [
        ...(alcoholRes.data || []).map((s: any) => ({
          id: s.id,
          source: "alcohol" as const,
          sale_number: s.sale_number,
          total_amount: Number(s.total_amount) || 0,
          payment_method: s.payment_method,
          created_at: s.created_at,
          is_cancelled: !!s.is_cancelled,
          pos_id: s.pos_id,
        })),
        ...(ticketRes.data || []).map((s: any) => ({
          id: s.id,
          source: "ticket" as const,
          sale_number: s.sale_number,
          total_amount: Number(s.total) || 0,
          payment_method: s.payment_method,
          created_at: s.created_at,
          is_cancelled: s.payment_status && s.payment_status !== "paid",
          pos_id: s.pos_id,
        })),
      ];

      merged.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      return merged.slice(0, 40);
    },
  });

  // Fetch void requests only for alcohol sales
  const saleIds = sales?.filter((s) => s.source === "alcohol").map((s) => s.id) || [];
  const { data: voidRequests } = useQuery({
    queryKey: ["void-requests-for-sales", saleIds],
    enabled: saleIds.length > 0 && open,
    queryFn: async () => {
      const { data } = await supabase
        .from("void_requests" as any)
        .select("id, sale_id, status")
        .in("sale_id", saleIds);
      return (data || []) as unknown as { id: string; sale_id: string; status: string }[];
    },
  });

  const voidMap = new Map<string, string>();
  voidRequests?.forEach((vr) => voidMap.set(vr.sale_id, vr.status));

  const filtered = sales?.filter((s) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      s.sale_number?.toLowerCase().includes(q) ||
      formatCLP(s.total_amount).includes(q) ||
      format(new Date(s.created_at), "HH:mm").includes(q)
    );
  });

  const getVoidBadge = (saleId: string, isCancelled: boolean) => {
    if (isCancelled) return <Badge variant="destructive" className="text-[10px]">Anulada</Badge>;
    const status = voidMap.get(saleId);
    if (!status) return null;
    if (status === "pending") return <Badge variant="outline" className="text-[10px] border-yellow-500 text-yellow-600">Solicitud pendiente</Badge>;
    if (status === "approved") return <Badge variant="outline" className="text-[10px] border-blue-500 text-blue-600">Aprobada</Badge>;
    if (status === "executed") return <Badge variant="destructive" className="text-[10px]">Anulada</Badge>;
    return null;
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" className="w-full justify-between text-sm text-muted-foreground h-9">
          <span className="flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Ventas recientes
          </span>
          <ChevronDown className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`} />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <Card className="p-3 mt-2 space-y-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="Buscar por hora, monto..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-xs"
            />
          </div>
          <ScrollArea className="max-h-[280px]">
            <div className="space-y-1">
              {filtered?.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">Sin ventas recientes</p>
              )}
              {filtered?.map((sale) => {
                const hasActiveVoid = sale.source === "alcohol" && voidMap.has(sale.id);
                const canVoid = sale.source === "alcohol" && !sale.is_cancelled && !hasActiveVoid;
                return (
                  <div
                    key={`${sale.source}-${sale.id}`}
                    className={`flex items-center justify-between p-2 rounded-md text-xs ${
                      sale.is_cancelled ? "opacity-50 bg-muted/30" : "hover:bg-muted/50"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-muted-foreground font-mono w-10 shrink-0">
                        {format(new Date(sale.created_at), "HH:mm")}
                      </span>
                      <span className="font-medium">{formatCLP(sale.total_amount)}</span>
                      {sale.source === "ticket" && (
                        <Badge variant="outline" className="text-[10px] border-blue-500 text-blue-600 gap-1">
                          <Ticket className="w-2.5 h-2.5" />
                          Ticket
                        </Badge>
                      )}
                      <Badge variant="secondary" className="text-[10px]">
                        {sale.payment_method === "cash" ? "Efectivo" : sale.payment_method === "card" ? "Tarjeta" : sale.payment_method || "—"}
                      </Badge>
                      {sale.source === "alcohol" && getVoidBadge(sale.id, sale.is_cancelled)}
                    </div>
                    {canVoid && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => setVoidSaleId(sale.id)}
                      >
                        <Undo2 className="w-3 h-3 mr-1" />
                        Anular
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </Card>

        <VoidRequestDialog
          saleId={voidSaleId}
          onClose={() => setVoidSaleId(null)}
          onSuccess={() => {
            setVoidSaleId(null);
            refetch();
          }}
        />
      </CollapsibleContent>
    </Collapsible>
  );
}
