import { useEffect, useState, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Lock, Unlock, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface LockedWorker {
  worker_id: string;
  full_name: string | null;
  rut_code: string;
  failed_count: number;
  minutes_remaining: number;
  last_attempt_at: string;
}

export function LockedAccountsPanel() {
  const [rows, setRows] = useState<LockedWorker[]>([]);
  const [loading, setLoading] = useState(false);
  const [unlockingRut, setUnlockingRut] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("get_locked_workers");
    setLoading(false);
    if (error) {
      console.error("[LockedAccounts] error", error);
      return;
    }
    setRows((data || []) as LockedWorker[]);
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

  const handleUnlock = async (rut: string, name: string | null) => {
    setUnlockingRut(rut);
    const { data, error } = await supabase.rpc("unlock_worker_account", { p_rut_code: rut });
    setUnlockingRut(null);
    if (error || !(data as any)?.success) {
      toast.error(`No se pudo desbloquear: ${(data as any)?.error || error?.message || "error"}`);
      return;
    }
    toast.success(`Cuenta desbloqueada: ${name || rut}`);
    load();
  };

  if (!loading && rows.length === 0) return null;

  return (
    <Card className="p-4 mb-4 border-amber-500/40 bg-amber-500/5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Lock className="w-4 h-4 text-amber-500" />
          <h3 className="font-semibold">Cuentas bloqueadas ({rows.length})</h3>
        </div>
        <Button size="sm" variant="ghost" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>
      <div className="space-y-2">
        {rows.map((r) => (
          <div
            key={r.worker_id}
            className="flex items-center justify-between gap-3 rounded-md border border-border bg-background p-3"
          >
            <div className="flex flex-col">
              <span className="font-medium">{r.full_name || "Sin nombre"}</span>
              <span className="text-xs text-muted-foreground">
                RUT {r.rut_code} · {r.failed_count} intentos fallidos
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-amber-600 border-amber-500/40">
                {r.minutes_remaining > 0 ? `${r.minutes_remaining} min` : "expira ya"}
              </Badge>
              <Button
                size="sm"
                onClick={() => handleUnlock(r.rut_code, r.full_name)}
                disabled={unlockingRut === r.rut_code}
              >
                <Unlock className="w-4 h-4 mr-1" />
                Desbloquear
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
