import { useState } from "react";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { StatsCards } from "@/components/dashboard/StatsCards";
import { ProductsList } from "@/components/dashboard/ProductsList";
import { AlertsPanel } from "@/components/dashboard/AlertsPanel";
import { ConsumptionChart } from "@/components/dashboard/ConsumptionChart";
import { PredictionsPanel } from "@/components/dashboard/PredictionsPanel";
import { ExcelUpload } from "@/components/dashboard/ExcelUpload";
import { CocktailsMenu } from "@/components/dashboard/CocktailsMenu";
import { ProfitChart } from "@/components/dashboard/ProfitChart";

const Index = () => {
  const [activeView, setActiveView] = useState<"overview" | "products" | "predictions" | "menu">("overview");

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted to-background">
      <div className="container mx-auto p-4 md:p-8 space-y-6">
        <DashboardHeader activeView={activeView} setActiveView={setActiveView} />
        
        {activeView === "overview" && (
          <div className="space-y-6 slide-in-up">
            <StatsCards />
            <ProfitChart />
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <ConsumptionChart />
              </div>
              <AlertsPanel />
            </div>
            <ExcelUpload />
          </div>
        )}

        {activeView === "products" && (
          <div className="slide-in-up">
            <ProductsList />
          </div>
        )}

        {activeView === "predictions" && (
          <div className="slide-in-up">
            <PredictionsPanel />
          </div>
        )}

        {activeView === "menu" && (
          <div className="slide-in-up">
            <CocktailsMenu />
          </div>
        )}
      </div>
    </div>
  );
};

export default Index;
