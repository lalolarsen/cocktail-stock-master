import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart3, FileText } from "lucide-react";
import { ProveedoresPanel } from "./ProveedoresPanel";
import { PurchaseMetrics } from "./compras/PurchaseMetrics";

export function ComprasPanel() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Compras</h2>
        <p className="text-sm text-muted-foreground">Subí facturas y mirá cuánto compraste vs vendiste.</p>
      </div>

      <Tabs defaultValue="metrics" className="w-full">
        <TabsList>
          <TabsTrigger value="metrics" className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4" /> Métricas
          </TabsTrigger>
          <TabsTrigger value="invoices" className="flex items-center gap-2">
            <FileText className="w-4 h-4" /> Facturas
          </TabsTrigger>
        </TabsList>

        <TabsContent value="metrics" className="mt-4">
          <PurchaseMetrics />
        </TabsContent>

        <TabsContent value="invoices" className="mt-4">
          <ProveedoresPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
