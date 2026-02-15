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

    // Set status to EXTRACTING
    await supabase.from("purchase_imports").update({ status: "EXTRACTING" }).eq("id", purchase_import_id);

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
    const uint8 = new Uint8Array(arrayBuffer);
    // Convert to base64 in chunks to avoid stack overflow on large files
    let base64 = "";
    const chunkSize = 32768;
    for (let i = 0; i < uint8.length; i += chunkSize) {
      base64 += String.fromCharCode(...uint8.subarray(i, i + chunkSize));
    }
    base64 = btoa(base64);

    const fileType = filePath.toLowerCase().endsWith(".pdf") ? "pdf" : 
                     filePath.toLowerCase().endsWith(".png") ? "png" : "jpeg";

    // ── Extract with Gemini ──
    const rawExtraction = await extractWithAI(base64, fileType);

    // ── System validation ──
    const warnings_globales: string[] = [...(rawExtraction.warnings_globales || [])];

    // Validate header totals
    const headerNet = rawExtraction.header?.subtotal_neto || 0;
    const headerIva = rawExtraction.header?.iva || 0;
    const headerTotal = rawExtraction.header?.total || 0;
    const impEsp = rawExtraction.header?.impuestos_especificos_totales || {};
    const sumImpEsp = (impEsp.iaba_10 || 0) + (impEsp.iaba_18 || 0) + 
                      (impEsp.ila_vino_205 || 0) + (impEsp.ila_cerveza_205 || 0) + (impEsp.ila_315 || 0);
    
    if (headerTotal > 0) {
      const expectedTotal = headerNet + headerIva + sumImpEsp;
      if (Math.abs(expectedTotal - headerTotal) > 1) {
        warnings_globales.push(`No cuadra total: Neto(${headerNet}) + IVA(${headerIva}) + ImpEsp(${sumImpEsp}) = ${expectedTotal} ≠ Total(${headerTotal})`);
      }
    }

    if (!rawExtraction.lines || rawExtraction.lines.length === 0) {
      warnings_globales.push("No se detectaron líneas en el documento");
    }

    // ── Process lines ──
    const freightPatterns = /flete|despacho|transporte|entrega|envío|envio|reparto/i;

    const lines = (rawExtraction.lines || []).map((line: any, idx: number) => {
      const isFreight = line.es_flete_o_transporte === true || freightPatterns.test(line.descripcion_original || "");
      const mult = line.multiplicador_detectado || detectMultiplier(line.descripcion_original || "");
      const qtyInvoiced = line.cantidad_facturada || 0;
      const precioPackNeto = line.precio_pack_neto || 0;
      const descuento = line.descuento_pct || 0;
      const totalLineaNeto = line.total_linea_neto || 0;

      // System recalculation (validates AI output)
      let adjustedPack = precioPackNeto;
      if (descuento > 0 && descuento <= 100) {
        adjustedPack = precioPackNeto * (1 - descuento / 100);
      }
      const unitsReal = qtyInvoiced * mult;
      const costUnitNet = mult > 0 && qtyInvoiced > 0
        ? Math.round((totalLineaNeto > 0 ? totalLineaNeto / (qtyInvoiced * mult) : adjustedPack / mult) * 100) / 100
        : 0;

      const lineWarnings: string[] = [...(line.warnings || [])];
      if (unitsReal <= 0 && !isFreight) lineWarnings.push("Unidades reales ≤ 0");
      if (costUnitNet <= 0 && !isFreight) lineWarnings.push("Costo unitario neto ≤ 0");

      const needsReview = !isFreight && (unitsReal <= 0 || costUnitNet <= 0 || lineWarnings.length > 0);

      return {
        purchase_import_id,
        line_index: idx,
        raw_text: line.descripcion_original || "",
        qty_invoiced: qtyInvoiced,
        unit_price_net: precioPackNeto > 0 ? precioPackNeto : null,
        line_total_net: totalLineaNeto > 0 ? totalLineaNeto : null,
        discount_pct: descuento > 0 ? descuento : null,
        detected_multiplier: mult,
        units_real: unitsReal,
        cost_unit_net: costUnitNet,
        classification: isFreight ? "freight" : "inventory",
        status: isFreight ? "OK" : "REVIEW",
        product_id: null as string | null,
        tax_category_id: null as string | null,
        notes: isFreight ? "Auto-clasificado como flete/transporte" : (lineWarnings.length > 0 ? lineWarnings.join("; ") : null),
      };
    });

    // ── Auto-match from learning_product_mappings ──
    const { data: learnings } = await supabase
      .from("learning_product_mappings")
      .select("*")
      .eq("venue_id", imp.venue_id);

    const supplierRut = rawExtraction.header?.proveedor_rut?.trim();

    for (const line of lines) {
      if (line.classification !== "inventory" || !line.raw_text) continue;
      const normalized = line.raw_text.toLowerCase().trim();
      
      const match = (learnings || []).find((l: any) => {
        if (l.supplier_rut && supplierRut && l.supplier_rut !== supplierRut) return false;
        return l.raw_text?.toLowerCase().trim() === normalized;
      });

      if (match) {
        line.product_id = match.product_id;
        if (match.detected_multiplier) {
          line.detected_multiplier = match.detected_multiplier;
          line.units_real = (line.qty_invoiced || 0) * match.detected_multiplier;
          // Recalc cost
          let packNet = (line.line_total_net || 0) / ((line.qty_invoiced || 1));
          if (!line.line_total_net && line.unit_price_net) packNet = line.unit_price_net;
          if (line.discount_pct) packNet *= (1 - line.discount_pct / 100);
          line.cost_unit_net = match.detected_multiplier > 0 ? Math.round((packNet / match.detected_multiplier) * 100) / 100 : 0;
        }
        line.notes = `Auto-match: confianza ${Math.round((match.confidence || 0.8) * 100)}%`;
      }
    }

    // ── Insert lines ──
    if (lines.length > 0) {
      await supabase.from("purchase_import_lines").insert(lines);
    }

    // ── Insert taxes ──
    const taxes: any[] = [];
    if (headerIva > 0) {
      taxes.push({ purchase_import_id, tax_type: "vat_credit", tax_label: "IVA Crédito Fiscal (19%)", tax_amount: headerIva });
    }
    if (impEsp.iaba_10 > 0) taxes.push({ purchase_import_id, tax_type: "specific_tax", tax_label: "IABA 10%", tax_amount: impEsp.iaba_10 });
    if (impEsp.iaba_18 > 0) taxes.push({ purchase_import_id, tax_type: "specific_tax", tax_label: "IABA 18%", tax_amount: impEsp.iaba_18 });
    if (impEsp.ila_vino_205 > 0) taxes.push({ purchase_import_id, tax_type: "specific_tax", tax_label: "ILA Vinos 20.5%", tax_amount: impEsp.ila_vino_205 });
    if (impEsp.ila_cerveza_205 > 0) taxes.push({ purchase_import_id, tax_type: "specific_tax", tax_label: "ILA Cerveza 20.5%", tax_amount: impEsp.ila_cerveza_205 });
    if (impEsp.ila_315 > 0) taxes.push({ purchase_import_id, tax_type: "specific_tax", tax_label: "ILA Destilados 31.5%", tax_amount: impEsp.ila_315 });

    if (taxes.length > 0) {
      await supabase.from("purchase_import_taxes").insert(taxes);
    }

    // ── Update import to REVIEW ──
    const issuesCount = lines.filter((l: any) => l.status === "REVIEW").length;

    await supabase.from("purchase_imports").update({
      status: "REVIEW",
      supplier_name: rawExtraction.header?.proveedor_nombre || imp.supplier_name,
      supplier_rut: supplierRut || imp.supplier_rut,
      document_number: rawExtraction.header?.documento_numero || imp.document_number,
      document_date: rawExtraction.header?.fecha || imp.document_date,
      net_subtotal: headerNet || null,
      vat_amount: headerIva || null,
      total_amount: headerTotal || null,
      raw_extraction_json: { ...rawExtraction, warnings_globales, system_validated: true },
      issues_count: issuesCount,
      updated_at: new Date().toISOString(),
    }).eq("id", purchase_import_id);

    return new Response(JSON.stringify({
      success: true,
      lines_count: lines.length,
      issues_count: issuesCount,
      warnings: warnings_globales,
      confidence: rawExtraction.confidence,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    console.error("Extract invoice error:", error);
    // Try to set status back
    try {
      const { purchase_import_id } = await req.clone().json();
      if (purchase_import_id) {
        const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
        await supabase.from("purchase_imports").update({ status: "UPLOADED" }).eq("id", purchase_import_id);
      }
    } catch {}
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

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

  const prompt = `Eres un extractor de facturas chilenas. Analiza esta imagen/PDF de factura.

INSTRUCCIONES:
- Si el documento está rotado, corrige mentalmente la lectura.
- Reconstruye la tabla por columnas (no por líneas de texto).
- No inventes datos. Si falta algo, usa null y agrega un warning.
- Devuelve SOLO JSON válido.

REGLAS DE CÁLCULO:
- Si detectas notación de packs como "6PCX4", "4PX6", "X06", "24PF", "12X1" en la descripción:
  - multiplicador_detectado = el número total de unidades por pack
  - unidades_reales = cantidad_facturada * multiplicador_detectado
  - costo_unitario_real_neto = precio_pack_neto / multiplicador_detectado
- Si hay descuento:
  - Aplica: precio_pack_neto = precio_pack_neto * (1 - descuento_pct/100)
- Si detectas "flete", "despacho", "transporte", "entrega", "envío":
  - es_flete_o_transporte = true

DEVUELVE EXACTAMENTE ESTE JSON:
{
  "header": {
    "proveedor_nombre": "",
    "proveedor_rut": "",
    "documento_numero": "",
    "fecha": "YYYY-MM-DD",
    "subtotal_neto": 0,
    "iva": 0,
    "total": 0,
    "impuestos_especificos_totales": {
      "iaba_10": 0,
      "iaba_18": 0,
      "ila_vino_205": 0,
      "ila_cerveza_205": 0,
      "ila_315": 0
    }
  },
  "lines": [
    {
      "codigo": "",
      "descripcion_original": "",
      "cantidad_facturada": 0,
      "precio_pack_neto": 0,
      "descuento_pct": 0,
      "total_linea_neto": 0,
      "multiplicador_detectado": 1,
      "unidades_reales": 0,
      "costo_unitario_real_neto": 0,
      "es_flete_o_transporte": false,
      "warnings": []
    }
  ],
  "warnings_globales": [],
  "confidence": {
    "header": 0.0,
    "table": 0.0
  }
}`;

  const mimeType = fileType === "pdf" ? "application/pdf" : `image/${fileType}`;
  let content: string;

  if (LOVABLE_API_KEY) {
    console.log("Using Lovable AI Gateway for invoice extraction");
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
        max_tokens: 8192,
      }),
    });
    if (!response.ok) {
      const errText = await response.text();
      console.error("AI error:", response.status, errText);
      if (response.status === 429) throw new Error("Rate limit excedido. Intenta en unos minutos.");
      if (response.status === 402) throw new Error("Créditos insuficientes para IA.");
      throw new Error(`AI error: ${errText}`);
    }
    const result = await response.json();
    content = result.choices?.[0]?.message?.content || "";
  } else if (GEMINI_API_KEY) {
    console.log("Using Gemini API directly");
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
          generationConfig: { maxOutputTokens: 8192, temperature: 0.1 },
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
  if (!jsonMatch) throw new Error("Could not parse AI response as JSON");
  return JSON.parse(jsonMatch[0]);
}
