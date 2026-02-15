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
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No auth" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { purchase_import_id } = await req.json();
    if (!purchase_import_id) {
      return new Response(JSON.stringify({ error: "Missing purchase_import_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get import record
    const { data: imp, error: impErr } = await supabase
      .from("purchase_imports")
      .select("*")
      .eq("id", purchase_import_id)
      .single();

    if (impErr || !imp) {
      return new Response(JSON.stringify({ error: "Import not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Download file from storage
    const filePath = imp.raw_file_url;
    const { data: fileData, error: fileErr } = await supabase.storage
      .from("purchase-invoices")
      .download(filePath);

    if (fileErr || !fileData) {
      await supabase.from("purchase_imports").update({ status: "UPLOADED", issues_count: 1 }).eq("id", purchase_import_id);
      return new Response(JSON.stringify({ error: "File not found in storage" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const arrayBuffer = await fileData.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
    const fileType = filePath.toLowerCase().endsWith(".pdf") ? "pdf" : 
                     filePath.toLowerCase().endsWith(".png") ? "png" : "jpeg";

    // Extract with AI
    const rawExtraction = await extractWithAI(base64, fileType);

    // Detect freight lines and multipliers
    const freightPatterns = /flete|despacho|transporte|entrega|envío|envio|reparto/i;

    const lines = rawExtraction.lines.map((line: any, idx: number) => {
      const isFreight = freightPatterns.test(line.raw_product_name || "");
      const mult = detectMultiplier(line.raw_product_name || "");
      const qty = parseNum(line.qty_text);
      const unitPrice = parseNum(line.unit_price_text);
      const lineTotal = parseNum(line.line_total_text);
      const discountPct = parseNum(line.discount_text?.replace("%", ""));

      const unitsReal = qty * mult;
      
      // Calculate cost_unit_net
      let packNet = lineTotal > 0 ? lineTotal / (qty || 1) : unitPrice;
      if (discountPct > 0 && discountPct <= 100) {
        packNet = packNet * (1 - discountPct / 100);
      }
      const costUnitNet = mult > 0 ? packNet / mult : packNet;

      return {
        purchase_import_id,
        line_index: idx,
        raw_text: line.raw_product_name || "",
        qty_invoiced: qty,
        unit_price_net: unitPrice > 0 ? unitPrice : null,
        line_total_net: lineTotal > 0 ? lineTotal : null,
        discount_pct: discountPct > 0 ? discountPct : null,
        detected_multiplier: mult,
        units_real: unitsReal,
        cost_unit_net: Math.round(costUnitNet * 100) / 100,
        classification: isFreight ? "freight" : "inventory",
        status: isFreight ? "OK" : (unitsReal <= 0 || costUnitNet <= 0 ? "REVIEW" : "REVIEW"),
        product_id: null,
        notes: isFreight ? "Auto-clasificado como flete" : null,
      };
    });

    // Auto-match from learning_product_mappings
    const { data: learnings } = await supabase
      .from("learning_product_mappings")
      .select("*")
      .eq("venue_id", imp.venue_id);

    const supplierRut = rawExtraction.header?.provider_rut?.trim();

    for (const line of lines) {
      if (line.classification !== "inventory" || !line.raw_text) continue;
      const normalized = line.raw_text.toLowerCase().trim();
      
      // Find best match
      const match = (learnings || []).find((l: any) => {
        if (l.supplier_rut && supplierRut && l.supplier_rut !== supplierRut) return false;
        return l.raw_text?.toLowerCase().trim() === normalized;
      });

      if (match) {
        line.product_id = match.product_id;
        line.detected_multiplier = match.detected_multiplier || line.detected_multiplier;
        // Recalc with updated multiplier
        const mult = line.detected_multiplier;
        line.units_real = (line.qty_invoiced || 0) * mult;
        let packNet = (line.line_total_net || 0) / ((line.qty_invoiced || 1));
        if (!line.line_total_net && line.unit_price_net) packNet = line.unit_price_net;
        if (line.discount_pct) packNet *= (1 - line.discount_pct / 100);
        line.cost_unit_net = mult > 0 ? Math.round((packNet / mult) * 100) / 100 : 0;
        line.notes = `Auto-match: ${match.confidence >= 0.9 ? "alta" : "media"} confianza`;
      }
    }

    // Insert lines
    if (lines.length > 0) {
      await supabase.from("purchase_import_lines").insert(lines);
    }

    // Parse header totals
    const netSubtotal = parseNum(rawExtraction.header?.net_total_text);
    const vatAmount = parseNum(rawExtraction.header?.iva_total_text);
    const totalAmount = parseNum(rawExtraction.header?.gross_total_text);

    // Create taxes
    const taxes: any[] = [];
    if (vatAmount > 0) {
      taxes.push({
        purchase_import_id,
        tax_type: "vat_credit",
        tax_label: "IVA Crédito Fiscal (19%)",
        tax_amount: vatAmount,
      });
    }

    // Check for specific taxes in header
    if (rawExtraction.header?.tax_totals) {
      const tt = rawExtraction.header.tax_totals;
      if (tt.iaba_10_total > 0) taxes.push({ purchase_import_id, tax_type: "specific_tax", tax_label: "IABA 10%", tax_amount: tt.iaba_10_total });
      if (tt.iaba_18_total > 0) taxes.push({ purchase_import_id, tax_type: "specific_tax", tax_label: "IABA 18%", tax_amount: tt.iaba_18_total });
      if (tt.ila_vino_total > 0) taxes.push({ purchase_import_id, tax_type: "specific_tax", tax_label: "ILA Vinos 20.5%", tax_amount: tt.ila_vino_total });
      if (tt.ila_cerveza_total > 0) taxes.push({ purchase_import_id, tax_type: "specific_tax", tax_label: "ILA Cerveza 20.5%", tax_amount: tt.ila_cerveza_total });
      if (tt.ila_destilados_total > 0) taxes.push({ purchase_import_id, tax_type: "specific_tax", tax_label: "ILA Destilados 31.5%", tax_amount: tt.ila_destilados_total });
    }

    if (taxes.length > 0) {
      await supabase.from("purchase_import_taxes").insert(taxes);
    }

    // Count issues
    const issuesCount = lines.filter((l: any) => l.status === "REVIEW").length;

    // Update import
    await supabase.from("purchase_imports").update({
      status: "EXTRACTED",
      supplier_name: rawExtraction.header?.provider_name || imp.supplier_name,
      supplier_rut: supplierRut || imp.supplier_rut,
      document_number: rawExtraction.header?.document_number || imp.document_number,
      document_date: rawExtraction.header?.document_date || imp.document_date,
      net_subtotal: netSubtotal || null,
      vat_amount: vatAmount || null,
      total_amount: totalAmount || null,
      raw_extraction_json: rawExtraction,
      issues_count: issuesCount,
      updated_at: new Date().toISOString(),
    }).eq("id", purchase_import_id);

    return new Response(JSON.stringify({
      success: true,
      lines_count: lines.length,
      issues_count: issuesCount,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    console.error("Extract invoice error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function parseNum(val: any): number {
  if (val == null) return 0;
  const s = String(val).replace(/[^0-9.,-]/g, "").replace(/\./g, "").replace(",", ".");
  return parseFloat(s) || 0;
}

function detectMultiplier(text: string): number {
  // Patterns: "6PCX4" => 24, "24PF" => 24, "X06" => 6, "12X1" => 12
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

  const prompt = `Extract data from this Chilean invoice. Return ONLY raw values as they appear.

Return JSON:
{
  "header": {
    "provider_name": "string",
    "provider_rut": "string (XX.XXX.XXX-X)",
    "document_number": "string",
    "document_date": "YYYY-MM-DD",
    "net_total_text": "string",
    "iva_total_text": "string",
    "gross_total_text": "string",
    "tax_totals": {
      "iaba_10_total": number_or_0,
      "iaba_18_total": number_or_0,
      "ila_vino_total": number_or_0,
      "ila_cerveza_total": number_or_0,
      "ila_destilados_total": number_or_0
    }
  },
  "lines": [
    {
      "raw_product_name": "FULL name as written",
      "qty_text": "quantity",
      "unit_price_text": "unit price",
      "line_total_text": "line total",
      "discount_text": "discount if any (e.g. '20%')",
      "uom_text": "unit of measure"
    }
  ]
}

RULES:
1. Extract values EXACTLY as written
2. Keep full product names with descriptors
3. Use null for missing values
4. Return ONLY JSON`;

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
        messages: [{
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } },
          ],
        }],
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
          contents: [{ parts: [
            { text: prompt },
            { inline_data: { mime_type: mimeType, data: base64 } },
          ]}],
          generationConfig: { maxOutputTokens: 4096, temperature: 0.1 },
        }),
      }
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
