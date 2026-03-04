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
import { WasteManagement } from "@/components/dashboard/WasteManagement";
import { PasslineAuditPanel } from "@/components/dashboard/PasslineAuditPanel";
import { OpenBottlesMonitor } from "@/components/dashboard/OpenBottlesMonitor";
import { ReceiptSettingsCard } from "@/components/settings/ReceiptSettingsCard";


import { AppSidebar } from "@/components/AppSidebar";
import WorkerPinDialog from "@/components/WorkerPinDialog";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { VenueGuard } from "@/components/VenueGuard";
import { useAppSession } from "@/contexts/AppSessionContext";
import { Menu } from "lucide-react";

type ViewType = "overview" | "products" | "menu" | "workers" | "jornadas" | "expenses" | "reports" | "documents" | "pos" | "inventory" | "replenishment" | "notifications" | "tickets" | "finance" | "proveedores" | "courtesy-qr" | "waste" | "botellas" | "settings" | "passline-audit";

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
    <span className="text-sm text-muted-foreground">
      Hola, <span className="font-medium text-foreground">{name}</span>
    </span>
  );
}

export default function Admin() {
  const { role, isReadOnly } = useUserRole();
  const [activeView, setActiveView] = useState<ViewType>("overview");
  const [isVerified, setIsVerified] = useState(true);
  const [showPinDialog, setShowPinDialog] = useState(false);

  const allowedViewsForGerencia: ViewType[] = ["overview", "products", "menu", "expenses", "reports", "documents", "workers", "inventory", "finance", "courtesy-qr", "botellas"];
  
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
      case "expenses": return "Declaración de Gastos";
      case "reports": return "Reportes";
      case "documents": return "Documentos Electrónicos";
      case "pos": return "Barras y POS";
      case "inventory": return "Inventario en Tiempo Real";
      case "replenishment": return "Reposición de Stock";
      case "notifications": return "Notificaciones";
      case "tickets": return "Tipos de Entrada";
      case "finance": return "Finanzas";
      case "proveedores": return "Proveedores";
      case "courtesy-qr": return "QR de Cortesía";
      case "waste": return "Merma / Pérdida";
      case "botellas": return "Botellas Abiertas";
      case "settings": return "Configuración";
      case "passline-audit": return "Auditoría Totems Passline";
      default: return "Panel de Administración";
    }
  };

  return (
    <VenueGuard>
      <SidebarProvider>
        <div className="min-h-screen flex w-full bg-background">
          <AppSidebar activeView={activeView} setActiveView={handleViewChange} isReadOnly={isReadOnly} />
          
          <main className="flex-1 overflow-auto">
            <header className="sticky top-0 z-10 bg-background border-b border-border px-6 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <SidebarTrigger className="p-2 hover:bg-muted rounded-lg">
                    <Menu className="w-5 h-5" />
                  </SidebarTrigger>
                  <h1 className="text-lg font-semibold text-foreground tracking-tight">{getViewTitle()}</h1>
                </div>
                <HeaderGreeting />
              </div>
            </header>

          <div className="p-6 space-y-6 animate-fade-in">
            {activeView === "overview" && (
              <div className="space-y-6">
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
                <MenuWrapper isReadOnly={isReadOnly} />
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
                <WarehouseInventory />
              </div>
            )}

            {activeView === "replenishment" && !isReadOnly && (
              <div className="space-y-6">
                <BarReplenishment />
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

            {activeView === "finance" && (
              <div className="space-y-6">
                <FinancePanel />
              </div>
            )}

            {activeView === "proveedores" && !isReadOnly && (
              <div className="space-y-6">
                <ProveedoresPanel />
              </div>
            )}

            {activeView === "courtesy-qr" && (
              <div className="space-y-6">
                <CourtesyQR />
              </div>
            )}

            {activeView === "waste" && !isReadOnly && (
              <div className="space-y-6">
                <WasteManagement />
              </div>
            )}

            {activeView === "botellas" && (
              <div className="space-y-6">
                <OpenBottlesMonitor />
              </div>
            )}

            {activeView === "settings" && (
              <div className="space-y-6">
                <ReceiptSettingsCard />
              </div>
            )}

            {activeView === "passline-audit" && !isReadOnly && (
              <div className="slide-in-up">
                <PasslineAuditPanel />
              </div>
            )}
          </div>
        </main>
      </div>
    </SidebarProvider>
  </VenueGuard>
  );
}