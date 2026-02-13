import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useFinanceMTD } from "@/hooks/useFinanceMTD";
import { AddOperationalExpenseDialog } from "./AddOperationalExpenseDialog";
import { formatCLP } from "@/lib/currency";
import { Plus, TrendingUp, TrendingDown, DollarSign, Receipt, BarChart3, Percent, Loader2, CalendarClock } from "lucide-react";

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

interface MetricCard {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  color: string;
}

function MetricGrid({ cards }: { cards: MetricCard[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {cards.map((card) => (
        <Card key={card.label} className="relative overflow-hidden">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">
                  {card.label}
                </p>
                <p className={`text-2xl font-bold tabular-nums ${card.color}`}>
                  {card.value}
                </p>
                {card.sub && (
                  <p className={`text-sm font-medium ${card.color}`}>{card.sub}</p>
                )}
              </div>
              <card.icon className={`w-5 h-5 mt-1 ${card.color} opacity-60`} />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function FinancePanel() {
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());
  const [selectedYear] = useState(now.getFullYear());
  const [showExpenseDialog, setShowExpenseDialog] = useState(false);

  const mtd = useFinanceMTD(selectedYear, selectedMonth);

  const mtdCards: MetricCard[] = [
    { label: "Ventas", value: formatCLP(mtd.salesTotal), icon: DollarSign, color: "text-foreground" },
    { label: "COGS", value: formatCLP(mtd.cogsTotal), icon: Receipt, color: "text-foreground" },
    { label: "Margen Bruto", value: formatCLP(mtd.grossMargin), sub: `${mtd.marginPct.toFixed(1)}%`, icon: TrendingUp, color: mtd.grossMargin >= 0 ? "text-primary" : "text-destructive" },
    { label: "Gastos Operacionales", value: formatCLP(mtd.opexTotal), sub: `${mtd.opexPct.toFixed(1)}% de ventas`, icon: BarChart3, color: "text-foreground" },
    { label: "Resultado Operacional", value: formatCLP(mtd.operationalResult), icon: mtd.operationalResult >= 0 ? TrendingUp : TrendingDown, color: mtd.operationalResult >= 0 ? "text-primary" : "text-destructive" },
  ];

  const forecastCards: MetricCard[] = [
    { label: "Ventas proyectadas", value: formatCLP(mtd.salesForecast), icon: DollarSign, color: "text-foreground" },
    { label: "COGS proyectado", value: formatCLP(mtd.cogsForecast), icon: Receipt, color: "text-foreground" },
    { label: "Margen Bruto proyectado", value: formatCLP(mtd.grossProfitForecast), sub: `${mtd.grossMarginPctForecast.toFixed(1)}%`, icon: TrendingUp, color: mtd.grossProfitForecast >= 0 ? "text-primary" : "text-destructive" },
    { label: "OPEX proyectado", value: formatCLP(mtd.opexForecast), sub: `${mtd.opexPctForecast.toFixed(1)}% de ventas`, icon: BarChart3, color: "text-foreground" },
    { label: "Resultado Op. proyectado", value: formatCLP(mtd.operatingResultForecast), icon: mtd.operatingResultForecast >= 0 ? TrendingUp : TrendingDown, color: mtd.operatingResultForecast >= 0 ? "text-primary" : "text-destructive" },
  ];

  return (
    <div className="space-y-8">
      {/* Header controls */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <Select value={String(selectedMonth)} onValueChange={(v) => setSelectedMonth(Number(v))}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTHS.map((m, i) => (
                <SelectItem key={i} value={String(i)}>
                  {m} {selectedYear}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => setShowExpenseDialog(true)} size="sm">
          <Plus className="w-4 h-4 mr-1" />
          Agregar gasto operacional
        </Button>
      </div>

      {mtd.loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Section 1: MTD */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Estado de Resultados (MTD)
            </h2>
            <MetricGrid cards={mtdCards} />
          </section>

          {/* Section 2: Forecast */}
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <CalendarClock className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Proyección al cierre del mes
              </h2>
            </div>
            <MetricGrid cards={forecastCards} />
            <p className="text-xs text-muted-foreground">
              Proyección basada en promedio diario ({mtd.daysElapsed}/{mtd.daysInMonth} días transcurridos).
            </p>
          </section>
        </>
      )}

      <AddOperationalExpenseDialog
        open={showExpenseDialog}
        onOpenChange={setShowExpenseDialog}
        onSuccess={mtd.refresh}
      />
    </div>
  );
}
