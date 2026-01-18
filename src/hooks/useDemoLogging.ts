import { supabase } from "@/integrations/supabase/client";
import { useDemoMode } from "./useDemoMode";
import type { Json } from "@/integrations/supabase/types";

interface DemoEventPayload {
  event_type: string;
  user_role?: string;
  payload?: Json;
}

export function useDemoLogging() {
  const { isDemoMode, demoVenue } = useDemoMode();

  const logDemoEvent = async ({ event_type, user_role, payload = {} }: DemoEventPayload) => {
    if (!isDemoMode || !demoVenue) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      await supabase.from("demo_event_logs").insert([{
        venue_id: demoVenue.id,
        event_type,
        user_role: user_role || null,
        user_id: user?.id || null,
        payload,
      }]);
    } catch (error) {
      // Fail silently - demo logging should not block operations
      console.error("Demo logging failed:", error);
    }
  };

  return { logDemoEvent, isDemoMode };
}
