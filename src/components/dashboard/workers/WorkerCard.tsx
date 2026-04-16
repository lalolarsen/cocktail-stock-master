import { Worker, AVAILABLE_ROLES } from "./types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Edit2, Key, History, Power, PowerOff, Trash2, 
  Calendar, CheckCircle, XCircle
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface WorkerCardProps {
  worker: Worker;
  isReadOnly: boolean;
  showPin?: boolean;
  onEdit: (worker: Worker) => void;
  onResetPin: (worker: Worker) => void;
  onToggleActive: (worker: Worker) => void;
  onViewHistory: (worker: Worker) => void;
  onDelete: (worker: Worker) => void;
  maskRut: (rut: string | null) => string;
}

export function WorkerCard({
  worker,
  isReadOnly,
  showPin = false,
  onEdit,
  onResetPin,
  onToggleActive,
  onViewHistory,
  onDelete,
  maskRut,
}: WorkerCardProps) {
  const getRoleBadges = () => {
    return worker.roles.map((role) => {
      const roleInfo = AVAILABLE_ROLES.find((r) => r.value === role);
      if (!roleInfo) return null;
      const Icon = roleInfo.icon;
      return (
        <Badge 
          key={role} 
          variant="secondary" 
          className="gap-1.5 font-medium text-xs"
        >
          <Icon className="h-3 w-3" />
          {roleInfo.label}
        </Badge>
      );
    });
  };

  return (
    <div 
      className={`group relative p-4 rounded-xl border bg-card transition-all hover:shadow-md ${
        !worker.is_active ? "opacity-60" : "hover:border-primary/30"
      }`}
    >
      {/* Status indicator */}
      <div className="absolute top-3 right-3">
        {worker.is_active ? (
          <Badge variant="secondary" className="gap-1 text-xs bg-emerald-500/15 text-emerald-500 border-0">
            <CheckCircle className="h-3 w-3" />
            Activo
          </Badge>
        ) : (
          <Badge variant="secondary" className="gap-1 text-xs">
            <XCircle className="h-3 w-3" />
            Inactivo
          </Badge>
        )}
      </div>

      {/* Worker info */}
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold shrink-0 ${
          worker.is_active 
            ? "bg-primary/15 text-primary" 
            : "bg-muted text-muted-foreground"
        }`}>
          {worker.full_name 
            ? worker.full_name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)
            : "??"}
        </div>

        <div className="flex-1 min-w-0 space-y-1.5">
          <div>
            <h3 className="font-semibold text-foreground truncate text-sm leading-tight">
              {worker.full_name || "Sin nombre"}
            </h3>
            <p className="text-xs text-muted-foreground font-mono mt-0.5">
              PIN: {maskRut(worker.rut_code)}
            </p>
          </div>

          {/* Roles */}
          <div className="flex flex-wrap gap-1">
            {getRoleBadges()}
          </div>

          {/* Created date */}
          {worker.created_at && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Calendar className="h-3 w-3" />
              {format(new Date(worker.created_at), "dd MMM yyyy", { locale: es })}
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 mt-3 pt-3 border-t border-border">
        <Button
          variant="ghost"
          size="sm"
          className="flex-1 h-8 text-xs"
          onClick={() => onViewHistory(worker)}
        >
          <History className="h-3.5 w-3.5 mr-1" />
          Historial
        </Button>

        {!isReadOnly && (
          <>
            <Button
              variant="ghost"
              size="sm"
              className="flex-1 h-8 text-xs"
              onClick={() => onEdit(worker)}
            >
              <Edit2 className="h-3.5 w-3.5 mr-1" />
              Editar
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => onResetPin(worker)}
              title="Resetear PIN"
            >
              <Key className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => onToggleActive(worker)}
              title={worker.is_active ? "Desactivar" : "Activar"}
            >
              {worker.is_active ? (
                <PowerOff className="h-3.5 w-3.5 text-amber-500" />
              ) : (
                <Power className="h-3.5 w-3.5 text-emerald-500" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 hover:bg-destructive/10 hover:text-destructive"
              onClick={() => onDelete(worker)}
              title="Eliminar trabajador"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
