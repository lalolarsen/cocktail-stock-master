import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type WorkerRole = "admin" | "vendedor" | "bar" | "ticket_seller" | "gerencia";

interface CreateWorkerRequest {
  venue_id: string;
  rut_code: string;
  pin: string;
  full_name: string;
  role?: WorkerRole; // Single role (legacy)
  roles?: WorkerRole[]; // Multiple roles (new)
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create client with user's token to verify they're a developer
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Get the calling user
    const { data: { user: caller }, error: authError } = await userClient.auth.getUser();
    if (authError || !caller) {
      console.error("Auth error:", authError);
      return new Response(
        JSON.stringify({ error: "Invalid authentication" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if caller has developer role OR admin role in worker_roles
    const { data: devRoleData } = await userClient
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .eq("role", "developer")
      .maybeSingle();

    const { data: adminRoleData } = await userClient
      .from("worker_roles")
      .select("role")
      .eq("worker_id", caller.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!devRoleData && !adminRoleData) {
      console.error("Role check failed: user is not developer or admin");
      return new Response(
        JSON.stringify({ error: "Only developers or admins can create worker users" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse request body
    const body: CreateWorkerRequest = await req.json();
    const { venue_id, rut_code, pin, full_name, role, roles: rolesArray } = body;

    // Support both single role (legacy) and multiple roles
    const roles: WorkerRole[] = rolesArray ?? (role ? [role] : []);

    if (!venue_id || !rut_code || !pin || !full_name || roles.length === 0) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: venue_id, rut_code, pin, full_name, role/roles" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate PIN length (Supabase requires 6+ chars for password)
    if (pin.length < 6) {
      return new Response(
        JSON.stringify({ error: "PIN debe tener al menos 6 caracteres" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Normalize RUT: remove dots and dashes, lowercase
    const normalizedRut = rut_code.replace(/[.\-]/g, "").toLowerCase();
    const internalEmail = `${normalizedRut}@distock.local`;

    console.log(`Creating worker: ${full_name}, RUT: ${normalizedRut}, Roles: ${roles.join(', ')}, Venue: ${venue_id}`);

    // Use service role client for admin operations
    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Check if user already exists by internal email
    const { data: existingUsers } = await adminClient.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(u => u.email === internalEmail);

    let authUserId: string;

    if (existingUser) {
      console.log(`User already exists with email ${internalEmail}, updating...`);
      authUserId = existingUser.id;

      // Update password if needed
      const { error: updateError } = await adminClient.auth.admin.updateUserById(authUserId, {
        password: pin,
        email_confirm: true,
      });

      if (updateError) {
        console.error("Failed to update existing user:", updateError);
        return new Response(
          JSON.stringify({ error: `Failed to update user: ${updateError.message}` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else {
      // Create new auth user
      const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
        email: internalEmail,
        password: pin,
        email_confirm: true,
      });

      if (createError || !newUser.user) {
        console.error("Failed to create auth user:", createError);
        return new Response(
          JSON.stringify({ error: `Failed to create auth user: ${createError?.message}` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      authUserId = newUser.user.id;
      console.log(`Created auth user: ${authUserId}`);
    }

    // Upsert profile
    const { error: profileError } = await adminClient
      .from("profiles")
      .upsert({
        id: authUserId,
        email: internalEmail,
        internal_email: internalEmail,
        rut_code: normalizedRut,
        worker_pin: pin,
        venue_id: venue_id,
        full_name: full_name,
        is_active: true,
      }, { onConflict: "id" });

    if (profileError) {
      console.error("Failed to upsert profile:", profileError);
      return new Response(
        JSON.stringify({ error: `Failed to create profile: ${profileError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Upserted profile for user: ${authUserId}`);

    // Insert roles in worker_roles (delete existing first to avoid duplicates)
    await adminClient
      .from("worker_roles")
      .delete()
      .eq("worker_id", authUserId);

    const roleInserts = roles.map((r) => ({
      worker_id: authUserId,
      role: r,
    }));

    const { error: roleInsertError } = await adminClient
      .from("worker_roles")
      .insert(roleInserts);

    if (roleInsertError) {
      console.error("Failed to insert roles:", roleInsertError);
      return new Response(
        JSON.stringify({ error: `Failed to assign roles: ${roleInsertError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Assigned roles [${roles.join(', ')}] to user ${authUserId}`);

    return new Response(
      JSON.stringify({
        success: true,
        user_id: authUserId,
        email: internalEmail,
        rut_code: normalizedRut,
        full_name: full_name,
        roles: roles,
        venue_id: venue_id,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: `Unexpected error: ${errorMessage}` }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
