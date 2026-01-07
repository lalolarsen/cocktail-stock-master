import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_URL = "https://api.resend.com/emails";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface FinancialSummary {
  id: string;
  jornada_id: string;
  venue_id: string;
  venue_name: string;
  jornada_numero: number;
  jornada_fecha: string;
  ingresos_brutos: number;
  costo_ventas: number;
  utilidad_bruta: number;
  margen_bruto: number;
  gastos_operacionales: number;
  resultado_periodo: number;
  closed_by: string;
  closed_by_name: string;
  closed_at: string;
}

const formatCurrency = (amount: number) => 
  `$${amount.toLocaleString("es-CL")}`;

const formatPercentage = (value: number) =>
  `${value.toFixed(2)}%`;

function generateCsvContent(summary: FinancialSummary): string {
  const headers = [
    "Concepto",
    "Monto"
  ];
  
  const rows = [
    ["Jornada ID", summary.jornada_id],
    ["Jornada #", summary.jornada_numero.toString()],
    ["Fecha", summary.jornada_fecha],
    ["Venue", summary.venue_name],
    ["Cerrada por", summary.closed_by_name],
    ["Fecha cierre", summary.closed_at],
    ["", ""],
    ["--- ESTADO DE RESULTADOS ---", ""],
    ["Ingresos Brutos", summary.ingresos_brutos.toString()],
    ["Costo de Ventas", summary.costo_ventas.toString()],
    ["Utilidad Bruta", summary.utilidad_bruta.toString()],
    ["Margen Bruto (%)", summary.margen_bruto.toFixed(2)],
    ["Gastos Operacionales", summary.gastos_operacionales.toString()],
    ["Resultado del Período", summary.resultado_periodo.toString()],
  ];

  const csvLines = [
    headers.join(","),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(","))
  ];

  return csvLines.join("\n");
}

