import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { AdminOverview } from "@/components/dashboard/AdminOverview";
import { ProductsList } from "@/components/dashboard/ProductsList";
import { MenuWrapper } from "@/components/dashboard/MenuWrapper";
import { WorkersManagementNew } from "@/components/dashboard/WorkersManagementNew";
import { ActivityPanel } from "@/components/dashboard/ActivityPanel";
import { JornadaManagement } from "@/components/dashboard/JornadaManagement";
import { ExpenseDeclaration } from "@/components/dashboard/ExpenseDeclaration";
import { ReportsPanel } from "@/components/dashboard/ReportsPanel";
import { DocumentsRetryPanel } from "@/components/dashboard/DocumentsRetryPanel";
import { POSBarsManagement } from "@/components/dashboard/POSBarsManagement";
import { WarehouseInventory } from "@/components/dashboard/WarehouseInventory";
import { BarReplenishment } from "@/components/dashboard/BarReplenishment";
import { NotificationsManagement } from "@/components/dashboard/NotificationsManagement";
import { TicketTypesManagement } from "@/components/dashboard/TicketTypesManagement";
import { FinancePanel } from "@/components/dashboard/FinancePanel";
import { ProveedoresPanel } from "@/components/dashboard/ProveedoresPanel";
import CourtesyQR from "@/pages/CourtesyQR";
import CourtesyQRSimple from "@/pages/CourtesyQRSimple";
import { WasteManagement } from "@/components/dashboard/WasteManagement";
import { PasslineAuditPanel } from "@/components/dashboard/PasslineAuditPanel";
import { OpenBottlesMonitor } from "@/components/dashboard/OpenBottlesMonitor";
import { VoidRequestsPanel } from "@/components/dashboard/VoidRequestsPanel";
import { ReceiptSettingsCard } from "@/components/settings/ReceiptSettingsCard";
import { IncomeDeclarationPanel } from "@/components/dashboard/IncomeDeclarationPanel";
import { AnalyticsPanel } from "@/components/dashboard/AnalyticsPanel";
import { InventoryFreezeBanner } from "@/components/InventoryFreezeBanner";
import { ExternalConsumptionPanel } from "@/components/dashboard/ExternalConsumptionPanel";
import { InventoryFreezeToggle } from "@/components/settings/InventoryFreezeToggle";

import { AppSidebar } from "@/components/AppSidebar";
import WorkerPinDialog from "@/components/WorkerPinDialog";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { VenueGuard } from "@/components/VenueGuard";
import { useAppSession } from "@/contexts/AppSessionContext";
import { Menu } from "lucide-react";

type ViewType = "overview" | "products" | "menu" | "workers" | "jornadas" | "expenses" | "reports" | "documents" | "pos" | "inventory" | "replenishment" | "notifications" | "tickets" | "finance" | "proveedores" | "courtesy-qr" | "waste" | "botellas" | "settings" | "passline-audit" | "income" | "analytics" | "voids" | "external-consumption";

function HeaderGreeting() {
  const { user } = useAppSession();
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.full_name) {
          setName(data.full_name.split(" ")[0]);
        }
      });
  }, [user?.id]);

  if (!name) return null;

  return (
    <span className="text-sm text-muted-foreground hidden sm:inline">
      Hola, <span className="font-medium text-foreground">{name}</span>
    </span>
  );
}

