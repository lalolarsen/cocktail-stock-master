import { Wine, Package, Martini, Users, Calendar, LogOut, FileText, Receipt, Warehouse, ArrowRightLeft, Bell, Ticket, Landmark } from "lucide-react";
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

type ViewType = "overview" | "products" | "menu" | "workers" | "jornadas" | "expenses" | "reports" | "documents" | "pos" | "inventory" | "replenishment" | "notifications" | "tickets" | "finance";

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

// ── Hardcoded menus by role (no flags, no DB config) ──

const ADMIN_MENU: MenuItem[] = [
  { title: "Panel General", value: "overview", icon: Wine },
  { title: "Jornadas", value: "jornadas", icon: Calendar },
  { title: "Puntos de Venta", value: "pos", icon: Receipt },
  { title: "Inventario", value: "inventory", icon: Warehouse },
  { title: "Reposición", value: "replenishment", icon: ArrowRightLeft },
  { title: "Carta", value: "menu", icon: Martini },
  { title: "Trabajadores", value: "workers", icon: Users },
  { title: "Reportes", value: "reports", icon: FileText },
  { title: "Finanzas", value: "finance", icon: Landmark },
];

const GERENCIA_MENU: MenuItem[] = [
  { title: "Panel General", value: "overview", icon: Wine },
  { title: "Finanzas", value: "finance", icon: Landmark },
  { title: "Reportes", value: "reports", icon: FileText },
  { title: "Inventario", value: "inventory", icon: Warehouse },
  { title: "Notificaciones", value: "notifications", icon: Bell },
];

const GERENCIA_EXTERNAL: Array<{ title: string; path: string; icon: typeof Wine }> = [
  { title: "Estado de Resultados", path: "/admin/reports/estado-resultados", icon: FileText },
  { title: "Auditoría Retiros", path: "/admin/pickups", icon: Receipt },
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
  const menuItems = isGerencia ? GERENCIA_MENU : ADMIN_MENU;
  const externalLinks = isGerencia ? GERENCIA_EXTERNAL : [];

  const renderMenuItem = (item: MenuItem) => {
    const isActive = activeView === item.value;
    return (
      <SidebarMenuItem key={item.value}>
        <SidebarMenuButton
          onClick={() => setActiveView(item.value)}
          tooltip={item.title}
          className={`transition-fast ${
            isActive 
              ? "bg-primary text-primary-foreground font-medium" 
              : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
          }`}
        >
          <item.icon className="w-4 h-4" />
          <span>{item.title}</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

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
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/40 uppercase text-[10px] tracking-widest">Navegación</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map(renderMenuItem)}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {externalLinks.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-sidebar-foreground/40 uppercase text-[10px] tracking-widest">Contabilidad</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {externalLinks.map((link) => (
                  <SidebarMenuItem key={link.path}>
                    <SidebarMenuButton
                      onClick={() => navigate(link.path)}
                      tooltip={link.title}
                      className="transition-fast text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
                    >
                      <link.icon className="w-4 h-4" />
                      <span>{link.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="p-4 border-t border-sidebar-border">
        <Button 
          variant="ghost" 
          className="w-full justify-start gap-2 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent" 
          onClick={handleLogout}
        >
          <LogOut className="w-4 h-4" />
          {!isCollapsed && <span className="text-sm">Cerrar sesión</span>}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
