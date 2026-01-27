import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface ActiveVenue {
  id: string;
  name: string;
  slug: string;
}

interface UseActiveVenueReturn {
  venue: ActiveVenue | null;
  isLoading: boolean;
  error: string | null;
  displayName: string | null;
}

export function useActiveVenue(): UseActiveVenueReturn {
  const [venue, setVenue] = useState<ActiveVenue | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchVenue = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Get current user
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setError("No hay usuario autenticado");
          setIsLoading(false);
          return;
        }

        // Get user's venue_id from profile
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("venue_id")
          .eq("id", user.id)
          .single();

        if (profileError || !profile?.venue_id) {
          setError("No se encontró venue asignado al usuario");
          setIsLoading(false);
          return;
        }

        // Fetch venue details
        const { data: venueData, error: venueError } = await supabase
          .from("venues")
          .select("id, name, slug")
          .eq("id", profile.venue_id)
          .single();

        if (venueError || !venueData) {
          setError("No se pudo cargar la información del venue");
          setIsLoading(false);
          return;
        }

        setVenue({
          id: venueData.id,
          name: venueData.name,
          slug: venueData.slug,
        });
      } catch (err) {
        console.error("Error fetching active venue:", err);
        setError("Error al cargar el venue activo");
      } finally {
        setIsLoading(false);
      }
    };

    fetchVenue();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      fetchVenue();
    });

    return () => subscription.unsubscribe();
  }, []);

  // Parse display name - split by space to get "Berlín – Valdivia" format if name contains location
  // Example: "Berlín Valdivia" → "Berlín – Valdivia"
  const displayName = venue
    ? formatVenueName(venue.name)
    : null;

  return { venue, isLoading, error, displayName };
}

// Format venue name: "Berlín Valdivia" → "Berlín – Valdivia"
function formatVenueName(name: string): string {
  // Split by space and join with dash if we have 2 parts
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    const venueName = parts[0];
    const location = parts.slice(1).join(" ");
    return `${venueName} – ${location}`;
  }
  return name;
}
