import { useState, useEffect, lazy, Suspense } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ShoppingCart,
  ArrowRightLeft,
  ClipboardCheck,
  Download,
  Package,
  DollarSign,
  Clock,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Loader2,
  Trash2,
  Scale,
  ClipboardList,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useActiveVenue } from "@/hooks/useActiveVenue";
import { ExcelUpload } from "./ExcelUpload";
import { InventoryFreezeBanner } from "@/components/InventoryFreezeBanner";
import { formatCLP } from "@/lib/currency";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const WarehouseInventory = lazy(() =>
  import("./WarehouseInventory").then((m) => ({ default: m.WarehouseInventory }))
);
const WasteManagement = lazy(() =>
  import("./WasteManagement").then((m) => ({ default: m.WasteManagement }))
);
const StockReconciliation = lazy(() =>
  import("./StockReconciliation").then((m) => ({ default: m.StockReconciliation }))
);
const ExternalConsumptionPanel = lazy(() =>
  import("./ExternalConsumptionPanel").then((m) => ({ default: m.ExternalConsumptionPanel }))
);

type MovementType = "COMPRA" | "TRANSFERENCIA" | "CONTEO";
type SecondaryView = "stock" | "waste" | "reconciliation" | "external" | null;

interface QuickStats {
  totalProducts: number;
  totalCapital: number;
  lastMovement: string | null;
  lowStockCount: number;
}

interface RecentMovement {
  id: string;
  movement_type: string;
  quantity: number;
  created_at: string;
  productName: string;
  locationName: string;
}

interface InventoryHubProps {
  isReadOnly?: boolean;
}

