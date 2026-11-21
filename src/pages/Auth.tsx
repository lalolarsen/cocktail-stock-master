import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Wine, ShoppingCart, Shield, Eye, Sparkles, Ticket, Package, ClipboardCheck } from "lucide-react";
import { AppRole } from "@/hooks/useUserRole";
import stockiaLogoFull from "@/assets/stockia-logo-full-white.png";
import { useAppSession } from "@/contexts/AppSessionContext";
import { withAuthTimeout, isInvalidCredentials } from "@/lib/auth-flow";

const LAST_MODE_KEY = "stockia_last_mode";

interface WorkerData {
  id: string;
  email: string;
  full_name: string | null;
  internal_email: string | null;
  is_active: boolean;
  rut_code: string;
  venue_id: string | null;
  roles: AppRole[];
}

export default function Auth() {
  const [rutCode, setRutCode] = useState("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [showModeSelection, setShowModeSelection] = useState(false);
  const [workerRoles, setWorkerRoles] = useState<AppRole[]>([]);
  const [hasStaleSession, setHasStaleSession] = useState(false);
  const navigate = useNavigate();
  const { user, refreshSession, isLoading: sessionLoading } = useAppSession();
  const submitting = useRef(false);

  // Sanitize PIN: strip invisible/whitespace/control chars that Android keyboards
  // and password managers sometimes inject. Prevents phantom "PIN incorrecto".
  const sanitizePin = (raw: string): string =>
    raw.replace(/[\u0000-\u001F\u007F-\u00A0\u200B-\u200F\uFEFF\s]/g, "");

  useEffect(() => {
    // If the user explicitly landed on /auth, do NOT auto-route them.
    // Instead surface a "Cambiar de trabajador" prompt so the previous
    // session can't ghost-block a new login on shared POS terminals.
    setHasStaleSession(!!user);
  }, [user?.id]);

  const handleSwitchWorker = async () => {
    try {
      await supabase.auth.signOut({ scope: "local" });
    } catch {
      // ignore — even if signOut fails we still want a clean form
    }
    setHasStaleSession(false);
    setShowModeSelection(false);
    setWorkerRoles([]);
    localStorage.removeItem(LAST_MODE_KEY);
    setRutCode("");
    setPin("");
  };





  const fetchWorkerRoles = async (userId: string): Promise<AppRole[]> => {
    // First try worker_roles table
    const { data: workerRoles, error: workerError } = await withAuthTimeout(supabase
      .from("worker_roles")
      .select("role")
      .eq("worker_id", userId));
    if (workerError) throw workerError;

    if (workerRoles && workerRoles.length > 0) {
      return workerRoles.map(r => r.role as AppRole);
    }

    // Fallback to user_roles table
    const { data: userRoles, error: userError } = await withAuthTimeout(supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId));
    if (userError) throw userError;

    if (userRoles && userRoles.length > 0) {
      return userRoles.map(r => r.role as AppRole);
    }

    return [];
  };

  const routeByRoles = (roles: AppRole[]) => {
    if (!roles.some(role => ["admin", "gerencia", "vendedor", "ticket_seller"].includes(role))) {
      toast.error("Tu cuenta no tiene un modo de trabajo habilitado. Pide al administrador revisar tus permisos.");
      return;
    }
    // Vendedor / ticket_seller always show mode selection
    // (alcohol, entradas, guardarropía)
    if (roles.includes("vendedor") || roles.includes("ticket_seller")) {
      setWorkerRoles(roles);
      setShowModeSelection(true);
      return;
    }

    if (roles.length === 1) {
      const role = roles[0];
      if (role === "admin" || role === "gerencia") {
        routeByRole(role);
      }
      return;
    }

    // Multiple roles - check last mode
    const lastMode = localStorage.getItem(LAST_MODE_KEY);
    if (lastMode && roles.includes(lastMode as AppRole)) {
      routeByRole(lastMode as AppRole);
      return;
    }

    // Show mode selection
    setWorkerRoles(roles);
    setShowModeSelection(true);
  };

  const routeByRole = (role: AppRole | "sales" | "tickets" | "coatcheck") => {
    localStorage.setItem(LAST_MODE_KEY, role);
    const nextParam = new URLSearchParams(window.location.search).get("next");
    if (nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//") && nextParam.split(/[?#]/)[0] !== "/auth") {
      navigate(nextParam);
      return;
    }
    if (role === "admin" || role === "gerencia") {
      navigate("/admin");
    } else if (role === "vendedor" || role === "sales") {
      navigate("/sales");
    } else if (role === "ticket_seller" || role === "tickets") {
      navigate("/tickets");
    } else if (role === "coatcheck") {
      navigate("/guardarropia");
    }
  };


  const normalizeRut = (input: string): string => {
    // For demo accounts, keep as-is (starts with DEMO-)
    if (input.toUpperCase().startsWith("DEMO-")) {
      return input.toUpperCase();
    }
    return input.replace(/\D/g, "").trim();
  };

  const validateRut = (rut: string): boolean => {
    // Demo accounts have format DEMO-XXX
    if (rut.toUpperCase().startsWith("DEMO-")) {
      return rut.length >= 6;
    }
    const normalized = normalizeRut(rut);
    return /^\d{7,9}$/.test(normalized);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting.current) return;

    const normalizedRut = normalizeRut(rutCode);
    const cleanPin = sanitizePin(pin);

    if (!validateRut(rutCode)) {
      toast.error("RUT inválido. Ingresa entre 7 y 9 dígitos, o usa un RUT demo.");
      return;
    }

    if (!cleanPin || cleanPin.length < 4) {
      toast.error("PIN debe tener al menos 4 dígitos");
      return;
    }

    setLoading(true);
    submitting.current = true;

    try {
      // Get worker by RUT
      const { data: workers, error: workerError } = await withAuthTimeout(supabase.rpc("get_worker_by_rut", {
        p_rut_code: normalizedRut,
        p_venue_id: null
      }));
      if (workerError) throw new Error("No pudimos consultar tu cuenta. Revisa la conexión e intenta nuevamente.");

      if (workerError || !workers || workers.length === 0) {
        // RUT inexistente: NO contamos como intento fallido para no llenar el contador
        toast.error("RUT no registrado. Verifica los dígitos.");
        setLoading(false);
        return;
      }

      const worker = workers[0] as WorkerData;

      const { data: lockStatus, error: lockError } = await withAuthTimeout(supabase.rpc("get_lock_status", {
        p_rut_code: normalizedRut,
        p_venue_id: worker.venue_id,
      }));
      if (lockError) throw new Error("No pudimos verificar el acceso. Intenta nuevamente.");
      const lock = Array.isArray(lockStatus) ? lockStatus[0] : lockStatus;
      if (lock?.is_locked) {
        const mins = Math.max(1, lock.minutes_remaining ?? 10);
        toast.error(`Cuenta bloqueada temporalmente. Intenta en ${mins} min o pide desbloqueo en Admin → Trabajadores.`);
        return;
      }

      if (!worker.is_active) {
        toast.error("Tu cuenta está desactivada. Contacta al administrador.");
        setLoading(false);
        return;
      }

      // Determine email to use for auth
      const authEmail = worker.internal_email || worker.email;

      if (!authEmail) {
        toast.error("Error de configuración. Contacta al administrador.");
        setLoading(false);
        return;
      }

      // Sign in using internal email + PIN as password
      let authData: Awaited<ReturnType<typeof supabase.auth.signInWithPassword>>["data"] | null = null;
      let signInError: any = null;
      try {
        const res = await withAuthTimeout(supabase.auth.signInWithPassword({
          email: authEmail,
          password: cleanPin,
        }));
        authData = res.data;
        signInError = res.error;
      } catch (netErr) {
        // Fetch failure / thrown exception (network, CORS, proxy). Do NOT count as fail.
        console.error("[Auth] network error during signIn:", netErr);
        void supabase.rpc("record_login_attempt", {
          p_rut_code: normalizedRut,
          p_venue_id: worker.venue_id,
          p_success: false,
          p_user_agent: navigator.userAgent,
          p_failure_reason: "network",
        }).then(({ error }) => { if (error) console.error("Error recording login attempt:", error); });
        toast.error("Sin conexión con el servidor. Verifica la red del POS e intenta de nuevo.");
        setLoading(false);
        return;
      }

      if (signInError) {
        const status = (signInError as any).status as number | undefined;
        const msg = String(signInError.message || "").toLowerCase();

        // Rate limit: NOT a credential failure — don't count toward lockout.
        if (status === 429 || msg.includes("rate") || msg.includes("too many")) {
          void supabase.rpc("record_login_attempt", {
            p_rut_code: normalizedRut,
            p_venue_id: worker.venue_id,
            p_success: false,
            p_user_agent: navigator.userAgent,
            p_failure_reason: "rate_limit",
          }).then(({ error }) => { if (error) console.error("Error recording login attempt:", error); });
          toast.error("Muchos intentos en poco tiempo. Espera 30 segundos y vuelve a probar.");
          setLoading(false);
          return;
        }

        // Any other non-400 → treat as transient/network, don't count.
        if (status && status !== 400 && status !== 401 && status !== 403) {
          void supabase.rpc("record_login_attempt", {
            p_rut_code: normalizedRut,
            p_venue_id: worker.venue_id,
            p_success: false,
            p_user_agent: navigator.userAgent,
            p_failure_reason: "network",
          }).then(({ error }) => { if (error) console.error("Error recording login attempt:", error); });
          toast.error(`Error temporal del servidor (${status}). Intenta nuevamente.`);
          setLoading(false);
          return;
        }

        if (!isInvalidCredentials(signInError)) {
          toast.error(signInError.code === "email_not_confirmed"
            ? "Esta cuenta necesita confirmación. Pide al administrador revisar el acceso."
            : "No fue posible iniciar sesión. Intenta nuevamente o pide al administrador revisar tu cuenta.");
          return;
        }

        // Only an explicitly invalid password counts toward lockout.
        await withAuthTimeout(supabase.rpc("record_login_attempt", {
          p_rut_code: normalizedRut,
          p_venue_id: worker.venue_id,
          p_success: false,
          p_user_agent: navigator.userAgent,
          p_failure_reason: "invalid_pin",
        }));
        const remaining = Math.max(0, 8 - ((lock?.failed_count ?? 0) + 1));
        if (remaining <= 0) {
          toast.error("PIN incorrecto. Cuenta bloqueada por 10 minutos.");
        } else {
          toast.error(`PIN incorrecto. Te quedan ${remaining} intento${remaining === 1 ? "" : "s"}.`);
        }
        setLoading(false);
        return;
      }

      if (!authData?.user) {
        toast.error("Respuesta inválida del servidor. Intenta de nuevo.");
        setLoading(false);
        return;
      }

      // Record successful login
      const { error: attemptError } = await withAuthTimeout(supabase.rpc("record_login_attempt", {
        p_rut_code: normalizedRut,
        p_venue_id: worker.venue_id,
        p_success: true,
        p_user_agent: navigator.userAgent,
        p_failure_reason: null,
      }));
      if (attemptError) console.error("Error recording successful login:", attemptError);

      // Record in login_history
      void supabase.from("login_history").insert({
        user_id: authData.user.id,
        user_agent: navigator.userAgent,
        venue_id: worker.venue_id,
      }).then(({ error }) => { if (error) console.error("Error recording login history:", error); });

      // Fetch roles and route
      await refreshSession();
      const roles = await fetchWorkerRoles(authData.user.id);
      if (roles.length === 0) {
        toast.error("No tienes roles asignados. Contacta al administrador.");
        await supabase.auth.signOut();
      } else {
        routeByRoles(roles);
      }
    } catch (error: any) {
      console.error("Login error:", error);
      toast.error(error?.message || "Error al iniciar sesión");
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  };


  const handleModeSelect = (role: AppRole | "sales" | "tickets" | "coatcheck") => {
    routeByRole(role);
  };


  // Mode selection screen
  if (showModeSelection) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md p-8 space-y-6 border border-border shadow-sm">
          <div className="text-center space-y-2">
            <h1 className="text-2xl font-bold">Selecciona tu modo</h1>
            <p className="text-muted-foreground text-sm">
              Tienes múltiples roles asignados
            </p>
          </div>

          <div className="space-y-3">
            {workerRoles.includes("vendedor") && (
              <>
                <Button
                  variant="outline"
                  className="w-full h-16 justify-start gap-4 text-left"
                  onClick={() => handleModeSelect("sales")}
                >
                  <ShoppingCart className="h-6 w-6 text-primary" />
                  <div>
                    <div className="font-medium">Caja Alcohol</div>
                    <div className="text-xs text-muted-foreground">Punto de venta bebidas</div>
                  </div>
                </Button>
                <Button
                  variant="outline"
                  className="w-full h-16 justify-start gap-4 text-left"
                  onClick={() => handleModeSelect("tickets")}
                >
                  <Ticket className="h-6 w-6 text-warning" />
                  <div>
                    <div className="font-medium">Caja Entradas</div>
                    <div className="text-xs text-muted-foreground">Venta de tickets</div>
                  </div>
                </Button>
              </>
            )}

            {workerRoles.includes("ticket_seller") && !workerRoles.includes("vendedor") && (
              <Button
                variant="outline"
                className="w-full h-16 justify-start gap-4 text-left"
                onClick={() => handleModeSelect("ticket_seller")}
              >
                <Sparkles className="h-6 w-6 text-warning" />
                <div>
                  <div className="font-medium">Entradas</div>
                  <div className="text-xs text-muted-foreground">Venta de tickets</div>
                </div>
              </Button>
            )}

            {(workerRoles.includes("vendedor") || workerRoles.includes("ticket_seller")) && (
              <Button
                variant="outline"
                className="w-full h-16 justify-start gap-4 text-left"
                onClick={() => handleModeSelect("coatcheck")}
              >
                <Package className="h-6 w-6 text-info" />
                <div>
                  <div className="font-medium">Caja Guardarropía</div>
                  <div className="text-xs text-muted-foreground">Mochilas y prendas</div>
                </div>
              </Button>
            )}


            {/* Bar role deprecated: STOCKIA is now pure POS (cover + receipt). */}


            {(workerRoles.includes("admin") || workerRoles.includes("gerencia")) && (
              <Button
                variant="outline"
                className="w-full h-16 justify-start gap-4 text-left"
                onClick={() => handleModeSelect(workerRoles.includes("admin") ? "admin" : "gerencia")}
              >
                <Shield className="h-6 w-6 text-info" />
                <div>
                  <div className="font-medium">Administración</div>
                  <div className="text-xs text-muted-foreground">
                    {workerRoles.includes("admin") ? "Control total" : "Solo lectura"}
                  </div>
                </div>
              </Button>
            )}
          </div>

          <Button
            variant="ghost"
            className="w-full"
            onClick={async () => {
              await supabase.auth.signOut();
              setShowModeSelection(false);
              setWorkerRoles([]);
            }}
          >
            Cerrar sesión
          </Button>
        </Card>
      </div>
    );
  }


  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md p-8 space-y-6 border border-border shadow-sm">
        <div className="text-center space-y-4">
          <img src={stockiaLogoFull} alt="StockIA by IAnticipa" className="h-12 mx-auto" />
          <p className="text-muted-foreground text-sm">
            Inicia sesión con tu RUT y PIN
          </p>
        </div>

        {hasStaleSession && (
          <div className="rounded-md border border-warning/30 bg-warning/10 p-3 text-xs text-warning-foreground space-y-2">
            <p>Este equipo tiene una sesión activa de otro trabajador.</p>
            <Button type="button" size="sm" className="w-full" disabled={loading || sessionLoading}
              onClick={async () => {
                setLoading(true);
                try {
                  await refreshSession();
                  const { data, error } = await withAuthTimeout(supabase.auth.getUser());
                  if (error || !data.user) throw new Error("La sesión venció. Ingresa nuevamente con tu RUT y PIN.");
                  routeByRoles(await fetchWorkerRoles(data.user.id));
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "No pudimos recuperar tu sesión.");
                } finally { setLoading(false); }
              }}>
              Continuar con mi sesión
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="w-full"
              onClick={handleSwitchWorker}
            >
              Cambiar de trabajador
            </Button>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4" autoComplete="off">
          <div className="space-y-2">
            <Label htmlFor="rut">RUT (sin puntos ni guión)</Label>
            <Input
              id="rut"
              name="stockia-rut"
              type="text"
              placeholder="12345678"
              value={rutCode}
              onChange={(e) => setRutCode(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ""))}
              required
              maxLength={15}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              data-form-type="other"
            />
            <p className="text-xs text-muted-foreground">
              Solo los dígitos, sin puntos ni guión
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="pin">PIN</Label>
            <Input
              id="pin"
              name="stockia-pin"
              type="password"
              inputMode="numeric"
              placeholder="••••"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              required
              maxLength={128}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              data-form-type="other"
              data-lpignore="true"
              data-1p-ignore="true"
            />
            <p className="text-xs text-muted-foreground">
              Escribe tu PIN manualmente. Ignora sugerencias del teclado.
            </p>
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Verificando...
              </>
            ) : (
              "Iniciar sesión"
            )}
          </Button>
        </form>
      </Card>
    </div>
  );
}

