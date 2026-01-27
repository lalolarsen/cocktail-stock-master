import { Wine, Package, Martini, Users, Calendar, LogOut, FileText, Receipt, FileCheck, ExternalLink, QrCode, Monitor, Warehouse, ArrowRightLeft, HelpCircle, Bell, Settings, Ticket, Banknote, TrendingUp, FileUp, Activity, Wallet } from "lucide-react";
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
import { useFeatureFlags, FeatureKey } from "@/hooks/useFeatureFlags";
import { VenueIndicator } from "@/components/VenueIndicator";

type ViewType = "overview" | "products" | "menu" | "workers" | "jornadas" | "expenses" | "reports" | "documents" | "pos" | "inventory" | "replenishment" | "notifications" | "tickets";

interface AppSidebarProps {
  activeView: ViewType;
  setActiveView: (view: ViewType) => void;
  isReadOnly?: boolean;
}

// Menu items organized by section
type MenuItem = {
  title: string;
  value: ViewType;
  icon: typeof Wine;
  adminOnly?: boolean;
  featureFlag?: FeatureKey;
};

type ExternalLinkItem = {
  title: string;
  icon: typeof Wine;
  path: string;
  adminOnly?: boolean;
  featureFlag?: FeatureKey;
};

// Operations section
const operationsItems: MenuItem[] = [
  { title: "Panel General", value: "overview", icon: Wine },
  { title: "Barras y POS", value: "pos", icon: Monitor, adminOnly: true },
  { title: "Inventario", value: "inventory", icon: Warehouse, featureFlag: "inventario" },
  { title: "Reposición", value: "replenishment", icon: ArrowRightLeft, adminOnly: true, featureFlag: "reposicion" },
  { title: "Productos", value: "products", icon: Package, featureFlag: "inventario" },
  { title: "Menú", value: "menu", icon: Martini, featureFlag: "ventas_alcohol" },
];

// Purchases section
const purchaseLinks: ExternalLinkItem[] = [
  { title: "Importar Factura", icon: FileUp, path: "/admin/purchases/import", adminOnly: true, featureFlag: "lector_facturas" },
  { title: "Catálogo Pendiente", icon: Package, path: "/admin/catalog/pending", adminOnly: true },
];

// People section
const peopleItems: MenuItem[] = [
  { title: "Jornadas", value: "jornadas", icon: Calendar, adminOnly: true, featureFlag: "jornadas" },
  { title: "Trabajadores", value: "workers", icon: Users },
];

// Accounting section (mix of views and external links)
const accountingViews: MenuItem[] = [
  { title: "Declaración de Gastos", value: "expenses", icon: Receipt, featureFlag: "contabilidad_basica" },
  { title: "Reportes", value: "reports", icon: FileText, featureFlag: "reportes" },
];

const accountingLinks: ExternalLinkItem[] = [
  { title: "Ingresos", icon: Banknote, path: "/admin/income", featureFlag: "contabilidad_basica" },
  { title: "Estado de Resultados", icon: TrendingUp, path: "/admin/reports/estado-resultados", featureFlag: "contabilidad_basica" },
  { title: "Documentos", icon: FileCheck, path: "/admin/documents", featureFlag: "contabilidad_avanzada" },
  { title: "Auditoría Retiros", icon: QrCode, path: "/admin/pickups", featureFlag: "qr_cover" },
];

// Settings section
const settingsViews: MenuItem[] = [
  { title: "Notificaciones", value: "notifications", icon: Bell, adminOnly: true },
  { title: "Tipos de Entrada", value: "tickets", icon: Ticket, adminOnly: true, featureFlag: "ventas_tickets" },
];

// Technical links removed - now only in /developer console
const settingsLinks: ExternalLinkItem[] = [];

// Helper to filter items by role
const filterByRole = <T extends { adminOnly?: boolean }>(items: T[], isReadOnly: boolean): T[] => 
  isReadOnly ? items.filter(item => !item.adminOnly) : items;

// Helper to filter items by feature flags
const filterByFeatureFlags = <T extends { featureFlag?: FeatureKey }>(
  items: T[], 
  isEnabled: (key: FeatureKey) => boolean
): T[] => 
  items.filter(item => !item.featureFlag || isEnabled(item.featureFlag));

export function AppSidebar({ activeView, setActiveView, isReadOnly = false }: AppSidebarProps) {
  const navigate = useNavigate();
  const { isEnabled } = useFeatureFlags();
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const handleExternalNavigation = (path: string) => {
    navigate(path);
  };

  // Apply both filters
  const filterItems = <T extends { adminOnly?: boolean; featureFlag?: FeatureKey }>(items: T[]): T[] => {
    return filterByFeatureFlags(filterByRole(items, isReadOnly), isEnabled);
  };

  // Render a menu item (view-based)
  const renderMenuItem = (item: MenuItem) => {
    const isActive = activeView === item.value;
    return (
      <SidebarMenuItem key={item.value}>
        <SidebarMenuButton
          onClick={() => setActiveView(item.value)}
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

  // Render an external link
  const renderExternalLink = (link: ExternalLinkItem) => (
    <SidebarMenuItem key={link.path}>
      <SidebarMenuButton
        onClick={() => handleExternalNavigation(link.path)}
        tooltip={link.title}
        className="transition-all duration-150 hover:bg-muted/50"
      >
        <link.icon className="w-4 h-4" />
        <span>{link.title}</span>
        {!isCollapsed && <ExternalLink className="w-3 h-3 ml-auto opacity-40" />}
      </SidebarMenuButton>
    </SidebarMenuItem>
  );

  // Get filtered items
  const filteredOperations = filterItems(operationsItems);
  const filteredPurchaseLinks = filterItems(purchaseLinks);
  const filteredPeopleItems = filterItems(peopleItems);
  const filteredAccountingViews = filterItems(accountingViews);
  const filteredAccountingLinks = filterItems(accountingLinks);
  const filteredSettingsViews = filterItems(settingsViews);
  const filteredSettingsLinks = filterItems(settingsLinks);

  return (
    <Sidebar collapsible="icon" className="border-r border-border/50">
      <SidebarHeader className="p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
            <Wine className="w-6 h-6 text-primary-foreground" />
          </div>
          {!isCollapsed && (
            <div>
              <h2 className="text-lg font-bold text-foreground">
                CoctelStock
              </h2>
              <p className="text-xs text-muted-foreground">Gestión de inventario</p>
            </div>
          )}
        </div>
        {!isCollapsed && <VenueIndicator variant="sidebar" />}
      </SidebarHeader>

      <SidebarContent>
        {/* Operations Section */}
        {filteredOperations.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Operaciones</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {filteredOperations.map(renderMenuItem)}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Purchases Section */}
        {filteredPurchaseLinks.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Compras</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {filteredPurchaseLinks.map(renderExternalLink)}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* People Section */}
        {filteredPeopleItems.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Equipo</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {filteredPeopleItems.map(renderMenuItem)}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Accounting Section */}
        {(filteredAccountingViews.length > 0 || filteredAccountingLinks.length > 0) && (
          <SidebarGroup>
            <SidebarGroupLabel>Contabilidad</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {filteredAccountingViews.map(renderMenuItem)}
                {filteredAccountingLinks.map(renderExternalLink)}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Settings Section */}
        {(filteredSettingsViews.length > 0 || filteredSettingsLinks.length > 0) && (
          <SidebarGroup>
            <SidebarGroupLabel>Configuración</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {filteredSettingsViews.map(renderMenuItem)}
                {filteredSettingsLinks.map(renderExternalLink)}
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
