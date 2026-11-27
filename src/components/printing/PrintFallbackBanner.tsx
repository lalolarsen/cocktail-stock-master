import { useEffect, useState } from "react";
import { AlertTriangle, Printer, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isAndroid } from "@/lib/printing/rawbt";
import { dismissFallback, subscribeFallback, type FallbackState } from "@/lib/printing/print-tracker";

/** Aviso amarillo grande cuando la impresión no llegó a RawBT. */
export function PrintFallbackBanner() {
  const [state, setState] = useState<FallbackState | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const unsub = subscribeFallback(setState);
    return () => {
      unsub();
    };
  }, []);
  if (!state) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 p-3 sm:p-4">
      <div className="mx-auto max-w-2xl rounded-xl border-2 border-warning bg-warning text-warning-foreground shadow-2xl p-4 space-y-3">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-7 h-7 shrink-0" />
          <div className="flex-1">
            <p className="text-lg font-bold leading-tight">Revisa la impresión</p>
            <p className="text-sm">{state.label} · ya está guardada, no se vuelve a cobrar.</p>
            {state.attempts > 1 && (
              <p className="text-sm font-semibold mt-1">
                {isAndroid()
                  ? 'Revisa el Bluetooth y la impresora "SD-…", encendida y con papel (botón Ayuda).'
                  : "Revisa la impresora seleccionada y la cola de Windows antes de reintentar."}
              </p>
            )}
          </div>
          <Button variant="ghost" size="icon" aria-label="Cerrar aviso" onClick={dismissFallback} className="shrink-0">
            <X className="w-5 h-5" />
          </Button>
        </div>
        <Button
          size="lg"
          variant="secondary"
          className="w-full h-16 text-lg font-bold gap-3"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await state.retry();
            } finally {
              setBusy(false);
            }
          }}
        >
          <Printer className="w-6 h-6" /> IMPRIMIR AHORA
        </Button>
      </div>
    </div>
  );
}
