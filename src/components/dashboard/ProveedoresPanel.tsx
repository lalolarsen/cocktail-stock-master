import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { purchaseImportsTable, purchasesTable, learningProductMappingsTable } from "@/lib/db-tables";
import { useActiveVenue } from "@/hooks/useActiveVenue";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UploadInvoiceDialog } from "@/components/proveedores/UploadInvoiceDialog";
import { toast } from "sonner";
import { Plus, FileText, Eye, Loader2, AlertCircle } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCLP } from "@/lib/currency";

interface PurchaseImport {
  id: string;
  supplier_name: string | null;
  supplier_rut: string | null;
  document_number: string | null;
  document_date: string | null;
  net_subtotal: number | null;
  vat_amount: number | null;
  total_amount: number | null;
  status: string;
  issues_count: number;
  created_at: string;
}

const STATUS_BADGES: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  UPLOADED: { label: "Subido", variant: "secondary" },
  EXTRACTING: { label: "Extrayendo...", variant: "outline" },
  EXTRACTED: { label: "Extraído", variant: "default" },
  REVIEW: { label: "En revisión", variant: "outline" },
  RECONCILING: { label: "En revisión", variant: "outline" },
  READY_TO_CONFIRM: { label: "Listo", variant: "default" },
  CONFIRMED: { label: "Confirmado", variant: "default" },
  REJECTED: { label: "Rechazado", variant: "destructive" },
};

