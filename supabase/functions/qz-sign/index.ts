import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    const payload = await req.text();
    if (!payload) {
      return new Response("Missing payload", { status: 400, headers: corsHeaders });
    }
    const pemKey = Deno.env.get("QZ_PRIVATE_KEY");
    if (!pemKey) {
      return new Response("QZ_PRIVATE_KEY not configured", {
        status: 500, headers: corsHeaders,
      });
    }
    const privateKey = await crypto.subtle.importKey(
      "pkcs8",
      pemToArrayBuffer(pemKey),
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
    return new Response(btoa(binary), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "text/plain" },
    });
  } catch (err) {
    return new Response(err.message || "Signing failed", {
      status: 500, headers: corsHeaders,
    });
  }
});
