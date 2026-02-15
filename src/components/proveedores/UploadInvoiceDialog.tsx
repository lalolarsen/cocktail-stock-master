import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useActiveVenue } from "@/hooks/useActiveVenue";
import { toast } from "sonner";
import { Upload, Loader2 } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  warehouseLocationId: string;
  onCreated: (importId: string) => void;
}

export function UploadInvoiceDialog({ open, onOpenChange, warehouseLocationId, onCreated }: Props) {
  const { venue } = useActiveVenue();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [supplierName, setSupplierName] = useState("");
  const [docNumber, setDocNumber] = useState("");
  const [docDate, setDocDate] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!file || !venue?.id) {
      toast.error("Selecciona un archivo");
      return;
    }

    setLoading(true);
    try {
      // Upload file to storage
      const ext = file.name.split(".").pop() || "pdf";
      const filePath = `${venue.id}/${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from("purchase-invoices")
        .upload(filePath, file);

      if (uploadErr) throw uploadErr;

      // Create purchase_imports record
      const { data: imp, error: insErr } = await supabase
        .from("purchase_imports" as any)
        .insert({
          venue_id: venue.id,
          location_id: warehouseLocationId,
          supplier_name: supplierName || null,
          document_number: docNumber || null,
          document_date: docDate || null,
          raw_file_url: filePath,
          status: "UPLOADED",
          created_by: (await supabase.auth.getUser()).data.user?.id,
        })
        .select("id")
        .single();

      if (insErr) throw insErr;
      const importId = (imp as any).id;

      toast.success("Archivo subido. Extrayendo datos...");

      // Trigger extraction edge function
      const { error: fnErr } = await supabase.functions.invoke("extract-invoice", {
        body: { purchase_import_id: importId },
      });

      if (fnErr) {
        console.error("Extraction error:", fnErr);
        toast.warning("Extracción falló. Puedes agregar líneas manualmente.");
      } else {
        toast.success("Extracción completada");
      }

      // Reset form
      setFile(null);
      setSupplierName("");
      setDocNumber("");
      onOpenChange(false);
      onCreated(importId);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Error al subir factura");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Subir factura de proveedor</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Archivo (PDF, JPG, PNG)</Label>
            <div
              className="mt-1 border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
              {file ? (
                <p className="text-sm font-medium">{file.name}</p>
              ) : (
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <Upload className="h-8 w-8" />
                  <p className="text-sm">Click para seleccionar archivo</p>
                </div>
              )}
            </div>
          </div>

          <div>
            <Label>Proveedor (opcional)</Label>
            <Input
              value={supplierName}
              onChange={(e) => setSupplierName(e.target.value)}
              placeholder="Se detectará del documento"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Folio (opcional)</Label>
              <Input
                value={docNumber}
                onChange={(e) => setDocNumber(e.target.value)}
                placeholder="Ej: 12345"
              />
            </div>
            <div>
              <Label>Fecha</Label>
              <Input
                type="date"
                value={docDate}
                onChange={(e) => setDocDate(e.target.value)}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={loading || !file}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {loading ? "Procesando..." : "Subir y procesar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
