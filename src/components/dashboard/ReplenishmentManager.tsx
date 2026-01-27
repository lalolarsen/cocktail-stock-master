import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  ArrowRight,
  Package,
  Upload,
  Plus,
  Trash2,
  FileSpreadsheet,
  History,
  Check,
  AlertCircle,
  CalendarIcon,
  ClipboardList,
  Eye,
  Play,
  Download,
  AlertTriangle,
  CheckCircle2,
  XCircle,
} from "lucide-react";
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import * as XLSX from "xlsx";

interface StockLocation {
  id: string;
  name: string;
  is_active?: boolean;
  type: "warehouse" | "bar";
}

interface Product {
  id: string;
  name: string;
  code: string;
  category: string;
  unit: string;
}

interface Jornada {
  id: string;
  numero_jornada: number;
  fecha: string;
  estado: string;
}

interface StockBalance {
  product_id: string;
  location_id: string;
  quantity: number;
}

interface PlanItem {
  id?: string;
  to_location_id: string;
  product_id: string;
  quantity: number;
  bar_name?: string;
  product_name?: string;
  product_unit?: string;
}

interface ReplenishmentPlan {
  id: string;
  jornada_id: string | null;
  plan_date: string;
  name: string;
  status: "draft" | "applied" | "cancelled";
  created_by: string;
  applied_at: string | null;
  created_at: string;
  items?: Array<{
    id: string;
    to_location_id: string;
    product_id: string;
    quantity: number;
    location?: { name: string };
    product?: { name: string; unit: string };
  }>;
  jornada?: { numero_jornada: number; fecha: string };
}

interface ImportRow {
  bar_name: string;
  product_code?: string;
  product_name?: string;
  quantity: number;
  valid: boolean;
  error?: string;
  product_id?: string;
  bar_id?: string;
}

interface InsufficientItem {
  product_id: string;
  product_name: string;
  required: number;
  available: number;
  missing: number;
}

