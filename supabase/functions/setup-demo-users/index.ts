import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface DemoUser {
  rut: string;
  pin: string;
  name: string;
  role: "admin" | "gerencia" | "vendedor" | "bar";
  email: string;
}

const DEMO_USERS: DemoUser[] = [
  { rut: "DEMO-ADMIN", pin: "1234", name: "Admin Demo", role: "admin", email: "demo-admin@coctelstock.demo" },
  { rut: "DEMO-GERENCIA", pin: "1234", name: "Gerente Demo", role: "gerencia", email: "demo-gerencia@coctelstock.demo" },
  { rut: "DEMO-VENDEDOR", pin: "1234", name: "Vendedor Demo", role: "vendedor", email: "demo-vendedor@coctelstock.demo" },
  { rut: "DEMO-BAR", pin: "1234", name: "Bartender Demo", role: "bar", email: "demo-bar@coctelstock.demo" },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Get or create demo venue
    let { data: venue } = await supabaseAdmin
      .from("venues")
      .select("id")
      .eq("is_demo", true)
      .single();

    if (!venue) {
      // Seed demo data first
      const { data: seedResult, error: seedError } = await supabaseAdmin.rpc("seed_demo_data");
      if (seedError) {
        console.error("Error seeding demo data:", seedError);
        throw new Error("Failed to seed demo data");
      }
      venue = { id: seedResult.venue_id };
    }

    const venueId = venue.id;
    const createdUsers: { rut: string; pin: string; role: string; name: string }[] = [];

    for (const demoUser of DEMO_USERS) {
      // Check if user already exists by rut_code
      const { data: existingProfile } = await supabaseAdmin
        .from("profiles")
        .select("id, rut_code")
        .eq("rut_code", demoUser.rut)
        .single();

      if (existingProfile) {
        console.log(`Demo user ${demoUser.rut} already exists`);
        createdUsers.push({ rut: demoUser.rut, pin: demoUser.pin, role: demoUser.role, name: demoUser.name });
        continue;
      }

      // Check if auth user exists by email
      const { data: existingAuthUsers } = await supabaseAdmin.auth.admin.listUsers();
      const existingAuth = existingAuthUsers?.users?.find(u => u.email === demoUser.email);

      let userId: string;

      if (existingAuth) {
        userId = existingAuth.id;
        console.log(`Auth user ${demoUser.email} exists, using ID: ${userId}`);
      } else {
        // Create auth user
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
          email: demoUser.email,
          password: demoUser.pin,
          email_confirm: true,
          user_metadata: { full_name: demoUser.name, is_demo: true }
        });

        if (authError) {
          console.error(`Error creating auth user ${demoUser.email}:`, authError);
          continue;
        }

        userId = authData.user.id;
        console.log(`Created auth user ${demoUser.email} with ID: ${userId}`);
      }

      // Check if profile exists for this user ID
      const { data: profileExists } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("id", userId)
        .single();

      if (!profileExists) {
        // Create profile
        const { error: profileError } = await supabaseAdmin
          .from("profiles")
          .insert({
            id: userId,
            email: demoUser.email,
            full_name: demoUser.name,
            rut_code: demoUser.rut,
            worker_pin: demoUser.pin,
            venue_id: venueId,
            is_active: true,
            internal_email: demoUser.email
          });

        if (profileError) {
          console.error(`Error creating profile for ${demoUser.rut}:`, profileError);
          continue;
        }
        console.log(`Created profile for ${demoUser.rut}`);
      } else {
        // Update existing profile
        const { error: updateError } = await supabaseAdmin
          .from("profiles")
          .update({
            rut_code: demoUser.rut,
            worker_pin: demoUser.pin,
            venue_id: venueId,
            is_active: true,
            full_name: demoUser.name,
            internal_email: demoUser.email
          })
          .eq("id", userId);

        if (updateError) {
          console.error(`Error updating profile for ${demoUser.rut}:`, updateError);
        }
      }

      // Check and create worker role
      const { data: existingRole } = await supabaseAdmin
        .from("worker_roles")
        .select("id")
        .eq("worker_id", userId)
        .eq("role", demoUser.role)
        .single();

      if (!existingRole) {
        const { error: roleError } = await supabaseAdmin
          .from("worker_roles")
          .insert({
            worker_id: userId,
            role: demoUser.role,
            venue_id: venueId
          });

        if (roleError) {
          console.error(`Error assigning role ${demoUser.role} to ${demoUser.rut}:`, roleError);
        } else {
          console.log(`Assigned role ${demoUser.role} to ${demoUser.rut}`);
        }
      }

      createdUsers.push({ rut: demoUser.rut, pin: demoUser.pin, role: demoUser.role, name: demoUser.name });
    }

    return new Response(
      JSON.stringify({
        success: true,
        venue_id: venueId,
        users: createdUsers,
        message: "Demo users configured successfully"
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error in setup-demo-users:", error);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
