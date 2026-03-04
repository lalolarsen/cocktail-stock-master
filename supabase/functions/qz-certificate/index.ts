import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data, error } = await supabaseAdmin
      .schema("vault")
      .from("decrypted_secrets")
      .select("decrypted_secret")
      .eq("name", "QZ_CERTIFICATE")
      .single();
    if (error || !data?.decrypted_secret) {
      return new Response("QZ_CERTIFICATE not found in Vault", {
        status: 500, headers: corsHeaders,
      });
    }
    return new Response(data.decrypted_secret, {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "text/plain" },
    });
  } catch (err) {
    return new Response(err.message || "Error", {
      status: 500, headers: corsHeaders,
    });
  }
});
