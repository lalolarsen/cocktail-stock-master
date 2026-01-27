import { MapPin } from "lucide-react";
import { useActiveVenue } from "@/hooks/useActiveVenue";
import { Skeleton } from "@/components/ui/skeleton";

interface VenueIndicatorProps {
  variant?: "header" | "sidebar";
  className?: string;
}

export function VenueIndicator({ variant = "header", className = "" }: VenueIndicatorProps) {
  const { displayName, isLoading, error } = useActiveVenue();

  if (isLoading) {
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

  if (variant === "sidebar") {
    return (
      <div className={`flex items-center gap-2 px-2 py-1.5 rounded-lg bg-primary/10 text-primary ${className}`}>
        <MapPin className="w-4 h-4 shrink-0" />
        <span className="text-sm font-medium truncate">{displayName}</span>
      </div>
    );
  }

  // Header variant (default)
  return (
    <div className={`flex items-center gap-1.5 text-muted-foreground ${className}`}>
      <MapPin className="w-4 h-4 shrink-0" />
      <span className="text-sm font-medium">{displayName}</span>
    </div>
  );
}