export function ProveedoresPanel() {
  const { venue } = useActiveVenue();
  const navigate = useNavigate();
  const [imports, setImports] = useState<PurchaseImport[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [warehouseId, setWarehouseId] = useState<string | null>(null);

  const fetchData = async () => {
    if (!venue?.id) return;
    setLoading(true);

    // Get warehouse location
    const { data: loc } = await supabase
      .from("stock_locations")
      .select("id")
      .eq("venue_id", venue.id)
      .eq("type", "warehouse")
      .eq("is_active", true)
      .limit(1)
      .single();

    if (loc) setWarehouseId(loc.id);

    // Get imports
    const { data, error } = await purchaseImportsTable()
      .select("*")
      .eq("venue_id", venue.id)
      .order("created_at", { ascending: false });

    if (!error && data) setImports(data as unknown as PurchaseImport[]);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [venue?.id]);

  const handleCreated = (importId: string) => {
    fetchData();
    // Navigate to detail after brief delay for extraction
    setTimeout(() => navigate(`/admin/proveedores/import/${importId}`), 1500);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!warehouseId) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No se encontró Bodega Principal activa.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Proveedores</h2>
          <p className="text-sm text-muted-foreground">Gestión de facturas y compras</p>
        </div>
        <Button onClick={() => setShowUpload(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Subir factura
        </Button>
      </div>

      <Tabs defaultValue="imports">
        <TabsList>
          <TabsTrigger value="imports">Importaciones</TabsTrigger>
          <TabsTrigger value="history">Historial</TabsTrigger>
          <TabsTrigger value="config">Configuración</TabsTrigger>
        </TabsList>

        <TabsContent value="imports" className="mt-4">
          {imports.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <FileText className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="font-medium">Sin importaciones</p>
                <p className="text-sm text-muted-foreground mt-1">Sube una factura para comenzar</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Proveedor</TableHead>
                    <TableHead>Doc #</TableHead>
                    <TableHead className="text-right">Neto</TableHead>
                    <TableHead className="text-right">IVA</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Obs.</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {imports.map((imp) => {
                    const badge = STATUS_BADGES[imp.status] || { label: imp.status, variant: "secondary" as const };
                    return (
                      <TableRow key={imp.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/admin/proveedores/import/${imp.id}`)}>
                        <TableCell className="text-sm">{imp.document_date || imp.created_at?.slice(0, 10)}</TableCell>
                        <TableCell className="font-medium text-sm">{imp.supplier_name || "—"}</TableCell>
                        <TableCell className="text-sm">{imp.document_number || "—"}</TableCell>
                        <TableCell className="text-right text-sm">{imp.net_subtotal ? formatCLP(imp.net_subtotal) : "—"}</TableCell>
                        <TableCell className="text-right text-sm">{imp.vat_amount ? formatCLP(imp.vat_amount) : "—"}</TableCell>
                        <TableCell className="text-right text-sm font-medium">{imp.total_amount ? formatCLP(imp.total_amount) : "—"}</TableCell>
                        <TableCell>
                          <Badge variant={badge.variant} className="text-[10px]">{badge.label}</Badge>
                        </TableCell>
                        <TableCell>
                          {imp.issues_count > 0 && (
                            <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300">
                              {imp.issues_count}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <HistoryTab venueId={venue?.id} />
        </TabsContent>

        <TabsContent value="config" className="mt-4">
          <LearningTab venueId={venue?.id} />
        </TabsContent>
      </Tabs>

      {warehouseId && (
        <UploadInvoiceDialog
          open={showUpload}
          onOpenChange={setShowUpload}
          warehouseLocationId={warehouseId}
          onCreated={handleCreated}
        />
      )}
    </div>
  );
}

interface PurchaseRow {
  id: string;
  document_date: string | null;
  supplier_name: string | null;
  document_number: string | null;
  net_subtotal: number | null;
  vat_credit: number | null;
  total_amount: number | null;
}

interface MappingRow {
  id: string;
  raw_text: string;
  detected_multiplier: number;
  confidence: number | null;
  times_used: number;
  products: { name: string } | null;
}

function HistoryTab({ venueId }: { venueId?: string }) {
  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!venueId) return;
    purchasesTable()
      .select("*")
      .eq("venue_id", venueId)
      .order("confirmed_at", { ascending: false })
      .then(({ data }) => {
        setPurchases((data ?? []) as unknown as PurchaseRow[]);
        setLoading(false);
      });
  }, [venueId]);

  if (loading) return <div className="py-8 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>;

  if (purchases.length === 0) {
    return (
      <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">
        Sin compras confirmadas aún.
      </CardContent></Card>
    );
  }

  return (
    <Card>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Fecha</TableHead>
            <TableHead>Proveedor</TableHead>
            <TableHead>Doc #</TableHead>
            <TableHead className="text-right">Neto</TableHead>
            <TableHead className="text-right">IVA CF</TableHead>
            <TableHead className="text-right">Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {purchases.map((p) => (
            <TableRow key={p.id}>
              <TableCell>{p.document_date}</TableCell>
              <TableCell>{p.supplier_name || "—"}</TableCell>
              <TableCell>{p.document_number || "—"}</TableCell>
              <TableCell className="text-right">{p.net_subtotal ? formatCLP(p.net_subtotal) : "—"}</TableCell>
              <TableCell className="text-right">{p.vat_credit ? formatCLP(p.vat_credit) : "—"}</TableCell>
              <TableCell className="text-right font-medium">{p.total_amount ? formatCLP(p.total_amount) : "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

function LearningTab({ venueId }: { venueId?: string }) {
  const [mappings, setMappings] = useState<MappingRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!venueId) return;
    learningProductMappingsTable()
      .select("*, products:product_id(name)")
      .eq("venue_id", venueId)
      .order("times_used", { ascending: false })
      .then(({ data }) => {
        setMappings((data ?? []) as unknown as MappingRow[]);
        setLoading(false);
      });
  }, [venueId]);

  if (loading) return <div className="py-8 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>;

  if (mappings.length === 0) {
    return (
      <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">
        Sin datos de aprendizaje. Se generarán al confirmar importaciones.
      </CardContent></Card>
    );
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-sm">Mappings aprendidos</CardTitle></CardHeader>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Texto factura</TableHead>
            <TableHead>Producto</TableHead>
            <TableHead>Mult.</TableHead>
            <TableHead>Confianza</TableHead>
            <TableHead>Usos</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {mappings.map((m) => (
            <TableRow key={m.id}>
              <TableCell className="text-xs max-w-[200px] truncate">{m.raw_text}</TableCell>
              <TableCell className="text-sm">{m.products?.name || "—"}</TableCell>
              <TableCell>{m.detected_multiplier}</TableCell>
              <TableCell>{Math.round((m.confidence || 0) * 100)}%</TableCell>
              <TableCell>{m.times_used}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
