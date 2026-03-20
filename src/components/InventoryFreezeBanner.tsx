import { Alert, AlertDescription } from "@/components/ui/alert";
import { Snowflake } from "lucide-react";
import { useFlags, isEnabled } from "@/lib/flags";
import { useActiveVenue } from "@/hooks/useActiveVenue";

export function InventoryFreezeBanner() {
  const { venueId } = useActiveVenue();
  const { flags, isLoading } = useFlags(venueId);

  if (isLoading || !isEnabled(flags, "inventory_freeze_mode")) {
    return null;
  }

  return (
    <Alert className="border-sky-500/50 bg-sky-500/10">
      <Snowflake className="h-4 w-4 text-sky-600" />
      <AlertDescription className="text-sky-800 dark:text-sky-200 font-medium">
        Modo Marcha Blanca: Inventario congelado — las ventas no descuentan stock
      </AlertDescription>
    </Alert>
  );
}
