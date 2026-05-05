import { Wine, Package, Martini, Users, Calendar, LogOut, FileText, Receipt, Ticket, Gift, Settings, BarChart3, Undo2, ClipboardList, Activity, Bell, Truck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { VenueIndicator } from "@/components/VenueIndicator";

import { useAppSession } from "@/contexts/AppSessionContext";
import stockiaLogo from "@/assets/stockia-logo-white.png";

type ViewType = "overview" | "products" | "menu" | "workers" | "jornadas" | "expenses" | "reports" | "documents" | "pos" | "inventory" | "replenishment" | "notifications" | "tickets" | "finance" | "proveedores" | "courtesy-qr" | "waste" | "botellas" | "settings" | "passline-audit" | "income" | "analytics" | "voids" | "external-consumption" | "reconciliation" | "comparison" | "live-inventory" | "shift-counts" | "weekly-count";

interface AppSidebarProps {
  activeView: ViewType;
  setActiveView: (view: ViewType) => void;
  isReadOnly?: boolean;
}

type MenuItem = {
  title: string;
  value: ViewType;
  icon: typeof Wine;
  badge?: string;
};

type MenuSection = {
  label: string;
  items: MenuItem[];
};

// ── Admin: full access ──
const ADMIN_SECTIONS: MenuSection[] = [
  {
    label: "Dashboard",
    items: [
      { title: "Dashboard", value: "overview", icon: Wine },
    ],
  },
  {
    label: "Operación",
    items: [
      { title: "Jornadas", value: "jornadas", icon: Calendar },
      { title: "Conteos por aprobar", value: "shift-counts", icon: ClipboardList },
      { title: "Puntos de Venta", value: "pos", icon: Receipt },
      { title: "Anulaciones", value: "voids", icon: Undo2 },
    ],
  },
  {
    label: "Inventario",
    items: [
      { title: "Inventario en vivo", value: "live-inventory", icon: Activity, badge: "NUEVO" },
      { title: "Conteo semanal", value: "weekly-count", icon: ClipboardList },
      { title: "Productos", value: "products", icon: Package },
    ],
  },
  {
    label: "Ventas",
    items: [
      { title: "Análisis", value: "analytics", icon: BarChart3 },
      { title: "Carta / Recetas", value: "menu", icon: Martini },
      { title: "QR Cortesía", value: "courtesy-qr", icon: Gift },
      // { title: "Totems Passline", value: "passline-audit", icon: Monitor },
      { title: "Reportes", value: "reports", icon: FileText },
    ],
  },
  {
    label: "Gestión",
    items: [
      { title: "Trabajadores", value: "workers", icon: Users },
      { title: "Tickets", value: "tickets", icon: Ticket },
    ],
  },
  {
    label: "Sistema",
    items: [
      { title: "Notificaciones", value: "notifications", icon: Bell },
      { title: "Configuración", value: "settings", icon: Settings },
    ],
  },
];

// ── Gerencia: read-only subset ──
const GERENCIA_SECTIONS: MenuSection[] = [
  {
    label: "Dashboard",
    items: [
      { title: "Dashboard", value: "overview", icon: Wine },
    ],
  },
  {
    label: "Inventario",
    items: [
      { title: "Inventario en vivo", value: "live-inventory", icon: Activity, badge: "NUEVO" },
    ],
  },
  {
    label: "Ventas",
    items: [
      { title: "Análisis", value: "analytics", icon: BarChart3 },
      { title: "QR Cortesía", value: "courtesy-qr", icon: Gift },
      { title: "Reportes", value: "reports", icon: FileText },
    ],
  },
  {
    label: "Sistema",
    items: [
      { title: "Notificaciones", value: "notifications", icon: Bell },
      { title: "Configuración", value: "settings", icon: Settings },
    ],
  },
];

export function AppSidebar({ activeView, setActiveView, isReadOnly = false }: AppSidebarProps) {
  const navigate = useNavigate();
  const { state } = useSidebar();
  const { role } = useAppSession();
  const isCollapsed = state === "collapsed";

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const isGerencia = isReadOnly || role === "gerencia";
  const sections = isGerencia ? GERENCIA_SECTIONS : ADMIN_SECTIONS;

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="px-3 py-3 space-y-2">
        <div className="flex items-center gap-2 h-8">
          {!isCollapsed ? (
            <img src={stockiaLogo} alt="StockIA" className="h-7" />
          ) : (
            <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-xs">S</span>
            </div>
          )}
        </div>
        {!isCollapsed && <VenueIndicator variant="sidebar" showRole />}
      </SidebarHeader>

      <SidebarContent className="gap-0 px-2 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-sidebar-border [&::-webkit-scrollbar-thumb]:rounded-full">
        {sections.map((section, idx) => (
          <SidebarGroup key={section.label} className={`py-1 ${idx === 0 ? "pt-2" : ""}`}>
            {!isCollapsed && (
              <SidebarGroupLabel className="text-sidebar-foreground/35 uppercase text-[9px] tracking-[0.12em] font-semibold px-2 h-5 mb-0.5">
                {section.label}
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                {section.items.map((item) => {
                  const isActive = activeView === item.value;
                  return (
                    <SidebarMenuItem key={item.value}>
                      <SidebarMenuButton
                        onClick={() => setActiveView(item.value)}
                        tooltip={item.title}
                        className={`h-8 rounded-md transition-colors duration-150 ${
                          isActive
                            ? "bg-primary/15 text-primary font-medium hover:bg-primary/20"
                            : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/60"
                        }`}
                      >
                        <item.icon className={`w-4 h-4 shrink-0 ${isActive ? "text-primary" : ""}`} />
                        <span className="text-[13px] flex-1 truncate">{item.title}</span>
                        {item.badge && !isCollapsed && (
                          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-primary/20 text-primary uppercase tracking-wider">
                            {item.badge}
                          </span>
                        )}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="p-2 border-t border-sidebar-border">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 h-8 text-sidebar-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors"
          onClick={handleLogout}
        >
          <LogOut className="w-4 h-4 shrink-0" />
          {!isCollapsed && <span className="text-[13px]">Cerrar sesión</span>}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
