import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

interface DemoVenue {
  id: string;
  name: string;
  is_demo: boolean;
}

export function useDemoMode() {
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [demoVenue, setDemoVenue] = useState<DemoVenue | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkDemoMode();
  }, []);

  const checkDemoMode = async () => {
    try {
      // Check for Demo DiStock venue (NOT Berlín - that's production now)
      let { data: venue } = await supabase
        .from("venues")
        .select("id, name, is_demo")
        .eq("slug", "demo-distock")
        .single();

      if (venue) {
        setDemoVenue(venue);
        // Check if current user's profile is linked to demo venue
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("venue_id")
            .eq("id", user.id)
            .single();
          
          setIsDemoMode(profile?.venue_id === venue.id);
        }
      }
    } catch (error) {
      console.error("Error checking demo mode:", error);
    } finally {
      setLoading(false);
    }
  };

  const activateDemoMode = async () => {
    const { data, error } = await supabase.rpc("seed_demo_data");
    if (error) throw error;
    
    const result = data as { success: boolean; venue_id?: string; error?: string };
    if (result.success || result.error === "Demo venue already exists") {
      await checkDemoMode();
      return result;
    }
    throw new Error(result.error || "Failed to activate demo");
  };

  const resetDemoMode = async () => {
    const { data, error } = await supabase.rpc("reset_demo_data");
    if (error) throw error;
    
    const result = data as { success: boolean; error?: string };
    if (result.success) {
      await checkDemoMode();
      return result;
    }
    throw new Error(result.error || "Failed to reset demo");
  };

  return {
    isDemoMode,
    demoVenue,
    loading,
    activateDemoMode,
    resetDemoMode,
    refreshDemoStatus: checkDemoMode
  };
}
