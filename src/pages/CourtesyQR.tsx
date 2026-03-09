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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  active: { label: "Activo", variant: "default" },
  redeemed: { label: "Canjeado", variant: "secondary" },
  expired: { label: "Expirado", variant: "outline" },
  cancelled: { label: "Cancelado", variant: "destructive" },
};

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

  const SOCIOS = [
    { key: "socio_md", label: "Socio: Mauricio Duque" },
    { key: "socio_gh", label: "Socio: Gabriel Hidalgo" },
    { key: "socio_cs", label: "Socio: Carlos Sinning" },
  ];

  // Fetch cocktails for product selection
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

  // Fetch courtesy QRs
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

  // Filter QRs
  const filteredQRs = useMemo(() => {
    let result = qrs;
    if (statusFilter !== "all") {
      result = result.filter((q) => q.status === statusFilter);
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (qr) =>
          qr.product_name.toLowerCase().includes(q) ||
          qr.code.toLowerCase().includes(q) ||
          (qr.note && qr.note.toLowerCase().includes(q))
      );
    }
    // Mark expired ones visually
    return result.map((qr) => {
      if (qr.status === "active" && new Date(qr.expires_at) < new Date()) {
        return { ...qr, status: "expired" };
      }
      return qr;
    });
  }, [qrs, statusFilter, searchQuery]);

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
      const product = cocktails.find((c) => c.id === selectedProductId);
      if (!product) throw new Error("Producto no encontrado");

      let expiresAt: string;
      if (expiryMode === "today") {
        const endOfDay = new Date();
        endOfDay.setHours(23, 59, 59, 999);
        expiresAt = endOfDay.toISOString();
      } else {
        if (!customExpiry) {
          toast.error("Selecciona fecha de expiración");
          setCreating(false);
          return;
        }
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

    if (error) {
      toast.error("Error al cancelar");
    } else {
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

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString("es-CL", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Gift className="w-6 h-6 text-primary" />
            QR de Cortesía
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Genera QRs para cortesías. Al canjear descuenta stock y registra costo.
          </p>
        </div>
        <Button onClick={() => { resetForm(); setShowCreate(true); }}>
          <Plus className="w-4 h-4 mr-2" />
          Crear QR
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 items-center">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar producto o código…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-1.5">
          {["all", "active", "redeemed", "expired", "cancelled"].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
                statusFilter === s
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border/50 text-muted-foreground hover:text-foreground"
              }`}
            >
              {s === "all" ? "Todos" : STATUS_MAP[s]?.label || s}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : filteredQRs.length === 0 ? (
        <Card className="p-12 text-center">
          <Gift className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-muted-foreground font-medium">No hay QRs de cortesía</p>
          <p className="text-sm text-muted-foreground/70 mt-1">Crea uno para empezar</p>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Producto</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>Código</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Usos</TableHead>
                <TableHead>Expira</TableHead>
                <TableHead>Nota</TableHead>
                <TableHead>Creado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredQRs.map((qr) => {
                const st = STATUS_MAP[qr.status] || STATUS_MAP.active;
                return (
                  <TableRow key={qr.id}>
                    <TableCell className="font-medium">{qr.product_name}</TableCell>
                    <TableCell>{qr.qty}</TableCell>
                    <TableCell>
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
                        {qr.code}
                      </code>
                    </TableCell>
                    <TableCell>
                      <Badge variant={st.variant}>{st.label}</Badge>
                    </TableCell>
                    <TableCell>
                      {qr.used_count}/{qr.max_uses}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(qr.expires_at)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[120px] truncate">
                      {qr.note || "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(qr.created_at)}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setShowQR(qr)}
                          title="Ver QR"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => copyCode(qr.code)}
                          title="Copiar código"
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleDuplicate(qr)}
                          title="Duplicar"
                        >
                          <CopyPlus className="w-4 h-4" />
                        </Button>
                        {qr.status === "active" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => handleCancel(qr)}
                            title="Cancelar"
                          >
                            <Ban className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gift className="w-5 h-5 text-primary" />
              Crear QR de Cortesía
            </DialogTitle>
            <DialogDescription>
              El producto se entregará gratis. Stock y costo se registran al canjear.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            {/* Product selector */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Producto</label>
              <Select value={selectedProductId} onValueChange={setSelectedProductId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar producto…" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {cocktails.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} — {formatCLP(c.price)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Quantity */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Cantidad</label>
              <Input
                type="number"
                min={1}
                max={20}
                value={qty}
                onChange={(e) => setQty(Math.max(1, parseInt(e.target.value) || 1))}
              />
            </div>

            {/* Expiry */}
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
                  onChange={(e) => setCustomExpiry(e.target.value)}
                  className="mt-2"
                />
              )}
            </div>

            {/* Max uses */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Usos máximos</label>
              <Input
                type="number"
                min={1}
                max={100}
                value={maxUses}
                onChange={(e) => setMaxUses(Math.max(1, parseInt(e.target.value) || 1))}
              />
            </div>

            {/* Note / Socio selector */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Motivo / Nota</label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {SOCIOS.map((s) => (
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
                onChange={(e) => setNote(e.target.value)}
              />
            </div>

            <Button
              onClick={handleCreate}
              disabled={creating || !selectedProductId}
              className="w-full"
              size="lg"
            >
              {creating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Generando…
                </>
              ) : (
                <>
                  <QrCode className="w-4 h-4 mr-2" />
                  Generar QR
                </>
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
                    value={`COURTESY:${showQR.code}`}
                    size={220}
                    level="H"
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
              <Button
                variant="outline"
                onClick={() => copyCode(showQR.code)}
                className="w-full"
              >
                <Copy className="w-4 h-4 mr-2" />
                Copiar código
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
