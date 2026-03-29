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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { QRCodeSVG } from "qrcode.react";
import {
  Plus,
  QrCode,
  Copy,
  Loader2,
  Gift,
  Printer,
  CheckCircle,
  Clock,
  XCircle,
} from "lucide-react";

const SOCIOS = [
  { key: "socio_md", label: "Socio: Mauricio Duque" },
  { key: "socio_cs", label: "Socio: Carlos Sinning" },
  { key: "rrhh_gh", label: "RRHH: Gabriel Hidalgo" },
];

const STATUS_BADGE: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  active: { label: "Activo", variant: "default" },
  redeemed: { label: "Canjeado", variant: "secondary" },
  expired: { label: "Expirado", variant: "outline" },
  cancelled: { label: "Cancelado", variant: "destructive" },
};

type CourtesyQR = {
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
  const { user } = useAppSession();
  const { venue } = useActiveVenue();
  const queryClient = useQueryClient();

  const [showCreate, setShowCreate] = useState(false);
  const [showQR, setShowQR] = useState<CourtesyQR | null>(null);

  // Create form
  const [selectedProductId, setSelectedProductId] = useState("");
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

  const { data: qrs = [], isLoading } = useQuery({
    queryKey: ["courtesy-qrs", venue?.id],
    queryFn: async () => {
      if (!venue?.id) return [];
      const { data, error } = await supabase
        .from("courtesy_qr")
        .select("*")
        .eq("venue_id", venue.id)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data || []) as CourtesyQR[];
    },
    enabled: !!venue?.id,
  });

  // Only show today's active + recent
  const todayQRs = useMemo(() => {
    const now = new Date();
    return qrs.map(qr =>
      qr.status === "active" && new Date(qr.expires_at) < now
        ? { ...qr, status: "expired" }
        : qr
    ).filter(qr => {
      // Show active first, then recent canjeados
      if (qr.status === "active") return true;
      // Show last 10 non-active
      return true;
    }).slice(0, 15);
  }, [qrs]);

  const activeCount = todayQRs.filter(q => q.status === "active").length;

  const resetForm = () => {
    setSelectedProductId("");
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
      const product = cocktails.find(c => c.id === selectedProductId);
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
          note: note || null,
          created_by: user.id,
          venue_id: venue.id,
        })
        .select()
        .single();

      if (error) throw error;
      toast.success("QR creado");
      queryClient.invalidateQueries({ queryKey: ["courtesy-qrs"] });
      setShowCreate(false);
      resetForm();
      setShowQR(data as CourtesyQR);
    } catch (err: any) {
      toast.error(err.message || "Error al crear");
    } finally {
      setCreating(false);
    }
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success("Código copiado");
  };

  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleString("es-CL", { hour: "2-digit", minute: "2-digit" });

  const handlePrint = (qr: CourtesyQR) => {
    const qrEl = document.getElementById("courtesy-qr-svg-simple");
    const w = window.open("", "_blank", "width=400,height=600");
    if (!w) { toast.error("Popup bloqueado"); return; }
    w.document.write(`
      <html><head><title>QR</title>
      <style>
        body { font-family: -apple-system, sans-serif; text-align: center; padding: 24px; }
        .name { font-size: 22px; font-weight: 700; margin: 16px 0 4px; }
        .sub { color: #888; font-size: 15px; }
        .code { font-family: monospace; font-size: 20px; letter-spacing: 3px; background: #f0f0f0; padding: 10px 20px; border-radius: 10px; display: inline-block; margin: 14px 0; }
        .note { font-style: italic; color: #888; font-size: 14px; }
      </style></head><body>
      <div class="name">${qr.product_name}</div>
      <div class="sub">× ${qr.qty}</div>
      ${qrEl?.outerHTML || ""}
      <div class="code">${qr.code}</div>
      ${qr.note ? `<div class="note">${qr.note}</div>` : ""}
      </body></html>
    `);
    w.document.close();
    w.print();
  };

  const statusIcon = (s: string) => {
    if (s === "active") return <CheckCircle className="w-4 h-4 text-green-500" />;
    if (s === "expired") return <Clock className="w-4 h-4 text-amber-500" />;
    return <XCircle className="w-4 h-4 text-muted-foreground" />;
  };

  return (
    <div className="space-y-4">
      {/* Compact header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Gift className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-bold">Cortesías</h2>
          {activeCount > 0 && (
            <Badge variant="default" className="text-xs">{activeCount} activos</Badge>
          )}
        </div>
        <Button size="lg" className="h-12 px-5 text-base gap-2" onClick={() => { resetForm(); setShowCreate(true); }}>
          <Plus className="w-5 h-5" />
          Crear
        </Button>
      </div>

      {/* Simple list */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : todayQRs.length === 0 ? (
        <div className="text-center py-16">
          <Gift className="w-14 h-14 mx-auto text-muted-foreground/20 mb-3" />
          <p className="text-muted-foreground text-lg font-medium">Sin cortesías</p>
          <p className="text-sm text-muted-foreground/60 mt-1">Toca "Crear" para generar una</p>
        </div>
      ) : (
        <div className="space-y-2">
          {todayQRs.map(qr => {
            const isActive = qr.status === "active";
            const badge = STATUS_BADGE[qr.status] || STATUS_BADGE.active;
            return (
              <button
                key={qr.id}
                onClick={() => isActive ? setShowQR(qr) : undefined}
                disabled={!isActive}
                className={`w-full text-left flex items-center gap-3 p-4 rounded-xl border transition-all active:scale-[0.98] ${
                  isActive
                    ? "bg-card border-primary/30 shadow-sm"
                    : "bg-muted/30 border-border/30 opacity-60"
                }`}
              >
                {statusIcon(qr.status)}
                <div className="flex-1 min-w-0">
                  <p className={`font-semibold truncate ${isActive ? "text-base" : "text-sm"}`}>
                    {qr.product_name} <span className="font-normal text-muted-foreground">× {qr.qty}</span>
                  </p>
                  {qr.note && (
                    <p className="text-xs text-muted-foreground truncate">{qr.note}</p>
                  )}
                </div>
                <div className="shrink-0 flex items-center gap-2">
                  <Badge variant={badge.variant} className="text-[11px]">{badge.label}</Badge>
                  {isActive && <QrCode className="w-5 h-5 text-primary" />}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Simplified Create Dialog - Mobile optimized */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-[95vw] sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl flex items-center gap-2">
              <Gift className="w-5 h-5 text-primary" />
              Nueva Cortesía
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 mt-1">
            {/* Product selector - big touch targets */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Producto</label>
              <Select value={selectedProductId} onValueChange={setSelectedProductId}>
                <SelectTrigger className="h-12 text-base">
                  <SelectValue placeholder="Seleccionar…" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {cocktails.map(c => (
                    <SelectItem key={c.id} value={c.id} className="text-base py-3">
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Quantity - big stepper */}
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

            {/* Quick note presets */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Motivo</label>
              <div className="grid grid-cols-1 gap-2">
                {SOCIOS.map(s => (
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
                value={SOCIOS.some(s => s.label === note) ? "" : note}
                onChange={e => setNote(e.target.value)}
                className="h-12 text-base"
              />
            </div>

            <Button
              onClick={handleCreate}
              disabled={creating || !selectedProductId}
              className="w-full h-14 text-lg gap-2 rounded-xl"
            >
              {creating ? (
                <><Loader2 className="w-5 h-5 animate-spin" />Generando…</>
              ) : (
                <><QrCode className="w-5 h-5" />Generar QR</>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* View QR Dialog - big for mobile */}
      <Dialog open={!!showQR} onOpenChange={() => setShowQR(null)}>
        <DialogContent className="max-w-[95vw] sm:max-w-sm rounded-2xl text-center">
          <DialogHeader>
            <DialogTitle className="sr-only">QR</DialogTitle>
          </DialogHeader>
          {showQR && (
            <div className="space-y-5 py-2">
              <div className="flex justify-center">
                <div className="bg-white p-5 rounded-2xl shadow-sm">
                  <QRCodeSVG
                    id="courtesy-qr-svg-simple"
                    value={`COURTESY:${showQR.code}`}
                    size={220}
                    level="H"
                    includeMargin
                    bgColor="#ffffff"
                    fgColor="#000000"
                  />
                </div>
              </div>
              <div>
                <p className="text-xl font-bold">{showQR.product_name}</p>
                <p className="text-muted-foreground">× {showQR.qty}</p>
              </div>
              <code className="block text-2xl font-mono tracking-[0.2em] bg-muted px-5 py-3 rounded-xl">
                {showQR.code}
              </code>
              {showQR.note && (
                <p className="text-sm text-muted-foreground italic">"{showQR.note}"</p>
              )}
              <div className="grid grid-cols-2 gap-3">
                <Button variant="outline" size="lg" className="h-14 text-base gap-2 rounded-xl" onClick={() => copyCode(showQR.code)}>
                  <Copy className="w-5 h-5" />
                  Copiar
                </Button>
                <Button size="lg" className="h-14 text-base gap-2 rounded-xl" onClick={() => handlePrint(showQR)}>
                  <Printer className="w-5 h-5" />
                  Imprimir
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
