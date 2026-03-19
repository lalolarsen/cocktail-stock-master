import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Monitor,
  TrendingUp,
  Calculator,
  RefreshCw,
} from "lucide-react";
import { formatCLP } from "@/lib/currency";
import { useCOGSData } from "@/hooks/useCOGSData";

/* ── Types ── */
interface SalesByPOS {
  posId: string;
  posName: string;
  total: number;
  transactions: number;
  type: "alcohol" | "tickets";
}

interface TopProduct {
  id: string;
  name: string;
  quantity: number;
  revenue: number;
}

interface Props {
  jornadaId?: string;
}

/* ── Compact bar for horizontal charts ── */
function HBar({ label, value, max, sub, color = "bg-primary" }: {
  label: string;
  value: number;
  max: number;
  sub?: string;
  color?: string;
}) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-20 sm:w-24 truncate text-muted-foreground text-xs">{label}</span>
      <div className="flex-1 h-5 bg-muted rounded overflow-hidden relative">
        <div
          className={`h-full ${color} rounded transition-all duration-300`}
          style={{ width: `${pct}%` }}
        />
        <span className="absolute inset-0 flex items-center justify-end pr-2 text-[10px] font-medium text-foreground tabular-nums">
          {sub || value}
        </span>
      </div>
    </div>
  );
}

