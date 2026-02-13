import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useFinanceMTD } from "@/hooks/useFinanceMTD";
import { AddOperationalExpenseDialog } from "./AddOperationalExpenseDialog";
import { formatCLP } from "@/lib/currency";
import {
  Plus, TrendingUp, TrendingDown, DollarSign, Receipt,
  BarChart3, CalendarClock, AlertCircle, AlertTriangle,
} from "lucide-react";

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

interface MetricCardProps {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  negative?: boolean;
}

function MetricCard({ label, value, sub, icon: Icon, negative }: MetricCardProps) {
  return (
    <Card className="relative overflow-hidden">
      <CardContent className="p-5 flex items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">
            {label}
          </p>
          <p className={`text-2xl font-bold tabular-nums leading-tight ${negative ? "text-destructive" : "text-foreground"}`}>
            {value}
          </p>
          {sub && (
            <p className={`text-sm font-medium ${negative ? "text-destructive" : "text-muted-foreground"}`}>
              {sub}
            </p>
          )}
        </div>
        <Icon className={`w-5 h-5 shrink-0 mt-0.5 opacity-30 ${negative ? "text-destructive" : "text-muted-foreground"}`} />
      </CardContent>
    </Card>
  );
}

function MetricGridSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <Card key={i}>
          <CardContent className="p-5 space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-7 w-32" />
            <Skeleton className="h-4 w-16" />
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
  const [pendingReviewCount, setPendingReviewCount] = useState(0);

  const mtd = useFinanceMTD(selectedYear, selectedMonth);

  useEffect(() => {
    supabase
      .from("jornadas")
      .select("*", { count: "exact", head: true })
      .eq("requires_review", true)
      .then(({ count }) => setPendingReviewCount(count || 0));
  }, []);

  const noSales = !mtd.loading && mtd.salesTotal === 0;

  return (
    <div className="space-y-10">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Finanzas</h1>
          <p className="text-sm text-muted-foreground">Estado de resultados mes a la fecha</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={String(selectedMonth)} onValueChange={(v) => setSelectedMonth(Number(v))}>
            <SelectTrigger className="w-[150px] h-9 text-sm">
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
          <Button onClick={() => setShowExpenseDialog(true)} size="sm">
            <Plus className="w-4 h-4 mr-1.5" />
            Agregar gasto operacional
          </Button>
        </div>
      </div>

      {/* Pending review alert */}
      {pendingReviewCount > 0 && (
        <Alert className="border-destructive/50 bg-destructive/10">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          <AlertDescription className="text-destructive">
            <strong>{pendingReviewCount} jornada{pendingReviewCount > 1 ? "s" : ""} pendiente{pendingReviewCount > 1 ? "s" : ""} de revisión.</strong>{" "}
            Existen cierres forzados sin revisar. La exportación del estado mensual está bloqueada hasta resolver.
          </AlertDescription>
        </Alert>
      )}

      {mtd.loading ? (
        <div className="space-y-10">
          <MetricGridSkeleton />
          <MetricGridSkeleton />
        </div>
      ) : noSales ? (
        <Card className="border-dashed">
          <CardContent className="py-16 flex flex-col items-center gap-3 text-center">
            <AlertCircle className="w-8 h-8 text-muted-foreground opacity-50" />
            <p className="text-sm text-muted-foreground">
              Aún no hay ventas en el periodo seleccionado.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* ── Section 1: MTD ── */}
          <section className="space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Estado de Resultados (MTD)
              </h2>
              <Badge variant="secondary" className="text-xs font-medium tabular-nums">
                Margen {mtd.marginPct.toFixed(1)}%
              </Badge>
              <Badge variant="secondary" className="text-xs font-medium tabular-nums">
                OPEX {mtd.opexPct.toFixed(1)}%
              </Badge>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <MetricCard label="Ventas" value={formatCLP(mtd.salesTotal)} icon={DollarSign} />
              <MetricCard label="COGS" value={formatCLP(mtd.cogsTotal)} icon={Receipt} />
              <MetricCard
                label="Margen Bruto"
                value={formatCLP(mtd.grossMargin)}
                sub={`${mtd.marginPct.toFixed(1)}%`}
                icon={TrendingUp}
                negative={mtd.grossMargin < 0}
              />
              <MetricCard
                label="Gastos Operacionales"
                value={formatCLP(mtd.opexTotal)}
                sub={`${mtd.opexPct.toFixed(1)}% de ventas`}
                icon={BarChart3}
              />
              <MetricCard
                label="Resultado Operacional"
                value={formatCLP(mtd.operationalResult)}
                icon={mtd.operationalResult >= 0 ? TrendingUp : TrendingDown}
                negative={mtd.operationalResult < 0}
              />
            </div>
          </section>

          {/* ── Section 2: Forecast ── */}
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <CalendarClock className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Proyección al cierre del mes
              </h2>
            </div>

            <Card className="bg-muted/40 border-border/50">
              <CardContent className="p-6 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <MetricCard label="Ventas proyectadas" value={formatCLP(mtd.salesForecast)} icon={DollarSign} />
                  <MetricCard label="COGS proyectado" value={formatCLP(mtd.cogsForecast)} icon={Receipt} />
                  <MetricCard
                    label="Margen Bruto proyectado"
                    value={formatCLP(mtd.grossProfitForecast)}
                    sub={`${mtd.grossMarginPctForecast.toFixed(1)}%`}
                    icon={TrendingUp}
                    negative={mtd.grossProfitForecast < 0}
                  />
                  <MetricCard
                    label="OPEX proyectado"
                    value={formatCLP(mtd.opexForecast)}
                    sub={`${mtd.opexPctForecast.toFixed(1)}% de ventas`}
                    icon={BarChart3}
                  />
                  <MetricCard
                    label="Resultado Op. proyectado"
                    value={formatCLP(mtd.operatingResultForecast)}
                    icon={mtd.operatingResultForecast >= 0 ? TrendingUp : TrendingDown}
                    negative={mtd.operatingResultForecast < 0}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Promedio diario ({mtd.daysElapsed}/{mtd.daysInMonth} días).
                </p>
              </CardContent>
            </Card>
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
