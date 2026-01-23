import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { CheckCircle2, XCircle, AlertTriangle, Clock, MapPin } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type RedemptionLogEntry = {
  id: string;
  result: string;
  redeemed_at: string;
  created_at: string;
  pos_id: string | null;
  metadata: {
    deliver?: {
      name?: string;
      quantity?: number;
      source?: string;
      sale_number?: string;
      ticket_number?: string;
      items?: { name: string; quantity: number }[];
    };
    missing?: { product_name: string }[];
    bar_name?: string;
  } | null;
};

interface RedemptionHistoryProps {
  barLocationId: string;
  refreshTrigger: number;
}

const REFRESH_INTERVAL_MS = 15000;

function getResultInfo(result: string) {
  switch (result) {
    case "success":
      return { 
        label: "Entregado", 
        icon: CheckCircle2, 
        className: "bg-green-500/20 text-green-400 border-green-500/30" 
      };
    case "already_redeemed":
      return { 
        label: "Ya usado", 
        icon: AlertTriangle, 
        className: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" 
      };
    case "stock_error":
      return { 
        label: "Sin stock", 
        icon: XCircle, 
        className: "bg-red-500/20 text-red-400 border-red-500/30" 
      };
    case "expired":
      return { 
        label: "Expirado", 
        icon: Clock, 
        className: "bg-orange-500/20 text-orange-400 border-orange-500/30" 
      };
    case "cancelled":
      return { 
        label: "Cancelado", 
        icon: XCircle, 
        className: "bg-gray-500/20 text-gray-400 border-gray-500/30" 
      };
    default:
      return { 
        label: "Inválido", 
        icon: XCircle, 
        className: "bg-muted text-muted-foreground border-muted" 
      };
  }
}

function getItemDisplay(metadata: RedemptionLogEntry["metadata"]): { name: string; quantity: number; items?: { name: string; quantity: number }[] } {
  if (!metadata?.deliver) return { name: "—", quantity: 0 };
  
  const deliver = metadata.deliver;
  
  if (deliver.name) {
    return { name: deliver.name, quantity: deliver.quantity || 1 };
  }
  
  if (deliver.items && deliver.items.length > 0) {
    if (deliver.items.length === 1) {
      return { name: deliver.items[0].name, quantity: deliver.items[0].quantity };
    }
    const totalQty = deliver.items.reduce((sum, item) => sum + item.quantity, 0);
    return { name: `${deliver.items.length} items`, quantity: totalQty, items: deliver.items };
  }
  
  return { name: "—", quantity: 0 };
}

function getSourceLabel(metadata: RedemptionLogEntry["metadata"]): string | null {
  if (!metadata?.deliver?.source) return null;
  return metadata.deliver.source === "ticket" ? "Cover" : "Caja";
}

function getOrderNumber(metadata: RedemptionLogEntry["metadata"]): string | null {
  if (!metadata?.deliver) return null;
  return metadata.deliver.sale_number || metadata.deliver.ticket_number || null;
}

export function RedemptionHistory({ barLocationId, refreshTrigger }: RedemptionHistoryProps) {
  const [entries, setEntries] = useState<RedemptionLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchHistory = async () => {
    if (!barLocationId) return;
    
    const { data, error } = await supabase
      .from("pickup_redemptions_log")
      .select("id, result, redeemed_at, created_at, pos_id, metadata")
      .eq("pos_id", barLocationId)
      .order("created_at", { ascending: false })
      .limit(20);
    
    if (!error && data) {
      setEntries(data as RedemptionLogEntry[]);
    }
    setLoading(false);
  };

  // Fetch on mount and when refreshTrigger changes
  useEffect(() => {
    fetchHistory();
  }, [barLocationId, refreshTrigger]);

  // Periodic refresh
  useEffect(() => {
    const interval = setInterval(fetchHistory, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [barLocationId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <Clock className="w-5 h-5 animate-pulse mr-2" />
        <span>Cargando historial...</span>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <Clock className="w-8 h-8 mb-2 opacity-50" />
        <span>Sin canjes recientes</span>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="space-y-2 pr-2">
        {entries.map((entry, index) => {
          const resultInfo = getResultInfo(entry.result);
          const Icon = resultInfo.icon;
          const itemDisplay = getItemDisplay(entry.metadata);
          const source = getSourceLabel(entry.metadata);
          const orderNumber = getOrderNumber(entry.metadata);
          const isNewest = index === 0;
          
          return (
            <div
              key={entry.id}
              className={cn(
                "p-3 rounded-lg border transition-colors",
                isNewest 
                  ? "bg-accent/50 border-accent" 
                  : "bg-card/50 border-border/50"
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Icon className={cn("w-4 h-4 flex-shrink-0", 
                    entry.result === "success" ? "text-green-400" :
                    entry.result === "already_redeemed" ? "text-yellow-400" : 
                    entry.result === "expired" ? "text-orange-400" : "text-red-400"
                  )} />
                  <span className="font-medium text-foreground truncate text-sm">
                    {itemDisplay.name}
                  </span>
                  {itemDisplay.quantity > 0 && (
                    <span className="text-xs bg-muted px-1.5 py-0.5 rounded font-medium">
                      x{itemDisplay.quantity}
                    </span>
                  )}
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {format(new Date(entry.created_at), "HH:mm", { locale: es })}
                </span>
              </div>
              
              {/* Multi-item details */}
              {itemDisplay.items && itemDisplay.items.length > 1 && (
                <div className="mt-1.5 pl-6 space-y-0.5">
                  {itemDisplay.items.slice(0, 3).map((item, idx) => (
                    <div key={idx} className="text-xs text-muted-foreground flex justify-between">
                      <span>{item.name}</span>
                      <span>x{item.quantity}</span>
                    </div>
                  ))}
                  {itemDisplay.items.length > 3 && (
                    <span className="text-xs text-muted-foreground">+{itemDisplay.items.length - 3} más</span>
                  )}
                </div>
              )}
              
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <Badge 
                  variant="outline" 
                  className={cn("text-xs py-0 h-5", resultInfo.className)}
                >
                  {resultInfo.label}
                </Badge>
                {source && (
                  <span className="text-xs text-muted-foreground">
                    {source}
                  </span>
                )}
                {orderNumber && (
                  <span className="text-xs text-muted-foreground font-mono">
                    #{orderNumber}
                  </span>
                )}
                {entry.result === "stock_error" && entry.metadata?.missing?.[0] && (
                  <span className="text-xs text-red-400 truncate">
                    Falta: {entry.metadata.missing[0].product_name}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}
