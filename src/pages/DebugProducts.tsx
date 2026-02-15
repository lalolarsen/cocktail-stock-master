import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function DebugProducts() {
  const [data, setData] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUserId(user?.id || null);

      const { data: rows, error: err } = await supabase
        .from("products")
        .select("id, name, is_active_in_sales")
        .eq("is_active_in_sales", true)
        .limit(20);

      if (err) {
        setError(JSON.stringify(err));
      } else {
        setData(rows || []);
        setCount(rows?.length || 0);
      }
    })();
  }, []);

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-4">
      <h1 className="text-xl font-bold">Debug: Products Query</h1>
      <Card>
        <CardHeader><CardTitle className="text-sm">Resultado</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p><strong>User ID:</strong> {userId || "No autenticado"}</p>
          <p><strong>Cantidad:</strong> {count}</p>
          {error && <p className="text-destructive"><strong>Error:</strong> {error}</p>}
          <pre className="bg-muted p-3 rounded text-xs overflow-auto max-h-80">
            {JSON.stringify(data.slice(0, 5), null, 2)}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
