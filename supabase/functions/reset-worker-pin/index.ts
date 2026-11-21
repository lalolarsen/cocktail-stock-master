import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { canResetWorkerPin } from "../_shared/worker-pin-policy.ts";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};
const reply = (status: number, body: object) => new Response(JSON.stringify(body), { status, headers });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers });
  if (req.method !== "POST") return reply(405, { error: "Método no permitido" });
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const authorization = req.headers.get("Authorization");
    if (!url || !anonKey || !serviceKey) return reply(500, { error: "Servicio no disponible" });
    if (!authorization) return reply(401, { error: "Inicia sesión nuevamente" });
    const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return reply(401, { error: "Tu sesión venció" });

    // This fresh server-only client never performs user sign-in.
    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const [{ data: workerRoles, error: wrError }, { data: userRoles, error: urError }] = await Promise.all([
      admin.from("worker_roles").select("role").eq("worker_id", user.id),
      admin.from("user_roles").select("role").eq("user_id", user.id),
    ]);
    if (wrError || urError) return reply(500, { error: "No pudimos verificar tus permisos" });
    const roles = workerRoles?.length ? workerRoles : userRoles ?? [];
    if (!roles.some(r => r.role === "admin")) return reply(403, { error: "Solo administración puede cambiar el PIN" });

    const { worker_id, pin } = await req.json();
    if (typeof worker_id !== "string" || !/^[0-9a-f-]{36}$/i.test(worker_id) ||
        typeof pin !== "string" || pin.length < 6 || pin.length > 128 || /\s/.test(pin)) {
      return reply(400, { error: "Ingresa un PIN de al menos 6 caracteres, sin espacios" });
    }
    const [{ data: caller, error: callerError }, { data: target, error: targetError }] = await Promise.all([
      admin.from("profiles").select("venue_id").eq("id", user.id).single(),
      admin.from("profiles").select("venue_id").eq("id", worker_id).single(),
    ]);
    if (callerError || targetError || !canResetWorkerPin(roles.map(r => r.role), caller?.venue_id ?? null, target?.venue_id ?? null)) {
      return reply(403, { error: "No puedes cambiar el PIN de este trabajador" });
    }
    const { error } = await admin.auth.admin.updateUserById(worker_id, { password: pin });
    if (error) return reply(400, { error: error.code === "weak_password"
      ? "Ese PIN es demasiado común. Prueba una combinación menos predecible."
      : "No se pudo cambiar el PIN. Revisa los datos e intenta nuevamente." });
    return reply(200, { success: true });
  } catch {
    return reply(500, { error: "No pudimos cambiar el PIN. Intenta nuevamente." });
  }
});