import { Shield, Eye, ShoppingCart, Wine, Sparkles } from "lucide-react";
import { AppRole } from "@/hooks/useUserRole";

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
}[] = [
  { 
    value: "admin", 
    label: "Administrador", 
    icon: Shield, 
  },
  { 
    value: "gerencia", 
    label: "Gerencia", 
    icon: Eye, 
  },
  { 
    value: "vendedor", 
    label: "Vendedor", 
    icon: ShoppingCart, 
  },
  { 
    value: "bar", 
    label: "Barra", 
    icon: Wine, 
  },
  { 
    value: "ticket_seller", 
    label: "Ticketero", 
    icon: Sparkles, 
  },
];
