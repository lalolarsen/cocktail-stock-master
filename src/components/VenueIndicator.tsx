import { MapPin } from "lucide-react";
import { useActiveVenue } from "@/hooks/useActiveVenue";
import { useUserRole, AppRole } from "@/hooks/useUserRole";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

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
  const { displayName, isLoading, error, isDemo } = useActiveVenue();
  const { role, loading: roleLoading } = useUserRole();

  if (isLoading || roleLoading) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <Skeleton className="h-4 w-4 rounded-full" />
        <Skeleton className="h-4 w-24" />
      </div>
    );
  }

  if (error || !displayName) {
    return null; // Error is handled by VenueGuard
  }

  const roleLabel = role ? ROLE_LABELS[role] : null;

  if (variant === "sidebar") {
    return (
      <div className={`space-y-2 ${className}`}>
        <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-muted/50 text-foreground">
          <MapPin className="w-4 h-4 shrink-0 text-muted-foreground" />
          <span className="text-sm font-medium truncate">{displayName}</span>
          {isDemo && (
            <Badge variant="secondary" className="text-xs bg-amber-500/20 text-amber-600 dark:text-amber-400">
              DEMO
            </Badge>
          )}
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
      {isDemo && (
        <Badge variant="secondary" className="text-xs bg-amber-500/20 text-amber-600 dark:text-amber-400 ml-1">
          DEMO
        </Badge>
      )}
    </div>
  );
}