export function ReplenishmentManager() {
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [balances, setBalances] = useState<StockBalance[]>([]);
  const [jornadas, setJornadas] = useState<Jornada[]>([]);
  const [plans, setPlans] = useState<ReplenishmentPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // New plan state
  const [planName, setPlanName] = useState("");
  const [selectedJornadaId, setSelectedJornadaId] = useState<string>("");
  const [planDate, setPlanDate] = useState<Date>(new Date());
  const [planItems, setPlanItems] = useState<PlanItem[]>([]);

  // Preview state
  const [showPreviewDialog, setShowPreviewDialog] = useState(false);
  const [previewGrouped, setPreviewGrouped] = useState<Record<string, PlanItem[]>>({});
  const [insufficientItems, setInsufficientItems] = useState<InsufficientItem[]>([]);

  // Import state
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importData, setImportData] = useState<ImportRow[]>([]);
  const [importFile, setImportFile] = useState<File | null>(null);

  // View plan state
  const [selectedPlan, setSelectedPlan] = useState<ReplenishmentPlan | null>(null);
  const [showPlanDetails, setShowPlanDetails] = useState(false);

  const warehouseId = locations.find((l) => l.type === "warehouse")?.id;
  const barLocations = locations.filter((l) => l.type === "bar" && l.is_active !== false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [locResult, prodResult, balResult, jorResult, plansResult] = await Promise.all([
        supabase.from("stock_locations").select("*").order("type", { ascending: false }).order("name"),
        supabase.from("products").select("*").order("name"),
        supabase.from("stock_balances").select("*"),
        supabase.from("jornadas").select("*").order("fecha", { ascending: false }).limit(20),
        supabase
          .from("replenishment_plans")
          .select(`
            *,
            jornada:jornadas(numero_jornada, fecha),
            items:replenishment_plan_items(
              id,
              to_location_id,
              product_id,
              quantity,
              location:stock_locations(name),
              product:products(name, unit)
            )
          `)
          .order("created_at", { ascending: false })
          .limit(50),
      ]);

      if (locResult.error) throw locResult.error;
      if (prodResult.error) throw prodResult.error;
      if (balResult.error) throw balResult.error;
      if (jorResult.error) throw jorResult.error;
      if (plansResult.error) throw plansResult.error;

      setLocations(locResult.data as StockLocation[] || []);
      setProducts(prodResult.data || []);
      setBalances(balResult.data || []);
      setJornadas(jorResult.data || []);
      setPlans(plansResult.data as unknown as ReplenishmentPlan[] || []);
    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error("Error al cargar datos");
    } finally {
      setLoading(false);
    }
  };

  const getWarehouseBalance = (productId: string): number => {
    if (!warehouseId) return 0;
    const balance = balances.find((b) => b.product_id === productId && b.location_id === warehouseId);
    return balance?.quantity || 0;
  };

  const addItem = () => {
    setPlanItems([...planItems, { to_location_id: "", product_id: "", quantity: 0 }]);
  };

  const removeItem = (index: number) => {
    setPlanItems(planItems.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: keyof PlanItem, value: string | number) => {
    const updated = [...planItems];
    if (field === "to_location_id") {
      updated[index].to_location_id = value as string;
      updated[index].bar_name = barLocations.find((b) => b.id === value)?.name;
    } else if (field === "product_id") {
      updated[index].product_id = value as string;
      const product = products.find((p) => p.id === value);
      updated[index].product_name = product?.name;
      updated[index].product_unit = product?.unit;
    } else if (field === "quantity") {
      updated[index].quantity = Number(value);
    }
    setPlanItems(updated);
  };

  const calculateWarehouseSufficiency = (): { grouped: Record<string, PlanItem[]>; insufficient: InsufficientItem[] } => {
    // Group items by bar
    const grouped: Record<string, PlanItem[]> = {};
    for (const item of planItems) {
      if (!item.to_location_id || !item.product_id || item.quantity <= 0) continue;
      const barName = barLocations.find((b) => b.id === item.to_location_id)?.name || "Desconocido";
      if (!grouped[barName]) grouped[barName] = [];
      grouped[barName].push({
        ...item,
        bar_name: barName,
        product_name: products.find((p) => p.id === item.product_id)?.name,
        product_unit: products.find((p) => p.id === item.product_id)?.unit,
      });
    }

    // Calculate total per product
    const productTotals: Record<string, number> = {};
    for (const item of planItems) {
      if (!item.product_id || item.quantity <= 0) continue;
      productTotals[item.product_id] = (productTotals[item.product_id] || 0) + item.quantity;
    }

    // Check sufficiency
    const insufficient: InsufficientItem[] = [];
    for (const [productId, required] of Object.entries(productTotals)) {
      const available = getWarehouseBalance(productId);
      if (available < required) {
        const product = products.find((p) => p.id === productId);
        insufficient.push({
          product_id: productId,
          product_name: product?.name || "Producto desconocido",
          required,
          available,
          missing: required - available,
        });
      }
    }

    return { grouped, insufficient };
  };

  const handlePreview = () => {
    const validItems = planItems.filter((item) => item.to_location_id && item.product_id && item.quantity > 0);
    if (validItems.length === 0) {
      toast.error("Agrega al menos un producto válido");
      return;
    }

    const { grouped, insufficient } = calculateWarehouseSufficiency();
    setPreviewGrouped(grouped);
    setInsufficientItems(insufficient);
    setShowPreviewDialog(true);
  };

  const handleCreatePlan = async () => {
    const validItems = planItems.filter((item) => item.to_location_id && item.product_id && item.quantity > 0);
    if (validItems.length === 0) {
      toast.error("Agrega al menos un producto válido");
      return;
    }

    const name = planName || `Reposición ${format(planDate, "dd/MM/yyyy")}`;

    setSubmitting(true);
    try {
      // Get venue_id from user profile
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await supabase
        .from("profiles")
        .select("venue_id")
        .eq("id", user!.id)
        .single();
      
      const venueId = profile?.venue_id;
      if (!venueId) throw new Error("No venue assigned");

      // Create plan
      const { data: planData, error: planError } = await supabase
        .from("replenishment_plans")
        .insert({
          name,
          jornada_id: selectedJornadaId || null,
          plan_date: format(planDate, "yyyy-MM-dd"),
          status: "draft",
          created_by: user?.id,
          venue_id: venueId,
        })
        .select()
        .single();

      if (planError) throw planError;

      // Insert items
      const items = validItems.map((item) => ({
        replenishment_plan_id: planData.id,
        to_location_id: item.to_location_id,
        product_id: item.product_id,
        quantity: item.quantity,
        venue_id: venueId,
      }));

      const { error: itemsError } = await supabase.from("replenishment_plan_items").insert(items);

      if (itemsError) throw itemsError;

      toast.success("Plan de reposición creado");
      setPlanItems([]);
      setPlanName("");
      setSelectedJornadaId("");
      setShowPreviewDialog(false);
      fetchData();
    } catch (error: any) {
      console.error("Error creating plan:", error);
      toast.error(error.message || "Error al crear plan");
    } finally {
      setSubmitting(false);
    }
  };

  const handleApplyPlan = async (planId: string) => {
    setSubmitting(true);
    try {
      const { data, error } = await supabase.rpc("apply_replenishment_plan", {
        p_plan_id: planId,
      });

      if (error) throw error;

      const result = data as unknown as { success: boolean; error?: string; insufficient_items?: InsufficientItem[]; items_moved?: number; bars_affected?: number };

      if (!result.success) {
        if (result.insufficient_items && result.insufficient_items.length > 0) {
          toast.error(
            <div>
              <p className="font-semibold mb-2">Stock insuficiente en bodega:</p>
              <ul className="text-sm space-y-1">
                {result.insufficient_items.map((item, i) => (
                  <li key={i}>
                    {item.product_name}: falta {item.missing} (disponible: {item.available})
                  </li>
                ))}
              </ul>
            </div>,
            { duration: 8000 }
          );
        } else {
          throw new Error(result.error || "Error al aplicar plan");
        }
        return;
      }

      toast.success(`Plan aplicado: ${result.items_moved} items movidos a ${result.bars_affected} barras`);
      setShowPlanDetails(false);
      fetchData();
    } catch (error: any) {
      console.error("Apply plan error:", error);
      toast.error(error.message || "Error al aplicar plan");
    } finally {
      setSubmitting(false);
    }
  };

  // Import functions
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImportFile(file);
      parseExcelFile(file);
    }
  };

  const parseExcelFile = async (file: File) => {
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet) as Array<{
        bar_name?: string;
        barra?: string;
        product_code?: string;
        codigo?: string;
        product_name?: string;
        producto?: string;
        quantity?: number;
        cantidad?: number;
      }>;

      const parsed: ImportRow[] = jsonData.map((row) => {
        const barName = row.bar_name || row.barra || "";
        const productCode = row.product_code || row.codigo || "";
        const productName = row.product_name || row.producto || "";
        const quantity = Number(row.quantity || row.cantidad || 0);

        const bar = barLocations.find((l) => l.name.toLowerCase() === barName.toLowerCase());
        const product = products.find(
          (p) => p.code.toLowerCase() === productCode.toLowerCase() || p.name.toLowerCase() === productName.toLowerCase()
        );

        let valid = true;
        let error = "";

        if (!bar) {
          valid = false;
          error = `Barra "${barName}" no encontrada`;
        } else if (!product) {
          valid = false;
          error = `Producto "${productCode || productName}" no encontrado`;
        } else if (quantity <= 0) {
          valid = false;
          error = "Cantidad debe ser mayor a 0";
        }

        return {
          bar_name: barName,
          product_code: productCode,
          product_name: productName,
          quantity,
          valid,
          error,
          product_id: product?.id,
          bar_id: bar?.id,
        };
      });

      setImportData(parsed);
    } catch (error) {
      console.error("Error parsing file:", error);
      toast.error("Error al leer el archivo");
    }
  };

  const handleImportConfirm = async () => {
    const validRows = importData.filter((row) => row.valid);
    if (validRows.length === 0) {
      toast.error("No hay filas válidas para importar");
      return;
    }

    // Convert to plan items
    const items: PlanItem[] = validRows.map((row) => ({
      to_location_id: row.bar_id!,
      product_id: row.product_id!,
      quantity: row.quantity,
      bar_name: row.bar_name,
      product_name: row.product_name || row.product_code,
    }));

    setPlanItems(items);
    setPlanName(`Importación ${importFile?.name || format(new Date(), "dd/MM/yyyy")}`);
    setShowImportDialog(false);
    setImportData([]);
    setImportFile(null);
    toast.success(`${validRows.length} items cargados. Revisa y guarda el plan.`);
  };

  const downloadTemplate = () => {
    const templateData = [
      { barra: "Barra 1", codigo: "PROD-0001", cantidad: 100 },
      { barra: "Barra 2", codigo: "PROD-0002", cantidad: 50 },
    ];

    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Reposición");
    XLSX.writeFile(wb, "plantilla_reposicion.xlsx");
  };

  const exportPlanToCSV = (plan: ReplenishmentPlan) => {
    if (!plan.items) return;

    const data = plan.items.map((item) => ({
      Barra: item.location?.name || "",
      Producto: item.product?.name || "",
      Cantidad: item.quantity,
      Unidad: item.product?.unit || "",
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Reposición");
    XLSX.writeFile(wb, `reposicion_${plan.name.replace(/\s/g, "_")}.xlsx`);
  };

  const viewPlanDetails = (plan: ReplenishmentPlan) => {
    setSelectedPlan(plan);
    setShowPlanDetails(true);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "draft":
        return <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30">Borrador</Badge>;
      case "applied":
        return <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30">Aplicado</Badge>;
      case "cancelled":
        return <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500/30">Cancelado</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <Card className="glass-effect">
        <CardHeader>
          <CardTitle>Planificación de Reposición</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="glass-effect shadow-elegant">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-2xl bg-gradient-to-r from-primary to-primary-glow bg-clip-text text-transparent">
              Planificación de Reposición
            </CardTitle>
            <CardDescription>Planifica y ejecuta transferencias de bodega a barras por jornada</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={downloadTemplate} className="gap-2">
              <Download className="w-4 h-4" />
              Plantilla
            </Button>
            <Button variant="outline" onClick={() => setShowImportDialog(true)} className="gap-2">
              <Upload className="w-4 h-4" />
              Importar Excel
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="new-plan" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="new-plan" className="flex items-center gap-2">
                <ClipboardList className="w-4 h-4" />
                Nuevo Plan
              </TabsTrigger>
              <TabsTrigger value="history" className="flex items-center gap-2">
                <History className="w-4 h-4" />
                Historial de Planes
              </TabsTrigger>
            </TabsList>

            <TabsContent value="new-plan" className="space-y-6">
              {/* Plan Header */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 glass-effect rounded-lg">
                <div className="space-y-2">
                  <Label>Nombre del Plan</Label>
                  <Input
                    value={planName}
                    onChange={(e) => setPlanName(e.target.value)}
                    placeholder={`Reposición ${format(planDate, "dd/MM/yyyy")}`}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Jornada (opcional)</Label>
                  <Select 
                    value={selectedJornadaId || "__none__"} 
                    onValueChange={(v) => setSelectedJornadaId(v === "__none__" ? "" : v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar jornada" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Sin jornada específica</SelectItem>
                      {jornadas.filter(j => j?.id).map((j) => (
                        <SelectItem key={j.id} value={j.id}>
                          #{j.numero_jornada} - {format(new Date(j.fecha), "dd/MM/yyyy")} ({j.estado})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Fecha del Plan</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !planDate && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {planDate ? format(planDate, "PPP", { locale: es }) : "Seleccionar fecha"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={planDate}
                        onSelect={(date) => date && setPlanDate(date)}
                        initialFocus
                        className={cn("p-3 pointer-events-auto")}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              {/* Warehouse balance summary */}
              <div className="p-4 glass-effect rounded-lg border-l-4 border-amber-500">
                <div className="flex items-center gap-2 mb-2">
                  <Package className="w-5 h-5 text-amber-500" />
                  <span className="font-semibold">Stock Bodega</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Los productos se transferirán desde la bodega principal. Verifica disponibilidad antes de aplicar.
                </p>
              </div>

              {/* Plan Items Builder */}
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <Label className="text-lg">Items del Plan</Label>
                  <Button size="sm" variant="outline" onClick={addItem} className="gap-2">
                    <Plus className="w-4 h-4" />
                    Agregar Item
                  </Button>
                </div>

                {planItems.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
                    <Package className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>Agrega productos para cada barra</p>
                    <p className="text-xs mt-1">O importa desde Excel</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Barra Destino</TableHead>
                        <TableHead>Producto</TableHead>
                        <TableHead>Stock Bodega</TableHead>
                        <TableHead>Cantidad</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {planItems.map((item, index) => {
                        const warehouseStock = item.product_id ? getWarehouseBalance(item.product_id) : 0;
                        const product = products.find((p) => p.id === item.product_id);
                        return (
                          <TableRow key={index}>
                            <TableCell>
                              <Select value={item.to_location_id || ""} onValueChange={(v) => updateItem(index, "to_location_id", v)}>
                                <SelectTrigger>
                                  <SelectValue placeholder="Seleccionar barra" />
                                </SelectTrigger>
                                <SelectContent>
                                  {barLocations.filter(bar => bar?.id).map((bar) => (
                                    <SelectItem key={bar.id} value={bar.id}>
                                      {bar.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell>
                              <Select value={item.product_id || ""} onValueChange={(v) => updateItem(index, "product_id", v)}>
                                <SelectTrigger>
                                  <SelectValue placeholder="Seleccionar producto" />
                                </SelectTrigger>
                                <SelectContent>
                                  {products.filter(p => p?.id).map((p) => (
                                    <SelectItem key={p.id} value={p.id}>
                                      {p.name} ({p.code})
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">
                                {warehouseStock} {product?.unit || ""}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                value={item.quantity || ""}
                                onChange={(e) => updateItem(index, "quantity", e.target.value)}
                                min={0}
                                className="w-24"
                              />
                            </TableCell>
                            <TableCell>
                              <Button size="icon" variant="ghost" onClick={() => removeItem(index)}>
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </div>

              {/* Actions */}
              {planItems.length > 0 && (
                <div className="flex gap-3">
                  <Button variant="outline" onClick={handlePreview} className="gap-2">
                    <Eye className="w-4 h-4" />
                    Vista Previa
                  </Button>
                  <Button onClick={handleCreatePlan} disabled={submitting} className="gap-2">
                    {submitting ? "Guardando..." : "Guardar Plan (Borrador)"}
                  </Button>
                </div>
              )}
            </TabsContent>

            <TabsContent value="history" className="space-y-4">
              {plans.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <History className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No hay planes de reposición</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {plans.map((plan) => (
                    <div key={plan.id} className="glass-effect p-4 rounded-lg hover:bg-muted/30 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {getStatusBadge(plan.status)}
                          <div>
                            <h4 className="font-semibold">{plan.name}</h4>
                            <p className="text-sm text-muted-foreground">
                              {format(new Date(plan.plan_date), "dd/MM/yyyy")}
                              {plan.jornada && ` • Jornada #${plan.jornada.numero_jornada}`}
                              {plan.items && ` • ${plan.items.length} items`}
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" variant="ghost" onClick={() => exportPlanToCSV(plan)}>
                            <Download className="w-4 h-4" />
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => viewPlanDetails(plan)}>
                            <Eye className="w-4 h-4 mr-1" />
                            Ver
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Preview Dialog */}
      <Dialog open={showPreviewDialog} onOpenChange={setShowPreviewDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="w-5 h-5" />
              Vista Previa del Plan
            </DialogTitle>
            <DialogDescription>Revisa los items agrupados por barra antes de guardar</DialogDescription>
          </DialogHeader>

          <ScrollArea className="h-96">
            <div className="space-y-4">
              {/* Insufficient stock warning */}
              {insufficientItems.length > 0 && (
                <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/30">
                  <div className="flex items-center gap-2 text-destructive font-semibold mb-2">
                    <AlertTriangle className="w-5 h-5" />
                    Stock Insuficiente en Bodega
                  </div>
                  <ul className="space-y-1 text-sm">
                    {insufficientItems.map((item, i) => (
                      <li key={i} className="flex justify-between">
                        <span>{item.product_name}</span>
                        <span>
                          Requerido: {item.required} | Disponible: {item.available} |{" "}
                          <span className="text-destructive font-semibold">Falta: {item.missing}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Grouped by bar */}
              {Object.entries(previewGrouped).map(([barName, items]) => (
                <div key={barName} className="p-4 glass-effect rounded-lg">
                  <div className="flex items-center gap-2 mb-3">
                    <Badge>{barName}</Badge>
                    <span className="text-sm text-muted-foreground">{items.length} productos</span>
                  </div>
                  <Table>
                    <TableBody>
                      {items.map((item, i) => (
                        <TableRow key={i}>
                          <TableCell>{item.product_name}</TableCell>
                          <TableCell className="text-right">
                            {item.quantity} {item.product_unit}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ))}
            </div>
          </ScrollArea>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPreviewDialog(false)}>
              Cerrar
            </Button>
            <Button onClick={handleCreatePlan} disabled={submitting}>
              {submitting ? "Guardando..." : "Guardar Plan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Plan Details Dialog */}
      <Dialog open={showPlanDetails} onOpenChange={setShowPlanDetails}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardList className="w-5 h-5" />
              {selectedPlan?.name}
            </DialogTitle>
            <DialogDescription>
              {selectedPlan?.plan_date && format(new Date(selectedPlan.plan_date), "dd/MM/yyyy")}
              {selectedPlan?.jornada && ` • Jornada #${selectedPlan.jornada.numero_jornada}`}
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-2 mb-4">{selectedPlan && getStatusBadge(selectedPlan.status)}</div>

          <ScrollArea className="h-80">
            {selectedPlan?.items && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Barra</TableHead>
                    <TableHead>Producto</TableHead>
                    <TableHead className="text-right">Cantidad</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedPlan.items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.location?.name}</TableCell>
                      <TableCell>{item.product?.name}</TableCell>
                      <TableCell className="text-right">
                        {item.quantity} {item.product?.unit}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </ScrollArea>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPlanDetails(false)}>
              Cerrar
            </Button>
            {selectedPlan?.status === "draft" && (
              <Button onClick={() => handleApplyPlan(selectedPlan.id)} disabled={submitting} className="gap-2">
                <Play className="w-4 h-4" />
                {submitting ? "Aplicando..." : "Aplicar Reposición"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Dialog */}
      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5" />
              Importar Plan desde Excel
            </DialogTitle>
            <DialogDescription>
              El archivo debe tener columnas: barra, codigo (o producto), cantidad
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Archivo Excel/CSV</Label>
              <Input type="file" accept=".xlsx,.xls,.csv" onChange={handleFileChange} />
            </div>

            {importData.length > 0 && (
              <div className="space-y-2">
                <Label>
                  Vista previa ({importData.filter((r) => r.valid).length}/{importData.length} filas válidas)
                </Label>
                <ScrollArea className="h-64 border rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Estado</TableHead>
                        <TableHead>Barra</TableHead>
                        <TableHead>Producto</TableHead>
                        <TableHead>Cantidad</TableHead>
                        <TableHead>Error</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {importData.map((row, i) => (
                        <TableRow key={i} className={!row.valid ? "bg-destructive/10" : ""}>
                          <TableCell>
                            {row.valid ? (
                              <CheckCircle2 className="w-4 h-4 text-green-500" />
                            ) : (
                              <XCircle className="w-4 h-4 text-destructive" />
                            )}
                          </TableCell>
                          <TableCell>{row.bar_name}</TableCell>
                          <TableCell>{row.product_code || row.product_name}</TableCell>
                          <TableCell>{row.quantity}</TableCell>
                          <TableCell className="text-destructive text-xs">{row.error}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowImportDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleImportConfirm} disabled={submitting || importData.filter((r) => r.valid).length === 0}>
              Cargar {importData.filter((r) => r.valid).length} items al plan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
