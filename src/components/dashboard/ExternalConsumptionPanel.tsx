import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAppSession } from "@/contexts/AppSessionContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, Trash2, Eye, Check, X, Play, FileText, ArrowLeft } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

type Batch = {
  id: string;
  venue_id: string;
  location_id: string;
  period_start: string;
  period_end: string;
  source_type: "cover_manual" | "totem_manual";
  status: "draft" | "confirmed" | "applied" | "cancelled";
  created_by: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  applied_at: string | null;
  notes: string | null;
  created_at: string;
  location_name?: string;
};

type BatchLine = {
  id: string;
  batch_id: string;
  product_id: string | null;
  cocktail_id: string | null;
  quantity: number;
  notes: string | null;
  product_name?: string;
  cocktail_name?: string;
};

type Location = { id: string; name: string };
type Product = { id: string; name: string };
type Cocktail = { id: string; name: string };

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  draft: { label: "Borrador", variant: "secondary" },
  confirmed: { label: "Confirmado", variant: "default" },
  applied: { label: "Aplicado", variant: "outline" },
  cancelled: { label: "Cancelado", variant: "destructive" },
};

const SOURCE_MAP: Record<string, string> = {
  cover_manual: "Covers Manuales",
  totem_manual: "Tótems Manual",
};

export function ExternalConsumptionPanel() {
  const { venue, user } = useAppSession();
  const venueId = venue?.id;
  const [batches, setBatches] = useState<Batch[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [cocktails, setCocktails] = useState<Cocktail[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState<Batch | null>(null);
  const [lines, setLines] = useState<BatchLine[]>([]);
  const [linesLoading, setLinesLoading] = useState(false);

  // Create form
  const [formLocation, setFormLocation] = useState("");
  const [formSource, setFormSource] = useState<"cover_manual" | "totem_manual">("cover_manual");
  const [formStart, setFormStart] = useState("");
  const [formEnd, setFormEnd] = useState("");
  const [formNotes, setFormNotes] = useState("");

  // Add line form
  const [lineType, setLineType] = useState<"product" | "cocktail">("cocktail");
  const [lineItemId, setLineItemId] = useState("");
  const [lineQty, setLineQty] = useState("");
  const [lineNotes, setLineNotes] = useState("");

  useEffect(() => {
    if (!venueId) return;
    loadAll();
  }, [venueId]);

  const loadAll = async () => {
    setLoading(true);
    const [bRes, lRes, pRes, cRes] = await Promise.all([
      supabase.from("external_consumption_batches" as any).select("*").eq("venue_id", venueId).order("created_at", { ascending: false }),
      supabase.from("stock_locations").select("id, name").eq("venue_id", venueId!).eq("is_active", true),
      supabase.from("products").select("id, name").eq("venue_id", venueId!),
      supabase.from("cocktails").select("id, name").eq("venue_id", venueId!),
    ]);
    const locMap = new Map((lRes.data || []).map((l: any) => [l.id, l.name]));
    setBatches(((bRes.data || []) as any[]).map(b => ({ ...b, location_name: locMap.get(b.location_id) || "—" })));
    setLocations((lRes.data || []) as Location[]);
    setProducts((pRes.data || []) as Product[]);
    setCocktails((cRes.data || []) as Cocktail[]);
    setLoading(false);
  };

  const handleCreate = async () => {
    if (!formLocation || !formStart || !formEnd) {
      toast.error("Completa todos los campos obligatorios");
      return;
    }
    const { error } = await supabase.from("external_consumption_batches" as any).insert({
      venue_id: venueId,
      location_id: formLocation,
      period_start: formStart,
      period_end: formEnd,
      source_type: formSource,
      created_by: user?.id,
      notes: formNotes || null,
    } as any);
    if (error) { toast.error("Error al crear lote"); return; }
    toast.success("Lote creado");
    setShowCreate(false);
    setFormLocation(""); setFormStart(""); setFormEnd(""); setFormNotes("");
    loadAll();
  };

  const openDetail = async (batch: Batch) => {
    setSelectedBatch(batch);
    setLinesLoading(true);
    const { data } = await supabase.from("external_consumption_lines" as any).select("*").eq("batch_id", batch.id);
    const enriched = ((data || []) as any[]).map((l: any) => ({
      ...l,
      product_name: products.find(p => p.id === l.product_id)?.name,
      cocktail_name: cocktails.find(c => c.id === l.cocktail_id)?.name,
    }));
    setLines(enriched);
    setLinesLoading(false);
  };

  const addLine = async () => {
    if (!selectedBatch || !lineItemId || !lineQty || Number(lineQty) <= 0) {
      toast.error("Selecciona producto y cantidad válida");
      return;
    }
    const payload: any = {
      batch_id: selectedBatch.id,
      quantity: Number(lineQty),
      notes: lineNotes || null,
    };
    if (lineType === "cocktail") payload.cocktail_id = lineItemId;
    else payload.product_id = lineItemId;

    const { error } = await supabase.from("external_consumption_lines" as any).insert(payload);
    if (error) { toast.error("Error al agregar línea"); return; }
    toast.success("Línea agregada");
    setLineItemId(""); setLineQty(""); setLineNotes("");
    openDetail(selectedBatch);
  };

  const deleteLine = async (lineId: string) => {
    await supabase.from("external_consumption_lines" as any).delete().eq("id", lineId);
    if (selectedBatch) openDetail(selectedBatch);
  };

  const updateBatchStatus = async (batchId: string, status: string, extra: any = {}) => {
    const { error } = await supabase.from("external_consumption_batches" as any)
      .update({ status, updated_at: new Date().toISOString(), ...extra } as any)
      .eq("id", batchId);
    if (error) { toast.error("Error al actualizar estado"); return; }
    toast.success(`Lote ${status === "confirmed" ? "confirmado" : status === "cancelled" ? "cancelado" : "actualizado"}`);
    loadAll();
    if (selectedBatch) setSelectedBatch({ ...selectedBatch, status: status as any, ...extra });
  };

  const applyBatch = async (batchId: string) => {
    const { data, error } = await supabase.rpc("apply_external_consumption_batch", { p_batch_id: batchId } as any);
    if (error) { toast.error(error.message || "Error al aplicar"); return; }
    toast.success(`Lote aplicado: ${(data as any)?.movements_created || 0} movimientos creados`);
    loadAll();
    setSelectedBatch(null);
  };

  // ── Detail View ──
  if (selectedBatch) {
    const b = selectedBatch;
    const isDraft = b.status === "draft";
    const isConfirmed = b.status === "confirmed";
    const badge = STATUS_MAP[b.status];

    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => setSelectedBatch(null)}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Volver
        </Button>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Lote de Consumo Externo</CardTitle>
              <Badge variant={badge.variant}>{badge.label}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div><span className="text-muted-foreground">Ubicación:</span><br />{b.location_name}</div>
              <div><span className="text-muted-foreground">Origen:</span><br />{SOURCE_MAP[b.source_type]}</div>
              <div><span className="text-muted-foreground">Período:</span><br />{b.period_start} — {b.period_end}</div>
              <div><span className="text-muted-foreground">Creado:</span><br />{format(new Date(b.created_at), "dd/MM/yy HH:mm", { locale: es })}</div>
            </div>
            {b.notes && <p className="text-sm text-muted-foreground border-l-2 border-muted pl-3">{b.notes}</p>}

            {/* Lines */}
            <div className="space-y-3">
              <h3 className="font-medium text-sm">Líneas de consumo</h3>
              {linesLoading ? (
                <p className="text-sm text-muted-foreground">Cargando…</p>
              ) : lines.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin líneas aún</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Producto</TableHead>
                      <TableHead className="text-right">Cantidad</TableHead>
                      <TableHead>Notas</TableHead>
                      {isDraft && <TableHead className="w-10" />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map(l => (
                      <TableRow key={l.id}>
                        <TableCell>{l.cocktail_name || l.product_name || "—"}</TableCell>
                        <TableCell className="text-right font-mono">{l.quantity}</TableCell>
                        <TableCell className="text-muted-foreground text-xs">{l.notes || "—"}</TableCell>
                        {isDraft && (
                          <TableCell>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteLine(l.id)}>
                              <Trash2 className="w-3.5 h-3.5 text-destructive" />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}

              {/* Add line (draft only) */}
              {isDraft && (
                <div className="border rounded-lg p-3 space-y-3 bg-muted/30">
                  <h4 className="text-sm font-medium">Agregar línea</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 items-end">
                    <div>
                      <Label className="text-xs">Tipo</Label>
                      <Select value={lineType} onValueChange={(v: any) => { setLineType(v); setLineItemId(""); }}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="cocktail">Carta</SelectItem>
                          <SelectItem value="product">Producto directo</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="sm:col-span-2">
                      <Label className="text-xs">{lineType === "cocktail" ? "Producto de carta" : "Producto"}</Label>
                      <Select value={lineItemId} onValueChange={setLineItemId}>
                        <SelectTrigger><SelectValue placeholder="Seleccionar…" /></SelectTrigger>
                        <SelectContent>
                          {(lineType === "cocktail" ? cocktails : products).map(item => (
                            <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Cantidad</Label>
                      <Input type="number" min={1} value={lineQty} onChange={e => setLineQty(e.target.value)} placeholder="0" />
                    </div>
                    <Button size="sm" onClick={addLine} className="h-9">
                      <Plus className="w-4 h-4 mr-1" /> Agregar
                    </Button>
                  </div>
                  <div>
                    <Label className="text-xs">Notas (opcional)</Label>
                    <Input value={lineNotes} onChange={e => setLineNotes(e.target.value)} placeholder="Ej: conteo manual viernes" />
                  </div>
                </div>
              )}
            </div>

            {/* Summary */}
            <div className="flex items-center justify-between pt-2 border-t">
              <span className="text-sm text-muted-foreground">
                Total: <strong className="text-foreground">{lines.reduce((a, l) => a + l.quantity, 0)}</strong> unidades en {lines.length} líneas
              </span>
              <div className="flex gap-2">
                {isDraft && lines.length > 0 && (
                  <Button size="sm" variant="outline" onClick={() => updateBatchStatus(b.id, "confirmed", { reviewed_by: user?.id, reviewed_at: new Date().toISOString() })}>
                    <Check className="w-4 h-4 mr-1" /> Confirmar
                  </Button>
                )}
                {isDraft && (
                  <Button size="sm" variant="destructive" onClick={() => updateBatchStatus(b.id, "cancelled")}>
                    <X className="w-4 h-4 mr-1" /> Cancelar
                  </Button>
                )}
                {isConfirmed && (
                  <Button size="sm" onClick={() => applyBatch(b.id)}>
                    <Play className="w-4 h-4 mr-1" /> Aplicar descuento
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── List View ──
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Consumo Externo</h2>
          <p className="text-sm text-muted-foreground">Registra y aplica descuentos de inventario por consumos fuera de Stockia</p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4 mr-1" /> Nuevo lote
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : batches.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">No hay lotes registrados</CardContent></Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Período</TableHead>
                <TableHead>Ubicación</TableHead>
                <TableHead>Origen</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Creado</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {batches.map(b => {
                const badge = STATUS_MAP[b.status];
                return (
                  <TableRow key={b.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openDetail(b)}>
                    <TableCell className="font-mono text-xs">{b.period_start} — {b.period_end}</TableCell>
                    <TableCell>{b.location_name}</TableCell>
                    <TableCell>{SOURCE_MAP[b.source_type]}</TableCell>
                    <TableCell><Badge variant={badge.variant}>{badge.label}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{format(new Date(b.created_at), "dd/MM HH:mm", { locale: es })}</TableCell>
                    <TableCell><Eye className="w-4 h-4 text-muted-foreground" /></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nuevo lote de consumo externo</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Ubicación</Label>
              <Select value={formLocation} onValueChange={setFormLocation}>
                <SelectTrigger><SelectValue placeholder="Seleccionar ubicación" /></SelectTrigger>
                <SelectContent>
                  {locations.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Origen</Label>
              <Select value={formSource} onValueChange={(v: any) => setFormSource(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cover_manual">Covers Manuales</SelectItem>
                  <SelectItem value="totem_manual">Tótems Manual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Desde</Label>
                <Input type="date" value={formStart} onChange={e => setFormStart(e.target.value)} />
              </div>
              <div>
                <Label>Hasta</Label>
                <Input type="date" value={formEnd} onChange={e => setFormEnd(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Notas (opcional)</Label>
              <Textarea value={formNotes} onChange={e => setFormNotes(e.target.value)} placeholder="Ej: semana 12, consolidado manual" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancelar</Button>
            <Button onClick={handleCreate}><FileText className="w-4 h-4 mr-1" /> Crear borrador</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
