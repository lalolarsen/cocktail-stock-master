// XHR polyfill for Deno
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * MODO ESTABILIZACIÓN - Extracción Bruta
 * 
 * La IA SOLO extrae datos crudos del documento.
 * NO calcula unidades reales, NO calcula neto, NO aplica descuentos.
 * El motor de cálculo determinístico (computePurchaseLine) hace todo el trabajo.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Estructura de extracción BRUTA (sin cálculos)
interface RawLineExtraction {
  raw_product_name: string;
  qty_text: string | null;
  unit_price_text: string | null;
  line_total_text: string | null;
  discount_text: string | null;
  uom_text: string | null;
  tax_iaba_text: string | null;
  tax_ila_text: string | null;
}

// Totales de impuestos por categoría (del header del documento)
interface HeaderTaxTotals {
  iaba_10_total: number;
  iaba_18_total: number;
  ila_vino_205_total: number;
  ila_cerveza_205_total: number;
  ila_destilados_315_total: number;
  sources: Record<string, "extracted" | "missing">;
}

interface RawExtraction {
  header: {
    provider_name: string | null;
    provider_rut: string | null;
    document_number: string | null;
    document_date: string | null;
    net_total_text: string | null;
    iva_total_text: string | null;
    gross_total_text: string | null;
    // NUEVO: Totales de impuestos por categoría
    tax_totals?: HeaderTaxTotals;
  };
  lines: RawLineExtraction[];
  raw_text: string;
  extraction_timestamp: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { purchase_document_id, file_url, file_type, file_content_base64 } = await req.json();

