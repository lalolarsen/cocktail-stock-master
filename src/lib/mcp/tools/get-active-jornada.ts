import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_active_jornada",
  title: "Jornada activa",
  description: "Devuelve la jornada (turno) actualmente abierta, si existe.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_args, ctx) => {
    const sb = supabaseForUser(ctx);
    const { data, error } = await sb
      .from("jornadas")
      .select("id, numero_jornada, nombre, fecha, hora_apertura, estado")
      .eq("estado", "activa")
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) throw new ToolError(error.message);
    const j = data?.[0];
    if (!j) return { content: [{ type: "text", text: "No hay jornada activa." }] };
    const jornada = {
      id: String(j.id),
      numero: Number(j.numero_jornada),
      nombre: String(j.nombre ?? ""),
      fecha: String(j.fecha),
      hora_apertura: j.hora_apertura ? String(j.hora_apertura) : null,
    };
    return { content: [{ type: "text", text: JSON.stringify(jornada) }], structuredContent: { jornada } };
  },
});
