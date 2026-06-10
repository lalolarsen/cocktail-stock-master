import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Monitor,
  TrendingUp,
  Clock,
  Users,
  Package,
  RefreshCw,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from "recharts";
import { formatCLP } from "@/lib/currency";

/* ── Types ── */
interface SalesByPOS {
  posId: string;
  posName: string;
  total: number;
  transactions: number;
  type: "alcohol" | "tickets";
}

interface SalesBySeller {
  userId: string;
  name: string;
  total: number;
  transactions: number;
}

interface HourBucket {
  hour: string; // "HH"
  total: number;
  transactions: number;
}

interface TopProduct {
  id: string;
  name: string;
  quantity: number;
  revenue: number;
  cash: number;
  card: number;
  other: number;
}

interface Props {
  jornadaId?: string;
}

/* ── Compact horizontal bar ── */
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
      <span className="w-24 sm:w-32 truncate text-muted-foreground text-xs">{label}</span>
      <div className="flex-1 h-5 bg-muted rounded overflow-hidden relative">
        <div
          className={`h-full ${color} rounded transition-all duration-300`}
          style={{ width: `${pct}%` }}
        />
        <span className="absolute inset-0 flex items-center justify-end pr-2 text-[10px] font-medium text-foreground tabular-nums">
          {sub ?? value}
        </span>
      </div>
    </div>
  );
}

/* ── Stacked payment-method bar ── */
function StackedPayBar({ cash, card, other, max }: { cash: number; card: number; other: number; max: number; }) {
  const total = cash + card + other;
  if (total === 0 || max === 0) {
    return <div className="flex-1 h-5 bg-muted rounded" />;
  }
  const pct = (v: number) => (v / max) * 100;
  return (
    <div className="flex-1 h-5 bg-muted rounded overflow-hidden relative flex">
      <div className="h-full bg-emerald-500" style={{ width: `${pct(cash)}%` }} />
      <div className="h-full bg-blue-500" style={{ width: `${pct(card)}%` }} />
      <div className="h-full bg-amber-500" style={{ width: `${pct(other)}%` }} />
      <span className="absolute inset-0 flex items-center justify-end pr-2 text-[10px] font-medium text-foreground tabular-nums">
        {formatCLP(total)}
      </span>
    </div>
  );
}

