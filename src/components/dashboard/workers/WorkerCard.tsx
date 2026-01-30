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
          variant="outline" 
          className={`gap-1.5 ${roleInfo.bgColor} ${roleInfo.textColor} border-0 font-medium`}
        >
          <Icon className="h-3 w-3" />
          {roleInfo.label}
        </Badge>
      );
    });
  };

  return (
    <div 
      className={`group relative p-5 rounded-xl border bg-card transition-all hover:shadow-md ${
        !worker.is_active ? "opacity-60 bg-muted/30" : "hover:border-primary/30"
      }`}
    >
      {/* Status indicator */}
      <div className="absolute top-4 right-4">
        {worker.is_active ? (
          <div className="flex items-center gap-1.5 text-xs text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">
            <CheckCircle className="h-3 w-3" />
            Activo
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full">
            <XCircle className="h-3 w-3" />
            Inactivo
          </div>
        )}
      </div>

      {/* Worker info */}
      <div className="flex items-start gap-4">
        {/* Avatar */}
        <div className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-semibold ${
          worker.is_active 
            ? "bg-gradient-to-br from-primary/20 to-primary/10 text-primary" 
            : "bg-muted text-muted-foreground"
        }`}>
          {worker.full_name 
            ? worker.full_name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)
            : "??"}
        </div>

        <div className="flex-1 min-w-0 space-y-2">
          <div>
            <h3 className="font-semibold text-foreground truncate">
              {worker.full_name || "Sin nombre"}
            </h3>
            <p className="text-sm text-muted-foreground font-mono">
              RUT: {maskRut(worker.rut_code)}
            </p>
          </div>

          {/* Roles */}
          <div className="flex flex-wrap gap-1.5">
            {getRoleBadges()}
          </div>

          {/* Created date */}
          {worker.created_at && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground pt-1">
              <Calendar className="h-3 w-3" />
              Creado: {format(new Date(worker.created_at), "dd MMM yyyy", { locale: es })}
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 mt-4 pt-4 border-t">
        <Button
          variant="ghost"
          size="sm"
          className="flex-1 h-9"
          onClick={() => onViewHistory(worker)}
        >
          <History className="h-4 w-4 mr-1.5" />
          Historial
        </Button>

        {!isReadOnly && (
          <>
            <Button
              variant="ghost"
              size="sm"
              className="flex-1 h-9"
              onClick={() => onEdit(worker)}
            >
              <Edit2 className="h-4 w-4 mr-1.5" />
              Editar
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-9 px-2.5"
              onClick={() => onResetPin(worker)}
              title="Resetear PIN"
            >
              <Key className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-9 px-2.5"
              onClick={() => onToggleActive(worker)}
              title={worker.is_active ? "Desactivar" : "Activar"}
            >
              {worker.is_active ? (
                <PowerOff className="h-4 w-4 text-amber-500" />
              ) : (
                <Power className="h-4 w-4 text-emerald-500" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-9 px-2.5 hover:bg-destructive/10 hover:text-destructive"
              onClick={() => onDelete(worker)}
              title="Eliminar trabajador"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
