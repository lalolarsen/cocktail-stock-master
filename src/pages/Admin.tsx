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
  const { role, isReadOnly } = useUserRole();
  const { isDemoMode, demoVenue, refreshDemoStatus } = useDemoMode();
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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-secondary/5">
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
      case "overview": return "Panel General";
      case "products": return "Productos";
      case "menu": return "Menú";
      case "jornadas": return "Jornadas";
      case "workers": return "Trabajadores";
      case "expenses": return "Declaración de Gastos";
      case "reports": return "Reportes";
      case "documents": return "Documentos Electrónicos";
      case "pos": return "Barras y POS";
      case "inventory": return "Inventario por Ubicación";
      case "replenishment": return "Reposición de Stock";
      case "notifications": return "Notificaciones";
      case "tickets": return "Tipos de Entrada";
      default: return "Panel de Administración";
    }
  };

  return (
    <SidebarProvider>
      {isDemoMode && <DemoWatermark />}
      <div className={`min-h-screen flex w-full bg-gradient-to-br from-primary/5 via-background to-secondary/5 ${isDemoMode ? 'pt-10' : ''}`}>
        <AppSidebar activeView={activeView} setActiveView={handleViewChange} isReadOnly={isReadOnly} />
        
        <main className="flex-1 overflow-auto">
          <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b border-border/50 px-6 py-4">
            <div className="flex items-center gap-4">
              <SidebarTrigger className="p-2 hover:bg-muted rounded-lg">
                <Menu className="w-5 h-5" />
              </SidebarTrigger>
              <h1 className="text-2xl font-bold gradient-text">{getViewTitle()}</h1>
              {isReadOnly && (
                <Badge variant="secondary" className="flex items-center gap-1 bg-amber-500/10 text-amber-600 border-amber-500/20">
                  <Eye className="w-3 h-3" />
                  Gerencia – solo lectura
                </Badge>
              )}
            </div>
          </header>

          <div className="p-6 space-y-6 animate-fade-in">
            {activeView === "overview" && (
              <div className="space-y-6">
                {isDemoMode && !isReadOnly && (
                  <DemoModeBanner isAdmin={true} onDemoActivated={refreshDemoStatus} />
                )}
                <AdminOverview isReadOnly={isReadOnly} onNavigate={handleViewChange} />
              </div>
            )}

            {activeView === "products" && (
              <div className="space-y-6">
                <ProductsList isReadOnly={isReadOnly} />
              </div>
            )}


            {activeView === "menu" && (
              <div className="space-y-6">
                <CocktailsMenu isReadOnly={isReadOnly} />
              </div>
            )}

            {activeView === "workers" && (
              <div className="space-y-6">
                <WorkersManagementNew isReadOnly={isReadOnly} />
                {!isReadOnly && <ActivityPanel />}
              </div>
            )}

            {activeView === "jornadas" && !isReadOnly && (
              <div className="space-y-6">
                <JornadaManagement />
              </div>
            )}

            {activeView === "expenses" && (
              <div className="space-y-6">
                <ExpenseDeclaration />
              </div>
            )}

            {activeView === "reports" && (
              <div className="space-y-6">
                <ReportsPanel />
              </div>
            )}

            {activeView === "documents" && (
              <div className="space-y-6">
                <DocumentsRetryPanel />
              </div>
            )}

            {activeView === "pos" && !isReadOnly && (
              <div className="space-y-6">
                <POSBarsManagement />
              </div>
            )}

            {activeView === "inventory" && (
              <div className="space-y-6">
                <InventoryByLocation />
              </div>
            )}

            {activeView === "replenishment" && !isReadOnly && (
              <div className="space-y-6">
                <ReplenishmentManager />
              </div>
            )}

            {activeView === "notifications" && !isReadOnly && (
              <div className="space-y-6">
                <NotificationsManagement />
              </div>
            )}

            {activeView === "tickets" && !isReadOnly && (
              <div className="space-y-6">
                <TicketTypesManagement />
              </div>
            )}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}