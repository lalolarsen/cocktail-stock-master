import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  AlertTriangle,
  Clock,
  XCircle,
  Loader2,
} from "lucide-react";

export type DocumentStatus = "pending" | "processing" | "issued" | "failed" | "cancelled";

interface StatusConfig {
  label: string;
  icon: React.ReactNode;
  className: string;
  variant?: "default" | "secondary" | "destructive" | "outline";
}

const statusConfig: Record<DocumentStatus, StatusConfig> = {
  pending: {
    label: "Pendiente",
    icon: <Clock className="w-3 h-3 mr-1" />,
    className: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
  },
  processing: {
    label: "Procesando",
    icon: <Loader2 className="w-3 h-3 mr-1 animate-spin" />,
    className: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  },
  issued: {
    label: "Emitido",
    icon: <CheckCircle2 className="w-3 h-3 mr-1" />,
    className: "bg-green-500/10 text-green-600 border-green-500/20",
  },
  failed: {
    label: "Fallido",
    icon: <AlertTriangle className="w-3 h-3 mr-1" />,
    className: "",
    variant: "destructive",
  },
  cancelled: {
    label: "Anulado",
    icon: <XCircle className="w-3 h-3 mr-1" />,
    className: "",
    variant: "secondary",
  },
};

interface DocumentStatusBadgeProps {
  status: string;
}

export function DocumentStatusBadge({ status }: DocumentStatusBadgeProps) {
  const config = statusConfig[status as DocumentStatus];
  
  if (!config) {
    return <Badge variant="outline">{status}</Badge>;
  }

  return (
    <Badge variant={config.variant} className={config.className}>
      {config.icon}
      {config.label}
    </Badge>
  );
}

// Human-readable error summary helper
export function getErrorSummary(errorMessage: string | null): string {
  if (!errorMessage) return "Error desconocido";
  
  // Common error patterns with human-readable translations
  const errorPatterns: [RegExp, string][] = [
    [/timeout/i, "Tiempo de espera agotado al conectar con el proveedor"],
    [/network|connection|fetch/i, "Error de conexión con el servicio"],
    [/unauthorized|401/i, "Credenciales inválidas del proveedor"],
    [/forbidden|403/i, "Acceso denegado por el proveedor"],
    [/not found|404/i, "Recurso no encontrado en el proveedor"],
    [/rate limit|429/i, "Límite de solicitudes excedido"],
    [/internal|500|server/i, "Error interno del proveedor"],
    [/invalid.*folio/i, "Folio inválido o duplicado"],
    [/rut.*inv[aá]lid/i, "RUT del cliente inválido"],
    [/monto/i, "Error en el monto del documento"],
  ];

  for (const [pattern, summary] of errorPatterns) {
    if (pattern.test(errorMessage)) {
      return summary;
    }
  }

  // If no pattern matches, return a truncated version of the original
  return errorMessage.length > 100 
    ? errorMessage.substring(0, 100) + "..." 
    : errorMessage;
}
