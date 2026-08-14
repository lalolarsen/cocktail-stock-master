import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Package, Martini } from "lucide-react";
import { ProductsList } from "@/components/dashboard/ProductsList";
import { MenuWrapper } from "@/components/dashboard/MenuWrapper";

interface CatalogWrapperProps {
  isReadOnly?: boolean;
}

export function CatalogWrapper({ isReadOnly = false }: CatalogWrapperProps) {
  return (
    <Tabs defaultValue="products" className="space-y-4">
      <TabsList className="grid w-full max-w-md grid-cols-2">
        <TabsTrigger value="products" className="gap-2">
          <Package className="w-4 h-4" />
          Productos
        </TabsTrigger>
        <TabsTrigger value="menu" className="gap-2">
          <Martini className="w-4 h-4" />
          Carta / Recetas
        </TabsTrigger>
      </TabsList>

      <TabsContent value="products" className="mt-0">
        <ProductsList isReadOnly={isReadOnly} />
      </TabsContent>
      <TabsContent value="menu" className="mt-0">
        <MenuWrapper isReadOnly={isReadOnly} />
      </TabsContent>
    </Tabs>
  );
}