export default function Admin() {
  const { role, isReadOnly } = useUserRole();
  const [activeView, setActiveView] = useState<ViewType>("overview");
  const [isVerified, setIsVerified] = useState(true);
  const [showPinDialog, setShowPinDialog] = useState(false);

  const allowedViewsForGerencia: ViewType[] = ["overview", "products", "menu", "expenses", "reports", "documents", "workers", "inventory", "finance", "courtesy-qr", "botellas", "income", "settings", "analytics", "voids"];
  
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
      <div className="min-h-screen flex items-center justify-center bg-background">
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
      case "overview": return "Dashboard";
      case "products": return "Productos";
      case "menu": return "Carta";
      case "jornadas": return "Jornadas";
      case "workers": return "Trabajadores";
      case "expenses": return "Gastos";
      case "reports": return "Reportes";
      case "documents": return "Documentos";
      case "pos": return "Barras y POS";
      case "inventory": return "Inventario";
      case "replenishment": return "Reposición";
      case "notifications": return "Notificaciones";
      case "tickets": return "Entradas";
      case "finance": return "Finanzas";
      case "income": return "Ingresos";
      case "analytics": return "Análisis";
      case "proveedores": return "Proveedores";
      case "courtesy-qr": return "QR Cortesía";
      case "waste": return "Merma";
      case "botellas": return "Botellas";
      case "settings": return "Config";
      case "passline-audit": return "Passline";
      case "voids": return "Anulaciones";
      default: return "Admin";
    }
  };

  return (
    <VenueGuard>
      <SidebarProvider>
        <div className="min-h-screen flex w-full bg-background">
          <AppSidebar activeView={activeView} setActiveView={handleViewChange} isReadOnly={isReadOnly} />
          
          <main className="flex-1 overflow-auto min-w-0">
            <header className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border px-3 sm:px-6 py-2.5 sm:py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 sm:gap-4 min-w-0">
                  <SidebarTrigger className="p-2 hover:bg-muted rounded-lg shrink-0">
                    <Menu className="w-5 h-5" />
                  </SidebarTrigger>
                  <h1 className="text-base sm:text-lg font-semibold text-foreground tracking-tight truncate">{getViewTitle()}</h1>
                </div>
                <HeaderGreeting />
              </div>
            </header>

          <div className="p-3 sm:p-6 space-y-4 sm:space-y-6 animate-fade-in">
            {activeView === "overview" && (
              <AdminOverview isReadOnly={isReadOnly} onNavigate={handleViewChange} />
            )}

            {activeView === "products" && <ProductsList isReadOnly={isReadOnly} />}
            {activeView === "menu" && <MenuWrapper isReadOnly={isReadOnly} />}

            {activeView === "workers" && (
              <div className="space-y-4 sm:space-y-6">
                <WorkersManagementNew isReadOnly={isReadOnly} />
                {!isReadOnly && <ActivityPanel />}
              </div>
            )}

            {activeView === "jornadas" && !isReadOnly && <JornadaManagement />}
            {activeView === "expenses" && <ExpenseDeclaration />}
            {activeView === "reports" && <ReportsPanel />}
            {activeView === "documents" && <DocumentsRetryPanel />}
            {activeView === "pos" && !isReadOnly && <POSBarsManagement />}
            {activeView === "inventory" && (
              <>
                <InventoryFreezeBanner />
                <WarehouseInventory isReadOnly={isReadOnly} />
              </>
            )}
            {activeView === "replenishment" && !isReadOnly && <BarReplenishment />}
            {activeView === "notifications" && !isReadOnly && <NotificationsManagement />}
            {activeView === "tickets" && !isReadOnly && <TicketTypesManagement />}
            {activeView === "finance" && isReadOnly && <FinancePanel />}
            {activeView === "income" && <IncomeDeclarationPanel />}
            {activeView === "proveedores" && !isReadOnly && <ProveedoresPanel />}
            {activeView === "analytics" && <AnalyticsPanel />}
            {activeView === "courtesy-qr" && (isReadOnly ? <CourtesyQRSimple /> : <CourtesyQR />)}
            {activeView === "waste" && !isReadOnly && <WasteManagement />}
            {activeView === "botellas" && <OpenBottlesMonitor />}
            {activeView === "settings" && (
              <>
                <ReceiptSettingsCard />
                {isReadOnly && <InventoryFreezeToggle />}
              </>
            )}
            {activeView === "passline-audit" && !isReadOnly && <PasslineAuditPanel />}
            {activeView === "voids" && <VoidRequestsPanel />}
          </div>
        </main>
      </div>
    </SidebarProvider>
  </VenueGuard>
  );
}
