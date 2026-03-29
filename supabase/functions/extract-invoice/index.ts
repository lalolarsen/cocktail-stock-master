import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { enforcePilotVenue } from "../_shared/pilot.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * SIMPLIFIED INVOICE EXTRACTOR
 * - Only inventory lines (ignores freight/expenses)
 * - Auto-maps Mixers → "Mixer Tradicional" and RedBull → "Redbulls"
 * - Calculates net COGS per product (ignores IVA and specific taxes)
 */

// Patterns for auto-mapping
const MIXER_PATTERNS = /\b(mixer|schweppes|canada\s*dry|ginger\s*ale|tonic|t[oó]nica|soda|sprite|coca[\s-]?cola|fanta|seven\s*up|7\s*up|agua\s*mineral|jugo|naranja|pomelo|lim[oó]n)\b/i;
const REDBULL_PATTERNS = /\b(red\s*bull|redbull|red-bull)\b/i;
const FREIGHT_PATTERNS = /flete|despacho|transporte|entrega|env[ií]o|envio|reparto|cargo\s*transporte|flete\s*de\s*mercader[ií]a|servicio/i;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No auth" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { purchase_import_id } = await req.json();
    if (!purchase_import_id) {
      return new Response(JSON.stringify({ error: "Missing purchase_import_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: imp, error: impErr } = await supabase
      .from("purchase_imports")
      .select("*")
      .eq("id", purchase_import_id)
      .single();

    if (impErr || !imp) {
      return new Response(JSON.stringify({ error: "Import not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    enforcePilotVenue(imp.venue_id);

    const filePath = imp.raw_file_url;
    const { data: fileData, error: fileErr } = await supabase.storage.from("purchase-invoices").download(filePath);

    if (fileErr || !fileData) {
      await supabase
        .from("purchase_imports")
        .update({ status: "UPLOADED", issues_count: 1 })
        .eq("id", purchase_import_id);
      return new Response(JSON.stringify({ error: "File not found in storage" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const arrayBuffer = await fileData.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = "";
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
      for (let j = 0; j < chunk.length; j++) {
        binary += String.fromCharCode(chunk[j]);
      }
    }
    const base64 = btoa(binary);
    const fileType = filePath.toLowerCase().endsWith(".pdf")
      ? "pdf"
      : filePath.toLowerCase().endsWith(".png")
        ? "png"
        : "jpeg";

    const rawExtraction = await extractWithAI(base64, fileType);

    // Load products for auto-mapping
    const { data: allProducts } = await supabase
      .from("products")
      .select("id, name, category")
      .eq("venue_id", imp.venue_id);

    // Find Mixer Tradicional and Redbull products
    const mixerProduct = (allProducts || []).find(
      (p) => p.name.toLowerCase().includes("mixer tradicional") || p.name.toLowerCase() === "mixer tradicional"
    );
    const redbullProduct = (allProducts || []).find(
      (p) => p.name.toLowerCase().includes("red bull") || p.name.toLowerCase().includes("redbull")
    );

    // Filter out freight/expense lines, keep only inventory
    const inventoryRawLines = (rawExtraction.lines || []).filter((line: any) => {
      const rawName = line.raw_product_name || "";
      const isFreight = line.line_type === "expense" || FREIGHT_PATTERNS.test(rawName);
      return !isFreight;
    });

    // Auto-match from learning_product_mappings
    const { data: learnings } = await supabase
      .from("learning_product_mappings")
      .select("*")
      .eq("venue_id", imp.venue_id);

    const supplierRut = rawExtraction.header?.provider_rut?.trim();

    const lines = inventoryRawLines.map((line: any, idx: number) => {
      const rawName = line.raw_product_name || "";
      const mult = detectMultiplier(rawName);
      const qty = parseNum(line.qty_text);
      const unitPrice = parseNum(line.unit_price_text);
      const lineTotal = parseNum(line.line_total_text);
      const discountPct = parseNum(line.discount_text?.replace("%", ""));

      const unitsReal = qty * mult;
      let packNet = lineTotal > 0 ? lineTotal / (qty || 1) : unitPrice;
      if (discountPct > 0 && discountPct <= 100) {
        packNet = packNet * (1 - discountPct / 100);
      }
      const costUnitNet = mult > 0 ? packNet / mult : packNet;

      // Auto-map product
      let autoProductId: string | null = null;
      let autoNotes: string | null = null;

      // 1. Check mixer/redbull patterns first
      if (REDBULL_PATTERNS.test(rawName) && redbullProduct) {
        autoProductId = redbullProduct.id;
        autoNotes = "Auto-match: RedBull → " + redbullProduct.name;
      } else if (MIXER_PATTERNS.test(rawName) && mixerProduct) {
        autoProductId = mixerProduct.id;
        autoNotes = "Auto-match: Mixer → " + mixerProduct.name;
      }

      // 2. Check learning memory if no auto-match
      if (!autoProductId) {
        const normalized = rawName.toLowerCase().trim();
        const match = (learnings || []).find((l: any) => {
          if (l.supplier_rut && supplierRut && l.supplier_rut !== supplierRut) return false;
          return l.raw_text?.toLowerCase().trim() === normalized;
        });

        if (match) {
          autoProductId = match.product_id;
          autoNotes = `Auto-match: ${match.confidence >= 0.9 ? "alta" : "media"} confianza`;
        }
      }

      return {
        purchase_import_id,
        line_index: idx,
        raw_text: rawName,
        qty_invoiced: qty,
        unit_price_net: unitPrice > 0 ? unitPrice : null,
        line_total_net: lineTotal > 0 ? lineTotal : null,
        discount_pct: discountPct > 0 ? discountPct : null,
        detected_multiplier: mult,
        units_real: unitsReal,
        cost_unit_net: Math.round(costUnitNet * 100) / 100,
        classification: "inventory",
        status: autoProductId ? "OK" : "REVIEW",
        product_id: autoProductId,
        notes: autoNotes,
      };
    });

    if (lines.length > 0) {
      await supabase.from("purchase_import_lines").insert(lines);
    }

    const netSubtotal = parseNum(rawExtraction.header?.net_total_text);
    const totalAmount = parseNum(rawExtraction.header?.gross_total_text);

    const issuesCount = lines.filter((l: any) => l.status === "REVIEW").length;

    await supabase
      .from("purchase_imports")
      .update({
        status: "EXTRACTED",
        supplier_name: rawExtraction.header?.provider_name || imp.supplier_name,
        supplier_rut: supplierRut || imp.supplier_rut,
        document_number: rawExtraction.header?.document_number || imp.document_number,
        document_date: rawExtraction.header?.document_date || imp.document_date,
        net_subtotal: netSubtotal || null,
        vat_amount: null,
        total_amount: totalAmount || null,
        raw_extraction_json: rawExtraction,
        issues_count: issuesCount,
        updated_at: new Date().toISOString(),
      })
      .eq("id", purchase_import_id);

    return new Response(
      JSON.stringify({
        success: true,
        lines_count: lines.length,
        issues_count: issuesCount,
        auto_mapped: lines.filter((l: any) => l.product_id).length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Extract invoice error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function parseNum(val: any): number {
  if (val == null) return 0;
  const s = String(val)
    .replace(/[^0-9.,-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  return parseFloat(s) || 0;
}

function detectMultiplier(text: string): number {
  const m1 = text.match(/(\d+)\s*(?:PCX|PX)\s*(\d+)/i);
  if (m1) return parseInt(m1[1]) * parseInt(m1[2]);

  const m2 = text.match(/(\d+)\s*(?:PF|UN|UND|U)\b/i);
  if (m2) return parseInt(m2[1]);

  const m3 = text.match(/X\s*(\d{2,})/i);
  if (m3) return parseInt(m3[1]);

  const m4 = text.match(/(\d+)\s*X\s*(\d+)/i);
  if (m4) return parseInt(m4[1]) * parseInt(m4[2]);

  return 1;
}

async function extractWithAI(base64: string, fileType: string): Promise<any> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");

  const prompt = `You are extracting data from a Chilean electronic invoice (Factura Electrónica) in the beverage/alcohol industry.
Return ONLY JSON. No prose. No markdown.

IMPORTANT:
- Read the entire page including bottom totals blocks.
- If the image is rotated, interpret it correctly.
- Do NOT guess. If unclear, set null.
- Extract RAW values EXACTLY as written.
- Preserve full product descriptions.
- IGNORE freight/shipping/delivery lines (flete, despacho, transporte, etc.)
- Only extract product lines (inventory items)

Return JSON in this exact schema:

{
  "header": {
    "provider_name": null,
    "provider_rut": null,
    "document_number": null,
    "document_date": null,
    "net_total_text": null,
    "gross_total_text": null
  },

  "lines": [
    {
      "raw_product_name": null,
      "qty_text": null,
      "uom_text": null,
      "unit_price_text": null,
      "discount_text": null,
      "line_total_text": null,
      "line_type": "inventory"
    }
  ],

  "warnings": [],
  "confidence": {
    "header": "high_or_medium_or_low",
    "lines": "high_or_medium_or_low"
  }
}

RULES:
1) Extract values EXACTLY as written.
2) If a field is missing, use null.
3) SKIP lines that are freight, shipping, delivery services, or non-product items. Only include actual products.
4) Return ONLY JSON.`;

  const mimeType = fileType === "pdf" ? "application/pdf" : `image/${fileType}`;
  let content: string;

  if (LOVABLE_API_KEY) {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } },
            ],
          },
        ],
        max_tokens: 4096,
      }),
    });
    if (!response.ok) throw new Error(`AI error: ${await response.text()}`);
    const result = await response.json();
    content = result.choices?.[0]?.message?.content || "";
  } else if (GEMINI_API_KEY) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mimeType, data: base64 } }] }],
          generationConfig: { maxOutputTokens: 4096, temperature: 0.1 },
        }),
      },
    );
    if (!response.ok) throw new Error(`AI error: ${await response.text()}`);
    const result = await response.json();
    content = result.candidates?.[0]?.content?.parts?.[0]?.text || "";
  } else {
    throw new Error("No AI API key configured");
  }

  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Could not parse AI response");
  return JSON.parse(jsonMatch[0]);
}
