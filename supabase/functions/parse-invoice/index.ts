import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface LineItem {
  raw_product_name: string;
  quantity: number | null;
  unit_price: number | null;
  total: number | null;
}

interface ExtractedData {
  provider_name: string | null;
  provider_rut: string | null;
  document_number: string | null;
  document_date: string | null;
  line_items: LineItem[];
  raw_text: string;
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

    // Get existing products for matching
    const { data: products } = await supabase
      .from("products")
      .select("id, name, code, category, unit");

    // Get existing generic mappings
    const { data: genericMappings } = await supabase
      .from("product_name_mappings")
      .select("raw_name, normalized_name, product_id, usage_count");

    // Build generic mapping lookup
    const genericMappingLookup = new Map<string, { product_id: string; usage_count: number }>();
    (genericMappings || []).forEach((m) => {
      genericMappingLookup.set(m.raw_name?.toLowerCase() || m.normalized_name, { 
        product_id: m.product_id, 
        usage_count: m.usage_count || 0 
      });
    });

    let extractedData: ExtractedData;

    if (file_type === "xml") {
      // Parse XML directly
      extractedData = parseXmlInvoice(file_content_base64);
    } else {
      // Use Gemini for OCR/parsing of PDF or image
      extractedData = await parseWithAI(file_content_base64, file_type);
    }

    // Get provider-specific mappings if we have a provider name
    const providerName = extractedData.provider_name?.toLowerCase().trim();
    let providerMappingLookup = new Map<string, { product_id: string; confidence_score: number }>();
    
    if (providerName) {
      const { data: providerMappings } = await supabase
        .from("provider_product_mappings")
        .select("raw_product_name, product_id, confidence_score")
        .eq("provider_name", providerName)
        .order("confidence_score", { ascending: false });

      (providerMappings || []).forEach((m) => {
        providerMappingLookup.set(m.raw_product_name, { 
          product_id: m.product_id, 
          confidence_score: m.confidence_score || 1.0 
        });
      });
    }

    // Match line items to products with priority:
    // 1. Provider-specific mappings (highest confidence)
    // 2. Generic learned mappings
    // 3. Fuzzy name matching
    const matchedItems = extractedData.line_items.map((item) => {
      const normalizedName = item.raw_product_name.toLowerCase().trim();
      
      // Priority 1: Check provider-specific mappings first
      const providerMapping = providerMappingLookup.get(normalizedName);
      if (providerMapping) {
        const product = products?.find((p) => p.id === providerMapping.product_id);
        // Confidence based on learned score, capped at 0.98 to show it's learned
        const confidence = Math.min(0.5 + (providerMapping.confidence_score * 0.4), 0.98);
        return {
          ...item,
          matched_product_id: providerMapping.product_id,
          matched_product_name: product?.name || null,
          match_confidence: confidence,
          match_source: "provider" as const,
        };
      }

      // Priority 2: Check generic mappings
      const genericMapping = genericMappingLookup.get(normalizedName);
      if (genericMapping) {
        const product = products?.find((p) => p.id === genericMapping.product_id);
        // Slightly lower confidence for generic mappings
        const usageBonus = Math.min(genericMapping.usage_count * 0.02, 0.1);
        return {
          ...item,
          matched_product_id: genericMapping.product_id,
          matched_product_name: product?.name || null,
          match_confidence: 0.75 + usageBonus,
          match_source: "generic" as const,
        };
      }

      // Priority 3: Fuzzy match by name
      const match = findBestProductMatch(item.raw_product_name, products || []);
      return {
        ...item,
        matched_product_id: match?.id || null,
        matched_product_name: match?.name || null,
        match_confidence: match?.confidence || 0,
        match_source: "fuzzy" as const,
      };
    });

    // Save purchase items
    const itemsToInsert = matchedItems.map((item) => ({
      purchase_document_id,
      raw_product_name: item.raw_product_name,
      extracted_quantity: item.quantity,
      extracted_unit_price: item.unit_price,
      extracted_total: item.total,
      matched_product_id: item.matched_product_id,
      match_confidence: item.match_confidence,
    }));

    if (itemsToInsert.length > 0) {
      await supabase.from("purchase_items").insert(itemsToInsert);
    }

