import { PILOT_MODE, PILOT_VENUE_DISPLAY } from "@/lib/venue";
import { Badge } from "@/components/ui/badge";
import { MapPin } from "lucide-react";

/**
 * Discrete badge shown when pilot mode is active.
 * Renders nothing when PILOT_MODE is false.
 */
export function PilotBadge() {
  if (!PILOT_MODE) return null;

  return (
    <Badge
      variant="outline"
      className="gap-1.5 text-[10px] font-medium tracking-wide uppercase border-primary/30 text-primary bg-primary/5"
    >
      <MapPin className="w-3 h-3" />
      Piloto · {PILOT_VENUE_DISPLAY}
    </Badge>
  );
}
