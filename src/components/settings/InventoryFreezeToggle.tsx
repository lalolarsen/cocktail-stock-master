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
      // Check if flag row exists
      const { data: existing } = await supabase
        .from("feature_flags")
        .select("id")
        .eq("venue_id", venue.id)
        .eq("feature_key", "inventory_freeze_mode")
        .maybeSingle();

      if (existing) {
        await supabase
          .from("feature_flags")
          .update({ enabled: !frozen })
          .eq("id", existing.id);
      } else {
        await supabase
          .from("feature_flags")
          .insert({ venue_id: venue.id, feature_key: "inventory_freeze_mode", enabled: true });
      }

      queryClient.invalidateQueries({ queryKey: ["effective-flags", venue.id] });
      toast.success(frozen ? "Inventario reactivado" : "Inventario congelado (marcha blanca)");
    } catch {
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
