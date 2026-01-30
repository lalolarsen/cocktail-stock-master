// Re-export from centralized context for backwards compatibility
import { useAppSession } from "@/contexts/AppSessionContext";
import type { ActiveVenue } from "@/contexts/AppSessionContext";

export type { ActiveVenue };

interface UseActiveVenueReturn {
  venue: ActiveVenue | null;
  isLoading: boolean;
  error: string | null;
  displayName: string | null;
  isDemo: boolean;
}

export function useActiveVenue(): UseActiveVenueReturn {
  const { venue, isLoading, venueError, displayName, isDemo } = useAppSession();
  
  return {
    venue,
    isLoading,
    error: venueError,
    displayName,
    isDemo,
  };
}
