// Single-venue mode: returns hardcoded venue constants
import { DEFAULT_VENUE_ID, DEFAULT_VENUE_NAME, DEFAULT_VENUE_SLUG, DEFAULT_VENUE_DISPLAY } from "@/lib/venue";

export interface ActiveVenue {
  id: string;
  name: string;
  slug: string;
  isDemo: boolean;
}

interface UseActiveVenueReturn {
  venue: ActiveVenue | null;
  isLoading: boolean;
  error: string | null;
  displayName: string | null;
  isDemo: boolean;
}

export function useActiveVenue(): UseActiveVenueReturn {
  return {
    venue: {
      id: DEFAULT_VENUE_ID,
      name: DEFAULT_VENUE_NAME,
      slug: DEFAULT_VENUE_SLUG,
      isDemo: false,
    },
    isLoading: false,
    error: null,
    displayName: DEFAULT_VENUE_DISPLAY,
    isDemo: false,
  };
}
