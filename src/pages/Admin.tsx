import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { StatsCards } from "@/components/dashboard/StatsCards";
import { ProductsList } from "@/components/dashboard/ProductsList";
import { AlertsPanel } from "@/components/dashboard/AlertsPanel";
import { ConsumptionChart } from "@/components/dashboard/ConsumptionChart";
import { PredictionsPanel } from "@/components/dashboard/PredictionsPanel";
import { ExcelUpload } from "@/components/dashboard/ExcelUpload";
import { CocktailsMenu } from "@/components/dashboard/CocktailsMenu";
import { ProfitChart } from "@/components/dashboard/ProfitChart";
import { WorkersManagement } from "@/components/dashboard/WorkersManagement";
import { ActivityPanel } from "@/components/dashboard/ActivityPanel";
import { JornadaStatus } from "@/components/dashboard/JornadaStatus";
import { JornadaManagement } from "@/components/dashboard/JornadaManagement";
import WorkerPinDialog from "@/components/WorkerPinDialog";
import { LogOut, FileText } from "lucide-react";

export default function Admin() {
  const [activeView, setActiveView] = useState<"overview" | "products" | "predictions" | "menu" | "workers" | "jornadas">("overview");
  const [isVerified, setIsVerified] = useState(false);
  const [showPinDialog, setShowPinDialog] = useState(true);
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
      <div className="container mx-auto p-6 space-y-6 animate-fade-in">
        <div className="flex justify-between items-center">
          <h1 className="text-4xl font-bold gradient-text">Panel de Administración</h1>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate("/reports")}>
              <FileText className="w-4 h-4 mr-2" />
              Reportes
            </Button>
            <Button variant="outline" onClick={handleLogout}>
              <LogOut className="w-4 h-4 mr-2" />
              Salir
            </Button>
          </div>
        </div>

        <DashboardHeader activeView={activeView} setActiveView={setActiveView} />

        {activeView === "overview" && (
          <div className="space-y-6">
            <JornadaStatus />
            <StatsCards />
            <div className="grid grid-cols-1 gap-6">
              <ProfitChart />
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2">
                  <ConsumptionChart />
                </div>
                <AlertsPanel />
              </div>
            </div>
            <ExcelUpload />
          </div>
        )}

        {activeView === "products" && (
          <div className="space-y-6">
            <ProductsList />
          </div>
        )}

        {activeView === "predictions" && (
          <div className="space-y-6">
            <PredictionsPanel />
          </div>
        )}

        {activeView === "menu" && (
          <div className="space-y-6">
            <CocktailsMenu />
          </div>
        )}

        {activeView === "workers" && (
          <div className="space-y-6">
            <WorkersManagement />
            <ActivityPanel />
          </div>
        )}

        {activeView === "jornadas" && (
          <div className="space-y-6">
            <JornadaManagement />
          </div>
        )}
      </div>
    </div>
  );
}
