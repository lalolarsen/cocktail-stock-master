import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows, fetchAllByIds } from "@/lib/supabase-batch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  BarChart3,
  TrendingUp,
  Receipt,
  DollarSign,
  Store,
  CreditCard,
  Banknote,
  Trophy,
  ShoppingCart,
  Gift,
  CalendarDays,
  Scale,
  AlertTriangle,
} from "lucide-react";
import { formatCLP } from "@/lib/currency";
import { DEFAULT_VENUE_ID } from "@/lib/venue";
import { startOfMonth, endOfMonth, format, subMonths } from "date-fns";
import { es } from "date-fns/locale";

/* ─────────────── types ─────────────── */

interface SaleRow {
  id: string;
  total_amount: number;
  net_amount: number | null;
  payment_method: string;
  pos_id: string | null;
  created_at: string;
  jornada_id: string | null;
}

interface SaleItemRow {
  quantity: number;
  unit_price: number;
  cocktail_id: string;
  cocktails: { name: string; category: string } | null;
}

interface POSTerminal {
  id: string;
  name: string;
}

interface POSStats {
  posId: string;
  posName: string;
  totalSales: number;
  transactionCount: number;
  avgTicket: number;
  cashTotal: number;
  cardTotal: number;
}

interface TopProduct {
  cocktailId: string;
  name: string;
  category: string;
  qtySold: number;
  revenue: number;
}

interface CourtesyCOGSItem {
  productName: string;
  qty: number;
  note: string;
  cogs: number;
}

interface ReconciliationWaste {
  productName: string;
  unit: string;
  shortage: number;
  costPerUnit: number;
  estimatedLoss: number;
}

