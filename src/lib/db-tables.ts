/**
 * Typed table accessors for Supabase tables not yet in auto-generated types.
 *
 * Usage: `openBottlesTable().select("*").eq(...)` instead of
 *        `supabase.from("open_bottles" as any)`.
 *
 * The `as never` cast is intentional: it tells TypeScript to skip the table
 * name check. The result is untyped on the way out, so callers must cast via
 * `as unknown as RowType[]` or the dedicated typed helpers below.
 *
 * When Supabase types are regenerated (e.g. via `supabase gen types`),
 * replace these helpers with the proper typed `.from<Table>()` calls and
 * delete this file.
 */

import { supabase } from "@/integrations/supabase/client";

// ── Bar / open bottles ───────────────────────────────────────────────────────
export const openBottlesTable      = () => supabase.from("open_bottles"       as never);
export const openBottleEventsTable = () => supabase.from("open_bottle_events" as never);

// ── Purchases / imports ──────────────────────────────────────────────────────
export const purchaseImportsTable      = () => supabase.from("purchase_imports"       as never);
export const purchaseImportLinesTable  = () => supabase.from("purchase_import_lines"  as never);
export const purchaseImportTaxesTable  = () => supabase.from("purchase_import_taxes"  as never);
export const purchasesTable            = () => supabase.from("purchases"               as never);
export const purchaseLinesTable        = () => supabase.from("purchase_lines"          as never);
export const expenseLinesTable         = () => supabase.from("expense_lines"           as never);
export const purchaseImportDraftsTable = () => supabase.from("purchase_import_drafts" as never);

// ── Product learning ─────────────────────────────────────────────────────────
export const learningProductMappingsTable = () => supabase.from("learning_product_mappings" as never);
export const specificTaxCategoriesTable   = () => supabase.from("specific_tax_categories"   as never);

// ── Passline audit ───────────────────────────────────────────────────────────
export const passlineAuditSessionsTable = () => supabase.from("passline_audit_sessions" as never);
export const passlineAuditItemsTable    = () => supabase.from("passline_audit_items"    as never);

// ── Misc ─────────────────────────────────────────────────────────────────────
export const proveedoresTable = () => supabase.from("purchases" as never);
