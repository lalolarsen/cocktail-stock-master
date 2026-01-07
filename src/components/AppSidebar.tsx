import { Wine, Package, Martini, Users, Calendar, LogOut, FileText, Receipt, FileCheck, ExternalLink, QrCode, Monitor, Warehouse, ArrowRightLeft, HelpCircle, Bell, Settings, Ticket, Banknote } from "lucide-react";
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

const menuItems = [
  { 
    title: "Panel General", 
    value: "overview" as ViewType, 
    icon: Wine,
    gradient: "from-primary to-primary-glow"
  },
  { 
    title: "Barras y POS", 
    value: "pos" as ViewType, 
    icon: Monitor,
    gradient: "from-blue-500 to-indigo-500",
    adminOnly: true
  },
  { 
    title: "Inventario", 
    value: "inventory" as ViewType, 
    icon: Warehouse,
    gradient: "from-emerald-500 to-green-500"
  },
  { 
    title: "Reposición", 
    value: "replenishment" as ViewType, 
    icon: ArrowRightLeft,
    gradient: "from-cyan-500 to-teal-500",
    adminOnly: true
  },
  { 
    title: "Productos", 
    value: "products" as ViewType, 
    icon: Package,
    gradient: "from-lime-500 to-green-500"
  },
  { 
    title: "Menú", 
    value: "menu" as ViewType, 
    icon: Martini,
    gradient: "from-amber-500 to-orange-500"
  },
  { 
    title: "Jornadas", 
    value: "jornadas" as ViewType, 
    icon: Calendar,
    gradient: "from-teal-500 to-cyan-500",
    adminOnly: true
  },
  { 
    title: "Trabajadores", 
    value: "workers" as ViewType, 
    icon: Users,
    gradient: "from-violet-500 to-purple-500",
    // Workers is now visible to gerencia (read-only view)
  },
  { 
    title: "Declaración de Gastos", 
    value: "expenses" as ViewType, 
    icon: Receipt,
    gradient: "from-rose-500 to-pink-500"
  },
  { 
    title: "Reportes", 
    value: "reports" as ViewType, 
    icon: FileText,
    gradient: "from-sky-500 to-blue-500"
  },
  { 
    title: "Notificaciones", 
    value: "notifications" as ViewType, 
    icon: Bell,
    gradient: "from-fuchsia-500 to-pink-500",
    adminOnly: true
  },
  { 
    title: "Tipos de Entrada", 
    value: "tickets" as ViewType, 
    icon: Ticket,
    gradient: "from-amber-500 to-yellow-500",
    adminOnly: true
  },
];

// External link items for separate pages
const externalLinks = [
  {
    title: "Ingresos",
    icon: Banknote,
    gradient: "from-emerald-500 to-teal-500",
    path: "/admin/income",
  },
  {
    title: "Documentos",
    icon: FileCheck,
    gradient: "from-indigo-500 to-purple-500",
    path: "/admin/documents",
  },
  {
    title: "Auditoría Retiros",
    icon: QrCode,
    gradient: "from-orange-500 to-red-500",
    path: "/admin/pickups",
  },
  {
    title: "Sistema",
    icon: Settings,
    gradient: "from-slate-500 to-zinc-500",
    path: "/admin/system",
    adminOnly: true,
  },
  {
    title: "Ayuda",
    icon: HelpCircle,
    gradient: "from-gray-500 to-slate-500",
    path: "/help",
  },
];

export function AppSidebar({ activeView, setActiveView, isReadOnly = false }: AppSidebarProps) {
  const navigate = useNavigate();
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";

  // Views restricted for gerencia (read-only users)
  const restrictedViews: ViewType[] = ["workers", "jornadas", "pos", "replenishment"];
  
  // Filter menu items based on role
  const visibleMenuItems = isReadOnly 
    ? menuItems.filter(item => !item.adminOnly)
    : menuItems;

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const handleExternalNavigation = (path: string) => {
    navigate(path);
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-border/50">
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary-glow flex items-center justify-center">
            <Wine className="w-6 h-6 text-primary-foreground" />
          </div>
          {!isCollapsed && (
            <div>
              <h2 className="text-lg font-bold bg-gradient-to-r from-primary to-primary-glow bg-clip-text text-transparent">
                CoctelStock
              </h2>
              <p className="text-xs text-muted-foreground">Gestión de inventario</p>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navegación</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleMenuItems.map((item) => {
                const isActive = activeView === item.value;
                return (
                  <SidebarMenuItem key={item.value}>
                    <SidebarMenuButton
                      onClick={() => setActiveView(item.value)}
                      tooltip={item.title}
                      className={`transition-all duration-200 ${
                        isActive 
                          ? `bg-gradient-to-r ${item.gradient} text-white shadow-md` 
                          : "hover:bg-muted/50"
                      }`}
                    >
                      <item.icon className="w-5 h-5" />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
              
              {/* External links - navigate to separate pages */}
              {externalLinks
                .filter((link) => !link.adminOnly || !isReadOnly)
                .map((link) => (
                <SidebarMenuItem key={link.path}>
                  <SidebarMenuButton
                    onClick={() => handleExternalNavigation(link.path)}
                    tooltip={link.title}
                    className="transition-all duration-200 hover:bg-muted/50"
                  >
                    <link.icon className="w-5 h-5" />
                    <span>{link.title}</span>
                    {!isCollapsed && <ExternalLink className="w-3 h-3 ml-auto opacity-50" />}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
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
