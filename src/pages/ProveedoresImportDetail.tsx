import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { purchaseImportsTable, purchaseImportLinesTable, learningProductMappingsTable } from "@/lib/db-tables";
import { useActiveVenue } from "@/hooks/useActiveVenue";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import ProductPicker from "@/components/purchase/ProductPicker";
import { toast } from "sonner";
import { ArrowLeft, Loader2, ImageIcon, FileText } from "lucide-react";
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

  const linkProduct = async (line: Line, productId: string, productName: string) => {
    const { error } = await purchaseImportLinesTable()
      .update({ product_id: productId, status: "OK", notes: "Vinculado manualmente" })
      .eq("id", line.id);

    if (error) {
      toast.error("No se pudo vincular");
      return;
    }

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

    const pending = lines.filter((l) => l.id !== line.id && !l.product_id).length;
    await purchaseImportsTable().update({ issues_count: pending }).eq("id", id);

    setLines((prev) =>
      prev.map((l) => (l.id === line.id ? { ...l, product_id: productId, products: { name: productName } } : l)),
    );
    toast.success(`Vinculado a ${productName}`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!header) {
    return (
      <div className="p-6">
        <Button variant="ghost" onClick={() => navigate(-1)} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Volver
        </Button>
        <p className="mt-6 text-sm text-muted-foreground">No se encontró la factura.</p>
      </div>
    );
  }

  const pending = lines.filter((l) => !l.product_id).length;
  const isPdf = header.raw_file_url?.toLowerCase().endsWith(".pdf");

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-semibold">{header.supplier_name || "Factura sin proveedor"}</h1>
            <p className="text-sm text-muted-foreground">
              {header.document_date || header.created_at?.slice(0, 10)}
              {header.document_number ? ` · Folio ${header.document_number}` : ""}
            </p>
          </div>
        </div>
        {pending > 0 && (
          <Badge variant="outline" className="text-amber-600 border-amber-400">
            {pending} por vincular
          </Badge>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total factura</p>
            <p className="text-2xl font-semibold mt-1">
              {header.total_amount ? formatCLP(header.total_amount) : "—"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Neto</p>
            <p className="text-2xl font-semibold mt-1">
              {header.net_subtotal ? formatCLP(header.net_subtotal) : "—"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Productos</p>
            <p className="text-2xl font-semibold mt-1">{lines.length}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-right w-20">Cant.</TableHead>
              <TableHead>Producto en la factura</TableHead>
              <TableHead className="text-right">Valor unitario</TableHead>
              <TableHead className="text-right">Total línea</TableHead>
              <TableHead className="w-[240px]">Catálogo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-10">
                  No se leyeron productos en esta factura.
                </TableCell>
              </TableRow>
            )}
            {lines.map((l) => (
              <TableRow key={l.id}>
                <TableCell className="text-right text-sm font-medium">{l.units_real}</TableCell>
                <TableCell className="text-sm">{l.raw_text || "—"}</TableCell>
                <TableCell className="text-right text-sm">{formatCLP(Math.round(l.cost_unit_net || 0))}</TableCell>
                <TableCell className="text-right text-sm font-medium">
                  {formatCLP(Math.round(l.line_total_net ?? l.units_real * l.cost_unit_net))}
                </TableCell>
                <TableCell>
                  {l.product_id ? (
                    <span className="text-xs text-muted-foreground">{l.products?.name || "Vinculado"}</span>
                  ) : (
                    venue?.id && (
                      <ProductPicker
                        venueId={venue.id}
                        value={null}
                        onSelect={(productId, productName) => productId && linkProduct(l, productId, productName)}
                      />
                    )
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            {isPdf ? <FileText className="h-4 w-4" /> : <ImageIcon className="h-4 w-4" />}
            Documento original
          </div>
          {!fileUrl ? (
            <p className="text-sm text-muted-foreground">No disponible.</p>
          ) : isPdf ? (
            <a href={fileUrl} target="_blank" rel="noreferrer" className="text-sm text-primary underline">
              Abrir PDF
            </a>
          ) : (
            <a href={fileUrl} target="_blank" rel="noreferrer">
              <img
                src={fileUrl}
                alt={`Factura ${header.supplier_name || ""} ${header.document_number || ""}`}
                className="max-h-[520px] w-auto rounded-lg border border-border object-contain"
                loading="lazy"
              />
            </a>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
