import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { useDemoMode } from "@/hooks/useDemoMode";
import { AdminOverview } from "@/components/dashboard/AdminOverview";
import { ProductsList } from "@/components/dashboard/ProductsList";
import { CocktailsMenu } from "@/components/dashboard/CocktailsMenu";
import { WorkersManagementNew } from "@/components/dashboard/WorkersManagementNew";
import { ActivityPanel } from "@/components/dashboard/ActivityPanel";
import { JornadaManagement } from "@/components/dashboard/JornadaManagement";
import { ExpenseDeclaration } from "@/components/dashboard/ExpenseDeclaration";
import { ReportsPanel } from "@/components/dashboard/ReportsPanel";
import { DocumentsRetryPanel } from "@/components/dashboard/DocumentsRetryPanel";
import { POSBarsManagement } from "@/components/dashboard/POSBarsManagement";
import { InventoryByLocation } from "@/components/dashboard/InventoryByLocation";
import { ReplenishmentManager } from "@/components/dashboard/ReplenishmentManager";
import { NotificationsManagement } from "@/components/dashboard/NotificationsManagement";
import { TicketTypesManagement } from "@/components/dashboard/TicketTypesManagement";
import { DemoWatermark } from "@/components/DemoWatermark";
import { DemoModeBanner } from "@/components/DemoModeBanner";
import { AppSidebar } from "@/components/AppSidebar";
import WorkerPinDialog from "@/components/WorkerPinDialog";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import { Menu, Eye } from "lucide-react";

type ViewType = "overview" | "products" | "menu" | "workers" | "jornadas" | "expenses" | "reports" | "documents" | "pos" | "inventory" | "replenishment" | "notifications" | "tickets";

export default function Admin() {
  const { isReadOnly } = useUserRole();
  const { isDemoMode, refreshDemoStatus } = useDemoMode();
  const [activeView, setActiveView] = useState<ViewType>("overview");
  const [isVerified, setIsVerified] = useState(true);
  const [showPinDialog, setShowPinDialog] = useState(false);

  const allowedViewsForGerencia: ViewType[] = ["overview", "products", "menu", "expenses", "reports", "documents", "workers", "inventory"];
  
  const handleViewChange = (view: ViewType) => {
    if (isReadOnly && !allowedViewsForGerencia.includes(view)) {
      return;
    }
    setActiveView(view);
  };

  const handlePinVerified = () => {
    setIsVerified(true);
    setShowPinDialog(false);
  };

  const handlePinCancel = () => {
    void (async () => {
      try {
        await supabase.auth.signOut();
      } catch (e) {
        console.error("Error signing out:", e);
      }
      window.location.assign("/auth");
    })();
  };

  if (!isVerified) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <WorkerPinDialog
          open={showPinDialog}
          onVerified={handlePinVerified}
          onCancel={handlePinCancel}
        />
      </div>
    );
  }

  const getViewTitle = () => {
    switch (activeView) {
      case "overview": return "Panel";
      case "products": return "Productos";
      case "menu": return "Menú";
      case "jornadas": return "Jornadas";
      case "workers": return "Trabajadores";
      case "expenses": return "Gastos";
      case "reports": return "Reportes";
      case "documents": return "Documentos";
      case "pos": return "Configuración";
      case "inventory": return "Inventario";
      case "replenishment": return "Reposición";
      case "notifications": return "Notificaciones";
      case "tickets": return "Entradas";
      default: return "Panel";
    }
  };

  return (
    <SidebarProvider>
      {isDemoMode && <DemoWatermark />}
      <div className={`min-h-screen flex w-full ${isDemoMode ? 'pt-10' : ''}`}>
        <AppSidebar activeView={activeView} setActiveView={handleViewChange} isReadOnly={isReadOnly} />
        
        <main className="flex-1 overflow-auto">
          <header className="sticky top-0 z-10 bg-background border-b px-6 py-3">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="p-2 hover:bg-muted rounded-lg">
                <Menu className="w-5 h-5" />
              </SidebarTrigger>
              <h1 className="text-xl font-semibold">{getViewTitle()}</h1>
              {isReadOnly && (
                <Badge variant="secondary" className="flex items-center gap-1">
                  <Eye className="w-3 h-3" />
                  Solo lectura
                </Badge>
              )}
            </div>
          </header>

          <div className="p-6">
            {activeView === "overview" && (
              <>
                {isDemoMode && !isReadOnly && (
                  <DemoModeBanner isAdmin={true} onDemoActivated={refreshDemoStatus} />
                )}
                <AdminOverview isReadOnly={isReadOnly} onNavigate={handleViewChange} />
              </>
            )}

            {activeView === "products" && <ProductsList isReadOnly={isReadOnly} />}
            {activeView === "menu" && <CocktailsMenu isReadOnly={isReadOnly} />}
            {activeView === "workers" && (
              <>
                <WorkersManagementNew isReadOnly={isReadOnly} />
                {!isReadOnly && <ActivityPanel />}
              </>
            )}
            {activeView === "jornadas" && !isReadOnly && <JornadaManagement />}
            {activeView === "expenses" && <ExpenseDeclaration />}
            {activeView === "reports" && <ReportsPanel />}
            {activeView === "documents" && <DocumentsRetryPanel />}
            {activeView === "pos" && !isReadOnly && <POSBarsManagement />}
            {activeView === "inventory" && <InventoryByLocation />}
            {activeView === "replenishment" && !isReadOnly && <ReplenishmentManager />}
            {activeView === "notifications" && !isReadOnly && <NotificationsManagement />}
            {activeView === "tickets" && !isReadOnly && <TicketTypesManagement />}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