    // Update document with extracted data
    await supabase
      .from("purchase_documents")
      .update({
        status: "ready",
        provider_name: extractedData.provider_name,
        provider_rut: extractedData.provider_rut,
        document_number: extractedData.document_number,
        document_date: extractedData.document_date,
        raw_text: extractedData.raw_text,
        extracted_data: extractedData,
      })
      .eq("id", purchase_document_id);

    return new Response(
      JSON.stringify({
        success: true,
        extracted_data: extractedData,
        matched_items: matchedItems,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error parsing invoice:", error);

    // Try to update document status to error
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

function parseXmlInvoice(base64Content: string): ExtractedData {
  const xml = atob(base64Content);
  
  // Simple XML parsing for Chilean electronic invoices (DTE)
  const getTagValue = (tag: string): string | null => {
    const regex = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, "i");
    const match = xml.match(regex);
    return match ? match[1].trim() : null;
  };

  // Extract line items from XML
  const lineItems: LineItem[] = [];
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
      return m ? parseFloat(m[1]) : null;
    };
    const getPrice = (d: string) => {
      const m = d.match(/<PrcItem>([^<]*)<\/PrcItem>/i);
      return m ? parseFloat(m[1]) : null;
    };
    const getTotal = (d: string) => {
      const m = d.match(/<MontoItem>([^<]*)<\/MontoItem>/i);
      return m ? parseFloat(m[1]) : null;
    };

    lineItems.push({
      raw_product_name: getName(detail),
      quantity: getQty(detail),
      unit_price: getPrice(detail),
      total: getTotal(detail),
    });
  }

  return {
    provider_name: getTagValue("RznSoc") || getTagValue("RznSocEmisor"),
    provider_rut: getTagValue("RUTEmisor"),
    document_number: getTagValue("Folio"),
    document_date: getTagValue("FchEmis"),
    line_items: lineItems,
    raw_text: xml,
  };
}

async function parseWithAI(base64Content: string, fileType: string): Promise<ExtractedData> {
  // Use Lovable AI Gateway - automatically available in Lovable Cloud
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  // Fallback to GEMINI_API_KEY for direct Google API if configured
  const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
  
  const prompt = `Analyze this invoice/purchase document and extract the following information in JSON format:
{
  "provider_name": "name of the supplier/vendor",
  "provider_rut": "RUT or tax ID if present (Chilean format XX.XXX.XXX-X)",
  "document_number": "invoice or document number",
  "document_date": "date in YYYY-MM-DD format",
  "line_items": [
    {
      "raw_product_name": "product name as written",
      "quantity": number or null,
      "unit_price": number or null (without currency symbol),
      "total": number or null (without currency symbol)
    }
  ]
}

Be thorough in extracting ALL line items. If a value is unclear, use null.
Focus on products/items, ignore subtotals, taxes, and grand totals as line items.
Return ONLY the JSON, no other text.`;

  const mimeType = fileType === "pdf" ? "application/pdf" : `image/${fileType}`;
  
  let content: string;

  if (LOVABLE_API_KEY) {
    // Use Lovable AI Gateway (preferred)
    console.log("Using Lovable AI Gateway");
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
    // Fallback to direct Google Gemini API
    console.log("Using Google Gemini API directly");
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
    throw new Error("No AI API key configured. LOVABLE_API_KEY or GEMINI_API_KEY is required.");
  }

  // Parse JSON from response
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Could not parse AI response");
  }

  const parsed = JSON.parse(jsonMatch[0]);

  return {
    provider_name: parsed.provider_name || null,
    provider_rut: parsed.provider_rut || null,
    document_number: parsed.document_number || null,
    document_date: parsed.document_date || null,
    line_items: parsed.line_items || [],
    raw_text: content,
  };
}

function findBestProductMatch(
  rawName: string,
  products: Array<{ id: string; name: string; code: string }>
): { id: string; name: string; confidence: number } | null {
  const normalized = rawName.toLowerCase().trim();
  let bestMatch: { id: string; name: string; confidence: number } | null = null;

  for (const product of products) {
    const productNormalized = product.name.toLowerCase().trim();
    
    // Exact match
    if (productNormalized === normalized) {
      return { id: product.id, name: product.name, confidence: 1.0 };
    }

    // Check if product code matches
    if (product.code && normalized.includes(product.code.toLowerCase())) {
      return { id: product.id, name: product.name, confidence: 0.9 };
    }

    // Partial match using Jaccard similarity
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
