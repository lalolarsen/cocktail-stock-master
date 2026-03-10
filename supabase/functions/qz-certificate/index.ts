import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/get_qz_secret`, {
      method: "POST",
      headers: {
        "apikey": serviceKey,
        "Authorization": `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ secret_name: "QZ_CERTIFICATE" }),
    });
    const cert = await res.text();
    if (!cert || cert.includes("error")) {
      return new Response("QZ_CERTIFICATE not found", {
        status: 500, headers: corsHeaders,
      });
    }
    return new Response(cert.replace(/^"|"$/g, "").replace(/\\n/g, "\n"), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "text/plain" },
    });
  } catch (err) {
    return new Response(err.message || "Error", {
      status: 500, headers: corsHeaders,
    });
  }
});
