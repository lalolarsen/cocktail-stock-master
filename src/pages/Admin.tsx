import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { AdminOverview } from "@/components/dashboard/AdminOverview";
import { ProductsList } from "@/components/dashboard/ProductsList";
import { MenuWrapper } from "@/components/dashboard/MenuWrapper";
import { WorkersManagementNew } from "@/components/dashboard/WorkersManagementNew";
import { ActivityPanel } from "@/components/dashboard/ActivityPanel";
import { JornadaManagement } from "@/components/dashboard/JornadaManagement";
import { ReportsPanel } from "@/components/dashboard/ReportsPanel";
import { POSBarsManagement } from "@/components/dashboard/POSBarsManagement";
import { NotificationsManagement } from "@/components/dashboard/NotificationsManagement";
import { TicketTypesManagement } from "@/components/dashboard/TicketTypesManagement";
import { ComprasPanel } from "@/components/dashboard/ComprasPanel";
import CourtesyQR from "@/pages/CourtesyQR";
import CourtesyQRSimple from "@/pages/CourtesyQRSimple";
import { VoidRequestsPanel } from "@/components/dashboard/VoidRequestsPanel";
import { ReceiptSettingsCard } from "@/components/settings/ReceiptSettingsCard";
import { AnalyticsPanel } from "@/components/dashboard/AnalyticsPanel";

import { AppSidebar } from "@/components/AppSidebar";
import WorkerPinDialog from "@/components/WorkerPinDialog";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { VenueGuard } from "@/components/VenueGuard";
import { useAppSession } from "@/contexts/AppSessionContext";
import { Menu } from "lucide-react";

type ViewType = "overview" | "products" | "menu" | "workers" | "jornadas" | "reports" | "pos" | "notifications" | "tickets" | "proveedores" | "courtesy-qr" | "settings" | "analytics" | "voids";

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

  const allowedViewsForGerencia: ViewType[] = ["overview", "products", "menu", "reports", "workers", "courtesy-qr", "settings", "analytics", "voids", "proveedores", "notifications"];

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
      case "reports": return "Reportes";
      case "pos": return "Barras y POS";
      case "notifications": return "Notificaciones";
      case "tickets": return "Entradas";
      case "analytics": return "Análisis";
      case "proveedores": return "Compras";
      case "courtesy-qr": return "Cortesías";
      case "settings": return "Config";
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
              <AdminOverview isReadOnly={isReadOnly} onNavigate={handleViewChange as any} />
            )}

            {activeView === "products" && <ProductsList isReadOnly={isReadOnly} />}
            {activeView === "menu" && <MenuWrapper isReadOnly={isReadOnly} />}

            {activeView === "workers" && (
              <div className="space-y-4 sm:space-y-6">
                <WorkersManagementNew isReadOnly={isReadOnly} viewerRole={role as any} />
                {!isReadOnly && <ActivityPanel />}
              </div>
            )}

            {activeView === "jornadas" && !isReadOnly && <JornadaManagement />}
            {activeView === "reports" && <ReportsPanel />}
            {activeView === "pos" && !isReadOnly && <POSBarsManagement />}
            {activeView === "notifications" && <NotificationsManagement />}
            {activeView === "tickets" && !isReadOnly && <TicketTypesManagement />}
            {activeView === "proveedores" && !isReadOnly && <ComprasPanel />}
            {activeView === "analytics" && <AnalyticsPanel />}
            {activeView === "courtesy-qr" && (isReadOnly ? <CourtesyQRSimple /> : <CourtesyQR />)}
            {activeView === "settings" && <ReceiptSettingsCard />}
            {activeView === "voids" && <VoidRequestsPanel />}
          </div>
        </main>
      </div>
    </SidebarProvider>
  </VenueGuard>
  );
}
