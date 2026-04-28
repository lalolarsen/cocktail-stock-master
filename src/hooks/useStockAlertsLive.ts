import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * Suscripción en vivo a stock_alerts del venue.
 * Muestra toast cuando llega una alerta nueva (count_variance, low_stock, etc.).
 */
export function useStockAlertsLive(venueId: string | null | undefined) {
  const mountedAtRef = useRef<number>(Date.now());

  useEffect(() => {
    if (!venueId) return;
    mountedAtRef.current = Date.now();

    const channel = supabase
      .channel(`stock-alerts-${venueId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "stock_alerts",
          filter: `venue_id=eq.${venueId}`,
        },
        (payload: any) => {
          // Ignore alerts that existed before mount (avoid spam on refresh)
          const createdAt = payload?.new?.created_at
            ? new Date(payload.new.created_at).getTime()
            : Date.now();
          if (createdAt < mountedAtRef.current - 5000) return;

          const message = payload?.new?.message ?? "Nueva alerta de stock";
          const type = payload?.new?.alert_type ?? "alert";
          if (type === "count_variance") {
            toast.warning("Diferencia en conteo", { description: message, duration: 8000 });
          } else {
            toast.info("Alerta de stock", { description: message, duration: 6000 });
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [venueId]);
}
