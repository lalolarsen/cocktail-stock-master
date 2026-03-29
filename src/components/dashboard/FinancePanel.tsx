import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useFinanceMTD } from "@/hooks/useFinanceMTD";
import { formatCLP } from "@/lib/currency";
import {
  TrendingUp, TrendingDown, DollarSign, Receipt,
  AlertCircle, Scale, Trash2, Monitor,
} from "lucide-react";

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

function MetricCard({ label, value, sub, icon: Icon, negative }: {
  label: string; value: string; sub?: string; icon: React.ElementType; negative?: boolean;
}) {
  return (
    <Card className="relative overflow-hidden">
      <CardContent className="p-5 flex items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">{label}</p>
          <p className={`text-2xl font-bold tabular-nums leading-tight ${negative ? "text-destructive" : "text-foreground"}`}>{value}</p>
          {sub && <p className={`text-sm font-medium ${negative ? "text-destructive" : "text-muted-foreground"}`}>{sub}</p>}
        </div>
        <Icon className={`w-5 h-5 shrink-0 mt-0.5 opacity-30 ${negative ? "text-destructive" : "text-muted-foreground"}`} />
      </CardContent>
    </Card>
  );
}

function StatementRow({ label, value, bold, negative, indent }: {
  label: string; value: number; bold?: boolean; negative?: boolean; indent?: boolean;
}) {
  return (
    <div className={`flex justify-between items-center py-1.5 ${indent ? "pl-4" : ""} ${bold ? "font-semibold" : "text-sm"}`}>
      <span className={negative ? "text-destructive" : "text-muted-foreground"}>{label}</span>
      <span className={`tabular-nums ${negative ? "text-destructive font-medium" : ""} ${bold ? "text-foreground" : ""}`}>
        {formatCLP(value)}
      </span>
    </div>
  );
}

export function FinancePanel() {
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());
  const [selectedYear] = useState(now.getFullYear());

  const mtd = useFinanceMTD(selectedYear, selectedMonth);

  const hasPassline = mtd.passlineSalesGross > 0;
  const hasAnyData = mtd.salesGross > 0 || mtd.cogsTotal > 0 || mtd.wasteTotal > 0 || hasPassline;
  const noDataAtAll = !mtd.loading && !hasAnyData;
  const hasSales = mtd.salesGross > 0 || hasPassline;

  const displayCogs = hasSales ? mtd.cogsTotal : 0;
  const displayWaste = mtd.wasteTotal;
  const totalSalesNet = mtd.salesNet + mtd.passlineSalesNet;
  const totalCogs = displayCogs + mtd.passlineCogs;
  const displayGrossMargin = hasSales ? (totalSalesNet - totalCogs - displayWaste) : -displayWaste;
  const displayMarginPct = totalSalesNet > 0 ? (displayGrossMargin / totalSalesNet) * 100 : 0;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Finanzas</h1>
          <p className="text-sm text-muted-foreground">Margen operacional del mes</p>
        </div>
        <Select value={String(selectedMonth)} onValueChange={(v) => setSelectedMonth(Number(v))}>
          <SelectTrigger className="w-[150px] h-9 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MONTHS.map((m, i) => (
              <SelectItem key={i} value={String(i)}>{m} {selectedYear}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {mtd.loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="p-5 space-y-2"><Skeleton className="h-3 w-24" /><Skeleton className="h-7 w-32" /></CardContent></Card>
          ))}
        </div>
      ) : noDataAtAll ? (
        <Card className="border-dashed">
          <CardContent className="py-16 flex flex-col items-center gap-3 text-center">
            <AlertCircle className="w-8 h-8 text-muted-foreground opacity-50" />
            <p className="text-sm text-muted-foreground">Aún no hay datos en el periodo seleccionado.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* KPI Cards */}
          <section className="space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Resumen del mes
              </h2>
              {hasSales && (
                <Badge variant="secondary" className="text-xs font-medium tabular-nums">
                  Margen {displayMarginPct.toFixed(1)}%
                </Badge>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <MetricCard label="Ventas totales (con IVA)" value={formatCLP(mtd.salesGross)} icon={DollarSign} />
              <MetricCard label="IVA Débito" value={formatCLP(mtd.ivaDebito)} icon={Scale} />
              <MetricCard label="Ventas netas" value={formatCLP(mtd.salesNet)} icon={DollarSign} />
              <MetricCard label="COGS" value={formatCLP(displayCogs)} icon={Receipt} />
              {displayWaste > 0 && (
                <MetricCard label="Merma" value={formatCLP(displayWaste)} icon={Trash2} negative />
              )}
              <MetricCard
                label="Margen Bruto"
                value={formatCLP(displayGrossMargin)}
                sub={hasSales ? `${displayMarginPct.toFixed(1)}%` : undefined}
                icon={displayGrossMargin >= 0 ? TrendingUp : TrendingDown}
                negative={displayGrossMargin < 0}
              />
            </div>

            {hasPassline && (
              <Card className="border-primary/20 bg-primary/5">
                <CardContent className="p-5 flex items-start gap-3">
                  <Monitor className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                  <div className="space-y-1 min-w-0">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Totems Passline</p>
                    <p className="text-lg font-bold tabular-nums">{formatCLP(mtd.passlineSalesGross)}</p>
                    <p className="text-xs text-muted-foreground">
                      Neto: {formatCLP(mtd.passlineSalesNet)} · COGS: {formatCLP(mtd.passlineCogs)} · Margen: {formatCLP(mtd.passlineMargin)}
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
          </section>

          {/* Desglose */}
          <section>
            <Card>
              <CardContent className="p-5 space-y-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  Desglose de margen
                </p>

                <StatementRow label="Ventas totales (con IVA)" value={mtd.salesGross} />
                <StatementRow label="(–) IVA débito fiscal" value={-mtd.ivaDebito} indent />
                <StatementRow label="Ventas netas" value={mtd.salesNet} bold />

                {hasPassline && (
                  <>
                    <div className="border-t my-2" />
                    <StatementRow label="Ventas Totems Passline (neto)" value={mtd.passlineSalesNet} />
                    <StatementRow label="(–) COGS Totems" value={-mtd.passlineCogs} indent negative />
                    <StatementRow label="Margen Totems" value={mtd.passlineMargin} bold />
                  </>
                )}

                <div className="border-t my-2" />

                {hasSales ? (
                  <StatementRow label="(–) Costo de ventas (COGS)" value={-displayCogs} negative />
                ) : (
                  <p className="text-sm text-muted-foreground py-1 italic">Sin ventas en el período</p>
                )}

                {displayWaste > 0 && (
                  <StatementRow label="(–) Merma" value={-displayWaste} negative />
                )}

                <div className="border-t my-2" />
                <StatementRow label="Margen Bruto" value={displayGrossMargin} bold negative={displayGrossMargin < 0} />
                {hasSales && (
                  <div className="flex justify-between items-center py-1 text-xs">
                    <span className="text-muted-foreground">% Margen sobre ventas netas</span>
                    <span className="tabular-nums font-semibold">{displayMarginPct.toFixed(1)}%</span>
                  </div>
                )}
              </CardContent>
            </Card>
          </section>
        </>
      )}
    </div>
  );
}
