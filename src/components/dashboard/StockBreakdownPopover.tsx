import { Warehouse, Wine, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ProductWithStock } from "@/hooks/useStockData";

interface StockBreakdownPopoverProps {
  product: ProductWithStock;
  unit: string;
}

export const StockBreakdownPopover = ({ product, unit }: StockBreakdownPopoverProps) => {
  const warehouseLocations = product.locationDetails.filter(l => l.locationType === 'warehouse');
  const barLocations = product.locationDetails.filter(l => l.locationType === 'bar');

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground">
          <MapPin className="h-3 w-3 mr-1" />
          Ver desglose
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="start">
        <div className="space-y-3">
          <h4 className="font-semibold text-sm">Desglose por ubicación</h4>
          
          {/* Warehouse section */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Warehouse className="h-3.5 w-3.5" />
              Bodega
            </div>
            {warehouseLocations.length > 0 ? (
              warehouseLocations.map((loc) => (
                <div key={loc.locationId} className="flex justify-between text-sm pl-5">
                  <span>{loc.locationName}</span>
                  <span className="font-medium">{loc.quantity} {unit}</span>
                </div>
              ))
            ) : (
              <div className="text-sm text-muted-foreground pl-5">Sin stock</div>
            )}
            <div className="flex justify-between text-sm pl-5 pt-1 border-t border-dashed">
              <span className="font-medium">Subtotal Bodega</span>
              <span className="font-bold text-primary">{product.warehouseStock} {unit}</span>
            </div>
          </div>

          {/* Bar section */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Wine className="h-3.5 w-3.5" />
              Barras
            </div>
            {barLocations.length > 0 ? (
              barLocations.map((loc) => (
                <div key={loc.locationId} className="flex justify-between text-sm pl-5">
                  <span>{loc.locationName}</span>
                  <span className="font-medium">{loc.quantity} {unit}</span>
                </div>
              ))
            ) : (
              <div className="text-sm text-muted-foreground pl-5">Sin stock en barras</div>
            )}
            <div className="flex justify-between text-sm pl-5 pt-1 border-t border-dashed">
              <span className="font-medium">Subtotal Barras</span>
              <span className="font-bold text-primary">{product.barStock} {unit}</span>
            </div>
          </div>

          {/* Total */}
          <div className="flex justify-between text-sm pt-2 border-t">
            <span className="font-semibold">Total General</span>
            <span className="font-bold text-lg text-primary">{product.totalStock} {unit}</span>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};
