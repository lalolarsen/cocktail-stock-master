import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_URL = "https://api.resend.com/emails";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface JornadaSummary {
  jornada: {
    id: string;
    numero_jornada: number;
    fecha: string;
    hora_apertura: string | null;
    hora_cierre: string | null;
  };
  sales: {
    total_active: number;
    total_cancelled: number;
    net_total: number;
    transactions_count: number;
    cash_total: number;
    card_total: number;
  };
  top_cocktails: Array<{ name: string; quantity: number; revenue: number }>;
  stock_alerts: Array<{ product_name: string; message: string }>;
  cash_register: {
    opening_cash: number;
    closing_cash: number | null;
    expected_cash: number | null;
    difference: number | null;
  } | null;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      console.error("RESEND_API_KEY not configured");
      return new Response(
        JSON.stringify({ success: false, error: "Email service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const sendEmail = async (to: string, subject: string, html: string) => {
      const response = await fetch(RESEND_API_URL, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "CoctelStock <onboarding@resend.dev>",
          to: [to],
          subject,
          html,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to send email");
      }

      return response.json();
    };

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get request body (optional jornada_id to process specific jornada)
    let jornadaId: string | null = null;
    try {
      const body = await req.json();
      jornadaId = body.jornada_id || null;
    } catch {
      // No body provided, will process all queued notifications
    }

    // Fetch queued notifications
    let query = supabase
      .from("notification_logs")
      .select("*")
      .eq("status", "queued")
      .eq("event_type", "jornada_closed");

    if (jornadaId) {
      query = query.eq("jornada_id", jornadaId);
    }

    const { data: queuedNotifications, error: fetchError } = await query.limit(50);

    if (fetchError) {
      console.error("Error fetching queued notifications:", fetchError);
      throw fetchError;
    }

    if (!queuedNotifications || queuedNotifications.length === 0) {
      console.log("No queued notifications to process");
      return new Response(
        JSON.stringify({ success: true, processed: 0, message: "No pending notifications" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Processing ${queuedNotifications.length} queued notifications`);

    // Group by jornada_id to avoid fetching same data multiple times
    const jornadaCache = new Map<string, JornadaSummary>();
    const results: Array<{ id: string; status: string; error?: string }> = [];

    for (const notification of queuedNotifications) {
      try {
        let summary = jornadaCache.get(notification.jornada_id);

        if (!summary) {
          // Fetch jornada details
          const { data: jornada, error: jornadaError } = await supabase
            .from("jornadas")
            .select("*")
            .eq("id", notification.jornada_id)
            .single();

          if (jornadaError || !jornada) {
            throw new Error("Jornada not found");
          }

          // Fetch sales summary
          const { data: salesData, error: salesError } = await supabase
            .from("sales")
            .select("id, total_amount, is_cancelled, payment_method")
            .eq("jornada_id", notification.jornada_id);

          if (salesError) throw salesError;

          const activeSales = salesData?.filter((s) => !s.is_cancelled) || [];
          const cancelledSales = salesData?.filter((s) => s.is_cancelled) || [];

          const salesSummary = {
            total_active: activeSales.reduce((sum, s) => sum + Number(s.total_amount), 0),
            total_cancelled: cancelledSales.reduce((sum, s) => sum + Number(s.total_amount), 0),
            net_total: activeSales.reduce((sum, s) => sum + Number(s.total_amount), 0),
            transactions_count: activeSales.length,
            cash_total: activeSales
              .filter((s) => s.payment_method === "cash")
              .reduce((sum, s) => sum + Number(s.total_amount), 0),
            card_total: activeSales
              .filter((s) => s.payment_method !== "cash")
              .reduce((sum, s) => sum + Number(s.total_amount), 0),
          };

          // Fetch top cocktails - manual query (no RPC function)
          let topCocktailsData: any[] | null = null;
          try {
            const { data } = await supabase.rpc("get_top_cocktails_for_jornada", {
              p_jornada_id: notification.jornada_id,
            });
            topCocktailsData = data;
          } catch {
            topCocktailsData = null;
          }

          // Fallback: manual query if RPC doesn't exist
          let cocktailsResult: Array<{ name: string; quantity: number; revenue: number }> = [];
          if (!topCocktailsData) {
            const activeSaleIds = activeSales.map((s) => s.id);
            if (activeSaleIds.length > 0) {
              const { data: saleItems } = await supabase
                .from("sale_items")
                .select("cocktail_id, quantity, subtotal, cocktails(name)")
                .in("sale_id", activeSaleIds);

              if (saleItems) {
                const cocktailMap = new Map<string, { name: string; quantity: number; revenue: number }>();
                for (const item of saleItems) {
                  const cocktailName = (item.cocktails as any)?.name || "Unknown";
                  const existing = cocktailMap.get(cocktailName) || { name: cocktailName, quantity: 0, revenue: 0 };
                  existing.quantity += item.quantity;
                  existing.revenue += Number(item.subtotal);
                  cocktailMap.set(cocktailName, existing);
                }
                cocktailsResult = Array.from(cocktailMap.values())
                  .sort((a, b) => b.quantity - a.quantity)
                  .slice(0, 5);
              }
            }
          } else {
            cocktailsResult = topCocktailsData;
          }

          // Fetch stock alerts for jornada
          const { data: stockAlerts } = await supabase
            .from("stock_alerts")
            .select("message, products(name)")
            .eq("jornada_id", notification.jornada_id)
            .limit(10);

          const alertsResult = stockAlerts?.map((a) => ({
            product_name: (a.products as any)?.name || "Producto",
            message: a.message,
          })) || [];

          // Fetch cash register data
          const { data: cashRegister } = await supabase
            .from("cash_registers")
            .select("*")
            .eq("jornada_id", notification.jornada_id)
            .single();

          summary = {
            jornada: {
              id: jornada.id,
              numero_jornada: jornada.numero_jornada,
              fecha: jornada.fecha,
              hora_apertura: jornada.hora_apertura,
              hora_cierre: jornada.hora_cierre,
            },
            sales: salesSummary,
            top_cocktails: cocktailsResult,
            stock_alerts: alertsResult,
            cash_register: cashRegister
              ? {
                  opening_cash: cashRegister.opening_cash,
                  closing_cash: cashRegister.closing_cash,
                  expected_cash: cashRegister.expected_cash,
                  difference: cashRegister.difference,
                }
              : null,
          };

          jornadaCache.set(notification.jornada_id, summary);
        }

        // Build email HTML
        const emailHtml = buildEmailHtml(summary);

        // Send email
        await sendEmail(
          notification.recipient_email,
          notification.email_subject || `Resumen de Jornada #${summary.jornada.numero_jornada}`,
          emailHtml
        );

        // Mark as sent
        await supabase
          .from("notification_logs")
          .update({ status: "sent", sent_at: new Date().toISOString() })
          .eq("id", notification.id);

        results.push({ id: notification.id, status: "sent" });
        console.log(`Email sent to ${notification.recipient_email}`);

      } catch (error: any) {
        console.error(`Failed to send notification ${notification.id}:`, error);

        // Mark as failed
        await supabase
          .from("notification_logs")
          .update({ status: "failed", error_message: error.message || "Unknown error" })
          .eq("id", notification.id);

        results.push({ id: notification.id, status: "failed", error: error.message });
      }
    }

    const sentCount = results.filter((r) => r.status === "sent").length;
    const failedCount = results.filter((r) => r.status === "failed").length;

    return new Response(
      JSON.stringify({
        success: true,
        processed: results.length,
        sent: sentCount,
        failed: failedCount,
        results,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Error in send-jornada-summary:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

function buildEmailHtml(summary: JornadaSummary): string {
  const formatCurrency = (amount: number) => 
    `$${amount.toLocaleString("es-CL")}`;

  const cocktailRows = summary.top_cocktails
    .map(
      (c) => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #eee;">${c.name}</td>
        <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">${c.quantity}</td>
        <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">${formatCurrency(c.revenue)}</td>
      </tr>
    `
    )
    .join("");

  const alertsList = summary.stock_alerts
    .map((a) => `<li style="margin-bottom: 4px;">${a.message}</li>`)
    .join("");

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
        <h1 style="margin: 0; font-size: 24px;">Resumen de Jornada</h1>
        <p style="margin: 10px 0 0; opacity: 0.9;">
          Jornada #${summary.jornada.numero_jornada} • ${summary.jornada.fecha}
        </p>
      </div>
      
      <div style="background: #f8f9fa; padding: 20px; border: 1px solid #e9ecef;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 15px;">
          <span style="color: #666;">Apertura:</span>
          <strong>${summary.jornada.hora_apertura || "N/A"}</strong>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span style="color: #666;">Cierre:</span>
          <strong>${summary.jornada.hora_cierre || "N/A"}</strong>
        </div>
      </div>
      
      <div style="padding: 25px 20px; background: white; border: 1px solid #e9ecef; border-top: none;">
        <h2 style="margin: 0 0 20px; font-size: 18px; color: #333;">💰 Ventas</h2>
        
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <tr>
            <td style="padding: 12px; background: #e8f5e9; border-radius: 8px; text-align: center;">
              <div style="font-size: 24px; font-weight: bold; color: #2e7d32;">
                ${formatCurrency(summary.sales.net_total)}
              </div>
              <div style="font-size: 12px; color: #666; margin-top: 4px;">Total Neto</div>
            </td>
          </tr>
        </table>
        
        <table style="width: 100%; font-size: 14px; margin-bottom: 20px;">
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #eee;">Transacciones</td>
            <td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right; font-weight: 600;">${summary.sales.transactions_count}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #eee;">Ventas Activas</td>
            <td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right; font-weight: 600;">${formatCurrency(summary.sales.total_active)}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #eee;">Efectivo</td>
            <td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right;">${formatCurrency(summary.sales.cash_total)}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #eee;">Tarjetas/Otros</td>
            <td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right;">${formatCurrency(summary.sales.card_total)}</td>
          </tr>
          ${summary.sales.total_cancelled > 0 ? `
          <tr>
            <td style="padding: 8px 0; color: #d32f2f;">Canceladas</td>
            <td style="padding: 8px 0; text-align: right; color: #d32f2f;">-${formatCurrency(summary.sales.total_cancelled)}</td>
          </tr>
          ` : ""}
        </table>
        
        ${summary.cash_register ? `
        <h2 style="margin: 25px 0 15px; font-size: 18px; color: #333;">🏦 Caja</h2>
        <table style="width: 100%; font-size: 14px; margin-bottom: 20px;">
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #eee;">Apertura</td>
            <td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right;">${formatCurrency(summary.cash_register.opening_cash)}</td>
          </tr>
          ${summary.cash_register.closing_cash !== null ? `
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #eee;">Cierre</td>
            <td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right;">${formatCurrency(summary.cash_register.closing_cash)}</td>
          </tr>
          ` : ""}
          ${summary.cash_register.expected_cash !== null ? `
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #eee;">Esperado</td>
            <td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right;">${formatCurrency(summary.cash_register.expected_cash)}</td>
          </tr>
          ` : ""}
          ${summary.cash_register.difference !== null ? `
          <tr>
            <td style="padding: 8px 0; font-weight: 600;">Diferencia</td>
            <td style="padding: 8px 0; text-align: right; font-weight: 600; color: ${summary.cash_register.difference >= 0 ? '#2e7d32' : '#d32f2f'};">
              ${summary.cash_register.difference >= 0 ? '+' : ''}${formatCurrency(summary.cash_register.difference)}
            </td>
          </tr>
          ` : ""}
        </table>
        ` : ""}
        
        ${summary.top_cocktails.length > 0 ? `
        <h2 style="margin: 25px 0 15px; font-size: 18px; color: #333;">🍹 Top Productos</h2>
        <table style="width: 100%; font-size: 14px; border-collapse: collapse;">
          <thead>
            <tr style="background: #f5f5f5;">
              <th style="padding: 10px 8px; text-align: left; font-weight: 600;">Producto</th>
              <th style="padding: 10px 8px; text-align: center; font-weight: 600;">Qty</th>
              <th style="padding: 10px 8px; text-align: right; font-weight: 600;">Ingresos</th>
            </tr>
          </thead>
          <tbody>
            ${cocktailRows}
          </tbody>
        </table>
        ` : ""}
        
        ${summary.stock_alerts.length > 0 ? `
        <h2 style="margin: 25px 0 15px; font-size: 18px; color: #333;">⚠️ Alertas de Stock</h2>
        <ul style="margin: 0; padding-left: 20px; font-size: 14px; color: #f57c00;">
          ${alertsList}
        </ul>
        ` : ""}
      </div>
      
      <div style="background: #f8f9fa; padding: 20px; text-align: center; border-radius: 0 0 10px 10px; border: 1px solid #e9ecef; border-top: none;">
        <p style="margin: 0; font-size: 12px; color: #666;">
          Este es un correo automático de CoctelStock. No responder a este mensaje.
        </p>
      </div>
      
    </body>
    </html>
  `;
}

serve(handler);
