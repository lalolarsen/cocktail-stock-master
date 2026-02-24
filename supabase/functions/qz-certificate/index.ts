import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const cert = Deno.env.get("QZ_CERTIFICATE");
  if (!cert) {
    return new Response(
      JSON.stringify({ error: "QZ_CERTIFICATE not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  return new Response(cert, {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "text/plain" },
  });
});