function buildEmailHtml(summary: FinancialSummary): string {
  const resultColor = summary.resultado_periodo >= 0 ? "#2e7d32" : "#d32f2f";
  const resultSign = summary.resultado_periodo >= 0 ? "+" : "";

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 650px; margin: 0 auto; padding: 20px; background: #f5f5f5;">
  
  <div style="background: linear-gradient(135deg, #1e3a5f 0%, #2d5a87 100%); color: white; padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
    <h1 style="margin: 0; font-size: 22px; font-weight: 600;">📊 Estado de Resultados</h1>
    <p style="margin: 12px 0 0; opacity: 0.9; font-size: 16px;">
      Jornada #${summary.jornada_numero} • ${summary.jornada_fecha}
    </p>
    <p style="margin: 8px 0 0; opacity: 0.7; font-size: 14px;">
      ${summary.venue_name}
    </p>
  </div>
  
  <div style="background: white; border: 1px solid #e0e0e0; border-top: none; padding: 0;">
    
    <!-- Resultado Principal -->
    <div style="padding: 25px; text-align: center; border-bottom: 1px solid #e0e0e0; background: ${summary.resultado_periodo >= 0 ? '#f1f8e9' : '#ffebee'};">
      <div style="font-size: 14px; color: #666; margin-bottom: 8px;">Resultado del Período</div>
      <div style="font-size: 36px; font-weight: 700; color: ${resultColor};">
        ${resultSign}${formatCurrency(summary.resultado_periodo)}
      </div>
    </div>

    <!-- KPIs Grid -->
    <div style="padding: 20px;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 15px; text-align: center; width: 33%; border-right: 1px solid #e0e0e0;">
            <div style="font-size: 12px; color: #666; margin-bottom: 4px;">Ingresos Brutos</div>
            <div style="font-size: 20px; font-weight: 600; color: #333;">${formatCurrency(summary.ingresos_brutos)}</div>
          </td>
          <td style="padding: 15px; text-align: center; width: 33%; border-right: 1px solid #e0e0e0;">
            <div style="font-size: 12px; color: #666; margin-bottom: 4px;">Costo de Ventas</div>
            <div style="font-size: 20px; font-weight: 600; color: #d32f2f;">${formatCurrency(summary.costo_ventas)}</div>
          </td>
          <td style="padding: 15px; text-align: center; width: 33%;">
            <div style="font-size: 12px; color: #666; margin-bottom: 4px;">Utilidad Bruta</div>
            <div style="font-size: 20px; font-weight: 600; color: #333;">${formatCurrency(summary.utilidad_bruta)}</div>
          </td>
        </tr>
      </table>
    </div>

    <!-- Detalle -->
    <div style="padding: 0 20px 20px;">
      <table style="width: 100%; font-size: 14px; border-collapse: collapse; background: #fafafa; border-radius: 8px;">
        <tr style="border-bottom: 1px solid #e0e0e0;">
          <td style="padding: 12px 16px; color: #666;">Ingresos Brutos</td>
          <td style="padding: 12px 16px; text-align: right; font-weight: 600;">${formatCurrency(summary.ingresos_brutos)}</td>
        </tr>
        <tr style="border-bottom: 1px solid #e0e0e0;">
          <td style="padding: 12px 16px; color: #666;">(-) Costo de Ventas</td>
          <td style="padding: 12px 16px; text-align: right; font-weight: 600; color: #d32f2f;">${formatCurrency(summary.costo_ventas)}</td>
        </tr>
        <tr style="border-bottom: 1px solid #e0e0e0; background: #f0f0f0;">
          <td style="padding: 12px 16px; font-weight: 600;">= Utilidad Bruta</td>
          <td style="padding: 12px 16px; text-align: right; font-weight: 700;">${formatCurrency(summary.utilidad_bruta)}</td>
        </tr>
        <tr style="border-bottom: 1px solid #e0e0e0;">
          <td style="padding: 12px 16px; color: #666; padding-left: 24px;">Margen Bruto</td>
          <td style="padding: 12px 16px; text-align: right; font-weight: 600;">${formatPercentage(summary.margen_bruto)}</td>
        </tr>
        <tr style="border-bottom: 1px solid #e0e0e0;">
          <td style="padding: 12px 16px; color: #666;">(-) Gastos Operacionales</td>
          <td style="padding: 12px 16px; text-align: right; font-weight: 600; color: #d32f2f;">${formatCurrency(summary.gastos_operacionales)}</td>
        </tr>
        <tr style="background: ${summary.resultado_periodo >= 0 ? '#e8f5e9' : '#ffebee'};">
          <td style="padding: 14px 16px; font-weight: 700; font-size: 15px;">= Resultado del Período</td>
          <td style="padding: 14px 16px; text-align: right; font-weight: 700; font-size: 15px; color: ${resultColor};">
            ${resultSign}${formatCurrency(summary.resultado_periodo)}
          </td>
        </tr>
      </table>
    </div>

    <!-- Metadata -->
    <div style="padding: 20px; background: #f5f5f5; border-top: 1px solid #e0e0e0;">
      <table style="width: 100%; font-size: 12px; color: #666;">
        <tr>
          <td style="padding: 4px 0;">
            <strong>Jornada ID:</strong> ${summary.jornada_id}
          </td>
        </tr>
        <tr>
          <td style="padding: 4px 0;">
            <strong>Cerrada por:</strong> ${summary.closed_by_name}
          </td>
        </tr>
        <tr>
          <td style="padding: 4px 0;">
            <strong>Fecha de cierre:</strong> ${new Date(summary.closed_at).toLocaleString("es-CL", { 
              timeZone: "America/Santiago",
              year: "numeric",
              month: "2-digit", 
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit"
            })}
          </td>
        </tr>
      </table>
    </div>

  </div>
  
  <div style="text-align: center; padding: 20px; font-size: 12px; color: #999;">
    Este es un correo automático generado por CoctelStock.
    <br>Se adjunta CSV con el resumen financiero.
  </div>
  
</body>
</html>`;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const MAX_RETRIES = 3;
  const RETRY_DELAY_MS = 2000;

  try {
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      console.error("RESEND_API_KEY not configured");
      return new Response(
        JSON.stringify({ success: false, error: "Email service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check demo mode
    const { data: demoVenue } = await supabase
      .from("venues")
      .select("id, is_demo")
      .eq("is_demo", true)
      .maybeSingle();

    if (demoVenue?.is_demo) {
      console.log("[send-financial-summary] Demo mode - skipping emails");
      return new Response(
        JSON.stringify({ success: true, message: "Demo mode - emails blocked", sent: 0, failed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch queued financial_summary notifications
    const { data: queuedNotifications, error: fetchError } = await supabase
      .from("notification_logs")
      .select("*")
      .eq("status", "queued")
      .eq("event_type", "financial_summary")
      .limit(50);

    if (fetchError) throw fetchError;

    if (!queuedNotifications || queuedNotifications.length === 0) {
      console.log("No queued financial_summary notifications");
      return new Response(
        JSON.stringify({ success: true, processed: 0, message: "No pending notifications" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Processing ${queuedNotifications.length} financial summary notifications`);

    const summaryCache = new Map<string, FinancialSummary>();
    const results: Array<{ id: string; status: string; error?: string }> = [];

    for (const notification of queuedNotifications) {
      try {
        let summary = summaryCache.get(notification.jornada_id);

        if (!summary) {
          // Fetch financial summary with related data
          const { data: financialData, error: financialError } = await supabase
            .from("jornada_financial_summary")
            .select(`
              *,
              jornadas!inner(numero_jornada, fecha),
              venues!inner(name),
              profiles!jornada_financial_summary_closed_by_fkey(full_name, email)
            `)
            .eq("jornada_id", notification.jornada_id)
            .single();

          if (financialError || !financialData) {
            throw new Error(`Financial summary not found for jornada ${notification.jornada_id}`);
          }

          summary = {
            id: financialData.id,
            jornada_id: financialData.jornada_id,
            venue_id: financialData.venue_id,
            venue_name: (financialData.venues as any)?.name || "Venue",
            jornada_numero: (financialData.jornadas as any)?.numero_jornada || 0,
            jornada_fecha: (financialData.jornadas as any)?.fecha || "",
            ingresos_brutos: financialData.ingresos_brutos,
            costo_ventas: financialData.costo_ventas,
            utilidad_bruta: financialData.utilidad_bruta,
            margen_bruto: Number(financialData.margen_bruto),
            gastos_operacionales: financialData.gastos_operacionales,
            resultado_periodo: financialData.resultado_periodo,
            closed_by: financialData.closed_by,
            closed_by_name: (financialData.profiles as any)?.full_name || (financialData.profiles as any)?.email || "Usuario",
            closed_at: financialData.closed_at,
          };

          summaryCache.set(notification.jornada_id, summary);
        }

        // Generate email content
        const emailHtml = buildEmailHtml(summary);
        const csvContent = generateCsvContent(summary);
        const csvBase64 = btoa(unescape(encodeURIComponent(csvContent)));

        // Send email with retry logic
        let lastError: Error | null = null;
        let sent = false;

        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
          try {
            const response = await fetch(RESEND_API_URL, {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${resendApiKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                from: "CoctelStock <onboarding@resend.dev>",
                to: [notification.recipient_email],
                subject: notification.email_subject,
                html: emailHtml,
                attachments: [
                  {
                    filename: `estado_resultados_jornada_${summary.jornada_numero}_${summary.jornada_fecha}.csv`,
                    content: csvBase64,
                  }
                ],
              }),
            });

            if (!response.ok) {
              const errorData = await response.json();
              throw new Error(errorData.message || `HTTP ${response.status}`);
            }

            sent = true;
            break;
          } catch (err: any) {
            lastError = err;
            console.warn(`Attempt ${attempt} failed for ${notification.recipient_email}: ${err.message}`);
            if (attempt < MAX_RETRIES) {
              await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * attempt));
            }
          }
        }

        if (sent) {
          await supabase
            .from("notification_logs")
            .update({ status: "sent", sent_at: new Date().toISOString() })
            .eq("id", notification.id);

          results.push({ id: notification.id, status: "sent" });
          console.log(`Email sent to ${notification.recipient_email}`);
        } else {
          throw lastError || new Error("Failed after retries");
        }

      } catch (error: any) {
        console.error(`Failed notification ${notification.id}:`, error);

        await supabase
          .from("notification_logs")
          .update({ 
            status: "failed", 
            error_message: error.message || "Unknown error" 
          })
          .eq("id", notification.id);

        results.push({ id: notification.id, status: "failed", error: error.message });
      }
    }

    const sentCount = results.filter(r => r.status === "sent").length;
    const failedCount = results.filter(r => r.status === "failed").length;

    return new Response(
      JSON.stringify({
        success: true,
        processed: results.length,
        sent: sentCount,
        failed: failedCount,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Error in send-financial-summary:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
