import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Verify admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Check admin role
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
    if (!profile || !["admin", "developer"].includes(profile.role)) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const lines: string[] = [];
    lines.push("-- ╔══════════════════════════════════════════════════════════════╗");
    lines.push("-- ║  STOCKIA / DiStock — Complete Database Schema              ║");
    lines.push(`-- ║  Generated: ${new Date().toISOString()}          ║`);
    lines.push("-- ╚══════════════════════════════════════════════════════════════╝");
    lines.push("");

    // 1. ENUMS
    const { data: enums } = await supabase.rpc("get_schema_enums");
    if (!enums) {
      // Fallback: direct SQL
      const { data: enumRows } = await supabase.from("_metadata_enums").select("*").limit(0);
    }
    // Use raw SQL via postgres
    const enumSql = `
      SELECT n.nspname AS schema, t.typname AS enum_name,
        string_agg(e.enumlabel, ''', ''' ORDER BY e.enumsortorder) AS vals
      FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      JOIN pg_namespace n ON t.typnamespace = n.oid
      WHERE n.nspname = 'public'
      GROUP BY n.nspname, t.typname ORDER BY t.typname
    `;

    // We need to use the service role client with raw SQL
    // Since supabase-js doesn't support raw SQL directly, use the REST API
    const pgRes = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceKey}`,
        "apikey": serviceKey,
      },
      body: JSON.stringify({ query: enumSql }),
    });

    // Alternative approach: use individual queries we know work
    lines.push("-- ═══════════════════════════════════════");
    lines.push("-- ENUMS");
    lines.push("-- ═══════════════════════════════════════");
    lines.push("");

    // Fetch enums via information_schema workaround
    const enumQuery = await fetch(`${supabaseUrl}/rest/v1/rpc/get_public_enums`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}`, "apikey": serviceKey },
      body: "{}",
    });

    // Since RPC may not exist, let's build from known enums
    const knownEnums = [
      { name: "app_role", values: ["admin", "vendedor", "gerencia", "bar", "ticket_seller", "developer"] },
      { name: "document_status", values: ["pending", "issued", "failed", "cancelled"] },
      { name: "document_type", values: ["boleta", "factura"] },
      { name: "location_type", values: ["warehouse", "bar"] },
      { name: "movement_type", values: ["entrada", "salida", "ajuste", "compra", "transfer_out", "transfer_in", "waste"] },
      { name: "payment_method", values: ["cash", "debit", "credit", "transfer", "card"] },
      { name: "pickup_token_status", values: ["issued", "redeemed", "expired", "cancelled", "pending"] },
      { name: "product_category", values: ["ml", "gramos", "unidades", "mixers_tradicionales", "redbull", "mixers_redbull", "botellas_1500", "botellas_1000", "botellas_750", "botellas_700", "botellines"] },
      { name: "redemption_result", values: ["success", "already_redeemed", "expired", "invalid", "unpaid", "cancelled", "not_found", "stock_error", "timeout"] },
      { name: "replenishment_plan_status", values: ["draft", "applied", "cancelled"] },
    ];

    for (const e of knownEnums) {
      lines.push(`CREATE TYPE public.${e.name} AS ENUM ('${e.values.join("', '")}');`);
    }
    lines.push("");

    // 2. TABLES
    lines.push("-- ═══════════════════════════════════════");
    lines.push("-- TABLES");
    lines.push("-- ═══════════════════════════════════════");
    lines.push("");

    // Query all tables and columns
    const tablesRes = await fetch(`${supabaseUrl}/rest/v1/rpc/get_schema_tables_dump`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}`, "apikey": serviceKey },
      body: "{}",
    });

    // Since RPC doesn't exist, we use the REST API to query information_schema
    // We'll query via PostgREST view if available, otherwise construct from what we know
    
    // Let's use a simpler approach - query via the REST API with a raw SQL function
    // First, let's try creating a temporary function or use existing ones
    
    // Actually, the best approach: query the columns table directly
    const colsUrl = `${supabaseUrl}/rest/v1/rpc/dump_full_schema`;
    const colsRes = await fetch(colsUrl, {
      method: "POST", 
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}`, "apikey": serviceKey },
      body: "{}",
    });

    // Since we can't guarantee RPCs exist, let me use a different approach
    // Query information_schema.columns via a view or direct SQL

    // Use the Supabase Management API or construct from the types we already know
    // Let's query directly via PostgREST with filters on the information_schema
    
    // PostgREST can't query information_schema directly.
    // Best approach: use the pg_catalog tables via a raw SQL query through edge function's postgres connection
    
    // Connect directly to postgres
    const pgConnStr = Deno.env.get("SUPABASE_DB_URL");
    
    if (pgConnStr) {
      // Use pg driver
      const { Pool } = await import("https://deno.land/x/postgres@v0.19.3/mod.ts");
      const pool = new Pool(pgConnStr, 1);
      const conn = await pool.connect();

      try {
        // ENUMS (overwrite with real data)
        lines.length = 0; // Reset
        lines.push("-- ╔══════════════════════════════════════════════════════════════╗");
        lines.push("-- ║  STOCKIA / DiStock — Complete Database Schema              ║");
        lines.push(`-- ║  Generated: ${new Date().toISOString()}`);
        lines.push("-- ╚══════════════════════════════════════════════════════════════╝");
        lines.push("");
        lines.push("-- ═══════════════════════════════════════");
        lines.push("-- ENUMS");
        lines.push("-- ═══════════════════════════════════════");
        lines.push("");

        const enumResult = await conn.queryObject<{ enum_name: string; vals: string }>(`
          SELECT t.typname AS enum_name,
            string_agg(e.enumlabel, ''', ''' ORDER BY e.enumsortorder) AS vals
          FROM pg_type t
          JOIN pg_enum e ON t.oid = e.enumtypid
          JOIN pg_namespace n ON t.typnamespace = n.oid
          WHERE n.nspname = 'public'
          GROUP BY t.typname ORDER BY t.typname
        `);
        for (const row of enumResult.rows) {
          lines.push(`CREATE TYPE public.${row.enum_name} AS ENUM ('${row.vals}');`);
        }
        lines.push("");

        // TABLES with columns
        lines.push("-- ═══════════════════════════════════════");
        lines.push("-- TABLES");
        lines.push("-- ═══════════════════════════════════════");
        lines.push("");

        const tablesResult = await conn.queryObject<{ table_name: string }>(`
          SELECT table_name FROM information_schema.tables 
          WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
          ORDER BY table_name
        `);

        for (const tbl of tablesResult.rows) {
          const colsResult = await conn.queryObject<{
            column_name: string; data_type: string; udt_name: string;
            column_default: string | null; is_nullable: string;
            character_maximum_length: number | null;
          }>(`
            SELECT column_name, data_type, udt_name, column_default, is_nullable, character_maximum_length
            FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = '${tbl.table_name}'
            ORDER BY ordinal_position
          `);

          lines.push(`-- Table: ${tbl.table_name}`);
          lines.push(`CREATE TABLE public.${tbl.table_name} (`);

          const colLines: string[] = [];
          for (const col of colsResult.rows) {
            let typeName = col.data_type;
            if (typeName === "USER-DEFINED") typeName = `public.${col.udt_name}`;
            else if (typeName === "ARRAY") typeName = `${col.udt_name}[]`.replace(/^_/, "");
            else if (typeName === "character varying") typeName = col.character_maximum_length ? `varchar(${col.character_maximum_length})` : "varchar";
            else if (typeName === "timestamp with time zone") typeName = "timestamptz";
            else if (typeName === "timestamp without time zone") typeName = "timestamp";

            let line = `  ${col.column_name} ${typeName}`;
            if (col.is_nullable === "NO") line += " NOT NULL";
            if (col.column_default) line += ` DEFAULT ${col.column_default}`;
            colLines.push(line);
          }

          // Primary key
          const pkResult = await conn.queryObject<{ column_name: string }>(`
            SELECT kcu.column_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
            WHERE tc.table_schema = 'public' AND tc.table_name = '${tbl.table_name}' AND tc.constraint_type = 'PRIMARY KEY'
            ORDER BY kcu.ordinal_position
          `);
          if (pkResult.rows.length > 0) {
            const pkCols = pkResult.rows.map(r => r.column_name).join(", ");
            colLines.push(`  PRIMARY KEY (${pkCols})`);
          }

          lines.push(colLines.join(",\n"));
          lines.push(");");
          lines.push("");
        }

        // FOREIGN KEYS
        lines.push("-- ═══════════════════════════════════════");
        lines.push("-- FOREIGN KEYS");
        lines.push("-- ═══════════════════════════════════════");
        lines.push("");

        const fkResult = await conn.queryObject<{
          constraint_name: string; table_name: string; column_name: string;
          foreign_table_schema: string; foreign_table_name: string; foreign_column_name: string;
          delete_rule: string;
        }>(`
          SELECT 
            tc.constraint_name, tc.table_name, kcu.column_name,
            ccu.table_schema AS foreign_table_schema,
            ccu.table_name AS foreign_table_name, ccu.column_name AS foreign_column_name,
            rc.delete_rule
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
          JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
          JOIN information_schema.referential_constraints rc ON rc.constraint_name = tc.constraint_name AND rc.constraint_schema = tc.table_schema
          WHERE tc.table_schema = 'public' AND tc.constraint_type = 'FOREIGN KEY'
          ORDER BY tc.table_name, tc.constraint_name
        `);

        for (const fk of fkResult.rows) {
          const onDelete = fk.delete_rule !== "NO ACTION" ? ` ON DELETE ${fk.delete_rule}` : "";
          lines.push(`ALTER TABLE public.${fk.table_name} ADD CONSTRAINT ${fk.constraint_name} FOREIGN KEY (${fk.column_name}) REFERENCES ${fk.foreign_table_schema}.${fk.foreign_table_name}(${fk.foreign_column_name})${onDelete};`);
        }
        lines.push("");

        // UNIQUE CONSTRAINTS
        const uqResult = await conn.queryObject<{ constraint_name: string; table_name: string; columns: string }>(`
          SELECT tc.constraint_name, tc.table_name, 
            string_agg(kcu.column_name, ', ' ORDER BY kcu.ordinal_position) AS columns
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
          WHERE tc.table_schema = 'public' AND tc.constraint_type = 'UNIQUE'
          GROUP BY tc.constraint_name, tc.table_name
          ORDER BY tc.table_name
        `);
        if (uqResult.rows.length > 0) {
          lines.push("-- ═══════════════════════════════════════");
          lines.push("-- UNIQUE CONSTRAINTS");
          lines.push("-- ═══════════════════════════════════════");
          lines.push("");
          for (const uq of uqResult.rows) {
            lines.push(`ALTER TABLE public.${uq.table_name} ADD CONSTRAINT ${uq.constraint_name} UNIQUE (${uq.columns});`);
          }
          lines.push("");
        }

        // INDEXES (non-pk, non-unique)
        const idxResult = await conn.queryObject<{ indexdef: string }>(`
          SELECT indexdef FROM pg_indexes 
          WHERE schemaname = 'public' 
            AND indexname NOT LIKE '%_pkey'
            AND indexname NOT LIKE '%_key'
          ORDER BY tablename, indexname
        `);
        if (idxResult.rows.length > 0) {
          lines.push("-- ═══════════════════════════════════════");
          lines.push("-- INDEXES");
          lines.push("-- ═══════════════════════════════════════");
          lines.push("");
          for (const idx of idxResult.rows) {
            lines.push(`${idx.indexdef};`);
          }
          lines.push("");
        }

        // RLS
        lines.push("-- ═══════════════════════════════════════");
        lines.push("-- ROW LEVEL SECURITY");
        lines.push("-- ═══════════════════════════════════════");
        lines.push("");

        // Enable RLS
        const rlsResult = await conn.queryObject<{ tablename: string }>(`
          SELECT relname AS tablename FROM pg_class c
          JOIN pg_namespace n ON c.relnamespace = n.oid
          WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity = true
          ORDER BY relname
        `);
        for (const r of rlsResult.rows) {
          lines.push(`ALTER TABLE public.${r.tablename} ENABLE ROW LEVEL SECURITY;`);
        }
        lines.push("");

        // Policies
        const polResult = await conn.queryObject<{
          tablename: string; policyname: string; permissive: string;
          roles: string; cmd: string; qual: string | null; with_check: string | null;
        }>(`
          SELECT tablename, policyname, permissive, 
            array_to_string(roles, ', ') as roles, cmd, qual, with_check
          FROM pg_policies WHERE schemaname = 'public'
          ORDER BY tablename, policyname
        `);
        for (const pol of polResult.rows) {
          let stmt = `CREATE POLICY "${pol.policyname}" ON public.${pol.tablename}`;
          stmt += ` AS ${pol.permissive}`;
          stmt += ` FOR ${pol.cmd}`;
          stmt += ` TO ${pol.roles}`;
          if (pol.qual) stmt += ` USING (${pol.qual})`;
          if (pol.with_check) stmt += ` WITH CHECK (${pol.with_check})`;
          stmt += ";";
          lines.push(stmt);
        }
        lines.push("");

        // FUNCTIONS
        lines.push("-- ═══════════════════════════════════════");
        lines.push("-- FUNCTIONS");
        lines.push("-- ═══════════════════════════════════════");
        lines.push("");

        const fnResult = await conn.queryObject<{ function_definition: string }>(`
          SELECT pg_get_functiondef(p.oid) AS function_definition
          FROM pg_proc p
          JOIN pg_namespace n ON p.pronamespace = n.oid
          WHERE n.nspname = 'public'
          ORDER BY p.proname
        `);
        for (const fn of fnResult.rows) {
          lines.push(fn.function_definition + ";");
          lines.push("");
        }

        // TRIGGERS
        lines.push("-- ═══════════════════════════════════════");
        lines.push("-- TRIGGERS");
        lines.push("-- ═══════════════════════════════════════");
        lines.push("");

        const trgResult = await conn.queryObject<{ trigger_definition: string }>(`
          SELECT pg_get_triggerdef(t.oid) AS trigger_definition
          FROM pg_trigger t
          JOIN pg_class c ON t.tgrelid = c.oid
          JOIN pg_namespace n ON c.relnamespace = n.oid
          WHERE n.nspname = 'public' AND NOT t.tgisinternal
          ORDER BY c.relname, t.tgname
        `);
        for (const trg of trgResult.rows) {
          lines.push(`${trg.trigger_definition};`);
        }
        lines.push("");

        // REALTIME
        lines.push("-- ═══════════════════════════════════════");
        lines.push("-- REALTIME PUBLICATION");
        lines.push("-- ═══════════════════════════════════════");
        lines.push("");

        const rtResult = await conn.queryObject<{ tablename: string }>(`
          SELECT schemaname || '.' || tablename as tablename 
          FROM pg_publication_tables 
          WHERE pubname = 'supabase_realtime'
          ORDER BY tablename
        `);
        if (rtResult.rows.length > 0) {
          for (const rt of rtResult.rows) {
            lines.push(`ALTER PUBLICATION supabase_realtime ADD TABLE ${rt.tablename};`);
          }
        }
        lines.push("");
        lines.push("-- END OF SCHEMA DUMP");

      } finally {
        conn.release();
        await pool.end();
      }
    } else {
      lines.push("-- ERROR: Could not connect to database directly. SUPABASE_DB_URL not available.");
    }

    const sqlContent = lines.join("\n");

    return new Response(sqlContent, {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/sql; charset=utf-8",
        "Content-Disposition": `attachment; filename="stockia_schema_${new Date().toISOString().slice(0,10)}.sql"`,
      },
    });

  } catch (err) {
    console.error("Schema dump error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
