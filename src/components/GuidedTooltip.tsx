import { ReactNode } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { HelpCircle } from "lucide-react";

interface GuidedTooltipProps {
  children: ReactNode;
  content: string;
  side?: "top" | "right" | "bottom" | "left";
}

export function GuidedTooltip({ children, content, side = "top" }: GuidedTooltipProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center gap-1 cursor-help">
          {children}
          <HelpCircle className="w-3.5 h-3.5 text-muted-foreground" />
        </span>
      </TooltipTrigger>
      <TooltipContent side={side} className="max-w-xs">
        <p className="text-sm">{content}</p>
      </TooltipContent>
    </Tooltip>
  );
}

// Common tooltips used throughout the app
export const TOOLTIPS = {
  warehouse: "La bodega es tu almacén central. Todo el inventario inicial se registra aquí.",
  bar: "Las barras son los puntos de despacho donde se preparan los tragos. Cada barra tiene su propio stock.",
  pos: "Las cajas POS son los terminales de venta. Cada caja está vinculada a una barra para el despacho.",
  jornada: "Una jornada es un período de operación (día o turno) que agrupa ventas y permite hacer corte de caja.",
  replenishment: "La reposición mueve productos desde la bodega a las barras antes de cada jornada.",
  pickupQR: "El código QR permite al barman verificar y entregar el pedido al cliente.",
  paymentMethod: "El método de pago se registra para el corte de caja. El efectivo se cuenta físicamente.",
  // Add-ons (from DiStock Manual)
  addon: "Un add-on es un modificador que agrega un cargo extra al producto, como 'Michelada' o 'Sal Extra'. Los insumos se contabilizan como gastos operacionales.",
  diferimiento: "La Venta NO es igual a la Entrega. El stock se descuenta solo cuando el QR es validado en barra.",
  multiStock: "Un solo producto puede impactar múltiples inventarios. Ejemplo: Ron Cola descuenta Ron (barra) y Lata (bodega frío).",
  validacionDinamica: "El mixer se elige en el 'último kilómetro' (la barra), reflejando exactamente lo entregado.",
};