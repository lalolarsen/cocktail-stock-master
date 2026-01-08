import { Wine, Package, Martini, Users, Calendar, LogOut, FileText, Receipt, FileCheck, ExternalLink, QrCode, Monitor, Warehouse, ArrowRightLeft, HelpCircle, Bell, Settings, Ticket, Banknote, TrendingUp, FileUp } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
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
};

type ExternalLink = {
  title: string;
  icon: typeof Wine;
  path: string;
  adminOnly?: boolean;
};

// Operations section
const operationsItems: MenuItem[] = [
  { title: "Panel General", value: "overview", icon: Wine },
  { title: "Barras y POS", value: "pos", icon: Monitor, adminOnly: true },
  { title: "Inventario", value: "inventory", icon: Warehouse },
  { title: "Reposición", value: "replenishment", icon: ArrowRightLeft, adminOnly: true },
  { title: "Productos", value: "products", icon: Package },
  { title: "Menú", value: "menu", icon: Martini },
];

// Purchases section
const purchaseLinks: ExternalLink[] = [
  { title: "Importar Factura", icon: FileUp, path: "/admin/purchases/import", adminOnly: true },
  { title: "Catálogo Pendiente", icon: Package, path: "/admin/catalog/pending", adminOnly: true },
];

// People section
const peopleItems: MenuItem[] = [
  { title: "Jornadas", value: "jornadas", icon: Calendar, adminOnly: true },
  { title: "Trabajadores", value: "workers", icon: Users },
];

// Accounting section (mix of views and external links)
const accountingViews: MenuItem[] = [
  { title: "Declaración de Gastos", value: "expenses", icon: Receipt },
  { title: "Reportes", value: "reports", icon: FileText },
];

const accountingLinks: ExternalLink[] = [
  { title: "Ingresos", icon: Banknote, path: "/admin/income" },
  { title: "Estado de Resultados", icon: TrendingUp, path: "/admin/reports/estado-resultados" },
  { title: "Documentos", icon: FileCheck, path: "/admin/documents" },
  { title: "Auditoría Retiros", icon: QrCode, path: "/admin/pickups" },
];

// Settings section
const settingsViews: MenuItem[] = [
  { title: "Notificaciones", value: "notifications", icon: Bell, adminOnly: true },
  { title: "Tipos de Entrada", value: "tickets", icon: Ticket, adminOnly: true },
];

const settingsLinks: ExternalLink[] = [
  { title: "Sistema", icon: Settings, path: "/admin/system", adminOnly: true },
  { title: "Ayuda", icon: HelpCircle, path: "/help" },
];
// Helper to filter items by role
const filterByRole = <T extends { adminOnly?: boolean }>(items: T[], isReadOnly: boolean): T[] => 
  isReadOnly ? items.filter(item => !item.adminOnly) : items;

export function AppSidebar({ activeView, setActiveView, isReadOnly = false }: AppSidebarProps) {
  const navigate = useNavigate();
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const handleExternalNavigation = (path: string) => {
    navigate(path);
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
  const renderExternalLink = (link: ExternalLink) => (
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

  return (
    <Sidebar collapsible="icon" className="border-r border-border/50">
      <SidebarHeader className="p-4">
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
      </SidebarHeader>

      <SidebarContent>
        {/* Operations Section */}
        <SidebarGroup>
          <SidebarGroupLabel>Operaciones</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {filterByRole(operationsItems, isReadOnly).map(renderMenuItem)}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Purchases Section */}
        {!isReadOnly && (
          <SidebarGroup>
            <SidebarGroupLabel>Compras</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {filterByRole(purchaseLinks, isReadOnly).map(renderExternalLink)}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* People Section */}
        <SidebarGroup>
          <SidebarGroupLabel>Equipo</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {filterByRole(peopleItems, isReadOnly).map(renderMenuItem)}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Accounting Section */}
        <SidebarGroup>
          <SidebarGroupLabel>Contabilidad</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {filterByRole(accountingViews, isReadOnly).map(renderMenuItem)}
              {filterByRole(accountingLinks, isReadOnly).map(renderExternalLink)}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Settings Section */}
        <SidebarGroup>
          <SidebarGroupLabel>Configuración</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {filterByRole(settingsViews, isReadOnly).map(renderMenuItem)}
              {filterByRole(settingsLinks, isReadOnly).map(renderExternalLink)}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
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
