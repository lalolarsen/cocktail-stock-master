import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Plus, Monitor, Trash2, Edit, Info, ChevronDown, ChevronUp, Search, Store, MapPin, Printer, Loader2, CheckCircle, XCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

interface StockLocation {
  id: string;
  name: string;
  type: "warehouse" | "bar";
  is_active: boolean;
  created_at: string;
}

type POSType = "alcohol_sales" | "ticket_sales" | "bar_redemption";

interface POSTerminal {
  id: string;
  name: string;
  location_id: string | null;
  bar_location_id: string | null;
  auto_redeem: boolean;
  is_active: boolean;
  created_at: string;
  pos_type: POSType;
  is_cash_register: boolean;
  location?: StockLocation | null;
  bar_location?: StockLocation | null;
  auto_print_enabled?: boolean;
  printer_name?: string | null;
}

type FilterKey = "all" | "active" | "inactive" | "cash" | "no_cash" | "alcohol" | "tickets";

const POS_TYPE_LABELS: Record<POSType, string> = {
  alcohol_sales: "Alcohol · Caja",
  ticket_sales: "Tickets · Caja",
  bar_redemption: "Barra · Sin caja",
};

const POS_TYPE_DESCRIPTIONS: Record<POSType, string> = {
  alcohol_sales: "Registra ventas de bar y participa en arqueo.",
  ticket_sales: "Registra entradas y participa en arqueo.",
  bar_redemption: "Solo redime QRs (no maneja efectivo).",
};

const FILTER_CHIPS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "active", label: "Activos" },
  { key: "inactive", label: "Inactivos" },
  { key: "cash", label: "Con caja" },
  { key: "no_cash", label: "Sin caja" },
  { key: "alcohol", label: "Alcohol" },
  { key: "tickets", label: "Tickets" },
];

/* ───── Info Banner ───── */
function InfoBanner() {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="border border-border rounded-lg px-3 py-2 flex items-start gap-2 bg-secondary/30">
      <Info className="w-4 h-4 mt-0.5 shrink-0 text-primary" />
      <div className="flex-1 text-sm text-muted-foreground leading-snug">
        Los terminales POS no requieren ubicación. El inventario se descuenta al redimir el QR en barra.
        {expanded && (
          <span className="block mt-1 text-xs">
            Las ventas generan un QR que el cliente presenta en cualquier barra. Al escanear, se descuenta el inventario de esa barra específica.
          </span>
        )}
      </div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-xs text-primary hover:underline shrink-0 mt-0.5"
      >
        {expanded ? "Ocultar" : "Ver más"}
      </button>
    </div>
  );
}

