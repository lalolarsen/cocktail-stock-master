import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";

interface FeatureDisabledProps {
  featureName?: string;
  description?: string;
}

/**
 * Full-page component shown when a feature is disabled.
 * Used for route protection.
 */
export function FeatureDisabled({ 
  featureName = "Esta función",
  description = "Contacta al administrador para habilitarla."
}: FeatureDisabledProps) {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <Card className="max-w-md w-full">
        <CardContent className="pt-8 pb-8 text-center space-y-4">
          <div className="mx-auto w-16 h-16 rounded-full bg-muted flex items-center justify-center">
            <Lock className="w-8 h-8 text-muted-foreground" />
          </div>
          <h2 className="text-xl font-bold text-foreground">Función desactivada</h2>
          <p className="text-muted-foreground">
            {featureName} no está habilitada para este local.
          </p>
          <p className="text-sm text-muted-foreground">
            {description}
          </p>
          <Button variant="outline" onClick={() => navigate(-1)} className="mt-4">
            Volver
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
