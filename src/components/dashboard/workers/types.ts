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
  color: string;
  bgColor: string;
  textColor: string;
}[] = [
  { 
    value: "admin", 
    label: "Administrador", 
    icon: Shield, 
    color: "text-blue-500",
    bgColor: "bg-blue-50",
    textColor: "text-blue-700"
  },
  { 
    value: "gerencia", 
    label: "Gerencia", 
    icon: Eye, 
    color: "text-amber-500",
    bgColor: "bg-amber-50",
    textColor: "text-amber-700"
  },
  { 
    value: "vendedor", 
    label: "Vendedor", 
    icon: ShoppingCart, 
    color: "text-emerald-500",
    bgColor: "bg-emerald-50",
    textColor: "text-emerald-700"
  },
  { 
    value: "bar", 
    label: "Barra", 
    icon: Wine, 
    color: "text-purple-500",
    bgColor: "bg-purple-50",
    textColor: "text-purple-700"
  },
  { 
    value: "ticket_seller", 
    label: "Ticketero", 
    icon: Sparkles, 
    color: "text-rose-500",
    bgColor: "bg-rose-50",
    textColor: "text-rose-700"
  },
];
