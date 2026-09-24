import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_jornada_sales_summary",
  title: "Resumen de ventas de jornada",
  description: "Total de ventas (CLP) de una jornada, desglosado por categoría, método de pago y punto de venta.",
  inputSchema: { jornada_id: z.string().uuid().describe("ID de la jornada (usa list_jornadas o get_active_jornada).") },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ jornada_id }, ctx) => {
    const sb = supabaseForUser(ctx);
    const rows: { total_amount: number; sale_category: string; payment_method: string; point_of_sale: string }[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb
        .from("sales")
        .select("total_amount, sale_category, payment_method, point_of_sale")
        .eq("jornada_id", jornada_id)
        .eq("is_cancelled", false)
        .range(from, from + 999);
      if (error) throw new ToolError(error.message);
      rows.push(...((data ?? []) as typeof rows));
      if (!data || data.length < 1000) break;
    }
    const group = (key: keyof (typeof rows)[number]) => {
      const m: Record<string, number> = {};
      for (const r of rows) m[String(r[key])] = (m[String(r[key])] ?? 0) + Number(r.total_amount || 0);
      return Object.entries(m).map(([k, v]) => ({ clave: k, total: Math.round(v) }));
    };
    const summary = {
      jornada_id,
      ventas: rows.length,
      total_clp: Math.round(rows.reduce((s, r) => s + Number(r.total_amount || 0), 0)),
      por_categoria: group("sale_category"),
      por_metodo_pago: group("payment_method"),
      por_punto_venta: group("point_of_sale"),
    };
    return { content: [{ type: "text", text: JSON.stringify(summary) }], structuredContent: { summary } };
  },
});
