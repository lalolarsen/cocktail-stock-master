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
    const certRaw = await res.text();
    if (!certRaw || certRaw.includes("error")) {
      return new Response("QZ_CERTIFICATE not found", {
        status: 500, headers: corsHeaders,
      });
    }

    const normalizedCert = certRaw
      .replace(/^"|"$/g, "")
      .replace(/\\\\n/g, "\n")
      .replace(/\\n/g, "\n")
      .replace(/\r/g, "")
      .trim();

    return new Response(normalizedCert, {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "text/plain" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error";
    return new Response(message, {
      status: 500, headers: corsHeaders,
    });
  }
});