export function JornadaKPIPanel({ jornadaId }: Props) {
  const [initialLoad, setInitialLoad] = useState(true);
  const [salesByPOS, setSalesByPOS] = useState<SalesByPOS[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const { summary: cogsSummary, byCategory, loading: cogsLoading } = useCOGSData(undefined, jornadaId);

  useEffect(() => {
    if (!jornadaId) {
      setSalesByPOS([]);
      setTopProducts([]);
      setInitialLoad(false);
      return;
    }
    setInitialLoad(true);
    fetchAll();
    const interval = setInterval(fetchAll, 30000);
    return () => clearInterval(interval);
  }, [jornadaId]);

  const fetchAll = async () => {
    try {
      let jId = jornadaId;
      if (!jId) {
        const { data: j } = await supabase
          .from("jornadas")
          .select("id")
          .eq("estado", "activa")
          .maybeSingle();
        jId = j?.id;
      }
      if (!jId) {
        setSalesByPOS([]);
        setTopProducts([]);
        return;
      }

      // Parallel fetch
      const [posRes, salesRes, ticketRes] = await Promise.all([
        supabase.from("pos_terminals").select("id, name, pos_type").eq("is_active", true),
        supabase.from("sales").select("id, pos_id, total_amount").eq("jornada_id", jId).eq("payment_status", "paid").eq("is_cancelled", false),
        supabase.from("ticket_sales").select("pos_id, total").eq("jornada_id", jId).eq("payment_status", "paid"),
      ]);

      // ── Sales by POS ──
      const posMap = new Map<string, SalesByPOS>();
      posRes.data?.forEach(pos => {
        posMap.set(pos.id, {
          posId: pos.id, posName: pos.name, total: 0, transactions: 0,
          type: pos.pos_type === "ticket_sales" ? "tickets" : "alcohol",
        });
      });
      salesRes.data?.forEach(s => {
        if (s.pos_id && posMap.has(s.pos_id)) {
          const p = posMap.get(s.pos_id)!;
          p.total += Number(s.total_amount);
          p.transactions += 1;
        }
      });
      ticketRes.data?.forEach(s => {
        if (s.pos_id && posMap.has(s.pos_id)) {
          const p = posMap.get(s.pos_id)!;
          p.total += s.total;
          p.transactions += 1;
        }
      });
      setSalesByPOS(
        Array.from(posMap.values()).filter(p => p.transactions > 0).sort((a, b) => b.total - a.total)
      );

      // ── Top products ──
      const saleIds = salesRes.data?.map(s => s.id) || [];
      if (saleIds.length > 0) {
        const { data: items } = await supabase
          .from("sale_items")
          .select("quantity, subtotal, cocktail:cocktails(id, name)")
          .in("sale_id", saleIds);

        const prodMap = new Map<string, TopProduct>();
        items?.forEach(item => {
          if (!item.cocktail) return;
          const c = item.cocktail as { id: string; name: string };
          if (prodMap.has(c.id)) {
            const e = prodMap.get(c.id)!;
            e.quantity += item.quantity;
            e.revenue += Number(item.subtotal);
          } else {
            prodMap.set(c.id, { id: c.id, name: c.name, quantity: item.quantity, revenue: Number(item.subtotal) });
          }
        });
        setTopProducts(Array.from(prodMap.values()).sort((a, b) => b.quantity - a.quantity).slice(0, 6));
      } else {
        setTopProducts([]);
      }

      setLastUpdated(new Date());
    } catch (e) {
      console.error("KPI fetch error:", e);
    } finally {
      setInitialLoad(false);
    }
  };

  const totalSales = salesByPOS.reduce((sum, p) => sum + p.total, 0);
  const maxPOS = salesByPOS[0]?.total || 1;
  const totalUnits = topProducts.reduce((sum, p) => sum + p.quantity, 0);
  const maxQty = topProducts[0]?.quantity || 1;

  const CATEGORY_LABELS: Record<string, string> = {
    licores: "Licores", vinos: "Vinos", cervezas: "Cervezas",
    bebidas: "Bebidas", mezcladores: "Mezcladores", otros: "Otros", insumos: "Insumos",
  };

  const isLoading = loading || cogsLoading;

  if (isLoading) {
    return <Skeleton className="h-56 rounded-lg" />;
  }

  const hasData = salesByPOS.length > 0 || topProducts.length > 0 || cogsSummary.total_cogs > 0;

  if (!hasData) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          <Monitor className="h-6 w-6 mx-auto mb-2 opacity-40" />
          <p className="text-sm">Sin datos en esta jornada</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      {/* ── Summary strip ── */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30">
        <div className="flex items-center gap-3 sm:gap-4 text-xs overflow-x-auto">
          <span className="flex items-center gap-1 text-muted-foreground whitespace-nowrap">
            <Monitor className="w-3 h-3" />
            <span className="font-semibold text-foreground">{formatCLP(totalSales)}</span>
          </span>
          <span className="flex items-center gap-1 text-muted-foreground whitespace-nowrap">
            <TrendingUp className="w-3 h-3" />
            <span className="font-semibold text-foreground">{totalUnits} uds</span>
          </span>
          <span className="flex items-center gap-1 text-muted-foreground whitespace-nowrap">
            <Calculator className="w-3 h-3" />
            <span className="font-semibold text-destructive">{formatCLP(cogsSummary.total_cogs)}</span>
          </span>
        </div>
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground shrink-0">
          <RefreshCw className="w-2.5 h-2.5" />
          {lastUpdated.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>

      {/* ── Tabs ── */}
      <CardContent className="p-0">
        <Tabs defaultValue="pos">
          <TabsList className="w-full rounded-none border-b border-border bg-transparent h-8">
            <TabsTrigger value="pos" className="text-xs h-7 data-[state=active]:bg-muted rounded-none data-[state=active]:border-b-2 data-[state=active]:border-primary">
              Ventas POS
            </TabsTrigger>
            <TabsTrigger value="top" className="text-xs h-7 data-[state=active]:bg-muted rounded-none data-[state=active]:border-b-2 data-[state=active]:border-primary">
              Top productos
            </TabsTrigger>
            <TabsTrigger value="cogs" className="text-xs h-7 data-[state=active]:bg-muted rounded-none data-[state=active]:border-b-2 data-[state=active]:border-primary">
              COGS
            </TabsTrigger>
          </TabsList>

          <div className="p-3 space-y-1.5">
            <TabsContent value="pos" className="mt-0 space-y-1.5">
              {salesByPOS.map(pos => (
                <HBar
                  key={pos.posId}
                  label={pos.posName}
                  value={pos.total}
                  max={maxPOS}
                  sub={formatCLP(pos.total)}
                  color={pos.type === "tickets" ? "bg-blue-500" : "bg-primary"}
                />
              ))}
              {salesByPOS.length > 1 && (
                <div className="flex gap-3 pt-1 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-primary" /> Alcohol</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-blue-500" /> Tickets</span>
                </div>
              )}
            </TabsContent>

            <TabsContent value="top" className="mt-0 space-y-1.5">
              {topProducts.map((p, i) => (
                <HBar
                  key={p.id}
                  label={`${i + 1}. ${p.name}`}
                  value={p.quantity}
                  max={maxQty}
                  sub={`${p.quantity} · ${formatCLP(p.revenue)}`}
                />
              ))}
              {topProducts.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">Sin ventas aún</p>
              )}
            </TabsContent>

            <TabsContent value="cogs" className="mt-0 space-y-1.5">
              {byCategory.map(cat => {
                const pct = cogsSummary.total_cogs > 0
                  ? (cat.total_cost / cogsSummary.total_cogs) * 100
                  : 0;
                return (
                  <div key={cat.category} className="flex items-center gap-2 text-sm">
                    <span className="w-20 sm:w-24 truncate text-muted-foreground text-xs">
                      {CATEGORY_LABELS[cat.category] || cat.category}
                    </span>
                    <div className="flex-1 h-5 bg-muted rounded overflow-hidden relative">
                      <div
                        className="h-full bg-destructive/70 rounded transition-all duration-300"
                        style={{ width: `${pct}%` }}
                      />
                      <span className="absolute inset-0 flex items-center justify-end pr-2 text-[10px] font-medium text-foreground tabular-nums">
                        {formatCLP(cat.total_cost)}
                      </span>
                    </div>
                  </div>
                );
              })}
              {byCategory.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">Sin movimientos</p>
              )}
              <div className="flex items-center justify-between pt-1 text-xs text-muted-foreground">
                <span>{cogsSummary.redemptions_count} redenciones · {cogsSummary.products_count} productos</span>
                <span className="font-semibold text-destructive">{formatCLP(cogsSummary.total_cogs)}</span>
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </CardContent>
    </Card>
  );
}
