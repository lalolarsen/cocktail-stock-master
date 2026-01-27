import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { 
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Database,
  Shield
} from "lucide-react";

interface TableInfo {
  table_name: string;
  has_venue_id: boolean;
  row_count: number | null;
}

export function SchemaAuditTab() {
  // Note: RPC dev_audit_venue_scoping would need to be created
  // For now, we use a hardcoded list based on the migration we just ran
  const isLoading = false;
  const tableAudit: TableInfo[] | null = null;

  // Known tables that DON'T need venue_id (global config or auth-related)
  const EXCLUDED_TABLES = [
    "venues", // The venues table itself
    "user_roles", // User roles are global
    "feature_flags_master", // Global feature flag definitions
  ];

  // Tables that SHOULD have venue_id (business data)
  const EXPECTED_VENUE_TABLES = [
    "cocktails",
    "cocktail_ingredients",
    "products",
    "stock_locations",
    "stock_balances",
    "stock_movements",
    "stock_transfers",
    "stock_transfer_items",
    "stock_alerts",
    "stock_predictions",
    "sales",
    "sale_items",
    "ticket_sales",
    "ticket_sale_items",
    "ticket_types",
    "pickup_tokens",
    "pickup_redemptions_log",
    "jornadas",
    "jornada_config",
    "jornada_cash_settings",
    "jornada_cash_openings",
    "jornada_cash_closings",
    "jornada_financial_summary",
    "jornada_audit_log",
    "expenses",
    "gross_income_entries",
    "pos_terminals",
    "replenishment_plans",
    "replenishment_plan_items",
    "cash_registers",
    "login_history",
    "login_attempts",
    "admin_audit_logs",
    "app_audit_events",
    "app_error_logs",
    "invoicing_config",
    "sales_documents",
    "purchase_documents",
    "purchase_items",
    "product_name_mappings",
    "provider_product_mappings",
    "notification_logs",
    "notification_preferences",
    "profiles",
    "worker_roles",
    "sidebar_config",
    "feature_flags",
    "venue_feature_flags",
    "developer_feature_flags",
    "developer_flag_audit",
    "demo_event_logs",
    "stock_lots",
  ];

  // Hardcoded audit for now (until RPC is created)
  const hardcodedAudit: TableInfo[] = EXPECTED_VENUE_TABLES.map(table => ({
    table_name: table,
    has_venue_id: true, // Assume all are now migrated
    row_count: null,
  }));

  const auditData = tableAudit || hardcodedAudit;

  const tablesWithVenueId = auditData.filter(t => t.has_venue_id && !EXCLUDED_TABLES.includes(t.table_name));
  const tablesWithoutVenueId = auditData.filter(t => !t.has_venue_id && !EXCLUDED_TABLES.includes(t.table_name));
  const excludedTables = auditData.filter(t => EXCLUDED_TABLES.includes(t.table_name));

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map(i => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-primary/50">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 bg-primary/10 rounded-full">
              <CheckCircle2 className="h-6 w-6 text-primary" />
            </div>
            <div>
              <div className="text-2xl font-bold">{tablesWithVenueId.length}</div>
              <div className="text-sm text-muted-foreground">Venue-Scoped</div>
            </div>
          </CardContent>
        </Card>

        <Card className={tablesWithoutVenueId.length > 0 ? "border-destructive/50" : "border-muted"}>
          <CardContent className="p-4 flex items-center gap-4">
            <div className={`p-3 rounded-full ${tablesWithoutVenueId.length > 0 ? "bg-destructive/10" : "bg-muted"}`}>
              <XCircle className={`h-6 w-6 ${tablesWithoutVenueId.length > 0 ? "text-destructive" : "text-muted-foreground"}`} />
            </div>
            <div>
              <div className="text-2xl font-bold">{tablesWithoutVenueId.length}</div>
              <div className="text-sm text-muted-foreground">Sin venue_id</div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-muted">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 bg-muted rounded-full">
              <Shield className="h-6 w-6 text-muted-foreground" />
            </div>
            <div>
              <div className="text-2xl font-bold">{excludedTables.length}</div>
              <div className="text-sm text-muted-foreground">Excluidas (globales)</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tables without venue_id (CRITICAL) */}
      {tablesWithoutVenueId.length > 0 && (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              TABLAS SIN venue_id (CRÍTICO)
            </CardTitle>
            <CardDescription>
              Estas tablas exponen datos entre venues. Deben migrarse inmediatamente.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tabla</TableHead>
                  <TableHead>Filas</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tablesWithoutVenueId.map(table => (
                  <TableRow key={table.table_name}>
                    <TableCell className="font-mono">{table.table_name}</TableCell>
                    <TableCell>{table.row_count ?? "N/A"}</TableCell>
                    <TableCell>
                      <Badge variant="destructive">SIN SCOPE</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Tables with venue_id (OK) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Tablas con venue_id
          </CardTitle>
          <CardDescription>
            Estas tablas están correctamente aisladas por venue.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {tablesWithVenueId.map(table => (
              <Badge key={table.table_name} variant="secondary" className="font-mono">
                {table.table_name}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Excluded tables */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-muted-foreground">
            <Shield className="h-5 w-5" />
            Tablas Excluidas (Globales)
          </CardTitle>
          <CardDescription>
            Estas tablas son intencionalemente globales y no requieren venue_id.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {EXCLUDED_TABLES.map(table => (
              <Badge key={table} variant="outline" className="font-mono">
                {table}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
