import { useState, useRef } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useActiveVenue } from "@/hooks/useActiveVenue";
import { toast } from "sonner";
import { Camera, Image as ImageIcon, Loader2, CheckCircle2, RotateCcw } from "lucide-react";
import { formatCLP } from "@/lib/currency";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  warehouseLocationId: string;
  onSaved: () => void;
}

type Step = "pick" | "processing" | "confirm" | "done";

export function InvoiceCaptureDialog({ open, onOpenChange, warehouseLocationId, onSaved }: Props) {
  const { venue } = useActiveVenue();
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("pick");
  const [importId, setImportId] = useState<string | null>(null);
  const [supplier, setSupplier] = useState("");
  const [total, setTotal] = useState("");
  const [productCount, setProductCount] = useState(0);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setStep("pick");
    setImportId(null);
    setSupplier("");
    setTotal("");
    setProductCount(0);
    if (cameraRef.current) cameraRef.current.value = "";
    if (galleryRef.current) galleryRef.current.value = "";
  };

  const close = () => {
    onOpenChange(false);
    setTimeout(reset, 300);
  };

  const handleFile = async (file: File | null) => {
    if (!file || !venue?.id) return;
    setStep("processing");

    try {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const filePath = `${venue.id}/${Date.now()}.${ext}`;

      const { error: uploadErr } = await supabase.storage.from("purchase-invoices").upload(filePath, file);
      if (uploadErr) throw uploadErr;

      const { data: imp, error: insErr } = await supabase
        .from("purchase_imports" as any)
        .insert({
          venue_id: venue.id,
          location_id: warehouseLocationId,
          raw_file_url: filePath,
          status: "UPLOADED",
          created_by: (await supabase.auth.getUser()).data.user?.id,
        })
        .select("id")
        .single();

      if (insErr) throw insErr;
      const id = (imp as any).id as string;
      setImportId(id);

      const { data: result, error: fnErr } = await supabase.functions.invoke("extract-invoice", {
        body: { purchase_import_id: id },
      });

      if (fnErr) throw fnErr;

      const { data: fresh } = await supabase
        .from("purchase_imports" as any)
        .select("supplier_name, total_amount")
        .eq("id", id)
        .single();

      const { count } = await supabase
        .from("purchase_import_lines" as any)
        .select("id", { count: "exact", head: true })
        .eq("purchase_import_id", id);

      setSupplier(((fresh as any)?.supplier_name as string) || (result as any)?.supplier_name || "");
      const t = ((fresh as any)?.total_amount as number) ?? (result as any)?.total_amount ?? 0;
      setTotal(t ? String(Math.round(t)) : "");
      setProductCount(count ?? (result as any)?.lines_count ?? 0);
      setStep("confirm");
    } catch (err: any) {
      console.error(err);
      toast.error("No se pudo leer la foto. Intenta con más luz o vuelve a tomarla.");
      setStep("pick");
    }
  };

  const handleConfirm = async () => {
    if (!importId) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("purchase_imports" as any)
        .update({
          supplier_name: supplier.trim() || null,
          total_amount: total ? Math.round(Number(total.replace(/[^\d]/g, ""))) : null,
          status: "SAVED",
          updated_at: new Date().toISOString(),
        })
        .eq("id", importId);
      if (error) throw error;
      setStep("done");
      onSaved();
    } catch (err: any) {
      console.error(err);
      toast.error("No se pudo guardar. Intenta de nuevo.");
    } finally {
      setSaving(false);
    }
  };

  const retake = async () => {
    // Descarta la lectura anterior y vuelve al inicio
    if (importId) {
      await supabase.from("purchase_import_lines" as any).delete().eq("purchase_import_id", importId);
      await supabase.from("purchase_imports" as any).delete().eq("id", importId);
    }
    reset();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : close())}>
      <DialogContent className="sm:max-w-lg p-6">
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0] || null)}
        />
        <input
          ref={galleryRef}
          type="file"
          accept="image/*,.pdf"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0] || null)}
        />

        {step === "pick" && (
          <div className="space-y-5 text-center">
            <div>
              <h2 className="text-2xl font-semibold">Subir factura</h2>
              <p className="text-base text-muted-foreground mt-1">Toma una foto de la factura completa.</p>
            </div>

            <Button className="w-full h-20 text-lg gap-3" onClick={() => cameraRef.current?.click()}>
              <Camera className="h-7 w-7" /> Tomar foto
            </Button>

            <Button
              variant="outline"
              className="w-full h-16 text-base gap-3"
              onClick={() => galleryRef.current?.click()}
            >
              <ImageIcon className="h-6 w-6" /> Elegir foto guardada
            </Button>

            <Button variant="ghost" className="w-full h-12" onClick={close}>
              Cancelar
            </Button>
          </div>
        )}

        {step === "processing" && (
          <div className="py-12 flex flex-col items-center gap-4 text-center">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <p className="text-lg font-medium">Leyendo la factura...</p>
            <p className="text-sm text-muted-foreground">Esto puede tardar unos segundos. No cierres esta ventana.</p>
          </div>
        )}

        {step === "confirm" && (
          <div className="space-y-5">
            <div className="text-center">
              <h2 className="text-2xl font-semibold">¿Está correcto?</h2>
              <p className="text-base text-muted-foreground mt-1">Revisa estos datos y corrige si hace falta.</p>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-base">Proveedor</Label>
                <Input
                  className="h-14 text-lg"
                  value={supplier}
                  onChange={(e) => setSupplier(e.target.value)}
                  placeholder="Nombre del proveedor"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-base">Total de la factura</Label>
                <Input
                  className="h-14 text-lg"
                  inputMode="numeric"
                  value={total}
                  onChange={(e) => setTotal(e.target.value.replace(/[^\d]/g, ""))}
                  placeholder="0"
                />
                {total && <p className="text-sm text-muted-foreground">{formatCLP(Number(total))}</p>}
              </div>

              <div className="rounded-lg border border-border bg-muted/30 p-4 text-center">
                <p className="text-3xl font-semibold">{productCount}</p>
                <p className="text-sm text-muted-foreground">productos leídos</p>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <Button className="w-full h-16 text-lg" onClick={handleConfirm} disabled={saving}>
                {saving ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : null}
                Listo
              </Button>
              <Button variant="outline" className="w-full h-12 gap-2" onClick={retake} disabled={saving}>
                <RotateCcw className="h-4 w-4" /> Tomar otra foto
              </Button>
              <Button
                variant="ghost"
                className="w-full h-12"
                disabled={saving}
                onClick={async () => {
                  await retake();
                  close();
                }}
              >
                Cancelar
              </Button>
            </div>
          </div>
        )}

        {step === "done" && (
          <div className="py-10 flex flex-col items-center gap-4 text-center">
            <CheckCircle2 className="h-16 w-16 text-primary" />
            <h2 className="text-2xl font-semibold">Factura guardada</h2>
            <p className="text-base text-muted-foreground">Ya quedó registrada para gerencia.</p>
            <div className="flex flex-col gap-3 w-full pt-2">
              <Button className="w-full h-16 text-lg" onClick={reset}>
                Subir otra factura
              </Button>
              <Button variant="outline" className="w-full h-12" onClick={close}>
                Terminar
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
