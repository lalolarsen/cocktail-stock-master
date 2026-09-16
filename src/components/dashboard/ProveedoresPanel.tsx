import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { purchaseImportsTable, purchaseImportLinesTable, learningProductMappingsTable } from "@/lib/db-tables";
import { useActiveVenue } from "@/hooks/useActiveVenue";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { InvoiceCaptureDialog } from "@/components/proveedores/InvoiceCaptureDialog";
import ProductPicker from "@/components/purchase/ProductPicker";
import { toast } from "sonner";
import { Camera, FileText, Loader2, AlertCircle, ChevronRight, Link2 } from "lucide-react";
import { formatCLP } from "@/lib/currency";

interface PurchaseImport {
  id: string;
  supplier_name: string | null;
  supplier_rut: string | null;
  document_number: string | null;
  document_date: string | null;
  total_amount: number | null;
  status: string;
  issues_count: number;
  created_at: string;
}

export function ProveedoresPanel() {
  const { venue } = useActiveVenue();
  const navigate = useNavigate();
  const [imports, setImports] = useState<PurchaseImport[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCapture, setShowCapture] = useState(false);
  const [warehouseId, setWarehouseId] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);

  const fetchData = useCallback(async () => {
    if (!venue?.id) return;
    setLoading(true);

    const { data: loc } = await supabase
      .from("stock_locations")
      .select("id")
      .eq("venue_id", venue.id)
      .eq("type", "warehouse")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (loc) setWarehouseId(loc.id);

    const { data } = await purchaseImportsTable()
      .select("*")
      .eq("venue_id", venue.id)
      .order("created_at", { ascending: false });

    const rows = (data ?? []) as unknown as PurchaseImport[];
    setImports(rows);
    setPendingCount(rows.reduce((s, r) => s + (r.issues_count || 0), 0));
    setLoading(false);
  }, [venue?.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!warehouseId) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No se encontró Bodega Principal activa.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Facturas de proveedores</h2>
          <p className="text-sm text-muted-foreground">Registro de compras: cantidad, producto y valor.</p>
        </div>
        <Button size="lg" className="h-12 px-6 gap-2 text-base" onClick={() => setShowCapture(true)}>
          <Camera className="h-5 w-5" />
          Subir factura
        </Button>
      </div>

      <Tabs defaultValue="list">
        <TabsList>
          <TabsTrigger value="list">Historial</TabsTrigger>
          <TabsTrigger value="pending" className="gap-2">
            Por vincular
            {pendingCount > 0 && (
              <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-400">
                {pendingCount}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="mt-4">
          {imports.length === 0 ? (
            <Card>
              <CardContent className="py-14 text-center">
                <FileText className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="font-medium">Sin facturas todavía</p>
                <p className="text-sm text-muted-foreground mt-1">Toma una foto de una factura para empezar.</p>
              </CardContent>
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Proveedor</TableHead>
                    <TableHead>Folio</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Por vincular</TableHead>
                    <TableHead className="w-8"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {imports.map((imp) => (
                    <TableRow
                      key={imp.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => navigate(`/admin/proveedores/import/${imp.id}`)}
                    >
                      <TableCell className="text-sm">{imp.document_date || imp.created_at?.slice(0, 10)}</TableCell>
                      <TableCell className="font-medium text-sm">{imp.supplier_name || "—"}</TableCell>
                      <TableCell className="text-sm">{imp.document_number || "—"}</TableCell>
                      <TableCell className="text-right text-sm font-medium">
                        {imp.total_amount ? formatCLP(imp.total_amount) : "—"}
                      </TableCell>
                      <TableCell>
                        {imp.issues_count > 0 ? (
                          <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-400">
                            {imp.issues_count}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="pending" className="mt-4">
          <PendingLinksTab venueId={venue?.id} onLinked={fetchData} />
        </TabsContent>
      </Tabs>

      {warehouseId && (
        <InvoiceCaptureDialog
          open={showCapture}
          onOpenChange={setShowCapture}
          warehouseLocationId={warehouseId}
          onSaved={fetchData}
        />
      )}
    </div>
  );
}

interface PendingLine {
  id: string;
  raw_text: string;
  supplier_sku: string | null;
  units_real: number;
  cost_unit_net: number;
  purchase_import_id: string;
  purchase_imports?: { supplier_name: string | null; supplier_rut: string | null; document_date: string | null } | null;
}

export function PendingLinksTab({ venueId, onLinked }: { venueId?: string; onLinked?: () => void }) {
  const [lines, setLines] = useState<PendingLine[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!venueId) return;
    setLoading(true);
    const { data } = await purchaseImportLinesTable()
      .select(
        "id, raw_text, supplier_sku, units_real, cost_unit_net, purchase_import_id, purchase_imports!inner(supplier_name, supplier_rut, document_date, venue_id)",
      )
      .is("product_id", null)
      .eq("purchase_imports.venue_id", venueId)
      .order("created_at", { ascending: false })
      .limit(200);
    setLines((data ?? []) as unknown as PendingLine[]);
    setLoading(false);
  }, [venueId]);

  useEffect(() => {
    load();
  }, [load]);

  const link = async (line: PendingLine, productId: string) => {
    if (!venueId) return;
    const { error } = await purchaseImportLinesTable()
      .update({ product_id: productId, status: "OK", notes: "Vinculado manualmente" })
      .eq("id", line.id);

    if (error) {
      toast.error("No se pudo vincular");
      return;
    }

    await learningProductMappingsTable().insert({
      venue_id: venueId,
      product_id: productId,
      raw_text: line.raw_text,
      supplier_rut: line.purchase_imports?.supplier_rut ?? null,
      supplier_sku: line.supplier_sku,
      detected_multiplier: 1,
      confidence: 1,
    });

    const { count } = await purchaseImportLinesTable()
      .select("id", { count: "exact", head: true })
      .eq("purchase_import_id", line.purchase_import_id)
      .is("product_id", null);

    await purchaseImportsTable()
      .update({ issues_count: count ?? 0 })
      .eq("id", line.purchase_import_id);

    toast.success("Producto vinculado");
    setLines((prev) => prev.filter((l) => l.id !== line.id));
    onLinked?.();
  };

  if (loading) {
    return (
      <div className="py-10 text-center">
        <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
      </div>
    );
  }

  if (lines.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Link2 className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
          <p className="font-medium">Todo vinculado</p>
          <p className="text-sm text-muted-foreground mt-1">
            Cada producto de las facturas ya está asociado al catálogo.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Texto en la factura</TableHead>
            <TableHead>Proveedor</TableHead>
            <TableHead className="text-right">Cant.</TableHead>
            <TableHead className="text-right">Valor unit.</TableHead>
            <TableHead className="w-[240px]">Producto del catálogo</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((l) => (
            <TableRow key={l.id}>
              <TableCell className="text-sm max-w-[260px] truncate">{l.raw_text || "—"}</TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {l.purchase_imports?.supplier_name || "—"}
              </TableCell>
              <TableCell className="text-right text-sm">{l.units_real}</TableCell>
              <TableCell className="text-right text-sm">{formatCLP(Math.round(l.cost_unit_net || 0))}</TableCell>
              <TableCell>
                {venueId && (
                  <ProductPicker
                    venueId={venueId}
                    value={null}
                    onSelect={(productId) => productId && link(l, productId)}
                  />
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
