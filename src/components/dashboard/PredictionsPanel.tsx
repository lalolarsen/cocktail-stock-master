import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Brain, TrendingUp, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const PredictionsPanel = () => {
  const [loading, setLoading] = useState(false);
  const [predictions, setPredictions] = useState<any>(null);

  const generatePredictions = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("predict-consumption");

      if (error) throw error;

      setPredictions(data);
      toast.success("Predicciones generadas con éxito");
    } catch (error) {
      console.error("Error generating predictions:", error);
      toast.error("Error al generar predicciones");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="glass-effect shadow-elegant">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-2xl bg-gradient-to-r from-accent to-primary-glow bg-clip-text text-transparent">
          <Brain className="h-6 w-6 text-accent" />
          Predicciones con IA
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          <div className="text-center p-8 glass-effect rounded-lg">
            <Brain className="h-16 w-16 mx-auto mb-4 text-accent" />
            <h3 className="text-xl font-semibold mb-2">
              Análisis Predictivo de Consumo
            </h3>
            <p className="text-muted-foreground mb-6">
              Utiliza inteligencia artificial para predecir el consumo futuro de tus
              productos y optimizar tu inventario.
            </p>
            <Button
              onClick={generatePredictions}
              disabled={loading}
              className="bg-accent text-accent-foreground hover:opacity-90 transition-smooth"
              size="lg"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Analizando datos...
                </>
              ) : (
                <>
                  <TrendingUp className="mr-2 h-5 w-5" />
                  Generar Predicciones
                </>
              )}
            </Button>
          </div>

          {predictions && (
            <div className="space-y-4 slide-in-up">
              <h4 className="text-lg font-semibold">Resultados del Análisis</h4>
              <div className="glass-effect p-6 rounded-lg">
                <pre className="text-sm whitespace-pre-wrap">
                  {JSON.stringify(predictions, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
