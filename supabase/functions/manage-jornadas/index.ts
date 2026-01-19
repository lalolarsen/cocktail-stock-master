import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface JornadaConfig {
  dia_semana: number;
  hora_apertura: string;
  hora_cierre: string;
  activo: boolean;
}

// Helper to log audit events
async function logJornadaAudit(
  supabase: any,
  params: {
    venueId: string | null;
    jornadaId: string;
    action: string;
    actorSource: string;
    reason?: string;
    meta?: Record<string, any>;
  }
) {
  try {
    await supabase.from("jornada_audit_log").insert({
      venue_id: params.venueId,
      jornada_id: params.jornadaId,
      action: params.action,
      actor_source: params.actorSource,
      reason: params.reason || null,
      meta: params.meta || {},
    });
    console.log(`[AUDIT] ${params.action} for jornada ${params.jornadaId}: ${params.reason || 'no reason'}`);
  } catch (err) {
    console.error("Failed to log audit event:", err);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const now = new Date();
    const currentDayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday...
    const currentTime = now.toTimeString().slice(0, 5); // HH:MM format
    const today = now.toISOString().split("T")[0];

    console.log(`[manage-jornadas] Running at ${now.toISOString()}, day=${currentDayOfWeek}, time=${currentTime}`);

    // Get week start (Monday)
    const daysSinceMonday = currentDayOfWeek === 0 ? 6 : currentDayOfWeek - 1;
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - daysSinceMonday);
    const weekStartStr = weekStart.toISOString().split("T")[0];

    // Check if auto-close is enabled (check first venue's settings as global default)
    const { data: cashSettings } = await supabase
      .from("jornada_cash_settings")
      .select("auto_close_enabled, venue_id")
      .limit(1)
      .maybeSingle();

    const autoCloseEnabled = cashSettings?.auto_close_enabled ?? false;
    console.log(`[manage-jornadas] auto_close_enabled=${autoCloseEnabled}`);

    // Get jornada config for today
    const { data: config, error: configError } = await supabase
      .from("jornada_config")
      .select("*")
      .eq("dia_semana", currentDayOfWeek)
      .eq("activo", true)
      .maybeSingle();

    if (configError) throw configError;

    // If no config for today, DO NOT auto-close - just log and return
    if (!config) {
      console.log("[manage-jornadas] No jornada config for today - skipping any auto operations");
      // SAFETY: We no longer auto-close when there's no config
      return new Response(
        JSON.stringify({ 
          message: "No jornada scheduled for today", 
          auto_close_enabled: autoCloseEnabled,
          skipped_auto_close: true 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Count jornadas this week to get the next number
    const { data: weekJornadas, error: weekError } = await supabase
      .from("jornadas")
      .select("numero_jornada")
      .eq("semana_inicio", weekStartStr)
      .order("numero_jornada", { ascending: false });

    if (weekError) throw weekError;

    const lastJornadaNum = weekJornadas?.[0]?.numero_jornada || 0;

    // Check if jornada for today already exists
    const { data: existingJornada, error: existingError } = await supabase
      .from("jornadas")
      .select("*")
      .eq("fecha", today)
      .maybeSingle();

    if (existingError) throw existingError;

    let result = { action: "none", jornada: null as any, auto_close_enabled: autoCloseEnabled };

    // If jornada exists for today
    if (existingJornada) {
      console.log(`[manage-jornadas] Existing jornada found: id=${existingJornada.id}, estado=${existingJornada.estado}`);
      
      // Check if it should be opened (auto-open is safe)
      if (existingJornada.estado === "pendiente" && currentTime >= config.hora_apertura) {
        const { data: opened, error: openError } = await supabase
          .from("jornadas")
          .update({ estado: "activa", hora_apertura: currentTime })
          .eq("id", existingJornada.id)
          .select()
          .single();

        if (openError) throw openError;
        
        await logJornadaAudit(supabase, {
          venueId: existingJornada.venue_id,
          jornadaId: existingJornada.id,
          action: "opened",
          actorSource: "edge_manage-jornadas",
          reason: `Auto-opened at ${currentTime} (config hora_apertura: ${config.hora_apertura})`,
          meta: { config_snapshot: config, current_time: currentTime },
        });
        
        result = { action: "opened", jornada: opened, auto_close_enabled: autoCloseEnabled };
      }
      // SAFETY GUARD: Only auto-close if explicitly enabled
      else if (existingJornada.estado === "activa" && currentTime >= config.hora_cierre) {
        if (autoCloseEnabled) {
          const { data: closed, error: closeError } = await supabase
            .from("jornadas")
            .update({ estado: "cerrada", hora_cierre: currentTime })
            .eq("id", existingJornada.id)
            .select()
            .single();

          if (closeError) throw closeError;
          
          await logJornadaAudit(supabase, {
            venueId: existingJornada.venue_id,
            jornadaId: existingJornada.id,
            action: "auto_closed",
            actorSource: "edge_manage-jornadas",
            reason: `Auto-closed at ${currentTime} (config hora_cierre: ${config.hora_cierre})`,
            meta: { config_snapshot: config, current_time: currentTime, auto_close_enabled: true },
          });
          
          result = { action: "closed", jornada: closed, auto_close_enabled: autoCloseEnabled };
        } else {
          console.log(`[manage-jornadas] SKIPPED auto-close: auto_close_enabled=false`);
          result = { action: "skipped_auto_close", jornada: existingJornada, auto_close_enabled: autoCloseEnabled };
        }
      } else {
        result = { action: "no_change", jornada: existingJornada, auto_close_enabled: autoCloseEnabled };
      }
    } else {
      // Create new jornada for today
      const newJornadaNum = lastJornadaNum + 1;
      
      // Only create if we're past opening time
      if (currentTime >= config.hora_apertura) {
        // SAFETY: Never auto-create as closed
        const { data: created, error: createError } = await supabase
          .from("jornadas")
          .insert({
            numero_jornada: newJornadaNum,
            semana_inicio: weekStartStr,
            fecha: today,
            hora_apertura: currentTime,
            estado: "activa", // Always create as active, never as closed
            hora_cierre: null,
          })
          .select()
          .single();

        if (createError) throw createError;
        
        await logJornadaAudit(supabase, {
          venueId: created.venue_id,
          jornadaId: created.id,
          action: "opened",
          actorSource: "edge_manage-jornadas",
          reason: `Created and opened at ${currentTime}`,
          meta: { config_snapshot: config, current_time: currentTime },
        });
        
        result = { action: "created", jornada: created, auto_close_enabled: autoCloseEnabled };
      } else {
        // Create as pending
        const { data: created, error: createError } = await supabase
          .from("jornadas")
          .insert({
            numero_jornada: newJornadaNum,
            semana_inicio: weekStartStr,
            fecha: today,
            estado: "pendiente",
          })
          .select()
          .single();

        if (createError) throw createError;
        
        await logJornadaAudit(supabase, {
          venueId: created.venue_id,
          jornadaId: created.id,
          action: "created_pending",
          actorSource: "edge_manage-jornadas",
          reason: `Created as pending, waiting for hora_apertura: ${config.hora_apertura}`,
          meta: { config_snapshot: config, current_time: currentTime },
        });
        
        result = { action: "created_pending", jornada: created, auto_close_enabled: autoCloseEnabled };
      }
    }

    console.log(`[manage-jornadas] Result: ${JSON.stringify(result)}`);
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error managing jornadas:", error);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
