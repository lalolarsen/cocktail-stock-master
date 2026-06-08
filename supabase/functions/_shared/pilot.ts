/**
 * Single-venue mode — STOCKIA es una instancia dedicada a Berlín Valdivia.
 * Estas constantes se mantienen como única fuente de verdad del venue.
 */
export const BERLIN_VENUE_ID = "4e128e76-980d-4233-a438-92aa02cfb50b";
export const PILOT_VENUE_ID = BERLIN_VENUE_ID;

/**
 * Devuelve siempre el venue de Berlín. Conservada como helper compatible
 * con call sites legacy. Ya no valida ni lanza errores.
 */
export function enforcePilotVenue(_venueId?: string | null): string {
  return BERLIN_VENUE_ID;
}
