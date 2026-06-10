import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { enforcePilotVenue } from "../_shared/pilot.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * INVOICE EXTRACTOR — tuned for CCU format (Comercial CCU S.A.)
 * - Captures supplier_code (SKU) per line
 * - Auto-matches by (supplier_rut, supplier_sku) first, then patterns, then raw_text memory
 * - Ignores freight (cód 9999 / "Flete de Mercaderías")
 * - Costs are NET (no IVA, no ILA/IABA)
 */

const MIXER_PATTERNS = /\b(mixer|schweppes|canada\s*dry|ginger\s*ale|tonic|t[oó]nica|soda|sprite|coca[\s-]?cola|fanta|seven\s*up|7\s*up|agua\s*mineral|agua\s*tonica|jugo|naranja|pomelo|lim[oó]n|cachantun|cachantún|catun|watts|pepsi)\b/i;
const REDBULL_PATTERNS = /\b(red\s*bull|redbull|red-bull|\brb\s)/i;
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

    // Load products for fallback pattern auto-mapping
    const { data: allProducts } = await supabase
      .from("products")
      .select("id, name, category")
      .eq("venue_id", imp.venue_id);

    const mixerProduct = (allProducts || []).find(
      (p) => p.name.toLowerCase().includes("mixer tradicional") || p.name.toLowerCase() === "mixer tradicional"
    );
    const redbullProduct = (allProducts || []).find(
      (p) => p.name.toLowerCase().includes("red bull") || p.name.toLowerCase().includes("redbull")
    );

    // Filter out freight/expense lines
    const inventoryRawLines = (rawExtraction.lines || []).filter((line: any) => {
      const rawName = line.raw_product_name || "";
      const code = String(line.supplier_code || "").trim();
      const isFreight =
        line.line_type === "expense" ||
        code === "9999" ||
        FREIGHT_PATTERNS.test(rawName);
      return !isFreight;
    });

    // Load learning memory
    const { data: learnings } = await supabase
      .from("learning_product_mappings")
      .select("*")
      .eq("venue_id", imp.venue_id);

    const supplierRut = (rawExtraction.header?.provider_rut || "").trim();

    const lines = inventoryRawLines.map((line: any, idx: number) => {
      const rawName = line.raw_product_name || "";
      const supplierCode = String(line.supplier_code || "").trim() || null;
      const mult = detectMultiplier(rawName);
      const qty = parseNum(line.qty_text);
      const unitPrice = parseNum(line.unit_price_text);
      const lineTotal = parseNum(line.line_total_text);
      const discountPct = parseNum(line.discount_text?.replace?.("%", "") ?? line.discount_text);

      const unitsReal = qty * mult;
      // "Valor" (lineTotal) en facturas CCU YA viene neto de descuento.
      // No aplicamos descuento extra para evitar doble resta.
      // Fallback: si no hay lineTotal, usamos unit_price y aplicamos descuento si parece % válido (0<x<=100).
      let packNet: number;
      if (lineTotal > 0) {
        packNet = lineTotal / (qty || 1);
      } else {
        packNet = unitPrice;
        if (discountPct > 0 && discountPct <= 100) {
          packNet = packNet * (1 - discountPct / 100);
        }
      }
      const costUnitNet = mult > 0 ? packNet / mult : packNet;

      let autoProductId: string | null = null;
      let autoNotes: string | null = null;

      // 1) SKU match (highest confidence)
      if (supplierCode) {
        const skuMatch = (learnings || []).find((l: any) => {
          if (!l.supplier_sku) return false;
          if (l.supplier_rut && supplierRut && l.supplier_rut !== supplierRut) return false;
          return String(l.supplier_sku).trim() === supplierCode;
        });
        if (skuMatch) {
          autoProductId = skuMatch.product_id;
          autoNotes = `Auto-match: SKU ${supplierCode}`;
        }
      }

      // 2) RedBull / Mixer patterns
      if (!autoProductId) {
        if (REDBULL_PATTERNS.test(rawName) && redbullProduct) {
          autoProductId = redbullProduct.id;
          autoNotes = "Auto-match: RedBull → " + redbullProduct.name;
        } else if (MIXER_PATTERNS.test(rawName) && mixerProduct) {
          autoProductId = mixerProduct.id;
          autoNotes = "Auto-match: Mixer → " + mixerProduct.name;
        }
      }

      // 3) raw_text memory
      if (!autoProductId) {
        const normalized = rawName.toLowerCase().trim();
        const match = (learnings || []).find((l: any) => {
          if (l.supplier_rut && supplierRut && l.supplier_rut !== supplierRut) return false;
          return l.raw_text?.toLowerCase().trim() === normalized;
        });
        if (match) {
          autoProductId = match.product_id;
          autoNotes = `Auto-match: ${match.confidence >= 0.9 ? "alta" : "media"} confianza (nombre)`;
        }
      }

      return {
        purchase_import_id,
        line_index: idx,
        raw_text: rawName,
        supplier_sku: supplierCode,
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

/**
 * Detect pack multiplier from product description.
 * Patterns observed in CCU invoices:
 *  - 6PFX4-LAT350 / 4PCX6-VNR330 / 6PACKX4 / 4PRX6 → N x M packs
 *  - 12PF-PET 600CC / 24PF-LAT250 → N units
 *  - PET1500X6-TR / PET1600X6-TR / LAT250X24 → trailing Xn = units
 */
function detectMultiplier(text: string): number {
  const t = text.toUpperCase();

  // 1) PACK-of-PACK: <N><PC|PX|PF|PR|PK|PACK>[X]<M>  e.g. 6PFX4, 4PCX6, 6PACKX4, 4PRX6
  const packOfPack = t.match(/(\d+)\s*(?:PC|PX|PF|PR|PK|PACK)\s*X\s*(\d+)/i);
  if (packOfPack) return parseInt(packOfPack[1]) * parseInt(packOfPack[2]);

  // 1b) OCR-tolerant: "6PF24" / "6PC24" / "4PR6" — OCR a veces lee la X como 2/4.
  //     Sólo aplica cuando el segundo número es chico (1-30 = unidades por pack).
  const packOcr = t.match(/(\d+)\s*(?:PC|PX|PF|PR|PK)\s*(\d+)\b/i);
  if (packOcr) {
    const a = parseInt(packOcr[1]);
    const b = parseInt(packOcr[2]);
    if (b > 0 && b <= 30) return a * b;
  }

  // 2) Trailing X<n> in things like PET1500X6, LAT250X24, VNR330X6
  const trailingX = t.match(/(?:PET|LAT|LATA|VNR|BOT|VID|TR)\s*\d+\s*X\s*(\d+)/i);
  if (trailingX) return parseInt(trailingX[1]);

  // 3) <N>PF standalone (no X following) → N units
  const pfAlone = t.match(/(\d+)\s*PF(?!\s*X)/i);
  if (pfAlone) return parseInt(pfAlone[1]);

  // 4) <N> UN / U / UND
  const unMatch = t.match(/(\d+)\s*(?:UN|UND|U)\b/i);
  if (unMatch) return parseInt(unMatch[1]);

  // 5) Generic <N>X<M>: heuristic — if first > 100 it's a size (ignore), use M
  const generic = t.match(/(\d+)\s*X\s*(\d+)/i);
  if (generic) {
    const a = parseInt(generic[1]);
    const b = parseInt(generic[2]);
    if (a > 100) return b;
    return a * b;
  }

  // 6) trailing standalone X<n>
  const xOnly = t.match(/\bX\s*(\d{2,})\b/i);
  if (xOnly) return parseInt(xOnly[1]);

  return 1;
}

async function extractWithAI(base64: string, fileType: string): Promise<any> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");

  const prompt = `You are extracting data from a Chilean electronic invoice (Factura Electrónica). Most invoices are from CCU (Comercial CCU S.A., beverages/alcohol). Photos may be rotated, dim, or taken on dark backgrounds — interpret accordingly.

Return ONLY JSON. No prose. No markdown.

CCU invoice line columns (left to right):
  Código | Descripción | Grado Alcoh | UM | Cantidad | Precio Unit | % (descuento) | Descuento | Valor | [P.U.] Unidad

For EACH product line extract:
  - supplier_code: the numeric "Código" (e.g. "871240", "4714"). Critical for SKU matching.
  - raw_product_name: full "Descripción" exactly as written (e.g. "RED BULL TRADIC LAT250X24").
  - qty_text: "Cantidad" (typically in cases / CJ).
  - uom_text: "UM" (CJ, UN, etc).
  - unit_price_text: "Precio Unit" (price per case before discount).
  - discount_text: percentage from "%" column (e.g. "21.04", "13.51"). Null if absent.
  - line_total_text: "Valor" (line subtotal after discount, before taxes).
  - line_type: "inventory" for products, "expense" for freight/services.

CRITICAL RULES:
1) IGNORE lines where Código is "9999" or Descripción contains "Flete", "Despacho", "Transporte". Mark them line_type: "expense" so we discard them.
2) Header totals:
   - net_total_text = "SUBTOTAL" or "NETO" (BEFORE IVA and BEFORE specific taxes ILA/IABA).
   - gross_total_text = "TOTAL FACTURA" (final total with IVA + ILA + IABA).
   - DO NOT include IVA, ILA VIN, ILA CER, IABA in the cost — they go to gross_total only.
3) Extract values EXACTLY as written. Use Chilean number format (1.234,56 → "1.234,56" string).
4) If a value is unclear or missing, use null. Never guess.

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
      "supplier_code": null,
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
