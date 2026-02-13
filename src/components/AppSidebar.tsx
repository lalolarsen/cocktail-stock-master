import { Wine, Package, Martini, Users, Calendar, LogOut, FileText, Receipt, Warehouse, ArrowRightLeft, Bell, Ticket } from "lucide-react";
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
import { useAppSession, FeatureKey } from "@/contexts/AppSessionContext";
import stockiaLogo from "@/assets/stockia-logo-white.png";

type ViewType = "overview" | "products" | "menu" | "workers" | "jornadas" | "expenses" | "reports" | "documents" | "pos" | "inventory" | "replenishment" | "notifications" | "tickets";

interface AppSidebarProps {
  activeView: ViewType;
  setActiveView: (view: ViewType) => void;
  isReadOnly?: boolean;
}

// Menu item type with role-based visibility
type MenuItem = {
  title: string;
  value: ViewType;
  icon: typeof Wine;
  featureFlag?: FeatureKey;
  path?: string;
};

// Icon mapping for dynamic config
const ICON_MAP: Record<string, typeof Wine> = {
  Wine, Package, Martini, Users, Calendar, FileText, Receipt, Warehouse, ArrowRightLeft, Bell, Ticket,
};

// Default role-specific menu configurations (fallback)
const ADMIN_MENU: MenuItem[] = [
  { title: "Panel General", value: "overview", icon: Wine },
  { title: "Jornadas", value: "jornadas", icon: Calendar, featureFlag: "jornadas" },
  { title: "Puntos de Venta", value: "pos", icon: Receipt },
  { title: "Inventario", value: "inventory", icon: Warehouse, featureFlag: "inventario" },
  { title: "Reposición", value: "replenishment", icon: ArrowRightLeft, featureFlag: "reposicion" },
  { title: "Carta", value: "menu", icon: Martini, featureFlag: "ventas_alcohol" },
  { title: "Trabajadores", value: "workers", icon: Users },
  { title: "Reportes", value: "reports", icon: FileText, featureFlag: "reportes" },
];

const GERENCIA_MENU: MenuItem[] = [
  { title: "Panel General", value: "overview", icon: Wine },
  { title: "Reportes", value: "reports", icon: FileText, featureFlag: "reportes" },
  { title: "Notificaciones", value: "notifications", icon: Bell },
];

const GERENCIA_EXTERNAL_PATHS = [
  { title: "Estado de Resultados", path: "/admin/reports/estado-resultados", icon: FileText },
  { title: "Auditoría Retiros", path: "/admin/pickups", icon: Receipt },
];

// Helper to filter items by feature flags
const filterByFeatureFlags = (
  items: MenuItem[], 
  isEnabled: (key: FeatureKey) => boolean
): MenuItem[] => 
  items.filter(item => !item.featureFlag || isEnabled(item.featureFlag));

export function AppSidebar({ activeView, setActiveView, isReadOnly = false }: AppSidebarProps) {
  const navigate = useNavigate();
  const { state } = useSidebar();
  const { role, isEnabled, sidebarConfig } = useAppSession();
  const isCollapsed = state === "collapsed";

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const handleExternalNavigation = (path: string) => {
    navigate(path);
  };

  // Convert custom config to menu items
  const getMenuItemsFromConfig = (): { internal: MenuItem[]; external: Array<{ title: string; path: string; icon: typeof Wine }> } => {
    if (!sidebarConfig || sidebarConfig.length === 0) {
      const isGerencia = isReadOnly || role === "gerencia";
      const defaultItems = isGerencia 
        ? filterByFeatureFlags(GERENCIA_MENU, isEnabled)
        : filterByFeatureFlags(ADMIN_MENU, isEnabled);
      const externalItems = isGerencia ? GERENCIA_EXTERNAL_PATHS : [];
      return { internal: defaultItems, external: externalItems };
    }

    const internal: MenuItem[] = [];
    const external: Array<{ title: string; path: string; icon: typeof Wine }> = [];

    sidebarConfig.forEach(item => {
      if (!item.is_enabled) return;
      if (item.feature_flag && !isEnabled(item.feature_flag as FeatureKey)) return;
      const icon = ICON_MAP[item.icon_name] || Wine;
      if (item.external_path) {
        external.push({ title: item.menu_label, path: item.external_path, icon });
      } else {
        internal.push({ title: item.menu_label, value: item.view_type as ViewType, icon, featureFlag: item.feature_flag as FeatureKey | undefined });
      }
    });

    return { internal, external };
  };

  const { internal: menuItems, external: externalLinks } = getMenuItemsFromConfig();

  const renderMenuItem = (item: MenuItem) => {
    const isActive = activeView === item.value;
    return (
      <SidebarMenuItem key={item.value}>
        <SidebarMenuButton
          onClick={() => item.path ? handleExternalNavigation(item.path) : setActiveView(item.value)}
          tooltip={item.title}
          className={`relative transition-fast rounded-lg ${
            isActive 
              ? "bg-sidebar-accent text-white font-medium before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:w-[3px] before:h-5 before:rounded-r-full before:bg-sidebar-primary" 
              : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
          }`}
        >
          <item.icon className="w-4 h-4" />
          <span>{item.title}</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

  const renderExternalLink = (link: { title: string; path: string; icon: typeof Wine }) => (
    <SidebarMenuItem key={link.path}>
      <SidebarMenuButton
        onClick={() => handleExternalNavigation(link.path)}
        tooltip={link.title}
        className="transition-fast text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 rounded-lg"
      >
        <link.icon className="w-4 h-4" />
        <span>{link.title}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="p-4 pb-6 space-y-4">
        <div className="flex items-center gap-3">
          {!isCollapsed ? (
            <img src={stockiaLogo} alt="StockIA" className="h-7" />
          ) : (
            <div className="w-8 h-8 rounded-lg bg-sidebar-primary flex items-center justify-center">
              <span className="text-sidebar-primary-foreground font-bold text-xs">S</span>
            </div>
          )}
        </div>
        {!isCollapsed && <VenueIndicator variant="sidebar" showRole />}
      </SidebarHeader>

      <SidebarContent>
        {menuItems.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-sidebar-foreground/30 uppercase text-[10px] tracking-widest font-medium">Navegación</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {menuItems.map(renderMenuItem)}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {externalLinks.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-sidebar-foreground/30 uppercase text-[10px] tracking-widest font-medium">Contabilidad</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {externalLinks.map(renderExternalLink)}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="p-4 border-t border-sidebar-border">
        <Button 
          variant="ghost" 
          className="w-full justify-start gap-2 text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 rounded-lg" 
          onClick={handleLogout}
        >
          <LogOut className="w-4 h-4" />
          {!isCollapsed && <span className="text-sm">Cerrar sesión</span>}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
