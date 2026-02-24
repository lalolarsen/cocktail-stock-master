import { Wine, Package, Martini, Users, Calendar, LogOut, FileText, Receipt, Warehouse, ArrowRightLeft, Ticket, Landmark, Truck, Gift, Trash2, Settings } from "lucide-react";
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
import { PilotBadge } from "@/components/PilotBadge";
import { useAppSession } from "@/contexts/AppSessionContext";
import stockiaLogo from "@/assets/stockia-logo-white.png";

type ViewType = "overview" | "products" | "menu" | "workers" | "jornadas" | "expenses" | "reports" | "documents" | "pos" | "inventory" | "replenishment" | "notifications" | "tickets" | "finance" | "proveedores" | "courtesy-qr" | "waste" | "botellas" | "settings";

interface AppSidebarProps {
  activeView: ViewType;
  setActiveView: (view: ViewType) => void;
  isReadOnly?: boolean;
}

type MenuItem = {
  title: string;
  value: ViewType;
  icon: typeof Wine;
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
      { title: "Puntos de Venta", value: "pos", icon: Receipt },
    ],
  },
  {
    label: "Inventario",
    items: [
      { title: "Inventario", value: "inventory", icon: Warehouse },
      { title: "Productos", value: "products", icon: Package },
      { title: "Reposición", value: "replenishment", icon: ArrowRightLeft },
      { title: "Merma", value: "waste", icon: Trash2 },
      { title: "Botellas Abiertas", value: "botellas", icon: Wine },
      { title: "Proveedores", value: "proveedores", icon: Truck },
    ],
  },
  {
    label: "Ventas",
    items: [
      { title: "Carta / Recetas", value: "menu", icon: Martini },
      { title: "QR Cortesía", value: "courtesy-qr", icon: Gift },
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
    label: "Finanzas",
    items: [
      { title: "Finanzas", value: "finance", icon: Landmark },
    ],
  },
  {
    label: "Sistema",
    items: [
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
      { title: "Inventario", value: "inventory", icon: Warehouse },
      { title: "Botellas Abiertas", value: "botellas", icon: Wine },
    ],
  },
  {
    label: "Ventas",
    items: [
      { title: "QR Cortesía", value: "courtesy-qr", icon: Gift },
      { title: "Reportes", value: "reports", icon: FileText },
    ],
  },
  {
    label: "Finanzas",
    items: [
      { title: "Finanzas", value: "finance", icon: Landmark },
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
      <SidebarHeader className="p-4 space-y-3">
        <div className="flex items-center gap-3">
          {!isCollapsed ? (
            <img src={stockiaLogo} alt="StockIA" className="h-8" />
          ) : (
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-xs">S</span>
            </div>
          )}
        </div>
        {!isCollapsed && <VenueIndicator variant="sidebar" showRole />}
        {!isCollapsed && <PilotBadge />}
      </SidebarHeader>

      <SidebarContent>
        {sections.map((section) => (
          <SidebarGroup key={section.label}>
            <SidebarGroupLabel className="text-sidebar-foreground/40 uppercase text-[10px] tracking-widest px-3 pb-0.5">
              {section.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {section.items.map((item) => {
                  const isActive = activeView === item.value;
                  return (
                    <SidebarMenuItem key={item.value}>
                      <SidebarMenuButton
                        onClick={() => setActiveView(item.value)}
                        tooltip={item.title}
                        className={`h-8 transition-fast ${
                          isActive
                            ? "bg-primary text-primary-foreground font-medium"
                            : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
                        }`}
                      >
                        <item.icon className="w-4 h-4 shrink-0" />
                        <span className="text-sm">{item.title}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="p-3 border-t border-sidebar-border">
        <Button
          variant="ghost"
          className="w-full justify-start gap-2 h-8 text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent"
          onClick={handleLogout}
        >
          <LogOut className="w-4 h-4" />
          {!isCollapsed && <span className="text-sm">Cerrar sesión</span>}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
