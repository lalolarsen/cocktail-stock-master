import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useActiveVenue } from "@/hooks/useActiveVenue";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Package, Search, Plus, Minus, Send } from "lucide-react";
import { toast } from "sonner";

interface Product {
  id: string;
  name: string;
  unit: string;
  capacity_ml: number | null;
  category: string;
}

interface RequestLine {
  product: Product;
  quantity: number;
}

export interface ReplenishmentRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locationId: string;
  locationName: string;
  onRequestSent?: () => void;
}

export function ReplenishmentRequestDialog({
  open,
  onOpenChange,
  locationId,
  locationName,
  onRequestSent,
}: ReplenishmentRequestDialogProps) {
  const { venue } = useActiveVenue();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState("");
  const [lines, setLines] = useState<RequestLine[]>([]);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open || !venue?.id) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("products")
        .select("id, name, unit, capacity_ml, category")
        .eq("venue_id", venue.id)
        .order("name");
      setProducts((data || []) as Product[]);
      setLoading(false);
    })();
  }, [open, venue?.id]);

  const filtered = useMemo(() => {
    if (!search.trim()) return products;
    const q = search.toLowerCase();
    return products.filter((p) => p.name.toLowerCase().includes(q));
  }, [products, search]);

  const addProduct = (product: Product) => {
    const existing = lines.find((l) => l.product.id === product.id);
    if (existing) {
      setLines(lines.map((l) => l.product.id === product.id ? { ...l, quantity: l.quantity + 1 } : l));
    } else {
      setLines([...lines, { product, quantity: 1 }]);
    }
  };

  const updateQty = (productId: string, delta: number) => {
    setLines((prev) =>
      prev
        .map((l) => l.product.id === productId ? { ...l, quantity: Math.max(0, l.quantity + delta) } : l)
        .filter((l) => l.quantity > 0)
    );
  };

  const handleSubmit = async () => {
    if (lines.length === 0 || !venue?.id) return;
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No autenticado");

      const inserts = lines.map((l) => ({
        venue_id: venue.id,
        location_id: locationId,
        product_id: l.product.id,
        requested_quantity: l.product.capacity_ml
          ? l.quantity * l.product.capacity_ml
          : l.quantity,
        requested_by_user_id: user.id,
        notes: notes || null,
        status: "pending",
      }));

      const { error } = await supabase
        .from("replenishment_requests" as never)
        .insert(inserts as never);
      if (error) throw error;

      toast.success(`Solicitud de reposición enviada (${lines.length} productos)`);
      setLines([]);
      setNotes("");
      setSearch("");
      onOpenChange(false);
      onRequestSent?.();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Error al enviar solicitud");
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    setLines([]);
    setNotes("");
    setSearch("");
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-md max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="w-4 h-4" />
            Solicitar Reposición
          </DialogTitle>
          <DialogDescription>
            Solicitud para <span className="font-semibold">{locationName}</span> — requiere aprobación de administración
          </DialogDescription>
        </DialogHeader>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar producto..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-10"
          />
        </div>

        {/* Product list */}
        <ScrollArea className="flex-1 min-h-0 max-h-48 border rounded-md">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Sin resultados</p>
          ) : (
            <div className="p-1">
              {filtered.map((p) => {
                const inCart = lines.find((l) => l.product.id === p.id);
                return (
                  <button
                    key={p.id}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors ${
                      inCart ? "bg-primary/10" : "hover:bg-muted/50"
                    }`}
                    onClick={() => addProduct(p)}
                  >
                    <div className="text-left min-w-0">
                      <span className="font-medium truncate block">{p.name}</span>
                      <span className="text-xs text-muted-foreground">{p.category}</span>
                    </div>
                    {inCart ? (
                      <Badge variant="secondary" className="shrink-0">{inCart.quantity}</Badge>
                    ) : (
                      <Plus className="w-4 h-4 text-muted-foreground shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>

        {/* Selected items */}
        {lines.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Productos solicitados ({lines.length})
            </p>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {lines.map((l) => (
                <div key={l.product.id} className="flex items-center justify-between bg-muted/30 rounded-md px-3 py-1.5">
                  <span className="text-sm font-medium truncate flex-1 min-w-0">{l.product.name}</span>
                  <div className="flex items-center gap-1 shrink-0 ml-2">
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => updateQty(l.product.id, -1)}>
                      <Minus className="w-3 h-3" />
                    </Button>
                    <span className="text-sm font-semibold w-6 text-center tabular-nums">{l.quantity}</span>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => updateQty(l.product.id, 1)}>
                      <Plus className="w-3 h-3" />
                    </Button>
                    <span className="text-xs text-muted-foreground ml-1">
                      {l.product.capacity_ml ? "bot." : l.product.unit}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Notes */}
        <Textarea
          placeholder="Notas opcionales (ej: urgente, para evento)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="h-16 resize-none"
        />

        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={lines.length === 0 || submitting} className="gap-2">
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Enviar solicitud
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
