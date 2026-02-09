import { useState } from "react";
import { StatsCards } from "@/components/dashboard/StatsCards";
import { ProductsList } from "@/components/dashboard/ProductsList";
import { AlertsPanel } from "@/components/dashboard/AlertsPanel";
import { ConsumptionChart } from "@/components/dashboard/ConsumptionChart";
import { ExcelUpload } from "@/components/dashboard/ExcelUpload";
import { CocktailsMenu } from "@/components/dashboard/CocktailsMenu";
import { WorkersManagement } from "@/components/dashboard/WorkersManagement";
import { JornadaManagement } from "@/components/dashboard/JornadaManagement";
import { ExpenseDeclaration } from "@/components/dashboard/ExpenseDeclaration";
import { ReportsPanel } from "@/components/dashboard/ReportsPanel";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Menu } from "lucide-react";

type ViewType = "overview" | "products" | "menu" | "workers" | "jornadas" | "expenses" | "reports";

const Index = () => {
  const [activeView, setActiveView] = useState<ViewType>("overview");

  const handleViewChange = (view: ViewType) => {
    setActiveView(view);
  };

  const getViewTitle = () => {
    switch (activeView) {
      case "overview": return "Panel General";
      case "products": return "Productos";
      case "menu": return "Menú";
      case "jornadas": return "Jornadas";
      case "workers": return "Trabajadores";
      case "expenses": return "Declaración de Gastos";
      case "reports": return "Reportes";
      default: return "Dashboard";
    }
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar activeView={activeView} setActiveView={handleViewChange} />
        
        <main className="flex-1 overflow-auto">
          <header className="sticky top-0 z-10 bg-background border-b border-border px-6 py-3">
            <div className="flex items-center gap-4">
              <SidebarTrigger className="p-2 hover:bg-muted rounded-lg">
                <Menu className="w-5 h-5" />
              </SidebarTrigger>
              <h1 className="text-lg font-semibold text-foreground tracking-tight">{getViewTitle()}</h1>
            </div>
          </header>

          <div className="p-4 md:p-8 space-y-6">
            {activeView === "overview" && (
              <div className="space-y-6 slide-in-up">
                <StatsCards />
                <div className="grid grid-cols-1 gap-6">
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
              <div className="slide-in-up">
                <ProductsList />
              </div>
            )}

            {activeView === "menu" && (
              <div className="slide-in-up">
                <CocktailsMenu />
              </div>
            )}

            {activeView === "workers" && (
              <div className="slide-in-up">
                <WorkersManagement />
              </div>
            )}

            {activeView === "jornadas" && (
              <div className="slide-in-up">
                <JornadaManagement />
              </div>
            )}

            {activeView === "expenses" && (
              <div className="slide-in-up">
                <ExpenseDeclaration />
              </div>
            )}

            {activeView === "reports" && (
              <div className="slide-in-up">
                <ReportsPanel />
              </div>
            )}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
};

export default Index;
