import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { purchaseImportsTable, purchaseImportLinesTable, learningProductMappingsTable } from "@/lib/db-tables";
import { useActiveVenue } from "@/hooks/useActiveVenue";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import ProductPicker from "@/components/purchase/ProductPicker";
import { toast } from "sonner";
import { ArrowLeft, Loader2, ImageIcon, FileText, Download, ZoomIn, Link2, Unlink } from "lucide-react";
import { formatCLP } from "@/lib/currency";

interface ImportHeader {
  id: string;
  supplier_name: string | null;
  supplier_rut: string | null;
  document_number: string | null;
  document_date: string | null;
  net_subtotal: number | null;
  total_amount: number | null;
  status: string;
  raw_file_url: string | null;
  created_at: string;
}

interface Line {
  id: string;
  raw_text: string;
  supplier_sku: string | null;
  units_real: number;
  cost_unit_net: number;
  line_total_net: number | null;
  product_id: string | null;
  products?: { name: string } | null;
}

export default function ProveedoresImportDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { venue } = useActiveVenue();

  const [header, setHeader] = useState<ImportHeader | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [editingLineId, setEditingLineId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);

    const { data: h } = await purchaseImportsTable().select("*").eq("id", id).maybeSingle();
    const hdr = (h ?? null) as unknown as ImportHeader | null;
    setHeader(hdr);

    const { data: l } = await purchaseImportLinesTable()
      .select("id, raw_text, supplier_sku, units_real, cost_unit_net, line_total_net, product_id, products:product_id(name)")
      .eq("purchase_import_id", id)
      .order("line_index");
    setLines((l ?? []) as unknown as Line[]);

    if (hdr?.raw_file_url) {
      const { data: signed } = await supabase.storage
        .from("purchase-invoices")
        .createSignedUrl(hdr.raw_file_url, 60 * 60);
      setFileUrl(signed?.signedUrl ?? null);
    }

    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const refreshIssues = async (nextLines: Line[]) => {
    const pending = nextLines.filter((l) => !l.product_id).length;
    await purchaseImportsTable().update({ issues_count: pending }).eq("id", id);
  };

  const forgetMapping = async (line: Line) => {
    if (!venue?.id) return;
    let q = learningProductMappingsTable().delete().eq("venue_id", venue.id);
    if (line.supplier_sku) {
      q = q.eq("supplier_sku", line.supplier_sku);
    } else {
      q = q.eq("raw_text", line.raw_text);
    }
    if (header?.supplier_rut) q = q.eq("supplier_rut", header.supplier_rut);
    await q;
  };

  const linkProduct = async (line: Line, productId: string, productName: string) => {
    const wasLinked = !!line.product_id;

    const { error } = await purchaseImportLinesTable()
      .update({ product_id: productId, status: "OK", notes: wasLinked ? "Corregido manualmente" : "Vinculado manualmente" })
      .eq("id", line.id);

    if (error) {
      toast.error("No se pudo vincular");
      return;
    }

    if (wasLinked) await forgetMapping(line);

    if (venue?.id) {
      await learningProductMappingsTable().insert({
        venue_id: venue.id,
        product_id: productId,
        raw_text: line.raw_text,
        supplier_rut: header?.supplier_rut ?? null,
        supplier_sku: line.supplier_sku,
        detected_multiplier: 1,
        confidence: 1,
      });
    }

    const next = lines.map((l) =>
      l.id === line.id ? { ...l, product_id: productId, products: { name: productName } } : l,
    );
    setLines(next);
    setEditingLineId(null);
    await refreshIssues(next);
    toast.success(wasLinked ? `Corregido a ${productName}` : `Vinculado a ${productName}`);
  };

  const unlinkProduct = async (line: Line) => {
    const { error } = await purchaseImportLinesTable()
      .update({ product_id: null, status: "REVIEW", notes: "Vinculación quitada" })
      .eq("id", line.id);

    if (error) {
      toast.error("No se pudo quitar la vinculación");
      return;
    }

    await forgetMapping(line);

    const next = lines.map((l) => (l.id === line.id ? { ...l, product_id: null, products: null } : l));
    setLines(next);
    setEditingLineId(null);
    await refreshIssues(next);
    toast.success("Quedó pendiente por vincular");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const goBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate("/admin");
  };

  if (!header) {
    return (
      <div className="p-6">
        <Button variant="outline" onClick={goBack} className="h-11 gap-2">
          <ArrowLeft className="h-4 w-4" /> Volver
        </Button>
        <p className="mt-6 text-sm text-muted-foreground">No se encontró la factura.</p>
      </div>
    );
  }

  const pending = lines.filter((l) => !l.product_id).length;
  const isPdf = header.raw_file_url?.toLowerCase().endsWith(".pdf");

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-6xl mx-auto pb-16">
      <div className="sticky top-0 z-20 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Button variant="outline" onClick={goBack} className="h-11 gap-2 shrink-0">
              <ArrowLeft className="h-4 w-4" /> Volver
            </Button>
            <div className="min-w-0">
              <h1 className="text-lg sm:text-xl font-semibold truncate">
                {header.supplier_name || "Factura sin proveedor"}
              </h1>
              <p className="text-sm text-muted-foreground truncate">
                {header.document_date || header.created_at?.slice(0, 10)}
                {header.document_number ? ` · Folio ${header.document_number}` : ""}
              </p>
            </div>
          </div>
          {pending > 0 ? (
            <Badge variant="outline" className="text-amber-600 border-amber-400">
              {pending} por vincular
            </Badge>
          ) : (
            <Badge variant="outline" className="text-primary border-primary/40">
              Todo vinculado
            </Badge>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:gap-4 grid-cols-2 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total factura</p>
            <p className="text-xl sm:text-2xl font-semibold mt-1">
              {header.total_amount ? formatCLP(header.total_amount) : "—"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Neto</p>
            <p className="text-xl sm:text-2xl font-semibold mt-1">
              {header.net_subtotal ? formatCLP(header.net_subtotal) : "—"}
            </p>
          </CardContent>
        </Card>
        <Card className="col-span-2 sm:col-span-1">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Productos</p>
            <p className="text-xl sm:text-2xl font-semibold mt-1">{lines.length}</p>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-3">
        {lines.length === 0 && (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No se leyeron productos en esta factura.
            </CardContent>
          </Card>
        )}

        {lines.map((l) => {
          const isEditing = editingLineId === l.id;
          return (
            <Card key={l.id}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-base font-medium leading-snug break-words">{l.raw_text || "—"}</p>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {l.units_real} × {formatCLP(Math.round(l.cost_unit_net || 0))}
                    </p>
                  </div>
                  <p className="text-base font-semibold shrink-0">
                    {formatCLP(Math.round(l.line_total_net ?? l.units_real * l.cost_unit_net))}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-border/60">
                  {l.product_id && !isEditing ? (
                    <>
                      <Badge variant="outline" className="gap-1.5 text-xs">
                        <Link2 className="h-3 w-3" />
                        {l.products?.name || "Vinculado"}
                      </Badge>
                      <Button variant="outline" size="sm" className="h-9" onClick={() => setEditingLineId(l.id)}>
                        Cambiar
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-9 gap-1.5 text-muted-foreground"
                        onClick={() => unlinkProduct(l)}
                      >
                        <Unlink className="h-3.5 w-3.5" /> Quitar
                      </Button>
                    </>
                  ) : (
                    venue?.id && (
                      <div className="flex flex-wrap items-center gap-2 w-full">
                        <span className="text-xs text-muted-foreground">
                          {l.product_id ? "Elige el insumo correcto" : "Sin vincular"}
                        </span>
                        <div className="min-w-[240px]">
                          <ProductPicker
                            venueId={venue.id}
                            value={null}
                            onSelect={(productId, productName) => productId && linkProduct(l, productId, productName)}
                          />
                        </div>
                        {isEditing && (
                          <Button variant="ghost" size="sm" className="h-9" onClick={() => setEditingLineId(null)}>
                            Cancelar
                          </Button>
                        )}
                      </div>
                    )
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              {isPdf ? <FileText className="h-4 w-4" /> : <ImageIcon className="h-4 w-4" />}
              Documento original
            </div>
            {fileUrl && (
              <Button variant="outline" size="sm" className="h-9 gap-2" asChild>
                <a href={fileUrl} download>
                  <Download className="h-3.5 w-3.5" /> Descargar
                </a>
              </Button>
            )}
          </div>
          {!fileUrl ? (
            <p className="text-sm text-muted-foreground">No disponible.</p>
          ) : isPdf ? (
            <iframe src={fileUrl} title="Factura" className="w-full h-[520px] rounded-lg border border-border" />
          ) : (
            <button
              type="button"
              onClick={() => setZoomOpen(true)}
              className="relative block w-full text-left group"
            >
              <img
                src={fileUrl}
                alt={`Factura ${header.supplier_name || ""} ${header.document_number || ""}`}
                className="max-h-[520px] w-auto rounded-lg border border-border object-contain"
                loading="lazy"
              />
              <span className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-md bg-background/90 px-2.5 py-1.5 text-xs font-medium border border-border">
                <ZoomIn className="h-3.5 w-3.5" /> Ampliar
              </span>
            </button>
          )}
        </CardContent>
      </Card>

      <Dialog open={zoomOpen} onOpenChange={setZoomOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-4xl p-2">
          <div className="max-h-[85vh] overflow-auto">
            {fileUrl && (
              <img
                src={fileUrl}
                alt="Factura ampliada"
                className="w-full h-auto rounded-md"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
