/**
 * Single-venue mode — STOCKIA es una instancia dedicada a Berlín Valdivia.
 *
 * Todas las queries, inserts y RLS asumen este único venue. La columna
 * `venue_id` se mantiene en la base de datos por compatibilidad histórica
 * y para permitir revertir a multi-venue en el futuro sin migrar datos.
 */
export const BERLIN_VENUE_ID = "4e128e76-980d-4233-a438-92aa02cfb50b";
export const BERLIN_VENUE_NAME = "Berlín Valdivia";
export const BERLIN_VENUE_SLUG = "berlin-valdivia";
export const BERLIN_VENUE_DISPLAY = "Berlín – Valdivia";

// Backward-compat aliases (used across the codebase)
export const VENUE_ID = BERLIN_VENUE_ID;
export const DEFAULT_VENUE_ID = BERLIN_VENUE_ID;
export const DEFAULT_VENUE_NAME = BERLIN_VENUE_NAME;
export const DEFAULT_VENUE_SLUG = BERLIN_VENUE_SLUG;
export const DEFAULT_VENUE_DISPLAY = BERLIN_VENUE_DISPLAY;

// Pilot-mode aliases kept temporarily for legacy imports
export const PILOT_VENUE_ID = BERLIN_VENUE_ID;
export const PILOT_VENUE_NAME = BERLIN_VENUE_NAME;
export const PILOT_VENUE_SLUG = BERLIN_VENUE_SLUG;
export const PILOT_VENUE_DISPLAY = BERLIN_VENUE_DISPLAY;
