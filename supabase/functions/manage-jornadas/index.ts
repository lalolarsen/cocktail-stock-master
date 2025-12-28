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

    // Get week start (Monday)
    const daysSinceMonday = currentDayOfWeek === 0 ? 6 : currentDayOfWeek - 1;
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - daysSinceMonday);
    const weekStartStr = weekStart.toISOString().split("T")[0];

    // Get jornada config for today
    const { data: config, error: configError } = await supabase
      .from("jornada_config")
      .select("*")
      .eq("dia_semana", currentDayOfWeek)
      .eq("activo", true)
      .maybeSingle();

    if (configError) throw configError;

    // If no config for today, close any active jornada
    if (!config) {
      await supabase
        .from("jornadas")
        .update({ estado: "cerrada", hora_cierre: currentTime })
        .eq("estado", "activa");

      return new Response(
        JSON.stringify({ message: "No jornada scheduled for today", closed: true }),
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

    let result = { action: "none", jornada: null as any };

    // If jornada exists for today
    if (existingJornada) {
      // Check if it should be opened
      if (existingJornada.estado === "pendiente" && currentTime >= config.hora_apertura) {
        const { data: opened, error: openError } = await supabase
          .from("jornadas")
          .update({ estado: "activa", hora_apertura: currentTime })
          .eq("id", existingJornada.id)
          .select()
          .single();

        if (openError) throw openError;
        result = { action: "opened", jornada: opened };
      }
      // Check if it should be closed
      else if (existingJornada.estado === "activa" && currentTime >= config.hora_cierre) {
        const { data: closed, error: closeError } = await supabase
          .from("jornadas")
          .update({ estado: "cerrada", hora_cierre: currentTime })
          .eq("id", existingJornada.id)
          .select()
          .single();

        if (closeError) throw closeError;
        result = { action: "closed", jornada: closed };
      } else {
        result = { action: "no_change", jornada: existingJornada };
      }
    } else {
      // Create new jornada for today
      const newJornadaNum = lastJornadaNum + 1;
      
      // Only create if we're past opening time
      if (currentTime >= config.hora_apertura) {
        const { data: created, error: createError } = await supabase
          .from("jornadas")
          .insert({
            numero_jornada: newJornadaNum,
            semana_inicio: weekStartStr,
            fecha: today,
            hora_apertura: currentTime,
            estado: currentTime >= config.hora_cierre ? "cerrada" : "activa",
            hora_cierre: currentTime >= config.hora_cierre ? currentTime : null,
          })
          .select()
          .single();

        if (createError) throw createError;
        result = { action: "created", jornada: created };
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
        result = { action: "created_pending", jornada: created };
      }
    }

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
