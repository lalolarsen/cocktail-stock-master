import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAppSession } from "@/contexts/AppSessionContext";
import { useActiveVenue } from "@/hooks/useActiveVenue";
import { formatCLP } from "@/lib/currency";
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
  DialogDescription,
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
  Ban,
  Eye,
  Loader2,
  Gift,
  Search,
  CopyPlus,
  Printer,
  History,
  CheckCircle,
  Clock,
  XCircle,
  AlertTriangle,
} from "lucide-react";

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

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: typeof Gift }> = {
  active: { label: "Activo", variant: "default", icon: CheckCircle },
  redeemed: { label: "Canjeado", variant: "secondary", icon: Gift },
  expired: { label: "Expirado", variant: "outline", icon: Clock },
  cancelled: { label: "Cancelado", variant: "destructive", icon: XCircle },
};

const SOCIOS = [
  { key: "socio_md", label: "Socio: Mauricio Duque" },
  { key: "socio_cs", label: "Socio: Carlos Sinning" },
  { key: "rrhh_gh", label: "RRHH: Gabriel Hidalgo" },
];

export default function CourtesyQR() {
  const { user } = useAppSession();
  const { venue } = useActiveVenue();
  const queryClient = useQueryClient();

  const [showCreate, setShowCreate] = useState(false);
  const [showQR, setShowQR] = useState<CourtesyQR | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Create form state
  const [selectedProductId, setSelectedProductId] = useState("");
  const [qty, setQty] = useState(1);
  const [expiryMode, setExpiryMode] = useState<"today" | "custom">("today");
  const [customExpiry, setCustomExpiry] = useState("");
  const [maxUses, setMaxUses] = useState(1);
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
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as CourtesyQR[];
    },
    enabled: !!venue?.id,
  });

  // Fetch redemptions for audit tab
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

  // Fetch profiles for redeemer names
  const redeemerIds = useMemo(() => [...new Set(redemptions.map(r => r.redeemed_by))], [redemptions]);
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
    redeemerProfiles.forEach(p => { map[p.id] = p.full_name || "Sin nombre"; });
    return map;
  }, [redeemerProfiles]);

  // Normalize expired QRs
  const normalizedQRs = useMemo(() => 
    qrs.map(qr => 
      qr.status === "active" && new Date(qr.expires_at) < new Date()
        ? { ...qr, status: "expired" }
        : qr
    ),
  [qrs]);

  // Stats
  const stats = useMemo(() => ({
    active: normalizedQRs.filter(q => q.status === "active").length,
    redeemed: normalizedQRs.filter(q => q.status === "redeemed").length,
    expired: normalizedQRs.filter(q => q.status === "expired").length,
    cancelled: normalizedQRs.filter(q => q.status === "cancelled").length,
    total: normalizedQRs.length,
  }), [normalizedQRs]);

  // Filter
  const filteredQRs = useMemo(() => {
    let result = normalizedQRs;
    if (statusFilter !== "all") result = result.filter(q => q.status === statusFilter);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(qr =>
        qr.product_name.toLowerCase().includes(q) ||
        qr.code.toLowerCase().includes(q) ||
        (qr.note && qr.note.toLowerCase().includes(q))
      );
    }
    return result;
  }, [normalizedQRs, statusFilter, searchQuery]);

  // Redemptions enriched with QR data
  const enrichedRedemptions = useMemo(() => {
    const qrMap: Record<string, CourtesyQR> = {};
    qrs.forEach(q => { qrMap[q.id] = q; });
    return redemptions.map(r => ({
      ...r,
      qr: qrMap[r.courtesy_id],
      redeemerName: profileMap[r.redeemed_by] || "Desconocido",
    }));
  }, [redemptions, qrs, profileMap]);

  const resetForm = () => {
    setSelectedProductId("");
    setQty(1);
    setExpiryMode("today");
    setCustomExpiry("");
    setMaxUses(1);
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

      let expiresAt: string;
      if (expiryMode === "today") {
        const endOfDay = new Date();
        endOfDay.setHours(23, 59, 59, 999);
        expiresAt = endOfDay.toISOString();
      } else {
        if (!customExpiry) { toast.error("Selecciona fecha"); setCreating(false); return; }
        expiresAt = new Date(customExpiry).toISOString();
      }

      const { data, error } = await supabase
        .from("courtesy_qr")
        .insert({
          product_id: selectedProductId,
          product_name: product.name,
          qty,
          expires_at: expiresAt,
          max_uses: maxUses,
          note: note || null,
          created_by: user.id,
          venue_id: venue.id,
        })
        .select()
        .single();

      if (error) throw error;
      toast.success("QR de cortesía creado");
      queryClient.invalidateQueries({ queryKey: ["courtesy-qrs"] });
      setShowCreate(false);
      resetForm();
      setShowQR(data as CourtesyQR);
    } catch (err: any) {
      toast.error(err.message || "Error al crear QR");
    } finally {
      setCreating(false);
    }
  };

  const handleCancel = async (qr: CourtesyQR) => {
    const { error } = await supabase
      .from("courtesy_qr")
      .update({ status: "cancelled" })
      .eq("id", qr.id);
    if (error) toast.error("Error al cancelar");
    else {
      toast.success("QR cancelado");
      queryClient.invalidateQueries({ queryKey: ["courtesy-qrs"] });
    }
  };

  const handleDuplicate = (qr: CourtesyQR) => {
    setSelectedProductId(qr.product_id);
    setQty(qr.qty);
    setMaxUses(qr.max_uses);
    setNote(qr.note || "");
    setExpiryMode("today");
    setShowCreate(true);
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success("Código copiado");
  };

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleString("es-CL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

  const fmtDateFull = (iso: string) =>
    new Date(iso).toLocaleString("es-CL", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

  const handlePrint = (qr: CourtesyQR) => {
    const qrEl = document.getElementById("courtesy-qr-svg");
    const w = window.open("", "_blank", "width=400,height=600");
    if (!w) { toast.error("Popup bloqueado"); return; }
    w.document.write(`
      <html><head><title>QR Cortesía</title>
      <style>
        body { font-family: sans-serif; text-align: center; padding: 20px; }
        .product { font-size: 20px; font-weight: bold; margin: 12px 0 4px; }
        .sub { color: #666; font-size: 14px; }
        .code { font-family: monospace; font-size: 18px; letter-spacing: 2px; background: #f3f3f3; padding: 8px 16px; border-radius: 8px; display: inline-block; margin: 12px 0; }
        .note { font-style: italic; color: #666; font-size: 14px; }
      </style></head><body>
      <div class="product">${qr.product_name}</div>
      <div class="sub">× ${qr.qty} · ${qr.max_uses === 1 ? "1 uso" : `${qr.max_uses} usos`}</div>
      ${qrEl?.outerHTML || ""}
      <div class="code">${qr.code}</div>
      ${qr.note ? `<div class="note">"${qr.note}"</div>` : ""}
      </body></html>
    `);
    w.document.close();
    w.print();
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Gift className="w-6 h-6 text-primary" />
            QR de Cortesía
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Genera, gestiona y audita cortesías
          </p>
        </div>
        <Button onClick={() => { resetForm(); setShowCreate(true); }} size="lg">
          <Plus className="w-4 h-4 mr-2" />
          Crear QR
        </Button>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Activos", value: stats.active, icon: CheckCircle, color: "text-green-500" },
          { label: "Canjeados", value: stats.redeemed, icon: Gift, color: "text-blue-500" },
          { label: "Expirados", value: stats.expired, icon: AlertTriangle, color: "text-amber-500" },
          { label: "Cancelados", value: stats.cancelled, icon: XCircle, color: "text-destructive" },
        ].map(s => (
          <Card key={s.label} className="p-4 flex items-center gap-3">
            <s.icon className={`w-8 h-8 ${s.color} shrink-0`} />
            <div>
              <p className="text-2xl font-bold">{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </div>
          </Card>
        ))}
      </div>

      {/* Tabs: Cortesías + Auditoría */}
      <Tabs defaultValue="qrs" className="space-y-4">
        <TabsList>
          <TabsTrigger value="qrs" className="gap-1.5">
            <QrCode className="w-4 h-4" />
            Cortesías
          </TabsTrigger>
          <TabsTrigger value="audit" className="gap-1.5">
            <History className="w-4 h-4" />
            Historial de Canjes
          </TabsTrigger>
        </TabsList>

        {/* QRs Tab */}
        <TabsContent value="qrs" className="space-y-4">
          {/* Filters */}
          <div className="flex gap-3 items-center flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar producto o código…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {["all", "active", "redeemed", "expired", "cancelled"].map(s => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
                    statusFilter === s
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border/50 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {s === "all" ? "Todos" : STATUS_CONFIG[s]?.label || s}
                </button>
              ))}
            </div>
          </div>

          {/* QR Cards */}
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredQRs.length === 0 ? (
            <Card className="p-12 text-center">
              <Gift className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground font-medium">No hay cortesías</p>
              <p className="text-sm text-muted-foreground/70 mt-1">Crea una para empezar</p>
            </Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filteredQRs.map(qr => {
                const st = STATUS_CONFIG[qr.status] || STATUS_CONFIG.active;
                const isActive = qr.status === "active";
                return (
                  <Card key={qr.id} className={`p-4 space-y-3 transition-all ${isActive ? "border-primary/30" : "opacity-75"}`}>
                    {/* Top row: product + status */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-base truncate">{qr.product_name}</p>
                        <p className="text-sm text-muted-foreground">
                          × {qr.qty} · {qr.used_count}/{qr.max_uses} usos
                        </p>
                      </div>
                      <Badge variant={st.variant} className="shrink-0">{st.label}</Badge>
                    </div>

                    {/* Code */}
                    <div className="flex items-center gap-2">
                      <code className="text-sm bg-muted px-3 py-1.5 rounded-md font-mono tracking-wide flex-1 text-center">
                        {qr.code}
                      </code>
                      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => copyCode(qr.code)}>
                        <Copy className="w-3.5 h-3.5" />
                      </Button>
                    </div>

                    {/* Note */}
                    {qr.note && (
                      <p className="text-xs text-muted-foreground italic truncate">"{qr.note}"</p>
                    )}

                    {/* Meta row */}
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Expira: {fmtDate(qr.expires_at)}</span>
                      <span>Creado: {fmtDate(qr.created_at)}</span>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-1.5">
                      <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={() => setShowQR(qr)}>
                        <Eye className="w-3.5 h-3.5 mr-1" />
                        Ver QR
                      </Button>
                      <Button variant="outline" size="sm" className="text-xs" onClick={() => handleDuplicate(qr)}>
                        <CopyPlus className="w-3.5 h-3.5" />
                      </Button>
                      {isActive && (
                        <Button variant="outline" size="sm" className="text-xs text-destructive hover:text-destructive" onClick={() => handleCancel(qr)}>
                          <Ban className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Audit Tab */}
        <TabsContent value="audit" className="space-y-4">
          {loadingRedemptions ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : enrichedRedemptions.length === 0 ? (
            <Card className="p-12 text-center">
              <History className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground font-medium">Sin canjes registrados</p>
              <p className="text-sm text-muted-foreground/70 mt-1">Los canjes aparecerán aquí automáticamente</p>
            </Card>
          ) : (
            <div className="space-y-2">
              {enrichedRedemptions.map(r => (
                <Card key={r.id} className="p-4 flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                    r.result === "success" ? "bg-green-500/10 text-green-500" : "bg-destructive/10 text-destructive"
                  }`}>
                    {r.result === "success" ? <CheckCircle className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium truncate">
                        {r.qr?.product_name || "Producto eliminado"}
                      </p>
                      {r.qr && (
                        <span className="text-xs text-muted-foreground">× {r.qr.qty}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                      <span>Canjeó: {r.redeemerName}</span>
                      {r.qr?.note && <span>· {r.qr.note}</span>}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-medium">{r.result === "success" ? "Exitoso" : "Fallido"}</p>
                    <p className="text-xs text-muted-foreground">{fmtDateFull(r.redeemed_at)}</p>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gift className="w-5 h-5 text-primary" />
              Crear QR de Cortesía
            </DialogTitle>
            <DialogDescription>
              El producto se entrega gratis. Stock y costo se registran al canjear.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Producto</label>
              <Select value={selectedProductId} onValueChange={setSelectedProductId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar producto…" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {cocktails.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} — {formatCLP(c.price)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Cantidad</label>
                <Input
                  type="number"
                  min={1}
                  max={20}
                  value={qty}
                  onChange={e => setQty(Math.max(1, parseInt(e.target.value) || 1))}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Usos máximos</label>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={maxUses}
                  onChange={e => setMaxUses(Math.max(1, parseInt(e.target.value) || 1))}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Válido hasta</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setExpiryMode("today")}
                  className={`p-2.5 text-sm rounded-md border-2 transition-colors ${
                    expiryMode === "today"
                      ? "border-primary bg-primary/10 text-primary font-medium"
                      : "border-border/50 text-muted-foreground"
                  }`}
                >
                  Solo hoy
                </button>
                <button
                  type="button"
                  onClick={() => setExpiryMode("custom")}
                  className={`p-2.5 text-sm rounded-md border-2 transition-colors ${
                    expiryMode === "custom"
                      ? "border-primary bg-primary/10 text-primary font-medium"
                      : "border-border/50 text-muted-foreground"
                  }`}
                >
                  Personalizado
                </button>
              </div>
              {expiryMode === "custom" && (
                <Input
                  type="datetime-local"
                  value={customExpiry}
                  onChange={e => setCustomExpiry(e.target.value)}
                  className="mt-2"
                />
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Motivo</label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {SOCIOS.map(s => (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => setNote(s.label)}
                    className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${
                      note === s.label
                        ? "border-primary bg-primary/10 text-primary font-medium"
                        : "border-border/50 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <Input
                placeholder="Ej: VIP mesa 3, cumpleaños…"
                value={note}
                onChange={e => setNote(e.target.value)}
              />
            </div>

            <Button onClick={handleCreate} disabled={creating || !selectedProductId} className="w-full" size="lg">
              {creating ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Generando…</>
              ) : (
                <><QrCode className="w-4 h-4 mr-2" />Generar QR</>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* View QR Dialog */}
      <Dialog open={!!showQR} onOpenChange={() => setShowQR(null)}>
        <DialogContent className="max-w-sm text-center">
          <DialogHeader>
            <DialogTitle>QR de Cortesía</DialogTitle>
          </DialogHeader>
          {showQR && (
            <div className="space-y-4 py-4">
              <div className="flex justify-center">
                <div className="bg-white p-4 rounded-xl">
                  <QRCodeSVG
                    id="courtesy-qr-svg"
                    value={`COURTESY:${showQR.code}`}
                    size={200}
                    level="H"
                    includeMargin
                    bgColor="#ffffff"
                    fgColor="#000000"
                  />
                </div>
              </div>
              <div>
                <p className="text-lg font-bold">{showQR.product_name}</p>
                <p className="text-sm text-muted-foreground">
                  × {showQR.qty} · {showQR.max_uses === 1 ? "1 uso" : `${showQR.max_uses} usos`}
                </p>
              </div>
              <code className="block text-lg font-mono tracking-wider bg-muted px-4 py-2 rounded-lg">
                {showQR.code}
              </code>
              {showQR.note && (
                <p className="text-sm text-muted-foreground italic">"{showQR.note}"</p>
              )}
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => copyCode(showQR.code)} className="flex-1">
                  <Copy className="w-4 h-4 mr-2" />
                  Copiar
                </Button>
                <Button onClick={() => handlePrint(showQR)} className="flex-1">
                  <Printer className="w-4 h-4 mr-2" />
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
