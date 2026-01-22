import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// DEPRECATED: This edge function is no longer used.
// Jornadas are now manual-only (v1):
// - Only admins can open/close jornadas via UI
// - No automation, no schedules, no auto-close
// - Use the open_jornada_manual() and close_jornada_manual() RPC functions instead

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Return a message indicating this function is deprecated
  return new Response(
    JSON.stringify({
      deprecated: true,
      message: "Jornadas are now manual-only. Use open_jornada_manual() and close_jornada_manual() RPC functions instead.",
      action: "none",
    }),
    {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
});
