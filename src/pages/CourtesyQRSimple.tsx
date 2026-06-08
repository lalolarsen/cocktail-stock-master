import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAppSession } from "@/contexts/AppSessionContext";
import { useActiveVenue } from "@/hooks/useActiveVenue";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
  Printer,
  CheckCircle,
  Search,
  Receipt,
} from "lucide-react";
import { printCourtesyCover } from "@/lib/printing/courtesy-cover";

const SOCIOS = [
  { key: "socio_md", label: "Socio: Mauricio Duque" },
  { key: "socio_cs", label: "Socio: Carlos Sinning" },
  { key: "rrhh_gh", label: "RRHH: Gabriel Hidalgo" },
];

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

export default function CourtesyQRSimple() {
  const { user, activeJornadaId } = useAppSession();
  const { venue } = useActiveVenue();
  const queryClient = useQueryClient();

  const [showCreate, setShowCreate] = useState(false);
  const [lastIssued, setLastIssued] = useState<CourtesyRow | null>(null);

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

  const { data: courtesies = [], isLoading } = useQuery({
    queryKey: ["courtesy-list", venue?.id],
    queryFn: async () => {
      if (!venue?.id) return [];
      const { data, error } = await supabase
        .from("courtesy_qr")
        .select("*")
        .eq("venue_id", venue.id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data || []) as CourtesyRow[];
    },
    enabled: !!venue?.id,
  });

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

      // Crear la cortesía como ya REDIMIDA (el cover físico es la entrega).
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

      // Registrar redemption inmediatamente para que aparezca en reportes/jornada.
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
      queryClient.invalidateQueries({ queryKey: ["courtesy-list"] });
      setShowCreate(false);
      resetForm();
      setLastIssued(row);
      // Auto-imprime cover físico
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Gift className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-bold">Cortesías</h2>
          <Badge variant="outline" className="text-xs">Cover físico</Badge>
        </div>
        <Button size="lg" className="h-12 px-5 text-base gap-2" onClick={() => { resetForm(); setShowCreate(true); }}>
          <Plus className="w-5 h-5" />
          Emitir
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : courtesies.length === 0 ? (
        <div className="text-center py-16">
          <Gift className="w-14 h-14 mx-auto text-muted-foreground/20 mb-3" />
          <p className="text-muted-foreground text-lg font-medium">Sin cortesías</p>
          <p className="text-sm text-muted-foreground/60 mt-1">Toca "Emitir" para imprimir una</p>
        </div>
      ) : (
        <div className="space-y-2">
          {courtesies.map((row) => (
            <div
              key={row.id}
              className="w-full flex items-center gap-3 p-4 rounded-xl border bg-card border-primary/20"
            >
              <Receipt className="w-5 h-5 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold truncate text-base">
                  {row.product_name} <span className="font-normal text-muted-foreground">× {row.qty}</span>
                </p>
                {row.note && (
                  <p className="text-xs text-muted-foreground truncate">{row.note}</p>
                )}
              </div>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => reprint(row)}>
                <Printer className="w-4 h-4" />
                Reimprimir
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Emitir Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-[95vw] sm:max-w-md rounded-2xl">
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
                <Button
                  variant="outline"
                  size="icon"
                  className="h-12 w-12 text-lg rounded-xl"
                  onClick={() => setQty(Math.max(1, qty - 1))}
                  disabled={qty <= 1}
                >
                  −
                </Button>
                <span className="text-3xl font-bold w-12 text-center">{qty}</span>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-12 w-12 text-lg rounded-xl"
                  onClick={() => setQty(Math.min(20, qty + 1))}
                >
                  +
                </Button>
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
        <DialogContent className="max-w-[95vw] sm:max-w-sm rounded-2xl text-center">
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
              <Button
                size="lg"
                variant="outline"
                className="w-full h-12 gap-2 rounded-xl"
                onClick={() => reprint(lastIssued)}
              >
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
