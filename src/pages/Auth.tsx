import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Wine, ShoppingCart, Shield, Eye, Sparkles } from "lucide-react";
import { AppRole } from "@/hooks/useUserRole";

const LAST_MODE_KEY = "coctelstock_last_mode";

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
  const [workerData, setWorkerData] = useState<WorkerData | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    // Check if user is already logged in
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        handleExistingSession(session.user.id);
      }
    });
  }, []);

  const handleExistingSession = async (userId: string) => {
    // Get worker roles
    const roles = await fetchWorkerRoles(userId);
    if (roles && roles.length > 0) {
      routeByRoles(roles);
    }
  };

  const fetchWorkerRoles = async (userId: string): Promise<AppRole[]> => {
    // First try worker_roles table
    const { data: workerRoles } = await supabase
      .from("worker_roles")
      .select("role")
      .eq("worker_id", userId);

    if (workerRoles && workerRoles.length > 0) {
      return workerRoles.map(r => r.role as AppRole);
    }

    // Fallback to user_roles table
    const { data: userRoles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);

    if (userRoles && userRoles.length > 0) {
      return userRoles.map(r => r.role as AppRole);
    }

    return [];
  };

  const routeByRoles = (roles: AppRole[]) => {
    if (roles.length === 1) {
      const role = roles[0];
      if (role === "admin" || role === "gerencia") {
        navigate("/admin");
      } else if (role === "vendedor") {
        navigate("/sales");
      } else if (role === "bar") {
        navigate("/bar");
      } else if (role === "ticket_seller") {
        navigate("/tickets");
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

  const routeByRole = (role: AppRole) => {
    localStorage.setItem(LAST_MODE_KEY, role);
    if (role === "admin" || role === "gerencia") {
      navigate("/admin");
    } else if (role === "vendedor") {
      navigate("/sales");
    } else if (role === "bar") {
      navigate("/bar");
    } else if (role === "ticket_seller") {
      navigate("/tickets");
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
    
    const normalizedRut = normalizeRut(rutCode);
    
    if (!validateRut(rutCode)) {
      toast.error("RUT inválido. Ingresa entre 7 y 9 dígitos, o usa un RUT demo.");
      return;
    }

    if (!pin || pin.length < 4) {
      toast.error("PIN debe tener al menos 4 dígitos");
      return;
    }

    setLoading(true);

    try {
      // Check if account is locked
      const { data: isLocked } = await supabase.rpc("is_account_locked", {
        p_rut_code: normalizedRut,
        p_venue_id: null
      });

      if (isLocked) {
        toast.error("Cuenta bloqueada temporalmente. Intenta en 15 minutos.");
        setLoading(false);
        return;
      }

      // Get worker by RUT
      const { data: workers, error: workerError } = await supabase.rpc("get_worker_by_rut", {
        p_rut_code: normalizedRut,
        p_venue_id: null
      });

      if (workerError || !workers || workers.length === 0) {
        // Record failed attempt
        await supabase.rpc("record_login_attempt", {
          p_rut_code: normalizedRut,
          p_venue_id: null,
          p_success: false,
          p_user_agent: navigator.userAgent
        });
        toast.error("Credenciales incorrectas");
        setLoading(false);
        return;
      }

      const worker = workers[0] as WorkerData;

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
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: authEmail,
        password: pin,
      });

      if (authError) {
        // Record failed attempt
        await supabase.rpc("record_login_attempt", {
          p_rut_code: normalizedRut,
          p_venue_id: worker.venue_id,
          p_success: false,
          p_user_agent: navigator.userAgent
        });
        toast.error("Credenciales incorrectas");
        setLoading(false);
        return;
      }

      // Record successful login
      await supabase.rpc("record_login_attempt", {
        p_rut_code: normalizedRut,
        p_venue_id: worker.venue_id,
        p_success: true,
        p_user_agent: navigator.userAgent
      });

      // Record in login_history
      await supabase.from("login_history").insert({
        user_id: authData.user!.id,
        user_agent: navigator.userAgent,
      });

      // Fetch roles and route
      const roles = worker.roles || [];
      if (roles.length === 0) {
        // Fallback fetch
        const fetchedRoles = await fetchWorkerRoles(authData.user!.id);
        if (fetchedRoles.length > 0) {
          routeByRoles(fetchedRoles);
        } else {
          toast.error("No tienes roles asignados. Contacta al administrador.");
          await supabase.auth.signOut();
        }
      } else {
        setWorkerData(worker);
        routeByRoles(roles);
      }
    } catch (error: any) {
      console.error("Login error:", error);
      toast.error("Error al iniciar sesión");
    } finally {
      setLoading(false);
    }
  };

  const handleModeSelect = (role: AppRole) => {
    routeByRole(role);
  };

  // Mode selection screen
  if (showModeSelection) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-secondary/10 p-4">
        <Card className="w-full max-w-md p-8 space-y-6 backdrop-blur-sm bg-background/95 border-primary/20">
          <div className="text-center space-y-2">
            <h1 className="text-2xl font-bold">Selecciona tu modo</h1>
            <p className="text-muted-foreground text-sm">
              Tienes múltiples roles asignados
            </p>
          </div>

          <div className="space-y-3">
            {workerRoles.includes("vendedor") && (
              <Button
                variant="outline"
                className="w-full h-16 justify-start gap-4 text-left"
                onClick={() => handleModeSelect("vendedor")}
              >
                <ShoppingCart className="h-6 w-6 text-green-500" />
                <div>
                  <div className="font-medium">Caja</div>
                  <div className="text-xs text-muted-foreground">Punto de venta</div>
                </div>
              </Button>
            )}

            {workerRoles.includes("ticket_seller") && (
              <Button
                variant="outline"
                className="w-full h-16 justify-start gap-4 text-left"
                onClick={() => handleModeSelect("ticket_seller")}
              >
                <Sparkles className="h-6 w-6 text-amber-500" />
                <div>
                  <div className="font-medium">Entradas</div>
                  <div className="text-xs text-muted-foreground">Venta de tickets</div>
                </div>
              </Button>
            )}

            {workerRoles.includes("bar") && (
              <Button
                variant="outline"
                className="w-full h-16 justify-start gap-4 text-left"
                onClick={() => handleModeSelect("bar")}
              >
                <Wine className="h-6 w-6 text-purple-500" />
                <div>
                  <div className="font-medium">Barra</div>
                  <div className="text-xs text-muted-foreground">Entrega de pedidos</div>
                </div>
              </Button>
            )}

            {(workerRoles.includes("admin") || workerRoles.includes("gerencia")) && (
              <Button
                variant="outline"
                className="w-full h-16 justify-start gap-4 text-left"
                onClick={() => handleModeSelect(workerRoles.includes("admin") ? "admin" : "gerencia")}
              >
                <Shield className="h-6 w-6 text-blue-500" />
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
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-primary/10 via-background to-secondary/10 p-4">
      <Card className="w-full max-w-md p-8 space-y-6 backdrop-blur-sm bg-background/95 border-primary/20">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold gradient-text">CoctelStock</h1>
          <p className="text-muted-foreground">
            Inicia sesión con tu RUT y PIN
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="rut">RUT (sin puntos ni guión)</Label>
            <Input
              id="rut"
              type="text"
              placeholder="12345678"
              value={rutCode}
              onChange={(e) => setRutCode(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ""))}
              required
              maxLength={15}
              autoComplete="username"
            />
            <p className="text-xs text-muted-foreground">
              Solo los dígitos, sin puntos ni guión
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="pin">PIN</Label>
            <Input
              id="pin"
              type="password"
              inputMode="numeric"
              placeholder="••••"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              required
              maxLength={6}
              autoComplete="current-password"
            />
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
