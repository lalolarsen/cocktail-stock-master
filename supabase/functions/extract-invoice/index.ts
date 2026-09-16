import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { enforcePilotVenue } from "../_shared/pilot.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * INVOICE EXTRACTOR — versión simple.
 * Solo extrae: proveedor, documento, total, y por línea: cantidad, producto, valor unitario y total.
 * Sin impuestos específicos, sin multiplicadores de pack, sin descuentos encadenados.
 * Auto-vincula al catálogo por SKU del proveedor y por memoria de texto (learning_product_mappings).
 */

const FREIGHT_PATTERNS = /flete|despacho|transporte|entrega|env[ií]o|envio|reparto|cargo\s*transporte|servicio/i;

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

    // Descartar fletes y servicios
    const productLines = (rawExtraction.lines || []).filter((line: any) => {
      const rawName = line.raw_product_name || "";
      const code = String(line.supplier_code || "").trim();
      return !(line.line_type === "expense" || code === "9999" || FREIGHT_PATTERNS.test(rawName));
    });

    // Memoria de vinculación aprendida
    const { data: learnings } = await supabase
      .from("learning_product_mappings")
      .select("*")
      .eq("venue_id", imp.venue_id);

    const supplierRut = (rawExtraction.header?.provider_rut || "").trim();

    const lines = productLines.map((line: any, idx: number) => {
      const rawName = String(line.raw_product_name || "").trim();
      const supplierCode = String(line.supplier_code || "").trim() || null;
      const qty = parseNum(line.qty_text);
      const unitPrice = parseNum(line.unit_price_text);
      const lineTotal = parseNum(line.line_total_text);

      // Valor unitario: preferimos el total de la línea dividido por la cantidad.
      const unitCost = lineTotal > 0 && qty > 0 ? lineTotal / qty : unitPrice;

      let autoProductId: string | null = null;
      let autoNotes: string | null = null;

      // 1) Match por SKU del proveedor
      if (supplierCode) {
        const skuMatch = (learnings || []).find((l: any) => {
          if (!l.supplier_sku) return false;
          if (l.supplier_rut && supplierRut && l.supplier_rut !== supplierRut) return false;
          return String(l.supplier_sku).trim() === supplierCode;
        });
        if (skuMatch) {
          autoProductId = skuMatch.product_id;
          autoNotes = `Vinculado por código ${supplierCode}`;
        }
      }

      // 2) Match por texto exacto aprendido
      if (!autoProductId && rawName) {
        const normalized = rawName.toLowerCase();
        const match = (learnings || []).find((l: any) => {
          if (l.supplier_rut && supplierRut && l.supplier_rut !== supplierRut) return false;
          return l.raw_text?.toLowerCase().trim() === normalized;
        });
        if (match) {
          autoProductId = match.product_id;
          autoNotes = "Vinculado por nombre aprendido";
        }
      }

      return {
        purchase_import_id,
        line_index: idx,
        raw_text: rawName,
        supplier_sku: supplierCode,
        qty_invoiced: qty,
        unit_price_net: unitPrice > 0 ? unitPrice : null,
        line_total_net: lineTotal > 0 ? lineTotal : Math.round(qty * unitCost) || null,
        detected_multiplier: 1,
        units_real: qty,
        cost_unit_net: Math.round(unitCost * 100) / 100,
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
        supplier_name: rawExtraction.header?.provider_name || imp.supplier_name || null,
        total_amount: totalAmount || null,
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

async function extractWithAI(base64: string, fileType: string): Promise<any> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");

  const prompt = `Extract data from this Chilean invoice (Factura). Photos may be rotated, dim or low quality — interpret carefully.

Return ONLY JSON. No prose, no markdown.

Extract ONLY these things:

HEADER
  - provider_name: supplier name ("Razón Social" of the issuer).
  - provider_rut: supplier RUT.
  - document_number: invoice folio number.
  - document_date: issue date as YYYY-MM-DD.
  - net_total_text: NETO / SUBTOTAL (before IVA and before specific taxes).
  - gross_total_text: TOTAL of the invoice (final amount payable).

EACH PRODUCT LINE
  - supplier_code: product code as printed ("Código"), if any.
  - raw_product_name: description exactly as written.
  - qty_text: quantity.
  - unit_price_text: unit price as printed.
  - line_total_text: the line amount ("Valor" / "Total"), already net of any discount.
  - line_type: "inventory" for products, "expense" for freight, delivery or services.

RULES
1) Mark freight / despacho / transporte / servicio lines as line_type "expense" (also code 9999).
2) Do NOT extract taxes, discounts, alcohol degrees or units of measure — they are not needed.
3) Copy numbers exactly as written, Chilean format (e.g. "1.234,56").
4) If a value is unclear or absent use null. Never guess.

JSON schema:

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
      "supplier_code": null,
      "raw_product_name": null,
      "qty_text": null,
      "unit_price_text": null,
      "line_total_text": null,
      "line_type": "inventory"
    }
  ],
  "confidence": { "header": "high_or_medium_or_low", "lines": "high_or_medium_or_low" }
}`;

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
        model: "google/gemini-2.5-pro",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } },
            ],
          },
        ],
        max_tokens: 6144,
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
          generationConfig: { maxOutputTokens: 6144, temperature: 0.1 },
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
