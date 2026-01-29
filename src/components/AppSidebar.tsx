import { Wine, Package, Martini, Users, Calendar, LogOut, FileText, Receipt, Warehouse, ArrowRightLeft, Bell, Ticket } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
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
import { useFeatureFlags, FeatureKey } from "@/hooks/useFeatureFlags";
import { VenueIndicator } from "@/components/VenueIndicator";
import { useUserRole, AppRole } from "@/hooks/useUserRole";
import { useActiveVenue } from "@/hooks/useActiveVenue";

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
  Wine,
  Package,
  Martini,
  Users,
  Calendar,
  FileText,
  Receipt,
  Warehouse,
  ArrowRightLeft,
  Bell,
  Ticket,
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
  const { isEnabled } = useFeatureFlags();
  const { state } = useSidebar();
  const { role } = useUserRole();
  const { venue } = useActiveVenue();
  const isCollapsed = state === "collapsed";

  // Fetch custom sidebar config for this venue/role
  const { data: customConfig } = useQuery({
    queryKey: ["sidebar-config-active", venue?.id, role],
    queryFn: async () => {
      if (!venue?.id || !role) return null;
      const { data, error } = await supabase.rpc("get_sidebar_config", {
        p_venue_id: venue.id,
        p_role: role,
      });
      if (error) {
        console.error("Error fetching sidebar config:", error);
        return null;
      }
      return data as unknown as Array<{
        menu_key: string;
        menu_label: string;
        icon_name: string;
        view_type: string;
        feature_flag: string | null;
        external_path: string | null;
        is_enabled: boolean;
      }> | null;
    },
    enabled: !!venue?.id && !!role,
    staleTime: 1000 * 30, // 30 seconds - refresh more often for config changes
    refetchOnWindowFocus: true,
  });

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const handleExternalNavigation = (path: string) => {
    navigate(path);
  };

  // Convert custom config to menu items
  const getMenuItemsFromConfig = (): { internal: MenuItem[]; external: Array<{ title: string; path: string; icon: typeof Wine }> } => {
    if (!customConfig || customConfig.length === 0) {
      // Fallback to hardcoded defaults
      const isGerencia = isReadOnly || role === "gerencia";
      const defaultItems = isGerencia 
        ? filterByFeatureFlags(GERENCIA_MENU, isEnabled)
        : filterByFeatureFlags(ADMIN_MENU, isEnabled);
      const externalItems = isGerencia ? GERENCIA_EXTERNAL_PATHS : [];
      return { internal: defaultItems, external: externalItems };
    }

    const internal: MenuItem[] = [];
    const external: Array<{ title: string; path: string; icon: typeof Wine }> = [];

    customConfig.forEach(item => {
      if (!item.is_enabled) return;
      
      // Check feature flag
      if (item.feature_flag && !isEnabled(item.feature_flag as FeatureKey)) return;

      const icon = ICON_MAP[item.icon_name] || Wine;

      if (item.external_path) {
        external.push({
          title: item.menu_label,
          path: item.external_path,
          icon,
        });
      } else {
        internal.push({
          title: item.menu_label,
          value: item.view_type as ViewType,
          icon,
          featureFlag: item.feature_flag as FeatureKey | undefined,
        });
      }
    });

    return { internal, external };
  };

  const { internal: menuItems, external: externalLinks } = getMenuItemsFromConfig();

  // Render a menu item
  const renderMenuItem = (item: MenuItem) => {
    const isActive = activeView === item.value;
    return (
      <SidebarMenuItem key={item.value}>
        <SidebarMenuButton
          onClick={() => item.path ? handleExternalNavigation(item.path) : setActiveView(item.value)}
          tooltip={item.title}
          className={`transition-all duration-150 ${
            isActive 
              ? "bg-primary text-primary-foreground" 
              : "hover:bg-muted/50"
          }`}
        >
          <item.icon className="w-4 h-4" />
          <span>{item.title}</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

  // Render external link
  const renderExternalLink = (link: { title: string; path: string; icon: typeof Wine }) => (
    <SidebarMenuItem key={link.path}>
      <SidebarMenuButton
        onClick={() => handleExternalNavigation(link.path)}
        tooltip={link.title}
        className="transition-all duration-150 hover:bg-muted/50"
      >
        <link.icon className="w-4 h-4" />
        <span>{link.title}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );

  return (
    <Sidebar collapsible="icon" className="border-r border-border/50">
      <SidebarHeader className="p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
            <Wine className="w-6 h-6 text-primary-foreground" />
          </div>
          {!isCollapsed && (
            <div>
              <h2 className="text-lg font-bold text-foreground">DiStock</h2>
              <p className="text-xs text-muted-foreground">Gestión de bar</p>
            </div>
          )}
        </div>
        {!isCollapsed && <VenueIndicator variant="sidebar" showRole />}
      </SidebarHeader>

      <SidebarContent>
        {/* Main Navigation */}
        {menuItems.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Navegación</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {menuItems.map(renderMenuItem)}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* External links */}
        {externalLinks.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Contabilidad</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {externalLinks.map(renderExternalLink)}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="p-4">
        <Button 
          variant="outline" 
          className="w-full justify-start gap-2" 
          onClick={handleLogout}
        >
          <LogOut className="w-4 h-4" />
          {!isCollapsed && <span>Cerrar sesión</span>}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
