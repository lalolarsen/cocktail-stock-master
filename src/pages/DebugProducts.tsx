import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2 } from "lucide-react";

interface QueryResult {
  count: number | null;
  data: any[];
  error: string | null;
  loading: boolean;
}

export default function DebugProducts() {
  const [userId, setUserId] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [results, setResults] = useState<{
    totalCount: QueryResult;
    activeCount: QueryResult;
    sampleAll: QueryResult;
    sampleActive: QueryResult;
  }>({
    totalCount: { count: null, data: [], error: null, loading: true },
    activeCount: { count: null, data: [], error: null, loading: true },
    sampleAll: { count: null, data: [], error: null, loading: true },
    sampleActive: { count: null, data: [], error: null, loading: true },
  });

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUserId(user?.id || null);

      const [a, b, c, d] = await Promise.all([
        supabase.from("products").select("id", { count: "exact", head: true }),
        supabase.from("products").select("id", { count: "exact", head: true }).eq("is_active_in_sales", true),
        supabase.from("products").select("id,name,is_active_in_sales,venue_id,created_at").order("created_at", { ascending: false }).limit(20),
        supabase.from("products").select("id,name,is_active_in_sales,venue_id,created_at").eq("is_active_in_sales", true).order("name").limit(50),
      ]);

      setResults({
        totalCount: { count: a.count, data: [], error: a.error?.message || null, loading: false },
        activeCount: { count: b.count, data: [], error: b.error?.message || null, loading: false },
        sampleAll: { count: null, data: c.data || [], error: c.error?.message || null, loading: false },
        sampleActive: { count: null, data: d.data || [], error: d.error?.message || null, loading: false },
      });
    })();
  }, []);

  const displayData = showInactive ? results.sampleAll.data : results.sampleActive.data;
  const displayError = showInactive ? results.sampleAll.error : results.sampleActive.error;
  const loading = results.totalCount.loading;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <h1 className="text-xl font-bold">Debug: Products Query</h1>
      <p className="text-sm text-muted-foreground">User ID: {userId || "No autenticado"}</p>

      {loading ? (
        <div className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Cargando...</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">A) Total productos (sin filtros)</p>
                <p className="text-2xl font-bold">{results.totalCount.count ?? "—"}</p>
                {results.totalCount.error && <p className="text-xs text-destructive mt-1">{results.totalCount.error}</p>}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">B) Total activos (is_active_in_sales=true)</p>
                <p className="text-2xl font-bold">{results.activeCount.count ?? "—"}</p>
                {results.activeCount.error && <p className="text-xs text-destructive mt-1">{results.activeCount.error}</p>}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">
                  {showInactive ? `C) Sample sin filtros (${results.sampleAll.data.length})` : `D) Sample activos (${results.sampleActive.data.length})`}
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Checkbox id="toggle" checked={showInactive} onCheckedChange={(v) => setShowInactive(!!v)} />
                  <label htmlFor="toggle" className="text-xs">Mostrar inactivos</label>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {displayError && <p className="text-xs text-destructive mb-2">{displayError}</p>}
              <div className="overflow-auto max-h-96">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Nombre</TableHead>
                      <TableHead className="text-xs">Activo</TableHead>
                      <TableHead className="text-xs">Venue ID</TableHead>
                      <TableHead className="text-xs">Creado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {displayData.map((p: any) => (
                      <TableRow key={p.id}>
                        <TableCell className="text-xs">{p.name}</TableCell>
                        <TableCell className="text-xs">{p.is_active_in_sales ? "✅" : "❌"}</TableCell>
                        <TableCell className="text-xs font-mono">{p.venue_id?.slice(0, 8)}…</TableCell>
                        <TableCell className="text-xs">{p.created_at?.slice(0, 10)}</TableCell>
                      </TableRow>
                    ))}
                    {displayData.length === 0 && (
                      <TableRow><TableCell colSpan={4} className="text-center text-xs text-muted-foreground">Sin resultados</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
