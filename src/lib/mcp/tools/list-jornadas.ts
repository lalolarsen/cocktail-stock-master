import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_jornadas",
  title: "Listar jornadas",
  description: "Lista las jornadas más recientes con su estado y fecha.",
  inputSchema: { limit: z.number().int().min(1).max(50).default(10).describe("Cantidad de jornadas (1-50).") },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit }, ctx) => {
    const sb = supabaseForUser(ctx);
    const { data, error } = await sb
      .from("jornadas")
      .select("id, numero_jornada, nombre, fecha, estado, forced_close")
      .order("fecha", { ascending: false })
      .limit(limit);
    if (error) throw new ToolError(error.message);
    const jornadas = (data ?? []).map((j) => ({
      id: String(j.id),
      numero: Number(j.numero_jornada),
      nombre: String(j.nombre ?? ""),
      fecha: String(j.fecha),
      estado: String(j.estado),
      cierre_forzado: Boolean(j.forced_close),
    }));
    return { content: [{ type: "text", text: JSON.stringify(jornadas) }], structuredContent: { jornadas } };
  },
});
