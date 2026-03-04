import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const pemBody = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s/g, "");
  const binaryStr = atob(pemBody);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return bytes.buffer;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    const payload = await req.text();
    if (!payload) {
      return new Response("Missing payload", { status: 400, headers: corsHeaders });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data, error } = await supabaseAdmin
      .schema("vault")
      .from("decrypted_secrets")
      .select("decrypted_secret")
      .eq("name", "QZ_PRIVATE_KEY")
      .single();
    if (error || !data?.decrypted_secret) {
      return new Response("QZ_PRIVATE_KEY not found in Vault", {
        status: 500, headers: corsHeaders,
      });
    }

    const privateKey = await crypto.subtle.importKey(
      "pkcs8",
      pemToArrayBuffer(data.decrypted_secret),
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"],
    );

    const signature = await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      privateKey,
      new TextEncoder().encode(payload),
    );

    const bytes = new Uint8Array(signature);
    let binary = "";
    for (const b of bytes) binary += String.fromCharCode(b);
    const b64 = btoa(binary);

    return new Response(b64, {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "text/plain" },
    });
  } catch (err) {
    console.error("[qz-sign] Error:", err);
    return new Response(err.message || "Signing failed", {
      status: 500, headers: corsHeaders,
    });
  }
});
