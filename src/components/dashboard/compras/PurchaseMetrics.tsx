import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft, ChevronRight, ShoppingCart, TrendingUp, Percent, RefreshCw } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { useComprasMetrics } from "@/hooks/useComprasMetrics";
import { useActiveVenue } from "@/hooks/useActiveVenue";
import { formatCLP } from "@/lib/currency";

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

function currentMonthInTZ(): { year: number; month0: number } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
  });
  const parts = fmt.formatToParts(new Date());
  const y = Number(parts.find((p) => p.type === "year")?.value);
  const m = Number(parts.find((p) => p.type === "month")?.value);
  return { year: y, month0: m - 1 };
}

export function PurchaseMetrics() {
  const { venue } = useActiveVenue();
  const initial = useMemo(() => currentMonthInTZ(), []);
  const [year, setYear] = useState(initial.year);
  const [month0, setMonth0] = useState(initial.month0);

  const { loading, error, totalComprado, totalVendido, ratioPct, daily, topProducts, refresh } =
    useComprasMetrics(venue?.id, year, month0);

  const goPrev = () => {
    if (month0 === 0) {
      setMonth0(11);
      setYear((y) => y - 1);
    } else setMonth0((m) => m - 1);
  };
  const goNext = () => {
    if (month0 === 11) {
      setMonth0(0);
      setYear((y) => y + 1);
    } else setMonth0((m) => m + 1);
  };

  const years = useMemo(() => {
    const now = new Date().getFullYear();
    return [now - 2, now - 1, now, now + 1];
  }, []);

  return (
    <div className="space-y-4">
      {/* Header / filtros */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={goPrev}><ChevronLeft className="w-4 h-4" /></Button>
          <Select value={String(month0)} onValueChange={(v) => setMonth0(Number(v))}>
            <SelectTrigger className="w-[130px] h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MONTHS.map((m, i) => <SelectItem key={i} value={String(i)}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-[90px] h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              {years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="ghost" size="icon" onClick={goNext}><ChevronRight className="w-4 h-4" /></Button>
        </div>
        <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
          <RefreshCw className={`w-3.5 h-3.5 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refrescar
        </Button>
      </div>

      {error && (
        <Card><CardContent className="py-4 text-sm text-destructive">{error}</CardContent></Card>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <KpiCard
          label="Total comprado"
          value={loading ? null : formatCLP(totalComprado)}
          icon={<ShoppingCart className="w-4 h-4" />}
          hint="Facturas confirmadas del mes"
        />
        <KpiCard
          label="Total vendido"
          value={loading ? null : formatCLP(totalVendido)}
          icon={<TrendingUp className="w-4 h-4" />}
          hint="Ventas del mes (sin anuladas)"
        />
        <KpiCard
          label="Ratio Compras / Ventas"
          value={loading ? null : `${ratioPct.toFixed(1)}%`}
          icon={<Percent className="w-4 h-4" />}
          hint={totalVendido === 0 ? "Sin ventas registradas" : "Cuánto compraste vs vendiste"}
          accent={ratioPct > 50 ? "warn" : "ok"}
        />
      </div>

      {/* Gráfico diario */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Comprado vs Vendido por día</CardTitle></CardHeader>
        <CardContent className="h-[280px]">
          {loading ? (
            <Skeleton className="w-full h-full" />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={daily} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => v >= 1000000 ? `${(v / 1e6).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}
                />
                <Tooltip
                  formatter={(v: any) => formatCLP(Number(v))}
                  labelFormatter={(l) => `Día ${l}`}
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="comprado" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name="Comprado" />
                <Line type="monotone" dataKey="vendido" stroke="hsl(var(--muted-foreground))" strokeWidth={2} dot={false} name="Vendido" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Top productos */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Top 20 productos comprados</CardTitle></CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4"><Skeleton className="h-40 w-full" /></div>
          ) : topProducts.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Sin compras confirmadas este mes.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead className="text-right">Unidades</TableHead>
                  <TableHead className="text-right">Costo unit.</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topProducts.map((p, idx) => (
                  <TableRow key={`${p.product_id || p.name}-${idx}`}>
                    <TableCell className="text-xs text-muted-foreground">{idx + 1}</TableCell>
                    <TableCell className="font-medium text-sm">{p.name}</TableCell>
                    <TableCell className="text-right text-sm">{p.units}</TableCell>
                    <TableCell className="text-right text-sm">{formatCLP(p.lastUnitCost)}</TableCell>
                    <TableCell className="text-right text-sm font-medium">{formatCLP(p.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({
  label,
  value,
  icon,
  hint,
  accent,
}: {
  label: string;
  value: string | null;
  icon: React.ReactNode;
  hint?: string;
  accent?: "ok" | "warn";
}) {
  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>
          <span className={accent === "warn" ? "text-amber-500" : "text-primary"}>{icon}</span>
        </div>
        {value === null ? (
          <Skeleton className="h-7 w-32" />
        ) : (
          <div className="text-2xl font-semibold tracking-tight">{value}</div>
        )}
        {hint && <p className="text-[11px] text-muted-foreground mt-1">{hint}</p>}
      </CardContent>
    </Card>
  );
}
