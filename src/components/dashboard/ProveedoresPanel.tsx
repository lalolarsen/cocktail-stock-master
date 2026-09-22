import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { purchaseImportsTable, purchaseImportLinesTable, learningProductMappingsTable } from "@/lib/db-tables";
import { useActiveVenue } from "@/hooks/useActiveVenue";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InvoiceCaptureDialog } from "@/components/proveedores/InvoiceCaptureDialog";
import ProductPicker from "@/components/purchase/ProductPicker";
import { toast } from "sonner";
import { Camera, FileText, Loader2, AlertCircle, ChevronRight, Link2, Search } from "lucide-react";
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
  const [search, setSearch] = useState("");

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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return imports;
    return imports.filter(
      (i) =>
        (i.supplier_name || "").toLowerCase().includes(q) ||
        (i.document_number || "").toLowerCase().includes(q),
    );
  }, [imports, search]);

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

        <TabsContent value="list" className="mt-4 space-y-3">
          {imports.length === 0 ? (
            <Card>
              <CardContent className="py-14 text-center">
                <FileText className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="font-medium">Sin facturas todavía</p>
                <p className="text-sm text-muted-foreground mt-1">Toma una foto de una factura para empezar.</p>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="relative max-w-sm">
                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="h-11 pl-9"
                  placeholder="Buscar por proveedor o folio"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              {filtered.length === 0 ? (
                <Card>
                  <CardContent className="py-10 text-center text-sm text-muted-foreground">
                    Ninguna factura coincide con la búsqueda.
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  {filtered.map((imp) => (
                    <Card
                      key={imp.id}
                      className="cursor-pointer transition-colors hover:border-primary/40"
                      onClick={() => navigate(`/admin/proveedores/import/${imp.id}`)}
                    >
                      <CardContent className="p-4 flex items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium truncate">{imp.supplier_name || "Sin proveedor"}</p>
                          <p className="text-sm text-muted-foreground truncate">
                            {imp.document_date || imp.created_at?.slice(0, 10)}
                            {imp.document_number ? ` · Folio ${imp.document_number}` : ""}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-semibold">{imp.total_amount ? formatCLP(imp.total_amount) : "—"}</p>
                          {imp.issues_count > 0 ? (
                            <span className="text-xs text-amber-600">{imp.issues_count} por vincular</span>
                          ) : (
                            <span className="text-xs text-muted-foreground">Todo vinculado</span>
                          )}
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </>
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
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        {lines.length} producto(s) esperando que elijas el insumo del catálogo.
      </p>
      {lines.map((l) => (
        <Card key={l.id}>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium break-words">{l.raw_text || "—"}</p>
                <p className="text-sm text-muted-foreground">
                  {l.purchase_imports?.supplier_name || "Sin proveedor"} · {l.units_real} ×{" "}
                  {formatCLP(Math.round(l.cost_unit_net || 0))}
                </p>
              </div>
            </div>
            {venueId && (
              <div className="min-w-[240px] max-w-sm">
                <ProductPicker
                  venueId={venueId}
                  value={null}
                  onSelect={(productId) => productId && link(l, productId)}
                />
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
