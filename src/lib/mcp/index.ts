import { auth, defineMcp } from "@lovable.dev/mcp-js";
import getActiveJornada from "./tools/get-active-jornada";
import listJornadas from "./tools/list-jornadas";
import jornadaSalesSummary from "./tools/jornada-sales-summary";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "stockia",
  title: "STOCKIA",
  version: "0.1.0",
  instructions:
    "Herramientas de solo lectura de STOCKIA (Berlín Valdivia). Usa get_active_jornada o list_jornadas para obtener un jornada_id y luego get_jornada_sales_summary para ver ventas en CLP.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [getActiveJornada, listJornadas, jornadaSalesSummary],
});
