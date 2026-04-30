import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAppSession } from "@/contexts/AppSessionContext";
import { ClipboardList, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  onNavigate?: (view: string) => void;
}

/**
 * Persistent badge showing pending blind shift counts at top of dashboard.
 * Shown only when count > 0.
 */
export function PendingShiftCountsBanner({ onNavigate }: Props) {
  const { venue } = useAppSession();
  const [count, setCount] = useState(0);

  const refresh = async () => {
    if (!venue?.id) return;
    const { count: c } = await supabase
      .from("blind_shift_counts")
      .select("*", { count: "exact", head: true })
      .eq("venue_id", venue.id)
      .eq("admin_decision", "pending");
    setCount(c || 0);
  };

  useEffect(() => {
    refresh();
    if (!venue?.id) return;
    const channel = supabase
      .channel(`pending-shift-counts-${venue.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "blind_shift_counts",
          filter: `venue_id=eq.${venue.id}`,
        },
        () => refresh()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [venue?.id]);

  if (count === 0) return null;

  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-full bg-amber-500/20 shrink-0">
            <ClipboardList className="h-5 w-5 text-amber-500" />
          </div>
          <div className="space-y-1 min-w-0">
            <p className="font-semibold text-amber-400 text-sm">
              {count} conteo{count > 1 ? "s" : ""} de cierre pendiente{count > 1 ? "s" : ""}
            </p>
            <p className="text-xs text-muted-foreground">
              Resuélvelos antes de abrir la próxima jornada — la apertura está bloqueada hasta entonces.
            </p>
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onNavigate?.("shift-counts")}
          className="border-amber-500/40 text-amber-400 hover:bg-amber-500/10 shrink-0"
        >
          Revisar <ArrowRight className="w-3.5 h-3.5 ml-1" />
        </Button>
      </div>
    </div>
  );
}
