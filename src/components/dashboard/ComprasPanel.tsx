import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, LineChart } from "lucide-react";
import { ProveedoresPanel } from "./ProveedoresPanel";
import { InvoiceAnalytics } from "./compras/InvoiceAnalytics";

export function ComprasPanel() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Lector de facturas</h2>
        <p className="text-sm text-muted-foreground">Subí facturas, analizá precios y compará compras contra ventas.</p>
      </div>

      <Tabs defaultValue="analytics" className="w-full">
        <TabsList>
          <TabsTrigger value="analytics" className="flex items-center gap-2">
            <LineChart className="w-4 h-4" /> Análisis
          </TabsTrigger>
          <TabsTrigger value="invoices" className="flex items-center gap-2">
            <FileText className="w-4 h-4" /> Facturas
          </TabsTrigger>
        </TabsList>

        <TabsContent value="analytics" className="mt-4">
          <InvoiceAnalytics />
        </TabsContent>

        <TabsContent value="invoices" className="mt-4">
          <ProveedoresPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