export function InventoryHub({ isReadOnly = false }: InventoryHubProps) {
  const { venue } = useActiveVenue();
  const [stats, setStats] = useState<QuickStats | null>(null);
  const [recentMoves, setRecentMoves] = useState<RecentMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadDialog, setUploadDialog] = useState<MovementType | null>(null);
  const [secondaryView, setSecondaryView] = useState<SecondaryView>(null);
  const [showDetailedStock, setShowDetailedStock] = useState(false);

  useEffect(() => {
    if (!venue?.id) return;
    loadDashboard();
  }, [venue?.id]);

  const loadDashboard = async () => {
    if (!venue?.id) return;
    setLoading(true);

    const [balancesRes, movesRes] = await Promise.all([
      supabase
        .from("stock_balances")
        .select("quantity, product_id, products(name, cost_per_unit)")
        .eq("venue_id", venue.id),
      supabase
        .from("stock_movements")
        .select("id, movement_type, quantity, created_at, product_id, to_location_id, products(name), stock_locations!stock_movements_to_location_id_fkey(name)")
        .eq("venue_id", venue.id)
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

    // Stats
    const balances = balancesRes.data || [];
    let totalCapital = 0;
    const productIds = new Set<string>();
    let lowStock = 0;

    for (const b of balances) {
      const qty = Number(b.quantity) || 0;
      const cost = Number((b as any).products?.cost_per_unit) || 0;
      totalCapital += qty * cost;
      productIds.add(b.product_id);
      if (qty > 0 && qty <= 5) lowStock++;
    }

    const moves = movesRes.data || [];
    setStats({
      totalProducts: productIds.size,
      totalCapital,
      lastMovement: moves[0]?.created_at || null,
      lowStockCount: lowStock,
    });

    setRecentMoves(
      moves.map((m: any) => ({
        id: m.id,
        movement_type: m.movement_type,
        quantity: Number(m.quantity) || 0,
        created_at: m.created_at,
        productName: m.products?.name || "—",
        locationName: m.stock_locations?.name || "—",
      }))
    );

    setLoading(false);
  };

  const actionCards = [
    {
      title: "Subir Compra",
      description: "Ingresar compra de proveedor",
      icon: ShoppingCart,
      type: "COMPRA" as MovementType,
      color: "text-emerald-500",
      bg: "bg-emerald-500/10",
    },
    {
      title: "Subir Reposición",
      description: "Transferir entre ubicaciones",
      icon: ArrowRightLeft,
      type: "TRANSFERENCIA" as MovementType,
      color: "text-blue-500",
      bg: "bg-blue-500/10",
    },
    {
      title: "Subir Conteo",
      description: "Registrar conteo físico",
      icon: ClipboardCheck,
      type: "CONTEO" as MovementType,
      color: "text-amber-500",
      bg: "bg-amber-500/10",
    },
  ];

  const movementLabel = (type: string) => {
    const map: Record<string, string> = {
      compra: "Compra",
      transfer_in: "Entrada",
      transfer_out: "Salida",
      waste: "Merma",
      reconciliation: "Ajuste",
      sale: "Venta",
    };
    return map[type] || type;
  };

  const movementColor = (type: string) => {
    if (type === "compra" || type === "transfer_in" || type === "reconciliation") return "text-emerald-600";
    if (type === "waste" || type === "transfer_out" || type === "sale") return "text-red-500";
    return "text-muted-foreground";
  };

  return (
    <div className="space-y-6">
      <InventoryFreezeBanner />

      {/* ── Action Cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {actionCards.map((card) => (
          <Card
            key={card.type}
            className="cursor-pointer hover:shadow-md transition-shadow border-border/50"
            onClick={() => !isReadOnly && setUploadDialog(card.type)}
          >
            <CardContent className="p-4 flex flex-col items-center text-center gap-2">
              <div className={`p-3 rounded-xl ${card.bg}`}>
                <card.icon className={`w-6 h-6 ${card.color}`} />
              </div>
              <span className="font-medium text-sm text-foreground">{card.title}</span>
              <span className="text-xs text-muted-foreground hidden sm:block">{card.description}</span>
            </CardContent>
          </Card>
        ))}

        <Card
          className="cursor-pointer hover:shadow-md transition-shadow border-border/50"
          onClick={() => setUploadDialog("COMPRA")}
        >
          <CardContent className="p-4 flex flex-col items-center text-center gap-2">
            <div className="p-3 rounded-xl bg-purple-500/10">
              <Download className="w-6 h-6 text-purple-500" />
            </div>
            <span className="font-medium text-sm text-foreground">Descargar Stock</span>
            <span className="text-xs text-muted-foreground hidden sm:block">Exportar stock actual</span>
          </CardContent>
        </Card>
      </div>

      {/* ── Quick Stats ── */}
      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="border-border/50">
            <CardContent className="p-4 flex items-center gap-3">
              <Package className="w-5 h-5 text-muted-foreground" />
              <div>
                <p className="text-2xl font-bold text-foreground">{stats.totalProducts}</p>
                <p className="text-xs text-muted-foreground">Productos</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/50">
            <CardContent className="p-4 flex items-center gap-3">
              <DollarSign className="w-5 h-5 text-muted-foreground" />
              <div>
                <p className="text-2xl font-bold text-foreground">{formatCLP(stats.totalCapital)}</p>
                <p className="text-xs text-muted-foreground">Capital stock</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/50">
            <CardContent className="p-4 flex items-center gap-3">
              <Clock className="w-5 h-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium text-foreground">
                  {stats.lastMovement
                    ? format(new Date(stats.lastMovement), "dd MMM HH:mm", { locale: es })
                    : "—"}
                </p>
                <p className="text-xs text-muted-foreground">Último mov.</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/50">
            <CardContent className="p-4 flex items-center gap-3">
              <AlertTriangle className={`w-5 h-5 ${stats.lowStockCount > 0 ? "text-amber-500" : "text-muted-foreground"}`} />
              <div>
                <p className="text-2xl font-bold text-foreground">{stats.lowStockCount}</p>
                <p className="text-xs text-muted-foreground">Stock bajo</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Recent Movements ── */}
      {recentMoves.length > 0 && (
        <Card className="border-border/50">
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">Últimos movimientos</h3>
            <div className="space-y-2">
              {recentMoves.map((m) => (
                <div key={m.id} className="flex items-center justify-between text-sm py-1.5 border-b border-border/30 last:border-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full bg-muted ${movementColor(m.movement_type)}`}>
                      {movementLabel(m.movement_type)}
                    </span>
                    <span className="text-foreground truncate">{m.productName}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs text-muted-foreground">{m.locationName}</span>
                    <span className={`font-medium ${movementColor(m.movement_type)}`}>
                      {m.movement_type === "transfer_out" || m.movement_type === "waste" || m.movement_type === "sale" ? "-" : "+"}
                      {m.quantity}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(m.created_at), "dd/MM HH:mm")}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Secondary actions ── */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant={showDetailedStock ? "secondary" : "outline"}
          size="sm"
          onClick={() => { setShowDetailedStock(!showDetailedStock); setSecondaryView(null); }}
        >
          <Package className="w-4 h-4 mr-1" />
          {showDetailedStock ? <ChevronUp className="w-3 h-3 mr-1" /> : <ChevronDown className="w-3 h-3 mr-1" />}
          Stock detallado
        </Button>
        {!isReadOnly && (
          <>
            <Button
              variant={secondaryView === "waste" ? "secondary" : "outline"}
              size="sm"
              onClick={() => { setSecondaryView(secondaryView === "waste" ? null : "waste"); setShowDetailedStock(false); }}
            >
              <Trash2 className="w-4 h-4 mr-1" /> Merma
            </Button>
            <Button
              variant={secondaryView === "reconciliation" ? "secondary" : "outline"}
              size="sm"
              onClick={() => { setSecondaryView(secondaryView === "reconciliation" ? null : "reconciliation"); setShowDetailedStock(false); }}
            >
              <Scale className="w-4 h-4 mr-1" /> Cuadre
            </Button>
            <Button
              variant={secondaryView === "external" ? "secondary" : "outline"}
              size="sm"
              onClick={() => { setSecondaryView(secondaryView === "external" ? null : "external"); setShowDetailedStock(false); }}
            >
              <ClipboardList className="w-4 h-4 mr-1" /> Consumo externo
            </Button>
          </>
        )}
      </div>

      {/* ── Lazy secondary views ── */}
      <Suspense fallback={<div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}>
        {showDetailedStock && <WarehouseInventory isReadOnly={isReadOnly} />}
        {secondaryView === "waste" && <WasteManagement />}
        {secondaryView === "reconciliation" && <StockReconciliation />}
        {secondaryView === "external" && <ExternalConsumptionPanel />}
      </Suspense>

      {/* ── Upload Dialog ── */}
      <Dialog open={!!uploadDialog} onOpenChange={(o) => !o && setUploadDialog(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {uploadDialog === "COMPRA" && "Subir Compra"}
              {uploadDialog === "TRANSFERENCIA" && "Subir Reposición"}
              {uploadDialog === "CONTEO" && "Subir Conteo"}
            </DialogTitle>
          </DialogHeader>
          <ExcelUpload defaultMovementType={uploadDialog || undefined} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