/* ───── POS Terminal Row ───── */
function TerminalRow({
  terminal,
  onEdit,
  onDelete,
  onToggle,
  onUpdatePrinter,
}: {
  terminal: POSTerminal;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: (active: boolean) => void;
  onUpdatePrinter: (posId: string, field: "auto_print_enabled" | "printer_name", value: any) => Promise<void>;
}) {
  const [showPrint, setShowPrint] = useState(false);
  const [savingPrint, setSavingPrint] = useState(false);

  const handlePrintToggle = async (enabled: boolean) => {
    setSavingPrint(true);
    await onUpdatePrinter(terminal.id, "auto_print_enabled", enabled);
    setSavingPrint(false);
  };

  const handlePrinterName = async (name: string) => {
    if (name === (terminal.printer_name || "")) return;
    setSavingPrint(true);
    await onUpdatePrinter(terminal.id, "printer_name", name || null);
    setSavingPrint(false);
  };

  return (
    <div className="border-b border-border last:border-b-0">
      <div
        className="flex items-center justify-between px-4 py-3 hover:bg-secondary/20 transition-fast cursor-pointer group"
        onClick={(e) => {
          const tag = (e.target as HTMLElement).closest("button, label, [role='switch']");
          if (!tag) onEdit();
        }}
      >
        {/* Left: icon + name + type + hybrid info */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2 rounded-md bg-secondary">
            <Monitor className="w-4 h-4 text-foreground" />
          </div>
          <div className="min-w-0">
            <p className="font-medium text-sm truncate">{terminal.name}</p>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              <Badge
                variant="outline"
                className="text-[10px] font-normal"
              >
                {POS_TYPE_LABELS[terminal.pos_type] ?? terminal.pos_type}
              </Badge>
              {terminal.auto_redeem && (
                <Badge variant="outline" className="text-[10px] font-normal border-amber-500/40 text-amber-600 bg-amber-500/10">
                  Híbrido
                </Badge>
              )}
              {terminal.auto_redeem && terminal.bar_location && (
                <span className="text-[10px] text-muted-foreground">
                  → {terminal.bar_location.name}
                </span>
              )}
              {terminal.auto_print_enabled && (
                <Badge variant="outline" className="text-[10px] font-normal border-primary/40 text-primary bg-primary/10">
                  <Printer className="w-2.5 h-2.5 mr-0.5" />
                  {terminal.printer_name || "QZ"}
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Right: status + toggle + actions */}
        <div className="flex items-center gap-2 shrink-0">
          <Badge
            variant={terminal.is_active ? "default" : "secondary"}
            className={
              terminal.is_active
                ? "bg-primary/15 text-primary border-primary/30 text-[10px]"
                : "text-[10px]"
            }
          >
            {terminal.is_active ? "Activo" : "Inactivo"}
          </Badge>

          <Switch
            checked={terminal.is_active}
            onCheckedChange={onToggle}
            className="data-[state=checked]:bg-primary"
          />

          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            title="Configurar impresora"
            onClick={(e) => { e.stopPropagation(); setShowPrint(!showPrint); }}
          >
            <Printer className="w-3.5 h-3.5" />
          </Button>

          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); onEdit(); }}>
            <Edit className="w-3.5 h-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 hover:text-destructive"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Inline printer config */}
      {showPrint && (
        <div className="px-4 pb-3 pt-1 bg-secondary/10 border-t border-border/50">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Label className="text-xs whitespace-nowrap">Impresión auto (QZ)</Label>
              <Switch
                checked={terminal.auto_print_enabled ?? false}
                onCheckedChange={handlePrintToggle}
                disabled={savingPrint}
                className="data-[state=checked]:bg-primary"
              />
            </div>
            {terminal.auto_print_enabled && (
              <div className="flex items-center gap-2 flex-1 min-w-[180px]">
                <Input
                  placeholder="Nombre impresora (ej: XP-58)"
                  defaultValue={terminal.printer_name || ""}
                  className="text-xs h-8 max-w-[220px]"
                  onBlur={(e) => handlePrinterName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                />
              </div>
            )}
            {savingPrint && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
          </div>
        </div>
      )}
    </div>
  );
}

