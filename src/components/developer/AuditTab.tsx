import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RefreshCw, QrCode, Package, Flag, AlertCircle } from "lucide-react";
import { format } from "date-fns";

interface AuditTabProps {
  selectedVenueId: string | null;
}

type AuditType = "redemptions" | "movements" | "flags";

export function AuditTab({ selectedVenueId }: AuditTabProps) {
  const [activeTab, setActiveTab] = useState<AuditType>("redemptions");
  const [resultFilter, setResultFilter] = useState<string>("all");

  // QR Redemptions
  const { data: redemptions = [], isLoading: redemptionsLoading, refetch: refetchRedemptions } = useQuery({
    queryKey: ["dev-audit-redemptions", selectedVenueId],
    queryFn: async () => {
      const query = supabase
        .from("pickup_redemptions_log")
        .select("id, pickup_token_id, result, redeemed_at, metadata, created_at")
        .order("created_at", { ascending: false })
        .limit(100);
      
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    retry: false,
    staleTime: 1000 * 30,
  });

  // Stock Movements
  const { data: movements = [], isLoading: movementsLoading, refetch: refetchMovements } = useQuery({
    queryKey: ["dev-audit-movements", selectedVenueId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_movements")
        .select("id, movement_type, quantity, product_id, from_location_id, to_location_id, created_at, notes")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
    retry: false,
    staleTime: 1000 * 30,
  });

  // Flag Audit
  const { data: flagAudit = [], isLoading: flagsLoading, refetch: refetchFlags } = useQuery({
    queryKey: ["dev-flag-audit", selectedVenueId],
    queryFn: async () => {
      let query = supabase
        .from("developer_flag_audit")
        .select("*")
        .order("changed_at", { ascending: false })
        .limit(100);
      
      if (selectedVenueId) {
        query = query.eq("venue_id", selectedVenueId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    retry: false,
    staleTime: 1000 * 30,
  });

  const filteredRedemptions = resultFilter === "all" 
    ? redemptions 
    : redemptions.filter(r => r.result === resultFilter);

  const handleRefresh = () => {
    if (activeTab === "redemptions") refetchRedemptions();
    else if (activeTab === "movements") refetchMovements();
    else refetchFlags();
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Audit Logs</CardTitle>
          <CardDescription>
            Últimos 100 registros de cada categoría
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as AuditType)}>
            <div className="flex items-center justify-between gap-4 flex-wrap mb-4">
              <TabsList>
                <TabsTrigger value="redemptions" className="gap-1.5">
                  <QrCode className="h-4 w-4" />
                  <span className="hidden sm:inline">Redemptions</span>
                </TabsTrigger>
                <TabsTrigger value="movements" className="gap-1.5">
                  <Package className="h-4 w-4" />
                  <span className="hidden sm:inline">Stock</span>
                </TabsTrigger>
                <TabsTrigger value="flags" className="gap-1.5">
                  <Flag className="h-4 w-4" />
                  <span className="hidden sm:inline">Flags</span>
                </TabsTrigger>
              </TabsList>

              <div className="flex items-center gap-2">
                {activeTab === "redemptions" && (
                  <Select value={resultFilter} onValueChange={setResultFilter}>
                    <SelectTrigger className="w-[140px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="success">Success</SelectItem>
                      <SelectItem value="already_redeemed">Already Redeemed</SelectItem>
                      <SelectItem value="expired">Expired</SelectItem>
                      <SelectItem value="not_found">Not Found</SelectItem>
                    </SelectContent>
                  </Select>
                )}
                <Button variant="outline" size="sm" onClick={handleRefresh}>
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <TabsContent value="redemptions" className="mt-0">
              {redemptionsLoading ? (
                <LoadingSkeleton />
              ) : filteredRedemptions.length === 0 ? (
                <EmptyState message="No hay redemptions" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-2">Result</th>
                        <th className="text-left p-2">Token ID</th>
                        <th className="text-left p-2">Fecha</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRedemptions.map(r => (
                        <tr key={r.id} className="border-b hover:bg-muted/50">
                          <td className="p-2">
                            <Badge variant={r.result === "success" ? "default" : "destructive"}>
                              {r.result}
                            </Badge>
                          </td>
                          <td className="p-2 font-mono text-xs truncate max-w-[120px]">
                            {r.pickup_token_id?.slice(0, 8) || "N/A"}...
                          </td>
                          <td className="p-2 text-muted-foreground">
                            {format(new Date(r.created_at), "dd/MM HH:mm:ss")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </TabsContent>

            <TabsContent value="movements" className="mt-0">
              {movementsLoading ? (
                <LoadingSkeleton />
              ) : movements.length === 0 ? (
                <EmptyState message="No hay movimientos de stock" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-2">Tipo</th>
                        <th className="text-left p-2">Cantidad</th>
                        <th className="text-left p-2">Notas</th>
                        <th className="text-left p-2">Fecha</th>
                      </tr>
                    </thead>
                    <tbody>
                      {movements.map(m => (
                        <tr key={m.id} className="border-b hover:bg-muted/50">
                          <td className="p-2">
                            <Badge variant="outline">{m.movement_type}</Badge>
                          </td>
                          <td className="p-2 font-mono">{m.quantity}</td>
                          <td className="p-2 text-muted-foreground truncate max-w-[150px]">
                            {m.notes || "-"}
                          </td>
                          <td className="p-2 text-muted-foreground">
                            {format(new Date(m.created_at), "dd/MM HH:mm")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </TabsContent>

            <TabsContent value="flags" className="mt-0">
              {flagsLoading ? (
                <LoadingSkeleton />
              ) : flagAudit.length === 0 ? (
                <EmptyState message="No hay cambios de flags registrados" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-2">Key</th>
                        <th className="text-left p-2">Cambio</th>
                        <th className="text-left p-2">Fecha</th>
                      </tr>
                    </thead>
                    <tbody>
                      {flagAudit.map(f => (
                        <tr key={f.id} className="border-b hover:bg-muted/50">
                          <td className="p-2 font-mono text-xs">{f.key}</td>
                          <td className="p-2">
                            <span className="text-muted-foreground">
                              {f.from_enabled === null ? "null" : f.from_enabled ? "ON" : "OFF"}
                            </span>
                            {" → "}
                            <Badge variant={f.to_enabled ? "default" : "outline"}>
                              {f.to_enabled ? "ON" : "OFF"}
                            </Badge>
                          </td>
                          <td className="p-2 text-muted-foreground">
                            {format(new Date(f.changed_at), "dd/MM HH:mm:ss")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-2">
      {[1, 2, 3, 4, 5].map(i => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="py-12 text-center text-muted-foreground">
      <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
      {message}
    </div>
  );
}
