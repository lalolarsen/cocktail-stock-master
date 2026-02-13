import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useFinanceMTD } from "@/hooks/useFinanceMTD";
import { AddOperationalExpenseDialog } from "./AddOperationalExpenseDialog";
import { formatCLP } from "@/lib/currency";
import { Plus, TrendingUp, TrendingDown, DollarSign, Receipt, BarChart3, Percent, Loader2 } from "lucide-react";

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export function FinancePanel() {
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());
  const [selectedYear] = useState(now.getFullYear());
  const [showExpenseDialog, setShowExpenseDialog] = useState(false);

  const mtd = useFinanceMTD(selectedYear, selectedMonth);

  const cards = [
    {
      label: "Ventas MTD",
      value: formatCLP(mtd.salesTotal),
      icon: DollarSign,
      color: "text-foreground",
    },
    {
      label: "COGS MTD",
      value: formatCLP(mtd.cogsTotal),
      icon: Receipt,
      color: "text-foreground",
    },
    {
      label: "Margen Bruto MTD",
      value: formatCLP(mtd.grossMargin),
      sub: `${mtd.marginPct.toFixed(1)}%`,
      icon: TrendingUp,
      color: mtd.grossMargin >= 0 ? "text-primary" : "text-destructive",
    },
    {
      label: "Gastos Operacionales MTD",
      value: formatCLP(mtd.opexTotal),
      icon: BarChart3,
      color: "text-foreground",
    },
    {
      label: "Resultado Operacional MTD",
      value: formatCLP(mtd.operationalResult),
      icon: mtd.operationalResult >= 0 ? TrendingUp : TrendingDown,
      color: mtd.operationalResult >= 0 ? "text-primary" : "text-destructive",
    },
    {
      label: "OPEX %",
      value: `${mtd.opexPct.toFixed(1)}%`,
      icon: Percent,
      color: "text-foreground",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header controls */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <Select
            value={String(selectedMonth)}
            onValueChange={(v) => setSelectedMonth(Number(v))}
          >
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
          <span className="text-xs text-muted-foreground">Mes a la fecha</span>
        </div>
        <Button onClick={() => setShowExpenseDialog(true)} size="sm">
          <Plus className="w-4 h-4 mr-1" />
          Agregar gasto operacional
        </Button>
      </div>

      {/* Loading state */}
      {mtd.loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        /* Cards grid */
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
      )}

      {/* Expense dialog */}
      <AddOperationalExpenseDialog
        open={showExpenseDialog}
        onOpenChange={setShowExpenseDialog}
        onSuccess={mtd.refresh}
      />
    </div>
  );
}