    if (!purchase_document_id) {
      return new Response(JSON.stringify({ error: "Missing purchase_document_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update status to processing
    await supabase
      .from("purchase_documents")
      .update({ status: "processing" })
      .eq("id", purchase_document_id);

    let rawExtraction: RawExtraction;

    if (file_type === "xml") {
      rawExtraction = parseXmlRaw(file_content_base64);
    } else {
      rawExtraction = await extractWithAI(file_content_base64, file_type);
    }

    // Get existing products for matching (SOLO matching, no cálculos)
    const { data: products } = await supabase
      .from("products")
      .select("id, name, code, category, unit");

    const { data: providerMappings } = await supabase
      .from("provider_product_mappings")
      .select("raw_product_name, product_id, confidence_score, provider_name");

    const { data: genericMappings } = await supabase
      .from("product_name_mappings")
      .select("raw_name, normalized_name, product_id, usage_count");

    // Get venue_id from document
    const { data: docData } = await supabase
      .from("purchase_documents")
      .select("venue_id")
      .eq("id", purchase_document_id)
      .single();

    const venueId = docData?.venue_id;
    const providerName = rawExtraction.header.provider_name?.toLowerCase().trim();

    // Build lookup maps
    const providerLookup = new Map<string, { product_id: string; confidence: number }>();
    (providerMappings || []).forEach((m) => {
      if (m.provider_name?.toLowerCase() === providerName) {
        providerLookup.set(m.raw_product_name?.toLowerCase(), {
          product_id: m.product_id,
          confidence: m.confidence_score || 0.9,
        });
      }
    });

    const genericLookup = new Map<string, { product_id: string; usage_count: number }>();
    (genericMappings || []).forEach((m) => {
      genericLookup.set(m.raw_name?.toLowerCase() || m.normalized_name, {
        product_id: m.product_id,
        usage_count: m.usage_count || 0,
      });
    });

    // Match lines to products (SOLO matching, datos raw intactos)
    const matchedLines = rawExtraction.lines.map((line) => {
      const normalized = line.raw_product_name.toLowerCase().trim();
      
      // Check provider mapping first
      const providerMatch = providerLookup.get(normalized);
      if (providerMatch) {
        const product = products?.find((p) => p.id === providerMatch.product_id);
        return {
          ...line,
          matched_product_id: providerMatch.product_id,
          matched_product_name: product?.name || null,
          match_confidence: providerMatch.confidence,
          match_source: "provider" as const,
        };
      }

      // Check generic mapping
      const genericMatch = genericLookup.get(normalized);
      if (genericMatch) {
        const product = products?.find((p) => p.id === genericMatch.product_id);
        const usageBonus = Math.min(genericMatch.usage_count * 0.02, 0.1);
        return {
          ...line,
          matched_product_id: genericMatch.product_id,
          matched_product_name: product?.name || null,
          match_confidence: 0.75 + usageBonus,
          match_source: "generic" as const,
        };
      }

      // Fuzzy match
      const fuzzyMatch = findBestMatch(line.raw_product_name, products || []);
      return {
        ...line,
        matched_product_id: fuzzyMatch?.id || null,
        matched_product_name: fuzzyMatch?.name || null,
        match_confidence: fuzzyMatch?.confidence || 0,
        match_source: "fuzzy" as const,
      };
    });

    // Save purchase items with RAW data (NO calculations)
    const itemsToInsert = matchedLines.map((line) => ({
      purchase_document_id,
      venue_id: venueId,
      raw_product_name: line.raw_product_name,
      // Store raw text values - calculations happen in frontend
      extracted_quantity: parseNumberSafe(line.qty_text),
      extracted_unit_price: parseNumberSafe(line.unit_price_text),
      extracted_total: parseNumberSafe(line.line_total_text),
      extracted_uom: line.uom_text || "Unidad",
      // Raw discount text for frontend to process
      discount_percent: parseDiscountPercent(line.discount_text),
      discount_amount: parseDiscountAmount(line.discount_text),
      // Raw tax data
      tax_iaba_10: 0,
      tax_iaba_18: 0,
      tax_ila_vin: 0,
      tax_ila_cer: 0,
      tax_ila_lic: 0,
      // Matching results
      matched_product_id: line.matched_product_id,
      match_confidence: line.match_confidence,
      classification: "inventory",
      item_status: line.matched_product_id ? "matched" : "pending_match",
    }));

    if (itemsToInsert.length > 0) {
      await supabase.from("purchase_items").insert(itemsToInsert);
    }

    // Parse header values
    const netTotal = parseNumberSafe(rawExtraction.header.net_total_text);
    const ivaTotal = parseNumberSafe(rawExtraction.header.iva_total_text);
    const grossTotal = parseNumberSafe(rawExtraction.header.gross_total_text);

    // Update document with raw extraction
    await supabase
      .from("purchase_documents")
      .update({
        status: "ready",
        provider_name: rawExtraction.header.provider_name,
        provider_rut: rawExtraction.header.provider_rut,
        document_number: rawExtraction.header.document_number,
        document_date: rawExtraction.header.document_date,
        net_amount: netTotal,
        iva_amount: ivaTotal,
        total_amount_gross: grossTotal,
        raw_text: rawExtraction.raw_text,
        extracted_data: {
          raw_extraction: rawExtraction,
          matched_lines: matchedLines,
          extraction_mode: "STABILIZED_RAW",
        },
        audit_trail: [{
          action: "document_parsed_raw",
          timestamp: new Date().toISOString(),
          data: {
            extraction_mode: "STABILIZED_RAW",
            lines_count: matchedLines.length,
            matched_count: matchedLines.filter(l => l.matched_product_id).length,
          }
        }]
      })
      .eq("id", purchase_document_id);

    return new Response(
      JSON.stringify({
        success: true,
        extraction_mode: "STABILIZED_RAW",
        raw_extraction: rawExtraction,
        matched_lines: matchedLines,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error parsing invoice:", error);

    try {
      const { purchase_document_id } = await req.clone().json();
      if (purchase_document_id) {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabase = createClient(supabaseUrl, supabaseKey);
        await supabase
          .from("purchase_documents")
          .update({ status: "error" })
          .eq("id", purchase_document_id);
      }
    } catch {}

    const errorMessage = error instanceof Error ? error.message : "Error processing invoice";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ============================================================================
// XML PARSING (Extracción Bruta)
// ============================================================================

function parseXmlRaw(base64Content: string): RawExtraction {
  const xml = atob(base64Content);
  
  const getTagValue = (tag: string): string | null => {
    const regex = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, "i");
    const match = xml.match(regex);
    return match ? match[1].trim() : null;
  };

  const lines: RawLineExtraction[] = [];
  const detailRegex = /<Detalle>([\s\S]*?)<\/Detalle>/gi;
  let detailMatch;
  
  while ((detailMatch = detailRegex.exec(xml)) !== null) {
    const detail = detailMatch[1];
    
    const getName = (d: string) => {
      const m = d.match(/<NmbItem>([^<]*)<\/NmbItem>/i);
      return m ? m[1].trim() : "";
    };
    const getQty = (d: string) => {
      const m = d.match(/<QtyItem>([^<]*)<\/QtyItem>/i);
      return m ? m[1].trim() : null;
    };
    const getPrice = (d: string) => {
      const m = d.match(/<PrcItem>([^<]*)<\/PrcItem>/i);
      return m ? m[1].trim() : null;
    };
    const getTotal = (d: string) => {
      const m = d.match(/<MontoItem>([^<]*)<\/MontoItem>/i);
      return m ? m[1].trim() : null;
    };
    const getUom = (d: string) => {
      const m = d.match(/<UnmdItem>([^<]*)<\/UnmdItem>/i);
      return m ? m[1].trim() : null;
    };
    const getDiscount = (d: string) => {
      const pct = d.match(/<DscItem>([^<]*)<\/DscItem>/i) || d.match(/<PctDscto>([^<]*)<\/PctDscto>/i);
      const amt = d.match(/<DescuentoItem>([^<]*)<\/DescuentoItem>/i) || d.match(/<MntDscto>([^<]*)<\/MntDscto>/i);
      if (pct) return pct[1].trim() + "%";
      if (amt) return amt[1].trim();
      return null;
    };

    lines.push({
      raw_product_name: getName(detail),
      qty_text: getQty(detail),
      unit_price_text: getPrice(detail),
      line_total_text: getTotal(detail),
      discount_text: getDiscount(detail),
      uom_text: getUom(detail),
      tax_iaba_text: null,
      tax_ila_text: null,
    });
  }

  return {
    header: {
      provider_name: getTagValue("RznSoc") || getTagValue("RznSocEmisor"),
      provider_rut: getTagValue("RUTEmisor"),
      document_number: getTagValue("Folio"),
      document_date: getTagValue("FchEmis"),
      net_total_text: getTagValue("MntNeto"),
      iva_total_text: getTagValue("IVA"),
      gross_total_text: getTagValue("MntTotal"),
    },
    lines,
    raw_text: xml,
    extraction_timestamp: new Date().toISOString(),
  };
}

// ============================================================================
// AI EXTRACTION (Solo datos brutos, SIN cálculos)
// ============================================================================

async function extractWithAI(base64Content: string, fileType: string): Promise<RawExtraction> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
  
  // PROMPT SIMPLIFICADO: Solo extracción, NO cálculos
  const prompt = `Extract data from this Chilean invoice. Return ONLY raw values as they appear in the document.

Return JSON:
{
  "header": {
    "provider_name": "supplier name",
    "provider_rut": "RUT (XX.XXX.XXX-X)",
    "document_number": "folio/number",
    "document_date": "YYYY-MM-DD",
    "net_total_text": "net amount as text",
    "iva_total_text": "IVA amount as text",
    "gross_total_text": "total amount as text"
  },
  "lines": [
    {
      "raw_product_name": "FULL product name exactly as written",
      "qty_text": "quantity as text",
      "unit_price_text": "unit price as text",
      "line_total_text": "line total as text",
      "discount_text": "discount if present (e.g. '20%' or '5000')",
      "uom_text": "unit of measure as written",
      "tax_iaba_text": "IABA tax amount if present",
      "tax_ila_text": "ILA tax amount if present"
    }
  ]
}

CRITICAL RULES:
1. Extract values EXACTLY as written - do NOT calculate or derive values
2. Keep all text, numbers, symbols as they appear
3. Include full product names with all descriptors (size, pack notation, brand)
4. If a value is unclear or missing, use null
5. For discounts, include the symbol (% or $) in the text
6. Return ONLY the JSON, no other text`;

  const mimeType = fileType === "pdf" ? "application/pdf" : `image/${fileType}`;
  let content: string;

  if (LOVABLE_API_KEY) {
    console.log("Using Lovable AI Gateway (Stabilized Mode)");
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              {
                type: "image_url",
                image_url: { url: `data:${mimeType};base64,${base64Content}` },
              },
            ],
          },
        ],
        max_tokens: 4096,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Lovable AI Gateway error:", response.status, errorText);
      throw new Error(`AI API error: ${errorText}`);
    }

    const result = await response.json();
    content = result.choices?.[0]?.message?.content || "";
  } else if (GEMINI_API_KEY) {
    console.log("Using Google Gemini API directly (Stabilized Mode)");
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: prompt },
                {
                  inline_data: {
                    mime_type: mimeType,
                    data: base64Content,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            maxOutputTokens: 4096,
            temperature: 0.1,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`AI API error: ${errorText}`);
    }

    const result = await response.json();
    content = result.candidates?.[0]?.content?.parts?.[0]?.text || "";
  } else {
    throw new Error("No AI API key configured");
  }

  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Could not parse AI response");
  }

