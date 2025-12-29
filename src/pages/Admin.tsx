import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { StatsCards } from "@/components/dashboard/StatsCards";
import { ProductsList } from "@/components/dashboard/ProductsList";
import { AlertsPanel } from "@/components/dashboard/AlertsPanel";
import { ConsumptionChart } from "@/components/dashboard/ConsumptionChart";
import { ExcelUpload } from "@/components/dashboard/ExcelUpload";
import { CocktailsMenu } from "@/components/dashboard/CocktailsMenu";
import { WorkersManagement } from "@/components/dashboard/WorkersManagement";
import { ActivityPanel } from "@/components/dashboard/ActivityPanel";
import { JornadaStatus } from "@/components/dashboard/JornadaStatus";
import { JornadaManagement } from "@/components/dashboard/JornadaManagement";
import { ExpenseDeclaration } from "@/components/dashboard/ExpenseDeclaration";
import { ReportsPanel } from "@/components/dashboard/ReportsPanel";
import { PaymentMethodStats } from "@/components/dashboard/PaymentMethodStats";
import { AppSidebar } from "@/components/AppSidebar";
import WorkerPinDialog from "@/components/WorkerPinDialog";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import { Menu, Eye } from "lucide-react";

type ViewType = "overview" | "products" | "menu" | "workers" | "jornadas" | "expenses" | "reports";

export default function Admin() {
  const { role, isReadOnly } = useUserRole();
  const [activeView, setActiveView] = useState<ViewType>("overview");
  // Admin and gerencia already verified PIN during login, so skip the dialog
  const [isVerified, setIsVerified] = useState(true);
  const [showPinDialog, setShowPinDialog] = useState(false);

  // Restrict gerencia from accessing certain views
  const allowedViewsForGerencia: ViewType[] = ["overview", "products", "menu", "expenses", "reports"];
  
  const handleViewChange = (view: ViewType) => {
    // Gerencia cannot access workers or jornadas management
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
      default: return "Panel de Administración";
    }
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-gradient-to-br from-primary/5 via-background to-secondary/5">
        <AppSidebar activeView={activeView} setActiveView={handleViewChange} isReadOnly={isReadOnly} />
        
        <main className="flex-1 overflow-auto">
          {/* Header with sidebar trigger */}
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
                {!isReadOnly && <JornadaStatus />}
                <StatsCards />
                {isReadOnly && <PaymentMethodStats />}
                <div className="grid grid-cols-1 gap-6">
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2">
                      <ConsumptionChart />
                    </div>
                    <AlertsPanel />
                  </div>
                </div>
                {!isReadOnly && <ExcelUpload />}
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

            {activeView === "workers" && !isReadOnly && (
              <div className="space-y-6">
                <WorkersManagement />
                <ActivityPanel />
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
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}