export function AnalyticsPanel() {
  const venueId = DEFAULT_VENUE_ID;
  const [loading, setLoading] = useState(true);
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [saleItems, setSaleItems] = useState<SaleItemRow[]>([]);
  const [posTerminals, setPosTerminals] = useState<POSTerminal[]>([]);
  const [jornadaCount, setJornadaCount] = useState(0);
  const [courtesyCOGS, setCourtesyCOGS] = useState<CourtesyCOGSItem[]>([]);
  const [reconciliationWaste, setReconciliationWaste] = useState<ReconciliationWaste[]>([]);

  const monthOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [];
    for (let i = 0; i < 12; i++) {
      const d = subMonths(new Date(), i);
      const val = format(d, "yyyy-MM");
      const label = format(d, "MMMM yyyy", { locale: es });
      opts.push({ value: val, label: label.charAt(0).toUpperCase() + label.slice(1) });
    }
    return opts;
  }, []);

  const [selectedMonth, setSelectedMonth] = useState(monthOptions[0]?.value || format(new Date(), "yyyy-MM"));

  useEffect(() => {
    fetchAll();
  }, [selectedMonth]);

  const fetchAll = async () => {
    setLoading(true);

    const [year, month] = selectedMonth.split("-").map(Number);
    const from = startOfMonth(new Date(year, month - 1)).toISOString();
    const to = endOfMonth(new Date(year, month - 1)).toISOString();

    const [salesRes, posRes, jornadaRes, courtesyRes] = await Promise.all([
      fetchAllRows(() =>
        supabase
          .from("sales")
          .select("id, total_amount, net_amount, payment_method, pos_id, created_at, jornada_id")
          .eq("venue_id", venueId)
          .eq("payment_status", "paid")
          .eq("is_cancelled", false)
          .gte("created_at", from)
          .lte("created_at", to)
          .order("created_at", { ascending: false })
      ),
      supabase
        .from("pos_terminals")
        .select("id, name")
        .eq("venue_id", venueId),
      supabase
        .from("jornadas")
        .select("id", { count: "exact", head: true })
        .eq("venue_id", venueId)
        .eq("estado", "cerrada")
        .gte("fecha", from)
        .lte("fecha", to),
      supabase
        .from("courtesy_qr")
        .select("id, product_id, product_name, qty, note, status")
        .eq("venue_id", venueId)
        .eq("status", "redeemed")
        .gte("created_at", from)
        .lte("created_at", to),
    ]);

    const salesData = (salesRes || []) as SaleRow[];
    setSales(salesData);
    setPosTerminals((posRes.data || []) as POSTerminal[]);
    setJornadaCount(jornadaRes.count || 0);

    // Sale items — parallel batches
    if (salesData.length > 0) {
      const saleIds = salesData.map((s) => s.id);
      const allItems = await fetchAllByIds<SaleItemRow>(
        "sale_items",
        "sale_id",
        saleIds,
        "quantity, unit_price, cocktail_id, cocktails(name, category)"
      );
      setSaleItems(allItems);
    } else {
      setSaleItems([]);
    }

    // Courtesy COGS calculation
    const courtesyData = courtesyRes.data || [];
    if (courtesyData.length > 0) {
      const cocktailIds = [...new Set(courtesyData.map(c => c.product_id))];
      const { data: ingredients } = await supabase
        .from("cocktail_ingredients")
        .select("cocktail_id, quantity, products(cost_per_unit, capacity_ml)")
        .in("cocktail_id", cocktailIds);

      // Build recipe cost map
      const recipeCostMap = new Map<string, number>();
      if (ingredients) {
        for (const ing of ingredients as any[]) {
          const p = ing.products;
          if (!p) continue;
          const ingQtyMl = Number(ing.quantity);
          const capacityMl = Number(p.capacity_ml) || 0;
          const costPerUnit = Number(p.cost_per_unit) || 0;
          const costPerServing = capacityMl > 0
            ? (ingQtyMl / capacityMl) * costPerUnit
            : ingQtyMl * costPerUnit;
          const prev = recipeCostMap.get(ing.cocktail_id) || 0;
          recipeCostMap.set(ing.cocktail_id, prev + costPerServing);
        }
      }

      const items: CourtesyCOGSItem[] = courtesyData.map(qr => ({
        productName: qr.product_name,
        qty: qr.qty,
        note: qr.note || "Sin motivo",
        cogs: (recipeCostMap.get(qr.product_id) || 0) * qr.qty,
      }));
      setCourtesyCOGS(items);
    } else {
      setCourtesyCOGS([]);
    }

    // Reconciliation waste (mermas por comparación)
    const { data: reconMovements } = await supabase
      .from("stock_movements")
      .select("product_id, quantity, from_location_id, to_location_id, products(name, unit, cost_per_unit)")
      .eq("venue_id", venueId)
      .eq("movement_type", "reconciliation")
      .gte("created_at", from)
      .lte("created_at", to);

    if (reconMovements && reconMovements.length > 0) {
      const wasteMap = new Map<string, { name: string; unit: string; shortage: number; cost: number }>();
      for (const m of reconMovements as any[]) {
        const isShortage = !!m.from_location_id && !m.to_location_id;
        if (!isShortage) continue;
        const prod = m.products;
        if (!prod) continue;
        const key = m.product_id;
        if (!wasteMap.has(key)) wasteMap.set(key, { name: prod.name, unit: prod.unit || "ud", shortage: 0, cost: Number(prod.cost_per_unit) || 0 });
        const entry = wasteMap.get(key)!;
        entry.shortage += Number(m.quantity) || 0;
      }
      setReconciliationWaste(
        Array.from(wasteMap.values())
          .map(w => ({ productName: w.name, unit: w.unit, shortage: w.shortage, costPerUnit: w.cost, estimatedLoss: Math.round(w.shortage * w.cost) }))
          .sort((a, b) => b.estimatedLoss - a.estimatedLoss)
      );
    } else {
      setReconciliationWaste([]);
    }

    setLoading(false);
  };

  // Computed metrics
  const totalRevenue = useMemo(() => sales.reduce((s, r) => s + Math.abs(Number(r.total_amount)), 0), [sales]);
  const totalTransactions = sales.length;
  const avgTicket = totalTransactions > 0 ? totalRevenue / totalTransactions : 0;

  const cashTotal = useMemo(() =>
    sales.filter((s) => s.payment_method === "cash").reduce((acc, s) => acc + Math.abs(Number(s.total_amount)), 0),
    [sales]
  );
  const cardTotal = useMemo(() =>
    sales.filter((s) => s.payment_method === "card").reduce((acc, s) => acc + Math.abs(Number(s.total_amount)), 0),
    [sales]
  );

  const avgPerJornada = jornadaCount > 0 ? totalRevenue / jornadaCount : 0;

  // POS breakdown
  const posStats: POSStats[] = useMemo(() => {
    const posMap = new Map<string, { sales: number; count: number; cash: number; card: number }>();
    for (const s of sales) {
      const pid = s.pos_id || "sin-pos";
      if (!posMap.has(pid)) posMap.set(pid, { sales: 0, count: 0, cash: 0, card: 0 });
      const b = posMap.get(pid)!;
      const amt = Math.abs(Number(s.total_amount));
      b.sales += amt;
      b.count++;
      if (s.payment_method === "cash") b.cash += amt;
      else b.card += amt;
    }
    return Array.from(posMap.entries())
      .map(([pid, d]) => ({
        posId: pid,
        posName: posTerminals.find((p) => p.id === pid)?.name || (pid === "sin-pos" ? "Sin POS" : pid.slice(0, 8)),
        totalSales: d.sales,
        transactionCount: d.count,
        avgTicket: d.count > 0 ? d.sales / d.count : 0,
        cashTotal: d.cash,
        cardTotal: d.card,
      }))
      .sort((a, b) => b.totalSales - a.totalSales);
  }, [sales, posTerminals]);

  // Top products
  const topProducts: TopProduct[] = useMemo(() => {
    const map = new Map<string, { name: string; category: string; qty: number; revenue: number }>();
    for (const si of saleItems) {
      const c = si.cocktails;
      if (!c) continue;
      const key = si.cocktail_id;
      if (!map.has(key)) map.set(key, { name: c.name, category: c.category, qty: 0, revenue: 0 });
      const b = map.get(key)!;
      b.qty += Number(si.quantity);
      b.revenue += Number(si.quantity) * Number(si.unit_price);
    }
    return Array.from(map.entries())
      .map(([id, d]) => ({ cocktailId: id, ...d, qtySold: d.qty }))
      .sort((a, b) => b.qtySold - a.qtySold)
      .slice(0, 10);
  }, [saleItems]);

  // Payment distribution
  const cashPct = totalRevenue > 0 ? (cashTotal / totalRevenue) * 100 : 0;
  const cardPct = totalRevenue > 0 ? (cardTotal / totalRevenue) * 100 : 0;

  // Courtesy COGS aggregated by reason
  const courtesyByReason = useMemo(() => {
    const map = new Map<string, { count: number; totalCogs: number; items: string[] }>();
    for (const c of courtesyCOGS) {
      const key = c.note;
      if (!map.has(key)) map.set(key, { count: 0, totalCogs: 0, items: [] });
      const b = map.get(key)!;
      b.count += c.qty;
      b.totalCogs += c.cogs;
      if (!b.items.includes(c.productName)) b.items.push(c.productName);
    }
    return Array.from(map.entries())
      .map(([reason, d]) => ({ reason, ...d }))
      .sort((a, b) => b.totalCogs - a.totalCogs);
  }, [courtesyCOGS]);

  const totalCourtesyCOGS = courtesyCOGS.reduce((s, c) => s + c.cogs, 0);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Month Selector */}
      <div className="flex items-center gap-3">
        <CalendarDays className="w-5 h-5 text-muted-foreground" />
        <Select value={selectedMonth} onValueChange={setSelectedMonth}>
          <SelectTrigger className="w-[220px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {monthOptions.map((m) => (
              <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPICard icon={DollarSign} label="Ingreso Total" value={formatCLP(totalRevenue)} sub={`${totalTransactions} ventas`} accent="text-emerald-500" />
        <KPICard icon={Receipt} label="Ticket Promedio" value={formatCLP(avgTicket)} sub={`${jornadaCount} jornadas`} accent="text-blue-500" />
        <KPICard icon={Store} label="Promedio / Jornada" value={formatCLP(avgPerJornada)} sub={`${posStats.length} POS activos`} accent="text-violet-500" />
        <KPICard icon={ShoppingCart} label="Productos Vendidos" value={saleItems.reduce((s, si) => s + Number(si.quantity), 0).toLocaleString("es-CL")} sub={`${topProducts.length} productos distintos`} accent="text-amber-500" />
      </div>

      {/* Payment Distribution */}
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-muted-foreground" />
            Distribución de Medios de Pago
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 mb-3">
            <div className="flex-1 h-3 rounded-full bg-muted overflow-hidden flex">
              <div className="h-full bg-emerald-500 transition-all" style={{ width: `${cardPct}%` }} />
              <div className="h-full bg-amber-500 transition-all" style={{ width: `${cashPct}%` }} />
            </div>
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-emerald-500" />
              <span className="text-muted-foreground">Tarjeta</span>
              <span className="font-semibold">{formatCLP(cardTotal)}</span>
              <Badge variant="secondary" className="text-xs">{cardPct.toFixed(1)}%</Badge>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-amber-500" />
              <span className="text-muted-foreground">Efectivo</span>
              <span className="font-semibold">{formatCLP(cashTotal)}</span>
              <Badge variant="secondary" className="text-xs">{cashPct.toFixed(1)}%</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Revenue by POS */}
        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Store className="w-4 h-4 text-muted-foreground" />
              Ingreso por Punto de Venta
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {posStats.length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">Sin datos de POS</p>
            )}
            {posStats.map((pos, i) => {
              const pct = totalRevenue > 0 ? (pos.totalSales / totalRevenue) * 100 : 0;
              return (
                <div key={pos.posId} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono text-xs text-muted-foreground w-5">{i + 1}.</span>
                      <span className="font-medium truncate">{pos.posName}</span>
                    </div>
                    <span className="font-semibold tabular-nums">{formatCLP(pos.totalSales)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-primary/70 rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs text-muted-foreground tabular-nums w-12 text-right">{pct.toFixed(1)}%</span>
                  </div>
                  <div className="flex gap-3 text-xs text-muted-foreground pl-7">
                    <span>{pos.transactionCount} txn</span>
                    <span>Ticket: {formatCLP(pos.avgTicket)}</span>
                    <span className="flex items-center gap-0.5"><CreditCard className="w-3 h-3" />{formatCLP(pos.cardTotal)}</span>
                    <span className="flex items-center gap-0.5"><Banknote className="w-3 h-3" />{formatCLP(pos.cashTotal)}</span>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Top Products */}
        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-500" />
              Top Productos Vendidos
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {topProducts.length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">Sin datos de productos</p>
            )}
            {topProducts.map((p, i) => {
              const maxQty = topProducts[0]?.qtySold || 1;
              const pct = (p.qtySold / maxQty) * 100;
              return (
                <div key={p.cocktailId} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`font-mono text-xs w-5 ${i < 3 ? "text-amber-500 font-bold" : "text-muted-foreground"}`}>
                        {i + 1}.
                      </span>
                      <span className="font-medium truncate">{p.name}</span>
                      <Badge variant="outline" className="text-[10px] shrink-0">{p.category}</Badge>
                    </div>
                    <div className="text-right shrink-0 ml-2">
                      <span className="font-semibold tabular-nums">{p.qtySold}</span>
                      <span className="text-xs text-muted-foreground ml-1">uds</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pl-7">
                    <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-amber-500/60 rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs text-muted-foreground tabular-nums w-20 text-right">{formatCLP(p.revenue)}</span>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      {/* Courtesy COGS Section */}
      {courtesyCOGS.length > 0 && (
        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Gift className="w-4 h-4 text-primary" />
              COGS Cortesías
              <Badge variant="secondary" className="ml-auto text-xs">{formatCLP(totalCourtesyCOGS)}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* By reason summary */}
            <div className="space-y-2">
              {courtesyByReason.map(r => (
                <div key={r.reason} className="flex items-center justify-between text-sm p-2 rounded-lg bg-muted/50">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{r.reason}</p>
                    <p className="text-xs text-muted-foreground">{r.count} uds · {r.items.length} producto{r.items.length > 1 ? "s" : ""}</p>
                  </div>
                  <span className="font-semibold tabular-nums shrink-0 ml-2">{formatCLP(r.totalCogs)}</span>
                </div>
              ))}
            </div>

            {/* Detail table */}
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 text-muted-foreground">
                    <th className="text-left p-2 font-medium">Producto</th>
                    <th className="text-center p-2 font-medium">Qty</th>
                    <th className="text-left p-2 font-medium">Motivo</th>
                    <th className="text-right p-2 font-medium">COGS</th>
                  </tr>
                </thead>
                <tbody>
                  {courtesyCOGS.map((c, i) => (
                    <tr key={i} className="border-t border-border/30">
                      <td className="p-2 font-medium truncate max-w-[150px]">{c.productName}</td>
                      <td className="p-2 text-center tabular-nums">{c.qty}</td>
                      <td className="p-2 text-muted-foreground truncate max-w-[150px]">{c.note}</td>
                      <td className="p-2 text-right tabular-nums font-medium">{formatCLP(c.cogs)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Reconciliation Waste Section */}
      {reconciliationWaste.length > 0 && (
        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Scale className="w-4 h-4 text-destructive" />
              Mermas por Comparación
              <Badge variant="destructive" className="ml-auto text-xs">
                {formatCLP(reconciliationWaste.reduce((s, w) => s + w.estimatedLoss, 0))}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Faltantes detectados en comparaciones de inventario del mes. Solo incluye productos con diferencia negativa (merma).
            </p>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 text-muted-foreground">
                    <th className="text-left p-2 font-medium">Producto</th>
                    <th className="text-right p-2 font-medium">Faltante</th>
                    <th className="text-right p-2 font-medium">Costo unit.</th>
                    <th className="text-right p-2 font-medium">Pérdida est.</th>
                  </tr>
                </thead>
                <tbody>
                  {reconciliationWaste.map((w, i) => (
                    <tr key={i} className="border-t border-border/30">
                      <td className="p-2 font-medium truncate max-w-[180px]">{w.productName}</td>
                      <td className="p-2 text-right tabular-nums text-destructive font-medium">
                        {w.shortage} {w.unit}
                      </td>
                      <td className="p-2 text-right tabular-nums text-muted-foreground">{formatCLP(w.costPerUnit)}</td>
                      <td className="p-2 text-right tabular-nums font-semibold text-destructive">{formatCLP(w.estimatedLoss)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* KPI Card subcomponent */
function KPICard({
  icon: Icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: typeof DollarSign;
  label: string;
  value: string;
  sub: string;
  accent: string;
}) {
  return (
    <Card className="border-border/50">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-lg sm:text-xl font-bold tracking-tight">{value}</p>
            <p className="text-[11px] text-muted-foreground">{sub}</p>
          </div>
          <div className={`p-2 rounded-lg bg-muted ${accent}`}>
            <Icon className="w-4 h-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
