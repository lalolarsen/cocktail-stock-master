import { useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { 
  ChevronDown, 
  ChevronUp, 
  Upload, 
  FileSearch, 
  Edit, 
  Link, 
  Check, 
  XCircle,
  History 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { 
  Collapsible, 
  CollapsibleContent, 
  CollapsibleTrigger 
} from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface AuditEvent {
  action: string;
  timestamp: string;
  user_id?: string;
  data?: Record<string, unknown>;
}

interface ImportAuditTimelineProps {
  events: AuditEvent[];
  className?: string;
}

const ACTION_CONFIG: Record<string, { icon: typeof Upload; label: string; color: string }> = {
  document_uploaded: { 
    icon: Upload, 
    label: "Documento cargado", 
    color: "text-blue-600" 
  },
  document_parsed: { 
    icon: FileSearch, 
    label: "Documento procesado", 
    color: "text-purple-600" 
  },
  header_edited: { 
    icon: Edit, 
    label: "Cabecera editada", 
    color: "text-amber-600" 
  },
  item_matched: { 
    icon: Link, 
    label: "Producto asociado", 
    color: "text-green-600" 
  },
  item_reclassified: { 
    icon: Edit, 
    label: "Ítem reclasificado", 
    color: "text-orange-600" 
  },
  uom_adjusted: { 
    icon: Edit, 
    label: "Conversión ajustada", 
    color: "text-cyan-600" 
  },
  document_confirmed: { 
    icon: Check, 
    label: "Documento confirmado", 
    color: "text-green-700" 
  },
  document_voided: { 
    icon: XCircle, 
    label: "Documento anulado", 
    color: "text-red-600" 
  },
};

export function ImportAuditTimeline({ events, className }: ImportAuditTimelineProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (!events || events.length === 0) {
    return null;
  }

  const sortedEvents = [...events].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className={className}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" className="w-full justify-between">
          <span className="flex items-center gap-2">
            <History className="h-4 w-4" />
            Historial de cambios
            <Badge variant="secondary" className="ml-1">
              {events.length}
            </Badge>
          </span>
          {isOpen ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2">
        <div className="border rounded-lg p-3 bg-muted/30 space-y-3">
          {sortedEvents.map((event, index) => {
            const config = ACTION_CONFIG[event.action] || {
              icon: Edit,
              label: event.action,
              color: "text-gray-600",
            };
            const Icon = config.icon;

            return (
              <div
                key={index}
                className={cn(
                  "flex items-start gap-3 text-sm",
                  index < sortedEvents.length - 1 && "pb-3 border-b border-border/50"
                )}
              >
                <div className={cn("mt-0.5", config.color)}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium">{config.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(event.timestamp), "dd MMM yyyy, HH:mm", { locale: es })}
                  </p>
                  {event.data && Object.keys(event.data).length > 0 && (
                    <div className="mt-1 text-xs text-muted-foreground bg-background/50 rounded p-1.5">
                      {Object.entries(event.data).map(([key, value]) => (
                        <span key={key} className="mr-2">
                          <span className="font-medium">{key}:</span>{" "}
                          {typeof value === "object" ? JSON.stringify(value) : String(value)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
