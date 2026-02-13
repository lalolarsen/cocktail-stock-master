import { Wine, Package, TrendingUp, Martini, Users, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DashboardHeaderProps {
  activeView: "overview" | "products" | "predictions" | "menu" | "workers" | "jornadas";
  setActiveView: (view: "overview" | "products" | "predictions" | "menu" | "workers" | "jornadas") => void;
}

export const DashboardHeader = ({ activeView, setActiveView }: DashboardHeaderProps) => {
  return (
    <div className="bg-card border border-border rounded-lg p-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground tracking-tight">
            StockIA
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Control de inventario inteligente
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant={activeView === "overview" ? "default" : "outline"}
            onClick={() => setActiveView("overview")}
          >
            <Wine className="mr-2 h-4 w-4" />
            Dashboard
          </Button>
          <Button
            variant={activeView === "products" ? "default" : "outline"}
            onClick={() => setActiveView("products")}
          >
            <Package className="mr-2 h-4 w-4" />
            Productos
          </Button>
          <Button
            variant={activeView === "menu" ? "default" : "outline"}
            onClick={() => setActiveView("menu")}
          >
            <Martini className="mr-2 h-4 w-4" />
            Menú
          </Button>
          <Button
            variant={activeView === "jornadas" ? "default" : "outline"}
            onClick={() => setActiveView("jornadas")}
          >
            <Calendar className="mr-2 h-4 w-4" />
            Jornadas
          </Button>
          <Button
            variant={activeView === "predictions" ? "default" : "outline"}
            onClick={() => setActiveView("predictions")}
          >
            <TrendingUp className="mr-2 h-4 w-4" />
            Predicciones
          </Button>
          <Button
            variant={activeView === "workers" ? "default" : "outline"}
            onClick={() => setActiveView("workers")}
          >
            <Users className="mr-2 h-4 w-4" />
            Trabajadores
          </Button>
        </div>
      </div>
    </div>
  );
};