/* ───── Create / Edit Dialog ───── */
function TerminalDialog({
  open,
  onOpenChange,
  editing,
  terminals,
  barLocations,
  onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: POSTerminal | null;
  terminals: POSTerminal[];
  barLocations: StockLocation[];
  onSave: (data: { name: string; posType: POSType; locationId: string | null; barLocationId: string | null; autoRedeem: boolean; isActive: boolean }) => void;
}) {
  const [name, setName] = useState("");
  const [posType, setPosType] = useState<POSType>("alcohol_sales");
  const [locationId, setLocationId] = useState<string | null>(null);
  const [barLocationId, setBarLocationId] = useState<string | null>(null);
  const [autoRedeem, setAutoRedeem] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (open) {
      if (editing) {
        setName(editing.name);
        setPosType(editing.pos_type || "alcohol_sales");
        setLocationId(editing.location_id || null);
        setBarLocationId(editing.bar_location_id || null);
        setAutoRedeem(editing.auto_redeem || false);
        setIsActive(editing.is_active);
      } else {
        setName("");
        setPosType("alcohol_sales");
        setLocationId(null);
        setBarLocationId(null);
        setAutoRedeem(false);
        setIsActive(true);
      }
      setTouched(false);
    }
  }, [open, editing]);

  const nameError = touched && name.trim().length < 3 ? "Mínimo 3 caracteres." : null;
  const duplicateName =
    touched &&
    name.trim().length >= 3 &&
    terminals.some(
      (t) => t.name.toLowerCase() === name.trim().toLowerCase() && t.id !== editing?.id
    )
      ? "Ya existe un terminal con ese nombre."
      : null;

  const canSave = name.trim().length >= 3 && posType && !(posType === "bar_redemption" && !locationId) && !(autoRedeem && !barLocationId);

  // Show hybrid section for alcohol_sales and ticket_sales (not bar_redemption)
  const showHybridSection = posType !== "bar_redemption";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar terminal POS" : "Nuevo terminal POS"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Section A: Identification */}
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Identificación</Label>
            <div className="space-y-1">
              <Label htmlFor="pos-name">Nombre del terminal</Label>
              <Input
                id="pos-name"
                value={name}
                onChange={(e) => { setName(e.target.value); setTouched(true); }}
                placeholder="Ej: Caja Club / Caja Entrada / Lector Barra Pista"
              />
              <p className="text-[11px] text-muted-foreground">Usa nombres que el equipo reconozca en operación.</p>
              {nameError && <p className="text-[11px] text-destructive">{nameError}</p>}
              {duplicateName && <p className="text-[11px] text-warning">{duplicateName}</p>}
            </div>
          </div>

          {/* Section B: Type */}
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Tipo de terminal</Label>
            <RadioGroup
              value={posType}
              onValueChange={(v) => {
                const val = v as POSType;
                setPosType(val);
                if (val !== "bar_redemption") setLocationId(null);
                if (val === "bar_redemption") { setAutoRedeem(false); setBarLocationId(null); }
              }}
              className="space-y-2"
            >
              {(Object.keys(POS_TYPE_LABELS) as POSType[]).map((key) => (
                <label
                  key={key}
                  className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-fast ${
                    posType === key ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/30"
                  }`}
                >
                  <RadioGroupItem value={key} className="mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">{POS_TYPE_LABELS[key]}</p>
                    <p className="text-[11px] text-muted-foreground">{POS_TYPE_DESCRIPTIONS[key]}</p>
                  </div>
                </label>
              ))}
            </RadioGroup>

            {posType === "bar_redemption" && (
              <div className="space-y-1 pt-1">
                <Label>Ubicación (Barra)</Label>
                <Select value={locationId || ""} onValueChange={(v) => setLocationId(v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona una barra" />
                  </SelectTrigger>
                  <SelectContent>
                    {barLocations.filter((l) => l?.id).map((loc) => (
                      <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">El inventario se descontará de esta ubicación al escanear QR.</p>
              </div>
            )}
          </div>

          {/* Section C: Hybrid mode (only for cashier POS) */}
          {showHybridSection && (
            <div className="space-y-3">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Modo de operación</Label>
              <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                <div>
                  <p className="text-sm font-medium">Modo híbrido (auto-canje al vender)</p>
                  <p className="text-[11px] text-muted-foreground">
                    Descuenta stock automáticamente al confirmar la venta, sin esperar lectura de QR en barra.
                  </p>
                </div>
                <Switch checked={autoRedeem} onCheckedChange={(v) => { setAutoRedeem(v); if (!v) setBarLocationId(null); }} />
              </div>

              {autoRedeem && (
                <div className="space-y-1">
                  <Label>Barra asociada (descuento de stock)</Label>
                  <Select value={barLocationId || ""} onValueChange={(v) => setBarLocationId(v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona una barra" />
                    </SelectTrigger>
                    <SelectContent>
                      {barLocations.filter((l) => l?.id && l.is_active).map((loc) => (
                        <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-amber-600">
                    ⚠ Obligatorio en modo híbrido. El stock se descontará de esta barra al cobrar.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Section D: Estado */}
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Estado</Label>
            <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
              <div>
                <p className="text-sm font-medium">Activo</p>
                <p className="text-[11px] text-muted-foreground">Los terminales inactivos no aparecen para operar.</p>
              </div>
              <Switch checked={isActive} onCheckedChange={setIsActive} />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            disabled={!canSave}
            onClick={() => onSave({ name: name.trim(), posType, locationId, barLocationId, autoRedeem, isActive })}
          >
            {editing ? "Guardar" : "Crear terminal"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ═══════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════ */
export function POSBarsManagement() {
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [terminals, setTerminals] = useState<POSTerminal[]>([]);
  const [loading, setLoading] = useState(true);

  // Dialog states
  const [showLocationDialog, setShowLocationDialog] = useState(false);
  const [showPOSDialog, setShowPOSDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Form states
  const [locationForm, setLocationForm] = useState<{ name: string; type: "bar" | "warehouse" }>({ name: "", type: "bar" });
  const [editingLocation, setEditingLocation] = useState<StockLocation | null>(null);
  const [editingPOS, setEditingPOS] = useState<POSTerminal | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ type: "location" | "pos"; item: StockLocation | POSTerminal } | null>(null);

  // POS list controls
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      const [locResult, posResult] = await Promise.all([
        supabase.from("stock_locations").select("*").order("type", { ascending: false }).order("name"),
        supabase.from("pos_terminals").select("*, location:stock_locations!pos_terminals_location_id_fkey(*), bar_location:stock_locations!pos_terminals_bar_location_id_fkey(*)").order("name"),
      ]);
      if (locResult.error) throw locResult.error;
      if (posResult.error) throw posResult.error;
      setLocations(locResult.data as StockLocation[] || []);
      setTerminals(posResult.data as POSTerminal[] || []);
    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error("Error al cargar datos");
    } finally {
      setLoading(false);
    }
  };

  const barLocations = locations.filter((l) => l.type === "bar");
  const warehouseLocation = locations.find((l) => l.type === "warehouse");

  /* ── Filtered terminals ── */
  const filteredTerminals = useMemo(() => {
    let list = terminals;
    // search
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((t) => t.name.toLowerCase().includes(q));
    }
    // filter chips
    switch (filter) {
      case "active": list = list.filter((t) => t.is_active); break;
      case "inactive": list = list.filter((t) => !t.is_active); break;
      case "cash": list = list.filter((t) => t.is_cash_register); break;
      case "no_cash": list = list.filter((t) => !t.is_cash_register); break;
      case "alcohol": list = list.filter((t) => t.pos_type === "alcohol_sales"); break;
      case "tickets": list = list.filter((t) => t.pos_type === "ticket_sales"); break;
    }
    return list;
  }, [terminals, search, filter]);

  /* ── Printer config handler ── */
  const handleUpdatePrinter = async (posId: string, field: "auto_print_enabled" | "printer_name", value: any) => {
    const { error } = await supabase
      .from("pos_terminals")
      .update({ [field]: value })
      .eq("id", posId);
    if (error) {
      toast.error("Error al guardar config de impresora");
    } else {
      setTerminals((prev) => prev.map((t) => t.id === posId ? { ...t, [field]: value } : t));
      toast.success("Configuración de impresora guardada");
    }
  };

  /* ── Handlers ── */
  const handleSavePOS = async (data: { name: string; posType: POSType; locationId: string | null; barLocationId: string | null; autoRedeem: boolean; isActive: boolean }) => {
    if (data.posType === "bar_redemption" && !data.locationId) {
      toast.error("Los lectores de barra requieren una ubicación asociada");
      return;
    }
    if (data.autoRedeem && !data.barLocationId) {
      toast.error("En modo híbrido debes seleccionar una barra asociada");
      return;
    }
    try {
      const isCashRegister = data.posType !== "bar_redemption";
      const locationId = data.locationId || null;
      const payload = {
        name: data.name,
        location_id: locationId,
        pos_type: data.posType,
        is_cash_register: isCashRegister,
        is_active: data.isActive,
        auto_redeem: data.autoRedeem,
        bar_location_id: data.barLocationId || null,
      };

      if (editingPOS) {
        const { error } = await supabase
          .from("pos_terminals")
          .update(payload)
          .eq("id", editingPOS.id);
        if (error) throw error;
        toast.success("Cambios guardados");
      } else {
        const { error } = await supabase
          .from("pos_terminals")
          .insert(payload);
        if (error) throw error;
        toast.success("Terminal creado");
      }
      setShowPOSDialog(false);
      setEditingPOS(null);
      fetchData();
    } catch (error: any) {
      console.error("Error:", error);
      toast.error(error.message || "Error al guardar terminal");
    }
  };

  const handleToggleActive = async (type: "location" | "pos", id: string, isActive: boolean) => {
    // Optimistic update
    if (type === "pos") {
      setTerminals((prev) => prev.map((t) => (t.id === id ? { ...t, is_active: isActive } : t)));
    }
    try {
      const table = type === "location" ? "stock_locations" : "pos_terminals";
      const { error } = await supabase.from(table).update({ is_active: isActive }).eq("id", id);
      if (error) throw error;
      toast.success(isActive ? "Terminal activado" : "Terminal desactivado");
      fetchData();
    } catch (error: any) {
      console.error("Error:", error);
      toast.error(error.message || "Error al actualizar estado");
      fetchData(); // revert
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const table = deleteTarget.type === "location" ? "stock_locations" : "pos_terminals";
      const { error } = await supabase.from(table).delete().eq("id", deleteTarget.item.id);
      if (error) throw error;
      toast.success("Eliminado correctamente");
      setShowDeleteDialog(false);
      setDeleteTarget(null);
      fetchData();
    } catch (error: any) {
      console.error("Error:", error);
      toast.error("No se puede eliminar: tiene datos asociados. Desactívalo en su lugar.");
      setShowDeleteDialog(false);
    }
  };

  const handleCreateLocation = async () => {
    if (!locationForm.name.trim()) { toast.error("Nombre es requerido"); return; }
    try {
      if (editingLocation) {
        const { error } = await supabase.from("stock_locations").update({ name: locationForm.name }).eq("id", editingLocation.id);
        if (error) throw error;
        toast.success("Ubicación actualizada");
      } else {
        const { error } = await supabase.from("stock_locations").insert({ name: locationForm.name, type: locationForm.type });
        if (error) throw error;
        toast.success("Ubicación creada");
      }
      setShowLocationDialog(false);
      setEditingLocation(null);
      setLocationForm({ name: "", type: "bar" });
      fetchData();
    } catch (error: any) {
      console.error("Error:", error);
      toast.error(error.message || "Error al guardar ubicación");
    }
  };

  const openEditLocation = (loc: StockLocation) => {
    setEditingLocation(loc);
    setLocationForm({ name: loc.name, type: loc.type });
    setShowLocationDialog(true);
  };

  /* ── Render ── */
  if (loading) {
    return (
      <Card className="border border-border">
        <CardHeader><p className="text-lg font-semibold">Barras y Puntos de Venta</p></CardHeader>
        <CardContent className="space-y-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="border border-border">
        <CardContent className="pt-6">
          <Tabs defaultValue="pos" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="pos" className="flex items-center gap-2">
                <Monitor className="w-4 h-4" />
                Terminales POS
              </TabsTrigger>
              <TabsTrigger value="locations" className="flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                Ubicaciones
              </TabsTrigger>
            </TabsList>

            {/* ════ POS TAB ════ */}
            <TabsContent value="pos" className="space-y-4">
              {/* Header */}
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold">Terminales POS</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">Configura cajas y lectores. Las ventas y arqueos dependen de esto.</p>
                </div>
                <Button onClick={() => { setEditingPOS(null); setShowPOSDialog(true); }} className="gap-2 shrink-0">
                  <Plus className="w-4 h-4" />
                  Nuevo terminal
                </Button>
              </div>

              {/* Info banner */}
              <InfoBanner />

              {/* Search + filters */}
              <div className="space-y-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por nombre…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9 h-9"
                  />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {FILTER_CHIPS.map((chip) => (
                    <button
                      key={chip.key}
                      onClick={() => setFilter(chip.key)}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium transition-fast ${
                        filter === chip.key
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Terminal list */}
              {terminals.length === 0 ? (
                <div className="text-center py-12 border border-border rounded-lg">
                  <Monitor className="w-10 h-10 mx-auto mb-3 text-muted-foreground/40" />
                  <p className="font-medium">No hay terminales POS</p>
                  <p className="text-sm text-muted-foreground mt-1">Crea un terminal para empezar a vender.</p>
                  <Button className="mt-4 gap-2" onClick={() => { setEditingPOS(null); setShowPOSDialog(true); }}>
                    <Plus className="w-4 h-4" /> Crear terminal
                  </Button>
                </div>
              ) : filteredTerminals.length === 0 ? (
                <div className="text-center py-10 border border-border rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    Sin resultados para "<span className="text-foreground">{search || filter}</span>"
                  </p>
                  <Button variant="outline" size="sm" className="mt-3" onClick={() => { setSearch(""); setFilter("all"); }}>
                    Limpiar filtros
                  </Button>
                </div>
              ) : (
                <div className="border border-border rounded-lg overflow-hidden divide-y divide-border">
                  {filteredTerminals.map((terminal) => (
                    <TerminalRow
                      key={terminal.id}
                      terminal={terminal}
                      onEdit={() => { setEditingPOS(terminal); setShowPOSDialog(true); }}
                      onDelete={() => { setDeleteTarget({ type: "pos", item: terminal }); setShowDeleteDialog(true); }}
                      onToggle={(active) => handleToggleActive("pos", terminal.id, active)}
                      onUpdatePrinter={handleUpdatePrinter}
                    />
                  ))}
                </div>
              )}
            </TabsContent>

            {/* ════ LOCATIONS TAB ════ */}
            <TabsContent value="locations" className="space-y-4">
              <Alert className="border-primary/20 bg-primary/5">
                <Info className="h-4 w-4" />
                <AlertDescription>
                  Cada <strong>barra</strong> es un punto físico donde se almacena inventario y se redimen QR. La bodega repone a las barras.
                </AlertDescription>
              </Alert>

              <div className="flex justify-end">
                <Button onClick={() => setShowLocationDialog(true)} className="gap-2">
                  <Plus className="w-4 h-4" /> Nueva Barra
                </Button>
              </div>

              {/* Warehouse */}
              {warehouseLocation && (
                <div className="border border-border rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-md bg-secondary">
                        <Store className="w-4 h-4 text-warning" />
                      </div>
                      <div>
                        <p className="font-medium">{warehouseLocation.name}</p>
                        <p className="text-xs text-muted-foreground">Punto de reposición central</p>
                      </div>
                    </div>
                    <Badge variant="outline">Bodega</Badge>
                  </div>
                </div>
              )}

              {/* Bars */}
              <div className="space-y-2">
                {barLocations.map((location) => (
                  <div key={location.id} className="border border-border rounded-lg p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-md bg-secondary">
                        <Store className="w-4 h-4 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">{location.name}</p>
                        <p className="text-xs text-muted-foreground">Punto de inventario y lectura QR</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={location.is_active ? "default" : "secondary"} className={location.is_active ? "bg-primary/15 text-primary border-primary/30 text-[10px]" : "text-[10px]"}>
                        {location.is_active ? "Activo" : "Inactivo"}
                      </Badge>
                      <Switch checked={location.is_active} onCheckedChange={(checked) => handleToggleActive("location", location.id, checked)} />
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEditLocation(location)}>
                        <Edit className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8 hover:text-destructive" onClick={() => { setDeleteTarget({ type: "location", item: location }); setShowDeleteDialog(true); }}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* ── POS Create/Edit Dialog ── */}
      <TerminalDialog
        open={showPOSDialog}
        onOpenChange={setShowPOSDialog}
        editing={editingPOS}
        terminals={terminals}
        barLocations={barLocations}
        onSave={handleSavePOS}
      />

      {/* ── Location Dialog ── */}
      <Dialog open={showLocationDialog} onOpenChange={setShowLocationDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingLocation ? "Editar Ubicación" : "Nueva Ubicación"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="loc-name">Nombre</Label>
              <Input id="loc-name" value={locationForm.name} onChange={(e) => setLocationForm({ ...locationForm, name: e.target.value })} placeholder="Ej: Barra Principal" />
            </div>
            {!editingLocation && (
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select value={locationForm.type} onValueChange={(v) => setLocationForm({ ...locationForm, type: v as "bar" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="bar">Barra</SelectItem></SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Solo se pueden crear ubicaciones tipo Barra</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLocationDialog(false)}>Cancelar</Button>
            <Button onClick={handleCreateLocation}>{editingLocation ? "Guardar" : "Crear"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation ── */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar {deleteTarget?.type === "pos" ? "terminal" : "ubicación"}</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Si este {deleteTarget?.type === "pos" ? "terminal se usó en ventas históricas" : "ubicación tiene datos asociados"}, no se recomienda eliminar. Considera desactivar en su lugar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
