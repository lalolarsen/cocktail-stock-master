import { LayoutDashboard, Package, Receipt, FileText, Settings, LogOut, DollarSign } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";

type ViewType = "overview" | "products" | "menu" | "workers" | "jornadas" | "expenses" | "reports" | "documents" | "pos" | "inventory" | "replenishment" | "notifications" | "tickets";

interface MenuItem {
  title: string;
  value: ViewType | "income";
  icon: typeof LayoutDashboard;
  external?: boolean;
}

interface AppSidebarProps {
  activeView: ViewType;
  setActiveView: (view: ViewType) => void;
  isReadOnly?: boolean;
}

// Max 5 items per role - speed first
const adminMenuItems: MenuItem[] = [
  { title: "Panel", value: "overview", icon: LayoutDashboard },
  { title: "Inventario", value: "inventory", icon: Package },
  { title: "Gastos", value: "expenses", icon: Receipt },
  { title: "Reportes", value: "reports", icon: FileText },
  { title: "Config", value: "pos", icon: Settings },
];

const gerenciaMenuItems: MenuItem[] = [
  { title: "Panel", value: "overview", icon: LayoutDashboard },
  { title: "Inventario", value: "inventory", icon: Package },
  { title: "Gastos", value: "expenses", icon: Receipt },
  { title: "Reportes", value: "reports", icon: FileText },
  { title: "Ingresos", value: "income", icon: DollarSign, external: true },
];

export function AppSidebar({ activeView, setActiveView, isReadOnly = false }: AppSidebarProps) {
  const navigate = useNavigate();
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";

  const menuItems = isReadOnly ? gerenciaMenuItems : adminMenuItems;

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const handleClick = (item: MenuItem) => {
    if (item.external || item.value === "income") {
      navigate("/admin/income");
    } else {
      setActiveView(item.value as ViewType);
    }
  };

  return (
    <Sidebar collapsible="icon" className="border-r">
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-sm">CS</span>
          </div>
          {!isCollapsed && (
            <span className="font-semibold text-foreground">CoctelStock</span>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => {
                const isActive = activeView === item.value || 
                  (item.value === "income" && window.location.pathname === "/admin/income");
                return (
                  <SidebarMenuItem key={item.value}>
                    <SidebarMenuButton
                      onClick={() => handleClick(item)}
                      tooltip={item.title}
                      className={`transition-fast ${
                        isActive 
                          ? "bg-primary text-primary-foreground" 
                          : "hover:bg-muted"
                      }`}
                    >
                      <item.icon className="w-5 h-5" />
                      <span className="font-medium">{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-3">
        <Button 
          variant="ghost" 
          size="sm"
          className="w-full justify-start gap-2 text-muted-foreground" 
          onClick={handleLogout}
        >
          <LogOut className="w-4 h-4" />
          {!isCollapsed && <span>Salir</span>}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
