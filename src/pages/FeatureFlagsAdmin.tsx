import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Flag, Shield } from "lucide-react";
import { useUserRole } from "@/hooks/useUserRole";

interface FeatureFlag {
  id: string;
  feature_key: string;
  enabled: boolean;
  created_at: string;
}

const FEATURE_DESCRIPTIONS: Record<string, { name: string; description: string }> = {
  invoice_reader: {
    name: "Lector de Facturas",
    description: "Importar facturas de compra con OCR y mapeo automático de productos",
  },
  invoice_to_expense: {
    name: "Factura a Gasto",
    description: "Registrar líneas de factura como gastos operacionales",
  },
  advanced_inventory: {
    name: "Inventario Avanzado",
    description: "Funciones avanzadas de gestión de inventario y lotes",
  },
  advanced_reporting: {
    name: "Reportes Avanzados",
    description: "Reportes financieros y analytics avanzados",
  },
  erp_accounting: {
    name: "Contabilidad ERP",
    description: "Integración con sistemas ERP y contabilidad",
  },
};

export default function FeatureFlagsAdmin() {
  const navigate = useNavigate();
  const { role, loading: roleLoading } = useUserRole();
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [venueId, setVenueId] = useState<string | null>(null);

  useEffect(() => {
    fetchFlags();
  }, []);

  const fetchFlags = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("venue_id")
        .eq("id", user.id)
        .single();

      if (!profile?.venue_id) {
        setLoading(false);
        return;
      }

      setVenueId(profile.venue_id);

      const { data, error } = await supabase
        .from("feature_flags")
        .select("*")
        .eq("venue_id", profile.venue_id)
        .order("feature_key");

      if (error) throw error;
      setFlags(data || []);
    } catch (error) {
      console.error("Error fetching flags:", error);
      toast.error("Error al cargar las banderas de funcionalidades");
    } finally {
      setLoading(false);
    }
  };

  const toggleFlag = async (flagId: string, currentEnabled: boolean) => {
    setUpdating(flagId);
    try {
      const { error } = await supabase
        .from("feature_flags")
        .update({ enabled: !currentEnabled })
        .eq("id", flagId);

      if (error) throw error;

      setFlags(prev =>
        prev.map(f => (f.id === flagId ? { ...f, enabled: !currentEnabled } : f))
      );
      toast.success(`Funcionalidad ${!currentEnabled ? "activada" : "desactivada"}`);
    } catch (error) {
      console.error("Error toggling flag:", error);
      toast.error("Error al actualizar la funcionalidad");
    } finally {
      setUpdating(null);
    }
  };

  const createMissingFlags = async () => {
    if (!venueId) return;

    setLoading(true);
    try {
      const existingKeys = flags.map(f => f.feature_key);
      const missingKeys = Object.keys(FEATURE_DESCRIPTIONS).filter(
        key => !existingKeys.includes(key)
      );

      if (missingKeys.length === 0) {
        toast.info("Todas las banderas ya están configuradas");
        setLoading(false);
        return;
      }

      const newFlags = missingKeys.map(key => ({
        venue_id: venueId,
        feature_key: key,
        enabled: false,
      }));

      const { error } = await supabase.from("feature_flags").insert(newFlags);
      if (error) throw error;

      toast.success(`${missingKeys.length} banderas creadas`);
      fetchFlags();
    } catch (error) {
      console.error("Error creating flags:", error);
      toast.error("Error al crear banderas");
      setLoading(false);
    }
  };

  if (roleLoading || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (role !== "admin") {
    return (
      <div className="min-h-screen bg-background">
        <header className="flex h-14 items-center gap-4 border-b bg-card px-6">
          <Button variant="ghost" size="sm" onClick={() => navigate("/admin")} className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Volver
          </Button>
        </header>
        <main className="p-6 max-w-4xl mx-auto">
          <Card>
            <CardContent className="py-12 text-center">
              <Shield className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h2 className="text-xl font-bold mb-2">Acceso restringido</h2>
              <p className="text-muted-foreground">
                Solo los administradores pueden gestionar las funcionalidades.
              </p>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="flex h-14 items-center gap-4 border-b bg-card px-6">
        <Button variant="ghost" size="sm" onClick={() => navigate("/admin")} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Volver
        </Button>
        <div className="flex-1">
          <h1 className="text-lg font-semibold">Gestión de Funcionalidades</h1>
        </div>
        <Button variant="outline" size="sm" onClick={createMissingFlags}>
          Crear banderas faltantes
        </Button>
      </header>

      <main className="p-6 max-w-4xl mx-auto space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Flag className="h-5 w-5" />
              Feature Flags
            </CardTitle>
            <CardDescription>
              Controla qué funcionalidades están disponibles para este local
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {flags.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>No hay banderas configuradas para este local.</p>
                <Button className="mt-4" onClick={createMissingFlags}>
                  Crear banderas
                </Button>
              </div>
            ) : (
              flags.map(flag => {
                const info = FEATURE_DESCRIPTIONS[flag.feature_key] || {
                  name: flag.feature_key,
                  description: "Sin descripción",
                };
                return (
                  <div
                    key={flag.id}
                    className="flex items-center justify-between p-4 rounded-lg border"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium">{info.name}</h3>
                        <Badge variant={flag.enabled ? "default" : "secondary"}>
                          {flag.enabled ? "Activo" : "Inactivo"}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{info.description}</p>
                      <code className="text-xs text-muted-foreground">{flag.feature_key}</code>
                    </div>
                    <Switch
                      checked={flag.enabled}
                      disabled={updating === flag.id}
                      onCheckedChange={() => toggleFlag(flag.id, flag.enabled)}
                    />
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
