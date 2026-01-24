import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Code2, ArrowLeft, Mail } from "lucide-react";

type AuthMode = "signin" | "signup";

export default function DevAuth() {
  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    // Check if user is already logged in
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        // Already authenticated, redirect to developer panel
        navigate("/developer");
      } else {
        setCheckingSession(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (session) {
          navigate("/developer");
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [navigate]);

  const validateEmail = (email: string): boolean => {
    return email.includes("@") && email.length >= 5;
  };

  const handleSignIn = async () => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (error) {
      console.error("Supabase Auth Error:", {
        message: error.message,
        status: error.status,
        code: error.code,
        name: error.name,
        fullError: error,
      });

      const errorDetails = [
        error.message,
        error.status ? `Status: ${error.status}` : null,
        error.code ? `Code: ${error.code}` : null,
      ].filter(Boolean).join(" | ");

      toast.error(errorDetails, { duration: 8000 });
      return false;
    }

    toast.success("Sesión iniciada");
    return true;
  };

  const handleSignUp = async () => {
    const { error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/dev-auth`,
      },
    });

    if (error) {
      console.error("Supabase SignUp Error:", {
        message: error.message,
        status: error.status,
        code: error.code,
        name: error.name,
        fullError: error,
      });

      const errorDetails = [
        error.message,
        error.status ? `Status: ${error.status}` : null,
        error.code ? `Code: ${error.code}` : null,
      ].filter(Boolean).join(" | ");

      toast.error(errorDetails, { duration: 8000 });
      return false;
    }

    toast.success("Cuenta creada. Ahora inicia sesión.", { duration: 5000 });
    setMode("signin");
    setPassword("");
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateEmail(email)) {
      toast.error("Email inválido. Debe contener @");
      return;
    }

    if (!password || password.length < 6) {
      toast.error("Contraseña debe tener al menos 6 caracteres");
      return;
    }

    setLoading(true);

    try {
      if (mode === "signin") {
        await handleSignIn();
      } else {
        await handleSignUp();
      }
    } catch (error: any) {
      console.error("Auth catch error:", error);
      toast.error(`Error: ${error?.message || "Error desconocido"}`);
    } finally {
      setLoading(false);
    }
  };

  if (checkingSession) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-primary/10 via-background to-secondary/10 p-4">
      <Card className="w-full max-w-md backdrop-blur-sm bg-background/95 border-primary/20">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-2">
            <Code2 className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl">
            {mode === "signin" ? "Developer Login" : "Crear cuenta Developer"}
          </CardTitle>
          <CardDescription>
            {mode === "signin" 
              ? "Acceso exclusivo para desarrolladores" 
              : "Registra una nueva cuenta de desarrollador"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Mode Toggle */}
          <div className="flex rounded-lg bg-muted p-1">
            <button
              type="button"
              onClick={() => setMode("signin")}
              className={`flex-1 py-2 px-4 text-sm font-medium rounded-md transition-colors ${
                mode === "signin"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Iniciar sesión
            </button>
            <button
              type="button"
              onClick={() => setMode("signup")}
              className={`flex-1 py-2 px-4 text-sm font-medium rounded-md transition-colors ${
                mode === "signup"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Crear cuenta
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="developer@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="pl-10"
                  disabled={loading}
                />
              </div>
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
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                disabled={loading}
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
                  {mode === "signin" ? "Verificando..." : "Creando cuenta..."}
                </>
              ) : (
                mode === "signin" ? "Iniciar sesión" : "Crear cuenta"
              )}
            </Button>
          </form>

          {mode === "signup" && (
            <p className="text-xs text-muted-foreground text-center">
              Nota: Crear una cuenta no otorga acceso automático al panel de desarrollador. 
              Un administrador debe asignar el rol 'developer'.
            </p>
          )}

          <div className="text-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/")}
              className="gap-2 text-muted-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              Volver al inicio
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