export function JornadaKPIPanel({ jornadaId }: Props) {
  const [initialLoad, setInitialLoad] = useState(true);
  const [salesByPOS, setSalesByPOS] = useState<SalesByPOS[]>([]);
  const [salesBySeller, setSalesBySeller] = useState<SalesBySeller[]>([]);
  const [salesByHour, setSalesByHour] = useState<HourBucket[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [paymentMix, setPaymentMix] = useState({ cash: 0, card: 0, other: 0 });
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  useEffect(() => {
    if (!jornadaId) {
      setSalesByPOS([]);
      setSalesBySeller([]);
      setSalesByHour([]);
      setTopProducts([]);
      setInitialLoad(false);
      return;
    }
    setInitialLoad(true);
    fetchAll();
    const interval = setInterval(fetchAll, 30000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jornadaId]);

  const hourKey = (iso: string | null) => {
    if (!iso) return "—";
    return new Date(iso).toLocaleString("en-CA", {
      hour: "2-digit",
      hour12: false,
      timeZone: "America/Santiago",
    });
  };

  const classifyPayment = (pm: string | null | undefined): "cash" | "card" | "other" => {
    if (!pm) return "other";
    const k = pm.toLowerCase();
    if (k.includes("efectivo") || k.includes("cash")) return "cash";
    if (k.includes("tarjeta") || k.includes("card") || k.includes("debito") || k.includes("credito") || k.includes("débito") || k.includes("crédito")) return "card";
    return "other";
  };

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
        setSalesByPOS([]); setSalesBySeller([]); setSalesByHour([]); setTopProducts([]);
        return;
      }

      const [posRes, salesRes, ticketRes] = await Promise.all([
        supabase.from("pos_terminals").select("id, name, pos_type").eq("is_active", true),
        supabase.from("sales").select("id, pos_id, total_amount, created_at, created_by, payment_method").eq("jornada_id", jId).eq("payment_status", "paid").eq("is_cancelled", false),
        supabase.from("ticket_sales").select("pos_id, total, created_at, created_by, payment_method").eq("jornada_id", jId).eq("payment_status", "paid"),
      ]);

      const alcoholSales = salesRes.data ?? [];
      const ticketSales = ticketRes.data ?? [];

      // ── Sales by POS ──
      const posMap = new Map<string, SalesByPOS>();
      posRes.data?.forEach(pos => {
        posMap.set(pos.id, {
          posId: pos.id, posName: pos.name, total: 0, transactions: 0,
          type: pos.pos_type === "ticket_sales" ? "tickets" : "alcohol",
        });
      });
      alcoholSales.forEach(s => {
        if (s.pos_id && posMap.has(s.pos_id)) {
          const p = posMap.get(s.pos_id)!;
          p.total += Number(s.total_amount);
          p.transactions += 1;
        }
      });
      ticketSales.forEach(s => {
        if (s.pos_id && posMap.has(s.pos_id)) {
          const p = posMap.get(s.pos_id)!;
          p.total += Number(s.total);
          p.transactions += 1;
        }
      });
      setSalesByPOS(
        Array.from(posMap.values()).filter(p => p.transactions > 0).sort((a, b) => b.total - a.total)
      );

      // ── Sales by hour ──
      const hourMap = new Map<string, HourBucket>();
      const addHour = (iso: string | null, amount: number) => {
        const h = hourKey(iso);
        const e = hourMap.get(h) ?? { hour: h, total: 0, transactions: 0 };
        e.total += amount;
        e.transactions += 1;
        hourMap.set(h, e);
      };
      alcoholSales.forEach(s => addHour(s.created_at, Number(s.total_amount)));
      ticketSales.forEach(s => addHour(s.created_at, Number(s.total)));
      setSalesByHour(Array.from(hourMap.values()).sort((a, b) => a.hour.localeCompare(b.hour)));

      // ── Sales by seller ──
      const sellerIds = new Set<string>();
      alcoholSales.forEach(s => { if (s.created_by) sellerIds.add(s.created_by); });
      ticketSales.forEach(s => { if (s.created_by) sellerIds.add(s.created_by); });
      const sellerNames = new Map<string, string>();
      if (sellerIds.size > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", Array.from(sellerIds));
        profs?.forEach(p => sellerNames.set(p.id, p.full_name || "—"));
      }
      const sellerMap = new Map<string, SalesBySeller>();
      const addSeller = (uid: string | null, amount: number) => {
        if (!uid) return;
        const e = sellerMap.get(uid) ?? { userId: uid, name: sellerNames.get(uid) ?? "Usuario", total: 0, transactions: 0 };
        e.total += amount;
        e.transactions += 1;
        sellerMap.set(uid, e);
      };
      alcoholSales.forEach(s => addSeller(s.created_by, Number(s.total_amount)));
      ticketSales.forEach(s => addSeller(s.created_by, Number(s.total)));
      setSalesBySeller(Array.from(sellerMap.values()).sort((a, b) => b.total - a.total).slice(0, 8));

      // ── Payment mix global ──
      const mix = { cash: 0, card: 0, other: 0 };
      alcoholSales.forEach(s => { mix[classifyPayment(s.payment_method)] += Number(s.total_amount); });
      ticketSales.forEach(s => { mix[classifyPayment(s.payment_method)] += Number(s.total); });
      setPaymentMix(mix);

      // ── Top products with payment-method mix ──
      const saleIdToPayment = new Map<string, "cash" | "card" | "other">();
      alcoholSales.forEach(s => saleIdToPayment.set(s.id, classifyPayment(s.payment_method)));
      const saleIds = alcoholSales.map(s => s.id);
      if (saleIds.length > 0) {
        const { data: items } = await supabase
          .from("sale_items")
          .select("sale_id, quantity, subtotal, cocktail:cocktails(id, name)")
          .in("sale_id", saleIds);

        const prodMap = new Map<string, TopProduct>();
        items?.forEach(item => {
          if (!item.cocktail) return;
          const c = item.cocktail as { id: string; name: string };
          const pay = saleIdToPayment.get(item.sale_id) ?? "other";
          const rev = Number(item.subtotal);
          const e = prodMap.get(c.id) ?? { id: c.id, name: c.name, quantity: 0, revenue: 0, cash: 0, card: 0, other: 0 };
          e.quantity += item.quantity;
          e.revenue += rev;
          e[pay] += rev;
          prodMap.set(c.id, e);
        });
        setTopProducts(Array.from(prodMap.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 8));
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
  const maxSeller = salesBySeller[0]?.total || 1;
  const maxProduct = topProducts[0]?.revenue || 1;
  const peakHour = salesByHour.reduce<HourBucket | undefined>(
    (p, c) => (c.total > (p?.total ?? 0) ? c : p),
    undefined
  );

  if (initialLoad) {
    return <Skeleton className="h-72 rounded-lg" />;
  }

  const hasData = salesByPOS.length > 0 || topProducts.length > 0 || salesByHour.length > 0;

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
      {/* Summary strip */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30">
        <div className="flex items-center gap-3 sm:gap-4 text-xs overflow-x-auto">
          <span className="flex items-center gap-1 text-muted-foreground whitespace-nowrap">
            <Monitor className="w-3 h-3" />
            <span className="font-semibold text-foreground">{formatCLP(totalSales)}</span>
          </span>
          {peakHour && (
            <span className="flex items-center gap-1 text-muted-foreground whitespace-nowrap">
              <Clock className="w-3 h-3" />
              Pico <span className="font-semibold text-foreground">{peakHour.hour}h</span>
            </span>
          )}
          <span className="flex items-center gap-1 text-muted-foreground whitespace-nowrap">
            <TrendingUp className="w-3 h-3" />
            <span className="font-semibold text-foreground">{salesBySeller.length} vendedor{salesBySeller.length === 1 ? "" : "es"}</span>
          </span>
        </div>
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground shrink-0">
          <RefreshCw className="w-2.5 h-2.5" />
          {lastUpdated.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>

      {/* Tabs */}
      <CardContent className="p-0">
        <Tabs defaultValue="hour">
          <TabsList className="w-full rounded-none border-b border-border bg-transparent h-9 justify-start gap-0 px-1">
            <TabsTrigger value="hour" className="text-xs h-8 data-[state=active]:bg-muted rounded-none data-[state=active]:border-b-2 data-[state=active]:border-primary gap-1">
              <Clock className="w-3 h-3" /> Por hora
            </TabsTrigger>
            <TabsTrigger value="pos" className="text-xs h-8 data-[state=active]:bg-muted rounded-none data-[state=active]:border-b-2 data-[state=active]:border-primary gap-1">
              <Monitor className="w-3 h-3" /> Por POS
            </TabsTrigger>
            <TabsTrigger value="seller" className="text-xs h-8 data-[state=active]:bg-muted rounded-none data-[state=active]:border-b-2 data-[state=active]:border-primary gap-1">
              <Users className="w-3 h-3" /> Vendedor
            </TabsTrigger>
            <TabsTrigger value="top" className="text-xs h-8 data-[state=active]:bg-muted rounded-none data-[state=active]:border-b-2 data-[state=active]:border-primary gap-1">
              <Package className="w-3 h-3" /> Top × pago
            </TabsTrigger>
          </TabsList>

          <div className="p-3">
            <TabsContent value="hour" className="mt-0">
              {salesByHour.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">Sin ventas aún</p>
              ) : (
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={salesByHour} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis dataKey="hour" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(h) => `${h}h`} />
                      <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${Math.round(v / 1000)}k`} width={36} />
                      <Tooltip
                        cursor={{ fill: "hsl(var(--muted))" }}
                        formatter={(v: number, _n, p) => [formatCLP(v), `${(p.payload as HourBucket).transactions} tx`]}
                        labelFormatter={(h) => `${h}:00 hrs`}
                        contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "0.5rem", fontSize: 12 }}
                      />
                      <Bar dataKey="total" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </TabsContent>

            <TabsContent value="pos" className="mt-0 space-y-1.5">
              {salesByPOS.map(pos => (
                <HBar
                  key={pos.posId}
                  label={pos.posName}
                  value={pos.total}
                  max={maxPOS}
                  sub={`${formatCLP(pos.total)} · ${pos.transactions} tx`}
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

            <TabsContent value="seller" className="mt-0 space-y-1.5">
              {salesBySeller.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">Sin ventas aún</p>
              ) : (
                salesBySeller.map((s, i) => (
                  <HBar
                    key={s.userId}
                    label={`${i + 1}. ${s.name}`}
                    value={s.total}
                    max={maxSeller}
                    sub={`${formatCLP(s.total)} · ${s.transactions} tx`}
                  />
                ))
              )}
            </TabsContent>

            <TabsContent value="top" className="mt-0 space-y-1.5">
              {topProducts.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">Sin ventas aún</p>
              ) : (
                <>
                  {topProducts.map((p, i) => (
                    <div key={p.id} className="flex items-center gap-2 text-sm">
                      <span className="w-24 sm:w-32 truncate text-muted-foreground text-xs">
                        {i + 1}. {p.name}
                      </span>
                      <StackedPayBar cash={p.cash} card={p.card} other={p.other} max={maxProduct} />
                      <span className="w-10 text-right text-[10px] text-muted-foreground tabular-nums">{p.quantity}u</span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between pt-2 mt-1 border-t border-border text-[10px] text-muted-foreground">
                    <div className="flex flex-wrap gap-3">
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-500" /> Efectivo {formatCLP(paymentMix.cash)}</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-blue-500" /> Tarjeta {formatCLP(paymentMix.card)}</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-amber-500" /> Otro {formatCLP(paymentMix.other)}</span>
                    </div>
                  </div>
                </>
              )}
            </TabsContent>
          </div>
        </Tabs>
      </CardContent>
    </Card>
  );
}
