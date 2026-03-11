import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const pemBody = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\\n/g, "")
    .replace(/\n/g, "")
    .replace(/\r/g, "")
    .replace(/\s/g, "")
    .trim();
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
    console.log("[qz-sign] Payload preview:", JSON.stringify(payload.substring(0, 50)));

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/get_qz_secret`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ secret_name: "QZ_PRIVATE_KEY" }),
    });
    const pemRaw = await res.text();
    const pemKey = pemRaw.replace(/^"|"$/g, "").replace(/\\n/g, "\n");
    if (!pemKey || pemKey.includes("error")) {
      return new Response("QZ_PRIVATE_KEY not found", {
        status: 500,
        headers: corsHeaders,
      });
    }
    const first50 = pemKey.substring(0, 50);
    const lastChars = pemKey.substring(pemKey.length - 30);
    const hasCarriageReturn = pemKey.includes("\r");
    const hasLiteralBackslashN = pemKey.includes("\\n");
    console.log("[qz-sign] PEM first50:", JSON.stringify(first50));
    console.log("[qz-sign] PEM last30:", JSON.stringify(lastChars));
    console.log("[qz-sign] hasCarriageReturn:", hasCarriageReturn);
    console.log("[qz-sign] hasLiteralBackslashN:", hasLiteralBackslashN);
    console.log("[qz-sign] total length:", pemKey.length);

    const privateKey = await crypto.subtle.importKey(
      "pkcs8",
      pemToArrayBuffer(pemKey),
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, new TextEncoder().encode(payload));
    const bytes = new Uint8Array(signature);
    let binary = "";
    for (const b of bytes) binary += String.fromCharCode(b);

    const signatureBase64 = btoa(binary).replace(/\s+/g, "").trim();
    if (!/^[A-Za-z0-9+/=]+$/.test(signatureBase64)) {
      console.error("[qz-sign] Invalid base64 signature generated");
      return new Response("Invalid signature format", {
        status: 500,
        headers: corsHeaders,
      });
    }

    console.log("[qz-sign] Signature preview:", signatureBase64.substring(0, 50));
    console.log("[qz-sign] Signature length:", signatureBase64.length);

    return new Response(signatureBase64, {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "text/plain" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Signing failed";
    console.error("[qz-sign] Error:", message);
    return new Response(message, {
      status: 500,
      headers: corsHeaders,
    });
  }
});
