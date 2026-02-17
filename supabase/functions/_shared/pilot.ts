/**
 * Pilot-mode constants shared across all edge functions.
 *
 * When PILOT_MODE is true every write/read is locked to PILOT_VENUE_ID.
 * To disable, set PILOT_MODE = false and redeploy.
 */
export const PILOT_MODE = true;
export const PILOT_VENUE_ID = "4e128e76-980d-4233-a438-92aa02cfb50b";

/**
 * Returns the pilot venue id or throws if the incoming venueId doesn't match.
 */
export function enforcePilotVenue(venueId?: string | null): string {
  if (!PILOT_MODE) return venueId || PILOT_VENUE_ID;
  if (venueId && venueId !== PILOT_VENUE_ID) {
    throw new Error("Pilot mode: only Berlín is enabled");
  }
  return PILOT_VENUE_ID;
}
