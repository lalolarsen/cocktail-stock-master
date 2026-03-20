import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Snowflake, Loader2 } from "lucide-react";
import { useActiveVenue } from "@/hooks/useActiveVenue";
import { useFlags, isEnabled } from "@/lib/flags";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

export function InventoryFreezeToggle() {
  const { venue } = useActiveVenue();
  const { flags, isLoading } = useFlags(venue?.id);
  const [updating, setUpdating] = useState(false);
  const queryClient = useQueryClient();

  const frozen = isEnabled(flags, "inventory_freeze_mode");

  const toggle = async () => {
    if (!venue?.id) return;
    setUpdating(true);
    try {
      const newValue = !frozen;
      const { error } = await supabase.rpc("set_inventory_freeze_mode", {
        p_enabled: newValue,
        p_venue_id: venue.id,
      });
      if (error) throw error;

      await queryClient.invalidateQueries({ queryKey: ["effective-flags", venue.id] });
      toast.success(newValue ? "Inventario congelado (marcha blanca)" : "Inventario reactivado");
    } catch (err) {
      console.error("Error toggling freeze:", err);
      toast.error("Error al cambiar modo de inventario");
    } finally {
      setUpdating(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={frozen ? "border-sky-500/50" : ""}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Snowflake className="h-4 w-4" />
          Modo Marcha Blanca
        </CardTitle>
        <CardDescription>
          Cuando está activo, las ventas funcionan normalmente pero no se descuenta inventario. Ideal para pruebas operativas.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">
            {frozen ? "Inventario congelado" : "Inventario activo (normal)"}
          </span>
          <Switch
            checked={frozen}
            disabled={updating}
            onCheckedChange={toggle}
          />
        </div>
      </CardContent>
    </Card>
  );
}
