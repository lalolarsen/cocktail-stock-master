import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAppSession } from "@/contexts/AppSessionContext";
import { Siren, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

interface EmergencyRow {
  id: string;
  product_id: string;
  location_id: string;
  requested_quantity: number;
  created_at: string;
  product_name?: string;
  location_name?: string;
}

interface Props {
  onNavigate?: (view: string) => void;
}

/**
 * Persistent banner + 5min reminder toast for pending emergency replenishment requests.
 * Lives at the top of the admin dashboard.
 */
export function EmergencyRequestsBanner({ onNavigate }: Props) {
  const { venue } = useAppSession();
  const [rows, setRows] = useState<EmergencyRow[]>([]);
  const reminderRef = useRef<number | null>(null);

  const fetchEmergencies = async () => {
    if (!venue?.id) return;
    const { data, error } = await supabase
      .from("replenishment_requests" as never)
      .select("id, product_id, location_id, requested_quantity, created_at")
      .eq("venue_id", venue.id)
      .eq("status", "pending")
      .eq("is_emergency", true)
      .order("created_at", { ascending: true });

    if (error || !data) return;
    const list = data as unknown as EmergencyRow[];

    if (list.length === 0) {
      setRows([]);
      return;
    }

    const productIds = [...new Set(list.map((r) => r.product_id))];
    const locationIds = [...new Set(list.map((r) => r.location_id))];

    const [{ data: products }, { data: locations }] = await Promise.all([
      supabase.from("products").select("id, name").in("id", productIds),
      supabase.from("stock_locations").select("id, name").in("id", locationIds),
    ]);

    const pMap = Object.fromEntries((products || []).map((p) => [p.id, p.name]));
    const lMap = Object.fromEntries((locations || []).map((l) => [l.id, l.name]));

    setRows(
      list.map((r) => ({
        ...r,
        product_name: pMap[r.product_id] || "Producto",
        location_name: lMap[r.location_id] || "Barra",
      }))
    );
  };

  useEffect(() => {
    fetchEmergencies();

    if (!venue?.id) return;
    const channel = supabase
      .channel(`emergency-requests-${venue.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "replenishment_requests",
          filter: `venue_id=eq.${venue.id}`,
        },
        (payload: any) => {
          fetchEmergencies();
          if (
            payload.eventType === "INSERT" &&
            payload.new?.is_emergency === true &&
            payload.new?.status === "pending"
          ) {
            toast.error("🚨 Nueva emergencia de reposición", {
              description: "Un bartender solicitó stock urgente. Revísalo en 'Reposición'.",
              duration: 8000,
              action: { label: "Ir", onClick: () => onNavigate?.("replenishment") },
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [venue?.id]);

  // Persistent reminder: every 5 minutes if there are still pending emergencies
  useEffect(() => {
    if (reminderRef.current) {
      window.clearInterval(reminderRef.current);
      reminderRef.current = null;
    }
    if (rows.length === 0) return;

    reminderRef.current = window.setInterval(() => {
      toast.warning(`⏰ ${rows.length} emergencia(s) sin atender`, {
        description: "Revisa las solicitudes de reposición urgentes.",
        duration: 6000,
      });
    }, 5 * 60 * 1000);

    return () => {
      if (reminderRef.current) {
        window.clearInterval(reminderRef.current);
        reminderRef.current = null;
      }
    };
  }, [rows.length]);

  if (rows.length === 0) return null;

  const oldest = rows[0];
  const oldestAge = formatDistanceToNow(new Date(oldest.created_at), {
    addSuffix: false,
    locale: es,
  });

  return (
    <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 shadow-[0_0_20px_hsl(var(--destructive)/0.2)]">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-full bg-destructive/20 shrink-0">
            <Siren className="h-5 w-5 text-destructive" />
          </div>
          <div className="space-y-1 min-w-0">
            <p className="font-semibold text-destructive text-sm">
              🚨 {rows.length} emergencia{rows.length > 1 ? "s" : ""} de reposición pendiente
              {rows.length > 1 ? "s" : ""}
            </p>
            <p className="text-xs text-muted-foreground">
              Más antigua: <strong>{oldest.product_name}</strong> en{" "}
              <strong>{oldest.location_name}</strong> hace {oldestAge}.
            </p>
          </div>
        </div>
        <Button
          size="sm"
          variant="destructive"
          onClick={() => onNavigate?.("replenishment")}
          className="shrink-0"
        >
          Atender ahora <ArrowRight className="w-3.5 h-3.5 ml-1" />
        </Button>
      </div>
    </div>
  );
}
