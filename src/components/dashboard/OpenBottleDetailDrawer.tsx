import { useQuery } from "@tanstack/react-query";
import { openBottleEventsTable } from "@/lib/db-tables";
import { format, formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Wine, Clock, ArrowRight } from "lucide-react";
import type { OpenBottleRow } from "./OpenBottlesMonitor";

// ─── Types ────────────────────────────────────────────────────────────────────

interface BottleEvent {
  id: string;
  event_type: string;
  delta_ml: number;
  before_ml: number;
  after_ml: number;
  created_at: string;
  reason: string | null;
  actor_user_id: string;
  actor_name?: string;
}

// ─── Event type label ────────────────────────────────────────────────────────

const EVENT_LABEL: Record<string, string> = {
  OPENED: "Botella abierta",
  REDEEM_DEDUCT: "Descuento por canje",
  MANUAL_ADJUST: "Ajuste manual",
  COUNT: "Conteo",
  CLOSE_BOTTLE: "Botella cerrada",
};

const EVENT_VARIANT: Record<string, "default" | "secondary" | "destructive"> = {
  OPENED: "default",
  REDEEM_DEDUCT: "secondary",
  MANUAL_ADJUST: "default",
  COUNT: "secondary",
  CLOSE_BOTTLE: "destructive",
};

// ─── Data ─────────────────────────────────────────────────────────────────────

interface BottleEventRow extends BottleEvent {
  profiles: { full_name: string } | null;
}

async function fetchEvents(bottleId: string): Promise<BottleEvent[]> {
  const { data, error } = await openBottleEventsTable()
    .select(`
      id, event_type, delta_ml, before_ml, after_ml,
      created_at, reason, actor_user_id,
      profiles:actor_user_id(full_name)
    `)
    .eq("open_bottle_id", bottleId)
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) throw error;

  return ((data ?? []) as unknown as BottleEventRow[]).map((e) => ({
    ...e,
    actor_name: e.profiles?.full_name ?? e.actor_user_id?.slice(0, 8) ?? "—",
  }));
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  bottle: OpenBottleRow | null;
  onClose: () => void;
}

export function OpenBottleDetailDrawer({ bottle, onClose }: Props) {
  const { data: events = [], isLoading } = useQuery({
    queryKey: ["open-bottle-events", bottle?.id],
    queryFn: () => fetchEvents(bottle!.id),
    enabled: !!bottle?.id,
    staleTime: 30_000,
  });

  if (!bottle) return null;

  const pct =
    bottle.initial_ml > 0
      ? Math.round((bottle.remaining_ml / bottle.initial_ml) * 100)
      : 0;

  return (
    <Sheet open={!!bottle} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="mb-4">
          <SheetTitle className="flex items-center gap-2">
            <Wine className="w-5 h-5 text-primary" />
            Detalle de Botella
          </SheetTitle>
          <SheetDescription>
            Información de auditoría — solo lectura
          </SheetDescription>
        </SheetHeader>

        {/* Info card */}
        <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3 mb-5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-semibold text-foreground">{bottle.product_name}</p>
              <p className="text-sm text-muted-foreground">{bottle.location_name}</p>
            </div>
            <Badge variant={bottle.status === "OPEN" ? "default" : "secondary"}>
              {bottle.status === "OPEN" ? "Abierta" : "Cerrada"}
            </Badge>
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Etiqueta</p>
              <p className="font-medium">{bottle.label_code ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">% restante</p>
              <p className="font-medium">{pct}%</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Capacidad inicial</p>
              <p className="font-medium">{bottle.initial_ml} ml</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Restante actual</p>
              <p className="font-medium">{bottle.remaining_ml} ml</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Abierta desde</p>
              <p className="font-medium">
                {format(new Date(bottle.opened_at), "dd/MM/yyyy HH:mm")}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Abierta por</p>
              <p className="font-medium">{bottle.opened_by_name}</p>
            </div>
            {bottle.last_counted_at && (
              <>
                <div>
                  <p className="text-xs text-muted-foreground">Último conteo</p>
                  <p className="font-medium">
                    {format(new Date(bottle.last_counted_at), "dd/MM HH:mm")}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">ml contados</p>
                  <p className="font-medium">{bottle.last_counted_ml ?? "—"} ml</p>
                </div>
              </>
            )}
          </div>
        </div>

        <Separator className="mb-4" />

        {/* Events */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Últimos eventos</h3>
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : events.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Sin eventos registrados.
            </p>
          ) : (
            <div className="space-y-2">
              {events.map((ev) => (
                <div
                  key={ev.id}
                  className="rounded-md border border-border bg-background p-3 space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <Badge
                      variant={EVENT_VARIANT[ev.event_type] ?? "secondary"}
                      className="text-xs"
                    >
                      {EVENT_LABEL[ev.event_type] ?? ev.event_type}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(ev.created_at), {
                        locale: es,
                        addSuffix: true,
                      })}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 text-sm font-mono">
                    <span className="text-muted-foreground">{ev.before_ml} ml</span>
                    <ArrowRight className="w-3 h-3 text-muted-foreground" />
                    <span className="text-foreground">{ev.after_ml} ml</span>
                    <span
                      className={`ml-1 text-xs ${
                        ev.delta_ml < 0 ? "text-destructive" : "text-primary"
                      }`}
                    >
                      ({ev.delta_ml > 0 ? "+" : ""}
                      {ev.delta_ml} ml)
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{ev.reason ?? "—"}</span>
                    <span>{ev.actor_name}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
