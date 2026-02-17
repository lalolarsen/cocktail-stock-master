/**
 * Pilot Mode — Single-venue lock.
 *
 * When PILOT_MODE is true the entire app is scoped to PILOT_VENUE_ID.
 * Set PILOT_MODE to false to restore multi-venue behaviour.
 */
export const PILOT_MODE = true;

export const PILOT_VENUE_ID  = "4e128e76-980d-4233-a438-92aa02cfb50b";
export const PILOT_VENUE_NAME = "Berlín Valdivia";
export const PILOT_VENUE_SLUG = "berlin-valdivia";
export const PILOT_VENUE_DISPLAY = "Berlín – Valdivia";

// Backward-compat aliases (used across codebase)
export const DEFAULT_VENUE_ID      = PILOT_VENUE_ID;
export const DEFAULT_VENUE_NAME    = PILOT_VENUE_NAME;
export const DEFAULT_VENUE_SLUG    = PILOT_VENUE_SLUG;
export const DEFAULT_VENUE_DISPLAY = PILOT_VENUE_DISPLAY;

/**
 * Guard: throws if a venue_id doesn't match the pilot venue while pilot mode is on.
 */
export function assertPilotVenue(venueId: string | null | undefined): string {
  if (!PILOT_MODE) return venueId || PILOT_VENUE_ID;
  if (venueId && venueId !== PILOT_VENUE_ID) {
    throw new Error("Pilot mode: only Berlín is enabled");
  }
  return PILOT_VENUE_ID;
}
