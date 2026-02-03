import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CocktailsMenu } from "./CocktailsMenu";
import { AddonsManagement } from "./AddonsManagement";
import { Martini, PlusCircle } from "lucide-react";

interface MenuWrapperProps {
  isReadOnly?: boolean;
}

export function MenuWrapper({ isReadOnly = false }: MenuWrapperProps) {
  return (
    <div className="space-y-4">
      <Tabs defaultValue="menu" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="menu" className="gap-2">
            <Martini className="h-4 w-4" />
            Productos
          </TabsTrigger>
          <TabsTrigger value="addons" className="gap-2">
            <PlusCircle className="h-4 w-4" />
            Add-ons
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="menu" className="mt-6">
          <CocktailsMenu isReadOnly={isReadOnly} />
        </TabsContent>
        
        <TabsContent value="addons" className="mt-6">
          <AddonsManagement />
        </TabsContent>
      </Tabs>
    </div>
  );
}
