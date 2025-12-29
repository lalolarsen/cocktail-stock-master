import { Wine, Package, TrendingUp, Martini, Users, Calendar, LogOut, FileText, Receipt } from "lucide-react";
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

type ViewType = "overview" | "products" | "predictions" | "menu" | "workers" | "jornadas" | "expenses";

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
    title: "Productos", 
    value: "products" as ViewType, 
    icon: Package,
    gradient: "from-emerald-500 to-green-500"
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
    gradient: "from-teal-500 to-cyan-500"
  },
  { 
    title: "Predicciones", 
    value: "predictions" as ViewType, 
    icon: TrendingUp,
    gradient: "from-blue-500 to-indigo-500"
  },
  { 
    title: "Trabajadores", 
    value: "workers" as ViewType, 
    icon: Users,
    gradient: "from-violet-500 to-purple-500"
  },
  { 
    title: "Declaración de Gastos", 
    value: "expenses" as ViewType, 
    icon: Receipt,
    gradient: "from-rose-500 to-pink-500"
  },
];

export function AppSidebar({ activeView, setActiveView, isReadOnly = false }: AppSidebarProps) {
  const navigate = useNavigate();
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";

  // Views restricted for gerencia (read-only users)
  const restrictedViews: ViewType[] = ["workers", "jornadas"];
  
  // Filter menu items based on role
  const visibleMenuItems = isReadOnly 
    ? menuItems.filter(item => !restrictedViews.includes(item.value))
    : menuItems;

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
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
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Acciones</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => navigate("/reports")}
                  tooltip="Reportes"
                  className="hover:bg-muted/50"
                >
                  <FileText className="w-5 h-5" />
                  <span>Reportes</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
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
