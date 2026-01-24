import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Code2, ArrowLeft, Mail } from "lucide-react";

export default function DevAuth() {
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

  const handleLogin = async (e: React.FormEvent) => {
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
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (error) {
        // Log full error object for debugging
        console.error("Supabase Auth Error:", {
          message: error.message,
          status: error.status,
          code: error.code,
          name: error.name,
          fullError: error,
        });

        // Build detailed error message
        const errorDetails = [
          error.message,
          error.status ? `Status: ${error.status}` : null,
          error.code ? `Code: ${error.code}` : null,
        ].filter(Boolean).join(" | ");

        toast.error(errorDetails, { duration: 8000 });
        setLoading(false);
        return;
      }

      // Redirect happens via onAuthStateChange
      toast.success("Sesión iniciada");
    } catch (error: any) {
      console.error("Login catch error:", error);
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
          <CardTitle className="text-2xl">Developer Login</CardTitle>
          <CardDescription>
            Acceso exclusivo para desarrolladores
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <form onSubmit={handleLogin} className="space-y-4">
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
