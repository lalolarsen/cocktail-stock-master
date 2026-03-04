import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  const cert = Deno.env.get("QZ_CERTIFICATE");
  if (!cert) {
    return new Response("QZ_CERTIFICATE not configured", {
      status: 500, headers: corsHeaders,
    });
  }
  return new Response(cert, {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "text/plain" },
  });
});
