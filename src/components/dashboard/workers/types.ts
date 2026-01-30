import { Shield, Eye, ShoppingCart, Wine, Sparkles, Code } from "lucide-react";
import { AppRole } from "@/contexts/AppSessionContext";

export interface Worker {
  id: string;
  email: string;
  full_name: string | null;
  rut_code: string | null;
  is_active: boolean;
  internal_email: string | null;
  roles: AppRole[];
  created_at?: string;
}

export interface LoginRecord {
  id: string;
  login_at: string;
  user_agent: string | null;
}

export interface AuditLog {
  id: string;
  action: string;
  target_worker_id: string | null;
  details: any;
  created_at: string;
  admin_name?: string;
}

export const AVAILABLE_ROLES: { 
  value: AppRole; 
  label: string; 
  icon: any;
  description?: string;
}[] = [
  { 
    value: "developer", 
    label: "Desarrollador", 
    icon: Code,
    description: "Acceso completo al sistema y panel de desarrollo",
  },
  { 
    value: "admin", 
    label: "Administrador", 
    icon: Shield,
    description: "Gestión completa del venue",
  },
  { 
    value: "gerencia", 
    label: "Gerencia", 
    icon: Eye,
    description: "Solo lectura de reportes y estadísticas",
  },
  { 
    value: "vendedor", 
    label: "Vendedor", 
    icon: ShoppingCart,
    description: "Punto de venta y operaciones",
  },
  { 
    value: "bar", 
    label: "Barra", 
    icon: Wine,
    description: "Canje de tokens y preparación",
  },
  { 
    value: "ticket_seller", 
    label: "Ticketero", 
    icon: Sparkles,
    description: "Venta de entradas",
  },
];

// Roles that "developer" inherits (has access to all)
export const DEVELOPER_INHERITS_ALL = true;

// Get displayable roles (excludes developer for normal workers)
export function getAssignableRoles(currentUserIsDeveloper: boolean): typeof AVAILABLE_ROLES {
  if (currentUserIsDeveloper) {
    return AVAILABLE_ROLES;
  }
  return AVAILABLE_ROLES.filter(r => r.value !== "developer");
}
