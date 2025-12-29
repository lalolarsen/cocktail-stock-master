import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Wine } from "lucide-react";
import { Separator } from "@/components/ui/separator";

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [isBarLogin, setIsBarLogin] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Check if user is already logged in
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        checkUserRole(session.user.id);
      }
    });
  }, []);

  const checkUserRole = async (userId: string, forceBarRoute = false) => {
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);

    if (roles && roles.length > 0) {
      const role = roles[0].role;
      
      // If bar login was used, verify it's actually a bar user
      if (forceBarRoute) {
        if (role === "bar") {
          navigate("/bar");
        } else {
          // Wrong portal - sign out and show error
          await supabase.auth.signOut();
          toast.error("Esta cuenta no tiene acceso al portal de barra");
          return;
        }
      } else {
        // Regular login - redirect based on role, but block bar users
        if (role === "bar") {
          await supabase.auth.signOut();
          toast.error("Usuarios de barra deben usar el botón 'Entrar a Barra'");
          return;
        }
        if (role === "admin") {
          navigate("/admin");
        } else if (role === "gerencia") {
          navigate("/gerencia");
        } else if (role === "vendedor") {
          navigate("/sales");
        }
      }
    }
  };

  const recordLogin = async (userId: string) => {
    try {
      await supabase.from("login_history").insert({
        user_id: userId,
        user_agent: navigator.userAgent,
      });
    } catch (error) {
      console.error("Error recording login:", error);
    }
  };

  const handleAuth = async (e: React.FormEvent, forceBarRoute = false) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isLogin || forceBarRoute) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;

        if (data.user) {
          // Verify PIN
          const { data: profile, error: profileError } = await supabase
            .from("profiles")
            .select("worker_pin")
            .eq("id", data.user.id)
            .single();

          if (profileError) throw new Error("Error al verificar el PIN");
          
          if (profile?.worker_pin && profile.worker_pin !== pin) {
            await supabase.auth.signOut();
            throw new Error("PIN incorrecto");
          }

          // Record login history
          await recordLogin(data.user.id);
          await checkUserRole(data.user.id, forceBarRoute);
        }
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName,
            },
            emailRedirectTo: `${window.location.origin}/`,
          },
        });

        if (error) throw error;

        toast.success("Cuenta creada exitosamente. Por favor inicia sesión.");
        setIsLogin(true);
      }
    } catch (error: any) {
      toast.error(error.message || "Error en la autenticación");
    } finally {
      setLoading(false);
    }
  };

  const handleBarLogin = (e: React.FormEvent) => {
    handleAuth(e, true);
  };

  // Bar login mode UI
  if (isBarLogin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-900/30 via-background to-purple-600/20 p-4">
        <Card className="w-full max-w-md p-8 space-y-6 backdrop-blur-sm bg-background/95 border-purple-500/30">
          <div className="text-center space-y-2">
            <div className="flex items-center justify-center gap-2">
              <Wine className="h-8 w-8 text-purple-500" />
              <h1 className="text-3xl font-bold text-purple-500">Portal Barra</h1>
            </div>
            <p className="text-muted-foreground">
              Acceso exclusivo para personal de barra
            </p>
          </div>

          <form onSubmit={handleBarLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="bar-email">Email</Label>
              <Input
                id="bar-email"
                type="email"
                placeholder="tu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="bar-password">Contraseña</Label>
              <Input
                id="bar-password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="bar-pin">PIN de trabajador</Label>
              <Input
                id="bar-pin"
                type="password"
                placeholder="••••"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                required
                maxLength={6}
              />
            </div>

            <Button
              type="submit"
              className="w-full bg-purple-600 hover:bg-purple-700"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Verificando...
                </>
              ) : (
                <>
                  <Wine className="mr-2 h-4 w-4" />
                  Entrar a Barra
                </>
              )}
            </Button>
          </form>

          <div className="text-center">
            <button
              type="button"
              onClick={() => setIsBarLogin(false)}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              ← Volver al login principal
            </button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-secondary/10 p-4">
      <Card className="w-full max-w-md p-8 space-y-6 backdrop-blur-sm bg-background/95 border-primary/20">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold gradient-text">CoctelStock</h1>
          <p className="text-muted-foreground">
            {isLogin ? "Inicia sesión en tu cuenta" : "Crea una nueva cuenta"}
          </p>
        </div>

        <form onSubmit={handleAuth} className="space-y-4">
          {!isLogin && (
            <div className="space-y-2">
              <Label htmlFor="fullName">Nombre completo</Label>
              <Input
                id="fullName"
                type="text"
                placeholder="Tu nombre"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required={!isLogin}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="tu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Contraseña</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>

          {isLogin && (
            <div className="space-y-2">
              <Label htmlFor="pin">PIN de trabajador</Label>
              <Input
                id="pin"
                type="password"
                placeholder="••••"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                required
                maxLength={6}
              />
            </div>
          )}

          <Button
            type="submit"
            className="w-full"
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Procesando...
              </>
            ) : isLogin ? (
              "Iniciar sesión"
            ) : (
              "Crear cuenta"
            )}
          </Button>
        </form>

        {isLogin && (
          <>
            <div className="relative">
              <Separator />
              <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-background px-2 text-xs text-muted-foreground">
                o
              </span>
            </div>

            <Button
              type="button"
              variant="outline"
              className="w-full border-purple-500/30 text-purple-600 hover:bg-purple-500/10"
              onClick={() => setIsBarLogin(true)}
            >
              <Wine className="mr-2 h-4 w-4" />
              Entrar a Barra
            </Button>
          </>
        )}

        <div className="text-center">
          <button
            type="button"
            onClick={() => setIsLogin(!isLogin)}
            className="text-sm text-primary hover:underline"
          >
            {isLogin
              ? "¿No tienes cuenta? Regístrate"
              : "¿Ya tienes cuenta? Inicia sesión"}
          </button>
        </div>
      </Card>
    </div>
  );
}
