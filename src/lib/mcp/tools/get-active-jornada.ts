import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function client(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "get_active_jornada",
  title: "Obtener jornada activa",
  description:
    "Devuelve la jornada (turno operativo) activa en Berlín Valdivia con su ID, fecha, hora de apertura y responsables.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "No autenticado" }], isError: true };

    const sb = client(ctx);
    const { data, error } = await sb
      .from("jornadas")
      .select("id, fecha, estado, apertura_at, opened_by, notas")
      .eq("estado", "activa")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error)
      return { content: [{ type: "text", text: error.message }], isError: true };
    if (!data)
      return { content: [{ type: "text", text: "No hay jornada activa." }], structuredContent: { active: false } };

    return {
      content: [{ type: "text", text: `Jornada activa ${data.id} (${data.fecha}), abierta ${data.apertura_at}` }],
      structuredContent: { active: true, jornada: data },
    };
  },
});
