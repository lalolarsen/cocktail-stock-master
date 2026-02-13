import { MapPin } from "lucide-react";
import { useUserRole, AppRole } from "@/hooks/useUserRole";
import { Badge } from "@/components/ui/badge";
import { DEFAULT_VENUE_DISPLAY } from "@/lib/venue";

interface VenueIndicatorProps {
  variant?: "header" | "sidebar";
  className?: string;
  showRole?: boolean;
}

// Human-readable role labels
const ROLE_LABELS: Record<AppRole, string> = {
  admin: "Admin",
  gerencia: "Gerencia",
  vendedor: "Vendedor",
  bar: "Bartender",
  ticket_seller: "Tickets",
  developer: "Developer",
};

export function VenueIndicator({ variant = "header", className = "", showRole = false }: VenueIndicatorProps) {
  const { role, loading: roleLoading } = useUserRole();

  const displayName = DEFAULT_VENUE_DISPLAY;

  const roleLabel = role ? ROLE_LABELS[role] : null;

  if (variant === "sidebar") {
    return (
      <div className={`space-y-2 ${className}`}>
        <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-muted/50 text-foreground">
          <MapPin className="w-4 h-4 shrink-0 text-muted-foreground" />
          <span className="text-sm font-medium truncate">{displayName}</span>
        </div>
        {showRole && roleLabel && (
          <div className="px-2">
            <Badge variant="outline" className="text-xs font-normal">
              {roleLabel}
            </Badge>
          </div>
        )}
      </div>
    );
  }

  // Header variant (default)
  return (
    <div className={`flex items-center gap-2 text-muted-foreground ${className}`}>
      <MapPin className="w-4 h-4 shrink-0" />
      <span className="text-sm font-medium">{displayName}</span>
      {showRole && roleLabel && (
        <Badge variant="outline" className="text-xs font-normal ml-1">
          {roleLabel}
        </Badge>
      )}
    </div>
  );
}
