import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Shirt, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { DEFAULT_VENUE_ID } from "@/lib/venue";

export function CoatcheckSettingsCard() {
  const [backpack, setBackpack] = useState("2000");
  const [garment, setGarment] = useState("1000");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("coatcheck_settings")
        .select("price_backpack, price_garment")
        .eq("venue_id", DEFAULT_VENUE_ID)
        .maybeSingle();
      if (data) {
        setBackpack(String(data.price_backpack ?? 2000));
        setGarment(String(data.price_garment ?? 1000));
      }
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    const b = Math.round(Number(backpack));
    const g = Math.round(Number(garment));
    if (!Number.isFinite(b) || b < 0 || !Number.isFinite(g) || g < 0) {
      toast.error("Revisa los precios");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("coatcheck_settings").upsert({
      venue_id: DEFAULT_VENUE_ID,
      price_backpack: b,
      price_garment: g,
      updated_at: new Date().toISOString(),
    });
    setSaving(false);
    if (error) {
      toast.error("No se pudieron guardar los precios");
      return;
    }
    toast.success("Precios de guardarropía actualizados");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Shirt className="h-4 w-4 text-primary" /> Guardarropía
        </CardTitle>
        <CardDescription>Precios que usa la caja de guardarropía.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="py-6 flex justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Mochila / bolso</Label>
                <Input
                  inputMode="numeric"
                  className="h-12 text-base"
                  value={backpack}
                  onChange={(e) => setBackpack(e.target.value.replace(/[^\d]/g, ""))}
                />
              </div>
              <div className="space-y-2">
                <Label>Prenda de ropa</Label>
                <Input
                  inputMode="numeric"
                  className="h-12 text-base"
                  value={garment}
                  onChange={(e) => setGarment(e.target.value.replace(/[^\d]/g, ""))}
                />
              </div>
            </div>
            <Button onClick={save} disabled={saving} className="h-11">
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Guardar precios
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
