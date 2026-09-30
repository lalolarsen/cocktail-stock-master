import { HelpCircle, Bluetooth, AlertTriangle, Ban, ListChecks } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type Screen = "cortesias" | "guardarropia" | "tickets" | "alcohol";

const USAGE: Record<Screen, { title: string; steps: string[] }> = {
  cortesias: {
    title: "Cortesías",
    steps: ["Elige el trago.", "Elige el motivo y la cantidad.", "Presiona \"Emitir e imprimir\"."],
  },
  guardarropia: {
    title: "Guardarropía",
    steps: [
      "Elige el tipo (mochila o prenda) y la cantidad.",
      "Elige el pago (efectivo o tarjeta).",
      "Presiona \"Cobrar e imprimir\". El comprobante es para el trabajador.",
      "Al final de la noche presiona \"Resumen\" y fírmalo.",
    ],
  },
  tickets: {
    title: "Entradas",
    steps: ["Agrega las entradas.", "Elige el pago y cobra.", "En tablet sale solo el cover."],
  },
  alcohol: {
    title: "Alcohol",
    steps: ["Agrega los productos.", "Elige el pago y cobra.", "Entrega el comprobante al cliente."],
  },
};

interface Props {
  screen: Screen;
  size?: ButtonProps["size"];
  variant?: ButtonProps["variant"];
  className?: string;
}

function Section({ icon: Icon, title, children }: { icon: typeof HelpCircle; title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-2 text-lg font-semibold">
        <Icon className="h-5 w-5 text-primary" /> {title}
      </h3>
      <div className="text-base leading-relaxed text-foreground/90">{children}</div>
    </section>
  );
}

export function TabletHelpButton({ screen, size = "sm", variant = "outline", className }: Props) {
  const usage = USAGE[screen];
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant={variant} size={size} className={`gap-2 ${className ?? ""}`}>
          <HelpCircle className="h-4 w-4" /> Ayuda
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl">Ayuda</DialogTitle>
        </DialogHeader>
        <div className="space-y-6">
          <Section icon={Bluetooth} title="1. Si no imprime, revisa el Bluetooth">
            <ol className="list-decimal pl-5 space-y-1">
              <li>Desliza desde arriba de la pantalla y revisa que el Bluetooth esté encendido (ícono azul).</li>
              <li>
                Mantén presionado el ícono de Bluetooth. En "Dispositivos vinculados" debe aparecer la impresora,
                con un nombre como <strong>SD-</strong> y números (ejemplo: SD-1234).
              </li>
              <li>Si no aparece o dice "desconectado", tócala para conectar.</li>
              <li>Revisa que la impresora esté encendida, con papel y la tapa cerrada.</li>
              <li>Vuelve a la app e intenta de nuevo.</li>
            </ol>
          </Section>
          <Section icon={AlertTriangle} title="2. Si aún no imprime">
            <ul className="list-disc pl-5 space-y-1">
              <li>Apaga y enciende la impresora, espera 10 segundos e intenta de nuevo.</li>
              <li>
                Si sigue sin funcionar, <strong>avisa al administrador</strong>. No cambies ajustes dentro de la
                app de impresión (RawBT).
              </li>
            </ul>
          </Section>
          <Section icon={ListChecks} title={`3. Cómo usar ${usage.title}`}>
            <ol className="list-decimal pl-5 space-y-1">
              {usage.steps.map((s) => <li key={s}>{s}</li>)}
            </ol>
          </Section>
          <Section icon={Ban} title="4. Qué NO hacer">
            <ul className="list-disc pl-5 space-y-1">
              <li>No abrir ni configurar RawBT.</li>
              <li>No cerrar sesión ni cambiar de caja sin avisar.</li>
              <li>No desvincular la impresora.</li>
            </ul>
          </Section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
