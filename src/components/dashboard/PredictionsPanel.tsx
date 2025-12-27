import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Brain, TrendingUp, Loader2, AlertTriangle, Package, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

interface ProductPrediction {
  product_id: string;
  product_name: string;
  predicted_consumption_7days: number;
  days_until_stockout: number;
  recommended_order_quantity: number;
}

interface PredictionInsights {
  high_consumption_products: string[];
  low_stock_warnings: string[];
  category_trends: Record<string, string>;
}

interface PredictionsData {
  predictions?: ProductPrediction[];
  insights?: PredictionInsights;
  raw_response?: string;
}

export const PredictionsPanel = () => {
  const [loading, setLoading] = useState(false);
  const [predictions, setPredictions] = useState<PredictionsData | null>(null);

  const generatePredictions = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("predict-consumption");

      if (error) {
        console.error("Function error:", error);
        throw new Error(error.message || "Error en la función");
      }

      if (data?.error) {
        console.error("API error:", data.error);
        throw new Error(data.error);
      }

      setPredictions(data);
      toast.success("Predicciones generadas con éxito");
    } catch (error: unknown) {
      console.error("Error generating predictions:", error);
      const errorMessage = error instanceof Error ? error.message : "Error desconocido";
      toast.error(`Error al generar predicciones: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  const getStockoutColor = (days: number) => {
    if (days <= 3) return "destructive";
    if (days <= 7) return "secondary";
    return "outline";
  };

  const getStockoutProgress = (days: number) => {
    return Math.max(0, Math.min(100, (days / 30) * 100));
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
            <div className="space-y-6 slide-in-up">
              {/* Predicciones por producto */}
              {predictions.predictions && predictions.predictions.length > 0 && (
                <div className="space-y-4">
                  <h4 className="text-lg font-semibold flex items-center gap-2">
                    <Package className="h-5 w-5 text-accent" />
                    Predicciones por Producto (7 días)
                  </h4>
                  <div className="grid gap-4 md:grid-cols-2">
                    {predictions.predictions.map((pred, index) => (
                      <Card key={pred.product_id || index} className="glass-effect">
                        <CardContent className="p-4">
                          <div className="flex justify-between items-start mb-3">
                            <h5 className="font-medium text-foreground">
                              {pred.product_name || `Producto ${index + 1}`}
                            </h5>
                            <Badge variant={getStockoutColor(pred.days_until_stockout)}>
                              {pred.days_until_stockout} días
                            </Badge>
                          </div>
                          
                          <div className="space-y-3">
                            <div className="flex justify-between text-sm">
                              <span className="text-muted-foreground">Consumo estimado:</span>
                              <span className="font-medium">{pred.predicted_consumption_7days} unidades</span>
                            </div>
                            
                            <div>
                              <div className="flex justify-between text-sm mb-1">
                                <span className="text-muted-foreground">Tiempo hasta agotarse:</span>
                              </div>
                              <Progress 
                                value={getStockoutProgress(pred.days_until_stockout)} 
                                className="h-2"
                              />
                            </div>
                            
                            <div className="flex justify-between text-sm pt-2 border-t border-border/50">
                              <span className="text-muted-foreground flex items-center gap-1">
                                <ShoppingCart className="h-3 w-3" />
                                Recomendación de compra:
                              </span>
                              <span className="font-semibold text-accent">
                                {pred.recommended_order_quantity} unidades
                              </span>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {/* Insights */}
              {predictions.insights && (
                <div className="space-y-4">
                  <h4 className="text-lg font-semibold flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-accent" />
                    Insights del Análisis
                  </h4>
                  
                  <div className="grid gap-4 md:grid-cols-2">
                    {/* Alto consumo */}
                    {predictions.insights.high_consumption_products && 
                     predictions.insights.high_consumption_products.length > 0 && (
                      <Card className="glass-effect border-accent/20">
                        <CardContent className="p-4">
                          <h5 className="font-medium mb-3 text-accent">🔥 Alto Consumo</h5>
                          <ul className="space-y-1">
                            {predictions.insights.high_consumption_products.map((product, i) => (
                              <li key={i} className="text-sm text-muted-foreground">
                                • {product}
                              </li>
                            ))}
                          </ul>
                        </CardContent>
                      </Card>
                    )}

                    {/* Alertas de stock bajo */}
                    {predictions.insights.low_stock_warnings && 
                     predictions.insights.low_stock_warnings.length > 0 && (
                      <Card className="glass-effect border-destructive/20">
                        <CardContent className="p-4">
                          <h5 className="font-medium mb-3 text-destructive flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4" />
                            Alertas de Stock
                          </h5>
                          <ul className="space-y-1">
                            {predictions.insights.low_stock_warnings.map((warning, i) => (
                              <li key={i} className="text-sm text-muted-foreground">
                                • {warning}
                              </li>
                            ))}
                          </ul>
                        </CardContent>
                      </Card>
                    )}
                  </div>

                  {/* Tendencias por categoría */}
                  {predictions.insights.category_trends && 
                   Object.keys(predictions.insights.category_trends).length > 0 && (
                    <Card className="glass-effect">
                      <CardContent className="p-4">
                        <h5 className="font-medium mb-3">📊 Tendencias por Categoría</h5>
                        <div className="grid gap-2 md:grid-cols-3">
                          {Object.entries(predictions.insights.category_trends).map(([category, trend]) => (
                            <div key={category} className="flex justify-between items-center p-2 rounded-md bg-background/50">
                              <span className="text-sm font-medium">{category}</span>
                              <span className="text-xs text-muted-foreground">{trend}</span>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}

              {/* Respuesta raw si no hay datos estructurados */}
              {predictions.raw_response && !predictions.predictions && (
                <Card className="glass-effect">
                  <CardContent className="p-4">
                    <h5 className="font-medium mb-3">Análisis de IA</h5>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {predictions.raw_response}
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
