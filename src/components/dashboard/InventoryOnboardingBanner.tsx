import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Camera, Activity, ClipboardCheck, FileText, X } from "lucide-react";

interface Props {
  venueId: string | null | undefined;
}

const STORAGE_KEY = "stockia.inventoryOnboardingDismissed";

export function InventoryOnboardingBanner({ venueId }: Props) {
  const key = venueId ? `${STORAGE_KEY}.${venueId}` : null;
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (!key) return;
    setDismissed(localStorage.getItem(key) === "1");
  }, [key]);

  if (dismissed || !key) return null;

  const dismiss = () => {
    localStorage.setItem(key, "1");
    setDismissed(true);
  };

  const steps = [
    { icon: Camera, title: "1. Compras", desc: "Subí la factura con foto. La IA la procesa y carga el stock en bodega." },
    { icon: Activity, title: "2. Stock en vivo", desc: "Esta tabla se actualiza sola al canjear QR en barra. Sin refrescar." },
    { icon: ClipboardCheck, title: "3. Conteo de cierre", desc: "Bartenders cuentan al cerrar. Diferencias >10% generan alerta." },
    { icon: FileText, title: "4. Informe PDF", desc: "Descargá el inventario actual cuando quieras (auditoría, gerencia)." },
  ];

  return (
    <Card className="relative border-primary/30 bg-primary/5">
      <button
        onClick={dismiss}
        className="absolute top-2 right-2 p-1 rounded hover:bg-muted/40 text-muted-foreground"
        aria-label="Cerrar"
      >
        <X className="w-4 h-4" />
      </button>
      <div className="p-4 sm:p-5">
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-foreground">Cómo funciona ahora tu inventario</h3>
          <p className="text-xs text-muted-foreground">Stockia digitaliza el ciclo completo. Estos son los 4 pasos.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {steps.map((s) => (
            <div key={s.title} className="flex gap-2.5 p-3 rounded-md bg-background/60 border border-border">
              <s.icon className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <div className="min-w-0">
                <div className="text-xs font-semibold text-foreground">{s.title}</div>
                <div className="text-[11px] text-muted-foreground leading-snug mt-0.5">{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 flex justify-end">
          <Button size="sm" variant="ghost" onClick={dismiss} className="h-7 text-xs">
            Entendido, no mostrar de nuevo
          </Button>
        </div>
      </div>
    </Card>
  );
}