  const parsed = JSON.parse(jsonMatch[0]);

  return {
    header: {
      provider_name: parsed.header?.provider_name || null,
      provider_rut: parsed.header?.provider_rut || null,
      document_number: parsed.header?.document_number || null,
      document_date: parsed.header?.document_date || null,
      net_total_text: parsed.header?.net_total_text || null,
      iva_total_text: parsed.header?.iva_total_text || null,
      gross_total_text: parsed.header?.gross_total_text || null,
    },
    lines: (parsed.lines || []).map((line: Record<string, unknown>) => ({
      raw_product_name: String(line.raw_product_name || ""),
      qty_text: line.qty_text != null ? String(line.qty_text) : null,
      unit_price_text: line.unit_price_text != null ? String(line.unit_price_text) : null,
      line_total_text: line.line_total_text != null ? String(line.line_total_text) : null,
      discount_text: line.discount_text != null ? String(line.discount_text) : null,
      uom_text: line.uom_text != null ? String(line.uom_text) : null,
      tax_iaba_text: line.tax_iaba_text != null ? String(line.tax_iaba_text) : null,
      tax_ila_text: line.tax_ila_text != null ? String(line.tax_ila_text) : null,
    })),
    raw_text: content,
    extraction_timestamp: new Date().toISOString(),
  };
}

