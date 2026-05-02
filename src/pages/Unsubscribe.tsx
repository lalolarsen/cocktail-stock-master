import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

type State = "validating" | "valid" | "already" | "invalid" | "submitting" | "done" | "error";

export default function Unsubscribe() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [state, setState] = useState<State>("validating");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setState("invalid");
      return;
    }
    (async () => {
      try {
        const res = await fetch(
          `${SUPABASE_URL}/functions/v1/handle-email-unsubscribe?token=${encodeURIComponent(token)}`,
          { headers: { apikey: SUPABASE_KEY } }
        );
        const data = await res.json();
        if (data.valid === true) setState("valid");
        else if (data.reason === "already_unsubscribed") setState("already");
        else setState("invalid");
      } catch {
        setState("invalid");
      }
    })();
  }, [token]);

  const confirm = async () => {
    setState("submitting");
    setError(null);
    const { data, error: err } = await supabase.functions.invoke("handle-email-unsubscribe", {
      body: { token },
    });
    if (err || !data?.success) {
      setError(err?.message ?? "No se pudo procesar la baja.");
      setState("error");
      return;
    }
    setState("done");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Cancelar suscripción</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {state === "validating" && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Validando enlace…
            </div>
          )}
          {state === "valid" && (
            <>
              <p className="text-sm text-muted-foreground">
                Confirma para dejar de recibir correos de STOCKIA en esta dirección.
              </p>
              <Button onClick={confirm} className="w-full">Confirmar baja</Button>
            </>
          )}
          {state === "submitting" && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Procesando…
            </div>
          )}
          {state === "done" && (
            <p className="text-sm">Tu correo fue dado de baja correctamente.</p>
          )}
          {state === "already" && (
            <p className="text-sm text-muted-foreground">Este correo ya estaba dado de baja.</p>
          )}
          {state === "invalid" && (
            <p className="text-sm text-destructive">Enlace inválido o expirado.</p>
          )}
          {state === "error" && (
            <p className="text-sm text-destructive">{error ?? "Ocurrió un error."}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
