import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAppSession } from "@/contexts/AppSessionContext";
import { useActiveVenue } from "@/hooks/useActiveVenue";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Plus,
  Loader2,
  Gift,
  Search,
  Printer,
  History,
  CheckCircle,
  Download,
  Receipt,
} from "lucide-react";
import { printCourtesyCover } from "@/lib/printing/courtesy-cover";

type CourtesyRow = {
  id: string;
  code: string;
  product_id: string;
  product_name: string;
  qty: number;
  expires_at: string;
  max_uses: number;
  used_count: number;
  status: string;
  note: string | null;
  created_by: string;
  created_at: string;
};

type Redemption = {
  id: string;
  courtesy_id: string;
  redeemed_at: string;
  redeemed_by: string;
  result: string;
  reason: string | null;
  venue_id: string;
  jornada_id: string;
  pos_id: string | null;
  sale_id: string | null;
};

const SOCIOS = [
  { key: "socio_md", label: "Socio: Mauricio Duque" },
  { key: "socio_cs", label: "Socio: Carlos Sinning" },
  { key: "rrhh_gh", label: "RRHH: Gabriel Hidalgo" },
];

export default function CourtesyQR() {
  const { user, hasRole, activeJornadaId } = useAppSession();
  const { venue } = useActiveVenue();
  const queryClient = useQueryClient();
  const isAdmin = hasRole("admin");

  const [showCreate, setShowCreate] = useState(false);
  const [lastIssued, setLastIssued] = useState<CourtesyRow | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Form state
  const [selectedProductId, setSelectedProductId] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState("");
  const [creating, setCreating] = useState(false);

  const { data: cocktails = [] } = useQuery({
    queryKey: ["cocktails-courtesy", venue?.id],
    queryFn: async () => {
      if (!venue?.id) return [];
      const { data } = await supabase
        .from("cocktails")
        .select("id, name, price, category")
        .eq("venue_id", venue.id)
        .order("name");
      return data || [];
    },
    enabled: !!venue?.id,
  });

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["courtesy-list-full", venue?.id],
    queryFn: async () => {
      if (!venue?.id) return [];
      const { data, error } = await supabase
        .from("courtesy_qr")
        .select("*")
        .eq("venue_id", venue.id)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data || []) as CourtesyRow[];
    },
    enabled: !!venue?.id,
  });

  const { data: redemptions = [], isLoading: loadingRedemptions } = useQuery({
    queryKey: ["courtesy-redemptions", venue?.id],
    queryFn: async () => {
      if (!venue?.id) return [];
      const { data, error } = await supabase
        .from("courtesy_redemptions")
        .select("*")
        .eq("venue_id", venue.id)
        .order("redeemed_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data || []) as Redemption[];
    },
    enabled: !!venue?.id,
  });

  const redeemerIds = useMemo(() => [...new Set(redemptions.map((r) => r.redeemed_by))], [redemptions]);
  const { data: redeemerProfiles = [] } = useQuery({
    queryKey: ["redeemer-profiles", redeemerIds],
    queryFn: async () => {
      if (redeemerIds.length === 0) return [];
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", redeemerIds);
      return data || [];
    },
    enabled: redeemerIds.length > 0,
  });

  const profileMap = useMemo(() => {
    const map: Record<string, string> = {};
    redeemerProfiles.forEach((p) => { map[p.id] = p.full_name || "Sin nombre"; });
    return map;
  }, [redeemerProfiles]);

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return rows;
    const q = searchQuery.toLowerCase();
    return rows.filter((r) =>
      r.product_name.toLowerCase().includes(q) ||
      r.code.toLowerCase().includes(q) ||
      (r.note && r.note.toLowerCase().includes(q))
    );
  }, [rows, searchQuery]);

  const enrichedRedemptions = useMemo(() => {
    const map: Record<string, CourtesyRow> = {};
    rows.forEach((r) => { map[r.id] = r; });
    return redemptions.map((r) => ({
      ...r,
      ref: map[r.courtesy_id],
      redeemerName: profileMap[r.redeemed_by] || "Desconocido",
    }));
  }, [redemptions, rows, profileMap]);

  const filteredCocktails = useMemo(() => {
    if (!productSearch.trim()) return cocktails;
    const q = productSearch.toLowerCase();
    return cocktails.filter((c) => c.name.toLowerCase().includes(q));
  }, [cocktails, productSearch]);

  const selectedProduct = cocktails.find((c) => c.id === selectedProductId);

  const resetForm = () => {
    setSelectedProductId("");
    setProductSearch("");
    setQty(1);
    setNote("");
  };

  const handleCreate = async () => {
    if (!selectedProductId || !venue?.id || !user?.id) {
      toast.error("Selecciona un producto");
      return;
    }
    setCreating(true);
    try {
      const product = cocktails.find((c) => c.id === selectedProductId);
      if (!product) throw new Error("Producto no encontrado");

      const endOfDay = new Date();
      endOfDay.setHours(23, 59, 59, 999);

      const { data, error } = await supabase
        .from("courtesy_qr")
        .insert({
          product_id: selectedProductId,
          product_name: product.name,
          qty,
          expires_at: endOfDay.toISOString(),
          max_uses: 1,
          used_count: 1,
          status: "redeemed",
          note: note || null,
          created_by: user.id,
          venue_id: venue.id,
        })
        .select()
        .single();

      if (error) throw error;
      const row = data as CourtesyRow;

      if (activeJornadaId) {
        await supabase.from("courtesy_redemptions").insert({
          courtesy_id: row.id,
          redeemed_by: user.id,
          jornada_id: activeJornadaId,
          venue_id: venue.id,
          result: "success",
          pos_id: null,
        });
      }

      toast.success("Cortesía emitida");
      queryClient.invalidateQueries({ queryKey: ["courtesy-list-full"] });
      queryClient.invalidateQueries({ queryKey: ["courtesy-redemptions"] });
      setShowCreate(false);
      resetForm();
      setLastIssued(row);
      printCourtesyCover({
        productName: row.product_name,
        qty: row.qty,
        code: row.code,
        note: row.note,
        expiresAt: row.expires_at,
        createdAt: row.created_at,
      });
    } catch (err: any) {
      toast.error(err.message || "Error al emitir cortesía");
    } finally {
      setCreating(false);
    }
  };

  const reprint = (row: CourtesyRow) => {
    printCourtesyCover({
      productName: row.product_name,
      qty: row.qty,
      code: row.code,
      note: row.note,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
    });
  };

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleString("es-CL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

  const downloadReport = () => {
    const escape = (s: any) => `"${String(s ?? "").replace(/"/g, '""')}"`;
    const headers = [
      "codigo", "producto", "cantidad", "estado", "motivo", "emitido", "expira", "creado_por",
    ];
    const csvRows = rows.map((r) =>
      [r.code, r.product_name, r.qty, r.status, r.note || "", r.created_at, r.expires_at, r.created_by]
        .map(escape).join(",")
    );
    const csv = "\uFEFF" + headers.map(escape).join(",") + "\n" + csvRows.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cortesias_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Reporte descargado");
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Gift className="w-6 h-6 text-primary" />
            Cortesías
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Emite cover físico de cortesía · sin QR
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Button onClick={downloadReport} variant="outline" size="lg">
              <Download className="w-4 h-4 mr-2" />
              CSV
            </Button>
          )}
          <Button onClick={() => { resetForm(); setShowCreate(true); }} size="lg">
            <Plus className="w-4 h-4 mr-2" />
            Emitir cortesía
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card className="p-4 flex items-center gap-3">
          <Receipt className="w-8 h-8 text-primary shrink-0" />
          <div>
            <p className="text-2xl font-bold">{rows.length}</p>
            <p className="text-xs text-muted-foreground">Total emitidas</p>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-3">
          <Gift className="w-8 h-8 text-blue-500 shrink-0" />
          <div>
            <p className="text-2xl font-bold">{rows.reduce((s, r) => s + (r.qty || 0), 0)}</p>
            <p className="text-xs text-muted-foreground">Unidades</p>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-3">
          <History className="w-8 h-8 text-muted-foreground shrink-0" />
          <div>
            <p className="text-2xl font-bold">{redemptions.length}</p>
            <p className="text-xs text-muted-foreground">Registros</p>
          </div>
        </Card>
      </div>

      <Tabs defaultValue="list" className="space-y-4">
        <TabsList>
          <TabsTrigger value="list" className="gap-1.5">
            <Receipt className="w-4 h-4" />
            Cortesías
          </TabsTrigger>
          <TabsTrigger value="audit" className="gap-1.5">
            <History className="w-4 h-4" />
            Historial
          </TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="space-y-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar producto, código o motivo…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <Card className="p-12 text-center">
              <Gift className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground font-medium">No hay cortesías</p>
              <p className="text-sm text-muted-foreground/70 mt-1">Emite la primera para empezar</p>
            </Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((r) => (
                <Card key={r.id} className="p-4 flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{r.product_name}</p>
                      <p className="text-xs text-muted-foreground">× {r.qty} · {fmtDate(r.created_at)}</p>
                    </div>
                    <Badge variant="secondary" className="text-[10px]">{r.status}</Badge>
                  </div>
                  {r.note && (
                    <p className="text-xs italic text-muted-foreground line-clamp-2">"{r.note}"</p>
                  )}
                  <Button size="sm" variant="outline" className="gap-1.5 mt-1" onClick={() => reprint(r)}>
                    <Printer className="w-4 h-4" />
                    Reimprimir cover
                  </Button>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="audit" className="space-y-2">
          {loadingRedemptions ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : enrichedRedemptions.length === 0 ? (
            <Card className="p-8 text-center">
              <p className="text-sm text-muted-foreground">Sin registros</p>
            </Card>
          ) : (
            <div className="border rounded-lg divide-y">
              {enrichedRedemptions.map((r) => (
                <div key={r.id} className="p-3 flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">
                      {r.ref?.product_name || "—"}{" "}
                      <span className="text-muted-foreground font-normal">× {r.ref?.qty ?? 0}</span>
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {fmtDate(r.redeemed_at)} · {r.redeemerName}
                      {r.ref?.note ? ` · ${r.ref.note}` : ""}
                    </p>
                  </div>
                  <Badge variant={r.result === "success" ? "default" : "destructive"} className="text-[10px]">
                    {r.result}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Emitir Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl flex items-center gap-2">
              <Gift className="w-5 h-5 text-primary" />
              Nueva cortesía
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 mt-1">
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Producto</label>
              {selectedProduct ? (
                <div className="flex items-center gap-2 p-3 rounded-xl border-2 border-primary bg-primary/5">
                  <CheckCircle className="w-5 h-5 text-primary shrink-0" />
                  <span className="font-semibold text-base flex-1">{selectedProduct.name}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs h-8"
                    onClick={() => { setSelectedProductId(""); setProductSearch(""); }}
                  >
                    Cambiar
                  </Button>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar producto…"
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                      className="h-12 text-base pl-10"
                      autoFocus
                    />
                  </div>
                  <div className="max-h-48 overflow-y-auto space-y-1 border rounded-xl p-1">
                    {filteredCocktails.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">Sin resultados</p>
                    ) : (
                      filteredCocktails.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => { setSelectedProductId(c.id); setProductSearch(""); }}
                          className="w-full text-left p-3 rounded-lg hover:bg-accent active:scale-[0.98] transition-all text-base"
                        >
                          <span className="font-medium">{c.name}</span>
                          <span className="text-xs text-muted-foreground ml-2">{c.category}</span>
                        </button>
                      ))
                    )}
                  </div>
                </>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Cantidad</label>
              <div className="flex items-center gap-3">
                <Button variant="outline" size="icon" className="h-12 w-12 text-lg rounded-xl"
                  onClick={() => setQty(Math.max(1, qty - 1))} disabled={qty <= 1}>−</Button>
                <span className="text-3xl font-bold w-12 text-center">{qty}</span>
                <Button variant="outline" size="icon" className="h-12 w-12 text-lg rounded-xl"
                  onClick={() => setQty(Math.min(20, qty + 1))}>+</Button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Motivo</label>
              <div className="grid grid-cols-1 gap-2">
                {SOCIOS.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => setNote(note === s.label ? "" : s.label)}
                    className={`p-3 text-sm rounded-xl border-2 text-left transition-all active:scale-[0.98] ${
                      note === s.label
                        ? "border-primary bg-primary/10 text-primary font-medium"
                        : "border-border/50 text-foreground"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <Input
                placeholder="Otro motivo…"
                value={SOCIOS.some((s) => s.label === note) ? "" : note}
                onChange={(e) => setNote(e.target.value)}
                className="h-12 text-base"
              />
            </div>

            <Button
              onClick={handleCreate}
              disabled={creating || !selectedProductId}
              className="w-full h-14 text-lg gap-2 rounded-xl"
            >
              {creating ? (
                <><Loader2 className="w-5 h-5 animate-spin" />Emitiendo…</>
              ) : (
                <><Printer className="w-5 h-5" />Emitir e imprimir cover</>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmación post-emisión */}
      <Dialog open={!!lastIssued} onOpenChange={() => setLastIssued(null)}>
        <DialogContent className="max-w-sm rounded-2xl text-center">
          <DialogHeader>
            <DialogTitle className="sr-only">Cortesía emitida</DialogTitle>
          </DialogHeader>
          {lastIssued && (
            <div className="space-y-5 py-2">
              <CheckCircle className="w-16 h-16 mx-auto text-primary" />
              <div>
                <p className="text-xl font-bold">{lastIssued.product_name}</p>
                <p className="text-muted-foreground">× {lastIssued.qty}</p>
              </div>
              <p className="text-sm text-muted-foreground">
                Cover físico enviado a impresora. Entrégalo al cliente para canjear en barra.
              </p>
              <Button size="lg" variant="outline" className="w-full h-12 gap-2 rounded-xl"
                onClick={() => reprint(lastIssued)}>
                <Printer className="w-5 h-5" />
                Reimprimir
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
