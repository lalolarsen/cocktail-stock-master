import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch products and their movement history
    const { data: products, error: productsError } = await supabase
      .from("products")
      .select("*");

    if (productsError) throw productsError;

    const { data: movements, error: movementsError } = await supabase
      .from("stock_movements")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);

    if (movementsError) throw movementsError;

    // Prepare data for AI analysis
    const prompt = `Analiza los siguientes datos de inventario de un negocio de coctelería y genera predicciones de consumo:

Productos:
${JSON.stringify(products, null, 2)}

Últimos movimientos de stock:
${JSON.stringify(movements, null, 2)}

Por favor, proporciona:
1. Predicción de consumo para los próximos 7 días para cada producto
2. Productos que necesitarán reposición pronto
3. Recomendaciones de compra basadas en patrones de consumo
4. Análisis de tendencias de consumo por categoría

Responde en formato JSON con la siguiente estructura:
{
  "predictions": [
    {
      "product_id": "uuid",
      "product_name": "nombre",
      "predicted_consumption_7days": número,
      "days_until_stockout": número,
      "recommended_order_quantity": número
    }
  ],
  "insights": {
    "high_consumption_products": [],
    "low_stock_warnings": [],
    "category_trends": {}
  }
}`;

    // Call Lovable AI
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "Eres un experto en análisis predictivo de inventarios para negocios de coctelería. Analiza datos históricos y genera predicciones precisas.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI API error:", aiResponse.status, errorText);
      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const aiContent = aiData.choices[0].message.content;

    // Parse AI response
    let predictions;
    try {
      const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        predictions = JSON.parse(jsonMatch[0]);
      } else {
        predictions = { raw_response: aiContent };
      }
    } catch (e) {
      predictions = { raw_response: aiContent };
    }

    // Save predictions to database
    if (predictions.predictions) {
      for (const pred of predictions.predictions) {
        await supabase.from("stock_predictions").insert({
          product_id: pred.product_id,
          predicted_consumption: pred.predicted_consumption_7days,
          prediction_period: "7_days",
          confidence_score: 0.85,
        });
      }
    }

    return new Response(JSON.stringify(predictions), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in predict-consumption:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
