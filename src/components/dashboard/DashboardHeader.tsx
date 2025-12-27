import { Wine, Package, TrendingUp, Martini, Users } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DashboardHeaderProps {
  activeView: "overview" | "products" | "predictions" | "menu" | "workers";
  setActiveView: (view: "overview" | "products" | "predictions" | "menu" | "workers") => void;
}

export const DashboardHeader = ({ activeView, setActiveView }: DashboardHeaderProps) => {
  return (
    <div className="glass-effect rounded-xl p-6 shadow-elegant">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-primary-glow bg-clip-text text-transparent">
            CoctelStock
          </h1>
          <p className="text-muted-foreground mt-1">
            Sistema de gestión inteligente de inventario
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant={activeView === "overview" ? "default" : "outline"}
            className="primary-gradient text-primary-foreground hover:opacity-90 transition-smooth"
            onClick={() => setActiveView("overview")}
          >
            <Wine className="mr-2 h-4 w-4" />
            Panel General
          </Button>
          <Button
            variant={activeView === "products" ? "default" : "outline"}
            className={activeView === "products" ? "secondary-gradient text-secondary-foreground" : ""}
            onClick={() => setActiveView("products")}
          >
            <Package className="mr-2 h-4 w-4" />
            Productos
          </Button>
          <Button
            variant={activeView === "menu" ? "default" : "outline"}
            className={activeView === "menu" ? "bg-gradient-to-r from-amber-500 to-orange-500 text-white" : ""}
            onClick={() => setActiveView("menu")}
          >
            <Martini className="mr-2 h-4 w-4" />
            Menú
          </Button>
          <Button
            variant={activeView === "predictions" ? "default" : "outline"}
            className={activeView === "predictions" ? "bg-accent text-accent-foreground" : ""}
            onClick={() => setActiveView("predictions")}
          >
            <TrendingUp className="mr-2 h-4 w-4" />
            Predicciones
          </Button>
          <Button
            variant={activeView === "workers" ? "default" : "outline"}
            className={activeView === "workers" ? "bg-gradient-to-r from-violet-500 to-purple-500 text-white" : ""}
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