// ============================================================================
// HELPERS
// ============================================================================

function parseNumberSafe(value: string | null | undefined): number | null {
  if (!value) return null;
  const cleaned = value
    .replace(/\$/g, '')
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(/,/g, '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function parseDiscountPercent(text: string | null): number {
  if (!text) return 0;
  if (text.includes('%')) {
    const num = parseNumberSafe(text.replace('%', ''));
    return num ?? 0;
  }
  return 0;
}

function parseDiscountAmount(text: string | null): number {
  if (!text) return 0;
  if (text.includes('%')) return 0; // Percentage, not amount
  const num = parseNumberSafe(text);
  return num ?? 0;
}

function findBestMatch(
  rawName: string,
  products: Array<{ id: string; name: string; code: string }>
): { id: string; name: string; confidence: number } | null {
  const normalized = rawName.toLowerCase().trim();
  let bestMatch: { id: string; name: string; confidence: number } | null = null;

  for (const product of products) {
    const productNormalized = product.name.toLowerCase().trim();
    
    if (productNormalized === normalized) {
      return { id: product.id, name: product.name, confidence: 1.0 };
    }

    if (product.code && normalized.includes(product.code.toLowerCase())) {
      return { id: product.id, name: product.name, confidence: 0.9 };
    }

    const similarity = jaccardSimilarity(normalized, productNormalized);
    if (similarity > 0.5 && (!bestMatch || similarity > bestMatch.confidence)) {
      bestMatch = { id: product.id, name: product.name, confidence: similarity };
    }
  }

  return bestMatch;
}

function jaccardSimilarity(str1: string, str2: string): number {
  const set1 = new Set(str1.split(/\s+/));
  const set2 = new Set(str2.split(/\s+/));
  const intersection = new Set([...set1].filter((x) => set2.has(x)));
  const union = new Set([...set1, ...set2]);
  return intersection.size / union.size;
}
