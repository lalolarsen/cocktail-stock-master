import { ReactNode } from "react";

interface VenueGuardProps {
  children: ReactNode;
}

/**
 * Single-venue mode — passthrough. Kept as a component to preserve
 * call sites; the original multi-venue error/loading screen is no longer needed.
 */
export function VenueGuard({ children }: VenueGuardProps) {
  return <>{children}</>;
}
