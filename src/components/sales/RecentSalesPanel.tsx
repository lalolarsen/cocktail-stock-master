import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, Search, Undo2, Clock } from "lucide-react";
import { formatCLP } from "@/lib/currency";
import { format } from "date-fns";
import { VoidRequestDialog } from "./VoidRequestDialog";
import { useActiveVenue } from "@/hooks/useActiveVenue";

interface RecentSalesPanelProps {
  jornadaId: string | null;
  posId: string | null;
}

export function RecentSalesPanel({ jornadaId, posId }: RecentSalesPanelProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [voidSaleId, setVoidSaleId] = useState<string | null>(null);
  const { venueId } = useActiveVenue();

  const { data: sales, refetch } = useQuery({
    queryKey: ["recent-sales", jornadaId, posId, venueId],
    enabled: !!jornadaId && !!venueId && open,
    queryFn: async () => {
      let q = supabase
        .from("sales")
        .select("id, sale_number, total_amount, payment_method, created_at, is_cancelled, point_of_sale, pos_id")
        .eq("venue_id", venueId!)
        .eq("jornada_id", jornadaId!)
        .order("created_at", { ascending: false })
        .limit(30);

      if (posId) q = q.eq("pos_id", posId);

      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch void requests for these sales
  const saleIds = sales?.map((s) => s.id) || [];
  const { data: voidRequests } = useQuery({
    queryKey: ["void-requests-for-sales", saleIds],
    enabled: saleIds.length > 0 && open,
    queryFn: async () => {
      const { data } = await supabase
        .from("void_requests" as any)
        .select("id, sale_id, status")
        .in("sale_id", saleIds);
      return (data || []) as { id: string; sale_id: string; status: string }[];
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
                const hasActiveVoid = voidMap.has(sale.id);
                return (
                  <div
                    key={sale.id}
                    className={`flex items-center justify-between p-2 rounded-md text-xs ${
                      sale.is_cancelled ? "opacity-50 bg-muted/30" : "hover:bg-muted/50"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-muted-foreground font-mono w-10 shrink-0">
                        {format(new Date(sale.created_at), "HH:mm")}
                      </span>
                      <span className="font-medium">{formatCLP(sale.total_amount)}</span>
                      <Badge variant="secondary" className="text-[10px]">
                        {sale.payment_method === "cash" ? "Efectivo" : "Tarjeta"}
                      </Badge>
                      {getVoidBadge(sale.id, sale.is_cancelled)}
                    </div>
                    {!sale.is_cancelled && !hasActiveVoid && (
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
