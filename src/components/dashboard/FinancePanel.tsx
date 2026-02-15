import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useFinanceMTD } from "@/hooks/useFinanceMTD";
import { AddOperationalExpenseDialog, getCategoryLabel } from "./AddOperationalExpenseDialog";
import { formatCLP } from "@/lib/currency";
import {
  Plus, TrendingUp, TrendingDown, DollarSign, Receipt,
  BarChart3, CalendarClock, AlertCircle, AlertTriangle,
  FileText, Scale, Landmark,
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

/** Inline row for the income statement */
function StatementRow({ label, value, bold, negative, indent }: {
  label: string; value: number; bold?: boolean; negative?: boolean; indent?: boolean;
}) {
  return (
    <div className={`flex justify-between items-center py-1 ${indent ? "pl-4" : ""} ${bold ? "font-semibold" : "text-sm"}`}>
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

  const noSales = !mtd.loading && mtd.salesBruto === 0;

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
            Agregar gasto
          </Button>
        </div>
      </div>

      {/* Pending review alert */}
      {pendingReviewCount > 0 && (
        <Alert className="border-destructive/50 bg-destructive/10">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          <AlertDescription className="text-destructive">
            <strong>{pendingReviewCount} jornada{pendingReviewCount > 1 ? "s" : ""} pendiente{pendingReviewCount > 1 ? "s" : ""} de revisión.</strong>{" "}
            La exportación del estado mensual está bloqueada hasta resolver.
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
          {/* ── Section 1: Income Statement MTD ── */}
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

            {/* Key metrics cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <MetricCard label="Ventas netas (sin IVA)" value={formatCLP(mtd.salesNeto)} icon={DollarSign} />
              <MetricCard label="COGS (neto)" value={formatCLP(mtd.cogsTotal)} icon={Receipt} />
              <MetricCard
                label="Margen Bruto"
                value={formatCLP(mtd.grossMargin)}
                sub={`${mtd.marginPct.toFixed(1)}%`}
                icon={TrendingUp}
                negative={mtd.grossMargin < 0}
              />
              <MetricCard
                label="Imp. específicos (ILA/IABA)"
                value={formatCLP(mtd.specificTaxTotal)}
                icon={Landmark}
              />
              <MetricCard
                label="Total OPEX"
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

            {/* Full statement breakdown */}
            <Card>
              <CardContent className="p-5 space-y-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  Detalle completo
                </p>

                {/* Sales block */}
                <StatementRow label="Ventas brutas (con IVA)" value={mtd.salesBruto} />
                <StatementRow label="IVA débito fiscal" value={-mtd.ivaDebito} indent />
                <StatementRow label="Ventas netas (sin IVA)" value={mtd.salesNeto} bold />

                <div className="border-t my-2" />

                {/* COGS */}
                <StatementRow label="Costo de ventas (COGS neto)" value={-mtd.cogsTotal} negative />
                <StatementRow label="Margen bruto" value={mtd.grossMargin} bold negative={mtd.grossMargin < 0} />

                <div className="border-t my-2" />

                {/* Specific taxes */}
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mt-2 mb-1">
                  Impuestos Específicos (ILA / IABA)
                </p>
                {/* Category breakdown */}
                {mtd.specificTaxBreakdown.iaba_10 > 0 && (
                  <StatementRow label="IABA 10%" value={-mtd.specificTaxBreakdown.iaba_10} indent negative />
                )}
                {mtd.specificTaxBreakdown.iaba_18 > 0 && (
                  <StatementRow label="IABA 18%" value={-mtd.specificTaxBreakdown.iaba_18} indent negative />
                )}
                {mtd.specificTaxBreakdown.ila_vino > 0 && (
                  <StatementRow label="ILA Vino 20,5%" value={-mtd.specificTaxBreakdown.ila_vino} indent negative />
                )}
                {mtd.specificTaxBreakdown.ila_cerveza > 0 && (
                  <StatementRow label="ILA Cerveza 20,5%" value={-mtd.specificTaxBreakdown.ila_cerveza} indent negative />
                )}
                {mtd.specificTaxBreakdown.ila_destilados > 0 && (
                  <StatementRow label="ILA Destilados 31,5%" value={-mtd.specificTaxBreakdown.ila_destilados} indent negative />
                )}
                {/* Source breakdown */}
                <StatementRow label="Subtotal desde facturas importadas" value={-mtd.specificTaxFromInvoices} indent negative={mtd.specificTaxFromInvoices > 0} />
                <StatementRow label="Subtotal desde gastos manuales" value={-mtd.specificTaxFromOpex} indent negative={mtd.specificTaxFromOpex > 0} />
                <StatementRow label="Total impuestos específicos" value={-mtd.specificTaxTotal} bold negative />
                <StatementRow label="Margen post impuestos específicos" value={mtd.marginPostSpecificTax} bold negative={mtd.marginPostSpecificTax < 0} />

                <div className="border-t my-2" />

                {/* OPEX by category */}
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mt-2 mb-1">
                  Gastos Operacionales (OPEX)
                </p>

                {mtd.opexByCategory.length === 0 ? (
                  <p className="text-sm text-muted-foreground pl-4 py-1">Sin gastos registrados</p>
                ) : (
                  <Accordion type="multiple" className="w-full">
                    {mtd.opexByCategory.map((cat) => (
                      <AccordionItem key={cat.category} value={cat.category} className="border-0">
                        <AccordionTrigger className="py-1.5 hover:no-underline">
                          <div className="flex justify-between w-full pr-2 text-sm">
                            <span>{getCategoryLabel(cat.category)}</span>
                            <span className="tabular-nums font-medium">{formatCLP(cat.total)}</span>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="space-y-1 pl-4">
                            {cat.items.map((item) => (
                              <div key={item.id} className="flex justify-between text-xs text-muted-foreground">
                                <span className="truncate mr-2">
                                  {item.expense_date} — {item.description || "Sin descripción"}
                                </span>
                                <span className="tabular-nums shrink-0">{formatCLP(item.total_amount)}</span>
                              </div>
                            ))}
                            {(cat.vatTotal > 0 || cat.specificTaxTotal > 0) && (
                              <div className="pt-1 mt-1 border-t text-xs text-muted-foreground space-y-0.5">
                                {cat.vatTotal > 0 && (
                                  <div className="flex justify-between">
                                    <span>IVA incluido</span>
                                    <span className="tabular-nums">{formatCLP(cat.vatTotal)}</span>
                                  </div>
                                )}
                                {cat.specificTaxTotal > 0 && (
                                  <div className="flex justify-between">
                                    <span>Imp. específicos</span>
                                    <span className="tabular-nums">{formatCLP(cat.specificTaxTotal)}</span>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                )}

                <StatementRow label="Total OPEX" value={-mtd.opexTotal} bold negative />

                <div className="border-t my-2" />

                {/* Operating result */}
                <StatementRow label="Resultado operacional" value={mtd.operationalResult} bold negative={mtd.operationalResult < 0} />

                <div className="border-t border-dashed my-3" />

                {/* Tax block */}
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                  Bloque Tributario
                </p>
                <StatementRow label="IVA débito fiscal (ventas)" value={mtd.ivaDebito} indent />
                <StatementRow label="IVA crédito (facturas legacy)" value={-mtd.ivaCreditoFacturas} indent />
                {mtd.ivaCreditoFromImports > 0 && (
                  <StatementRow label="IVA crédito (importaciones)" value={-mtd.ivaCreditoFromImports} indent />
                )}
                <StatementRow
                  label="IVA neto del periodo"
                  value={mtd.ivaNeto}
                  bold
                  negative={mtd.ivaNeto > 0}
                />

                {mtd.freightFromImports > 0 && (
                  <>
                    <div className="border-t border-dashed my-2" />
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                      Flete desde importaciones
                    </p>
                    <StatementRow label="Flete/Transporte (facturas)" value={-mtd.freightFromImports} indent negative />
                  </>
                )}
              </CardContent>
            </Card>
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
                    label="Imp. específicos proyectado"
                    value={formatCLP(mtd.specificTaxForecast)}
                    icon={Landmark}
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
