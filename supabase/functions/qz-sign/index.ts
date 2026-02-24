import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Convert a PEM-encoded PKCS#8 private key to a CryptoKey for signing.
 */
async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const pemBody = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s/g, "");

  const binaryDer = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));

  return crypto.subtle.importKey(
    "pkcs8",
    binaryDer.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-512" },
    false,
    ["sign"],
  );
}

/**
 * Sign the payload with SHA-512 + RSA and return base64-encoded signature.
 */
async function signPayload(
  privateKey: CryptoKey,
  payload: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(payload);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, data);
  const bytes = new Uint8Array(signature);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { payload } = await req.json();
    if (!payload || typeof payload !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing payload string" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const pemKey = Deno.env.get("QZ_PRIVATE_KEY");
    if (!pemKey) {
      return new Response(
        JSON.stringify({ error: "QZ_PRIVATE_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const privateKey = await importPrivateKey(pemKey);
    const signature = await signPayload(privateKey, payload);

    return new Response(
      JSON.stringify({ signature }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[qz-sign] Error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Signing failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
