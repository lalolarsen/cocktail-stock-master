import { useMemo } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Loader2, Package, AlertCircle, CheckCircle2, ArrowRightLeft, ClipboardCheck,
  ShoppingCart, Clock,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCLP } from "@/lib/currency";
import type { ResolvedRow, ParseResult, MatchConfidence } from "@/lib/excel-inventory-parser";

interface StockImportPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parseResult: ParseResult | null;
  onConfirm: () => void;
  isProcessing: boolean;
  mode?: "pending" | "immediate";
}

// ── Confidence badge ─────────────────────────────────────────────────────────

const ConfidenceBadge = ({ confidence }: { confidence: MatchConfidence }) => {
  const config: Record<MatchConfidence, { label: string; className: string }> = {
    alta: { label: "Alta", className: "bg-emerald-500/15 text-emerald-700 border-emerald-200" },
    media: { label: "Media", className: "bg-amber-500/15 text-amber-700 border-amber-200" },
    baja: { label: "Baja", className: "bg-orange-500/15 text-orange-700 border-orange-200" },
    sin_match: { label: "Sin match", className: "bg-destructive/15 text-destructive border-destructive/30" },
  };
  const c = config[confidence] || config.sin_match;
  return <Badge variant="outline" className={`text-[10px] ${c.className}`}>{c.label}</Badge>;
};

// ── Executive summary ────────────────────────────────────────────────────────

const ExecutiveSummary = ({ rows, type }: { rows: ResolvedRow[]; type: string }) => {
  const validRows = rows.filter((r) => r.isValid);
  const productCount = new Set(validRows.map((r) => r.productId).filter(Boolean)).size;

  if (type === "COMPRA") {
    const montoTotal = validRows.reduce(
      (s, r) => s + (Number(r.costo_neto_envase) || 0) * (Number(r.cantidad_envases) || 0), 0
    );
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 p-3 bg-muted/30 rounded-lg text-sm">
        <div><span className="text-muted-foreground">Filas válidas</span><p className="font-semibold">{validRows.length}</p></div>
        <div><span className="text-muted-foreground">Productos</span><p className="font-semibold">{productCount}</p></div>
        <div><span className="text-muted-foreground">Monto total</span><p className="font-semibold text-emerald-600">{formatCLP(montoTotal)}</p></div>
        <div><span className="text-muted-foreground">Destino</span><p className="font-semibold">{validRows[0]?.ubicacion_destino || "—"}</p></div>
      </div>
    );
  }

  if (type === "TRANSFERENCIA") {
    const totalMovido = validRows.reduce((s, r) => s + r.computedBaseQty, 0);
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 p-3 bg-muted/30 rounded-lg text-sm">
        <div><span className="text-muted-foreground">Filas válidas</span><p className="font-semibold">{validRows.length}</p></div>
        <div><span className="text-muted-foreground">Productos</span><p className="font-semibold">{productCount}</p></div>
        <div><span className="text-muted-foreground">Total movido</span><p className="font-semibold text-blue-600">{totalMovido.toLocaleString()}</p></div>
        <div><span className="text-muted-foreground">Destino</span><p className="font-semibold">{validRows[0]?.ubicacion_destino || "—"}</p></div>
      </div>
    );
  }

  if (type === "CONTEO") {
    const diffs = validRows.map((r) => (Number(r.stock_real_contado) || 0) - (Number(r.stock_teorico_exportado) || 0));
    const positivos = diffs.filter((d) => d > 0).length;
    const mermas = diffs.filter((d) => d < 0).length;
    const sinCambio = diffs.filter((d) => d === 0).length;
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 p-3 bg-muted/30 rounded-lg text-sm">
        <div><span className="text-muted-foreground">Productos</span><p className="font-semibold">{productCount}</p></div>
        <div><span className="text-muted-foreground">Ajustes +</span><p className="font-semibold text-emerald-600">{positivos}</p></div>
        <div><span className="text-muted-foreground">Mermas −</span><p className="font-semibold text-destructive">{mermas}</p></div>
        <div><span className="text-muted-foreground">Sin cambio</span><p className="font-semibold">{sinCambio}</p></div>
      </div>
    );
  }

  return null;
};

// ── Row table ────────────────────────────────────────────────────────────────

const MovementTable = ({ rows, type }: { rows: ResolvedRow[]; type: string }) => {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground py-4 text-center">Sin filas</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="bg-muted/50 border-b sticky top-0">
          <tr>
            <th className="py-2 px-2 text-left font-medium">Fila</th>
            <th className="py-2 px-2 text-left font-medium">Producto Excel</th>
            <th className="py-2 px-2 text-left font-medium">Producto asociado</th>
            <th className="py-2 px-2 text-left font-medium">Match</th>
            <th className="py-2 px-2 text-left font-medium">Tipo</th>
            {type === "COMPRA" && (
              <>
                <th className="py-2 px-2 text-right font-medium">Cantidad</th>
                <th className="py-2 px-2 text-right font-medium">Costo/Env</th>
                <th className="py-2 px-2 text-right font-medium">Base Calc.</th>
              </>
            )}
            {type === "TRANSFERENCIA" && (
              <>
                <th className="py-2 px-2 text-left font-medium">Destino</th>
                <th className="py-2 px-2 text-right font-medium">Cant. Base</th>
              </>
            )}
            {type === "CONTEO" && (
              <>
                <th className="py-2 px-2 text-right font-medium">Teórico</th>
                <th className="py-2 px-2 text-right font-medium">Real</th>
                <th className="py-2 px-2 text-right font-medium">Diferencia</th>
              </>
            )}
            <th className="py-2 px-2 text-left font-medium">Estado</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => {
            const diff = type === "CONTEO"
              ? (row.stock_real_contado ?? 0) - (row.stock_teorico_exportado ?? 0)
              : 0;

            return (
              <tr key={idx} className={`border-b ${!row.isValid ? "bg-destructive/5" : "hover:bg-muted/30"}`}>
                <td className="py-1.5 px-2 text-muted-foreground">{row.rowIndex}</td>
                <td className="py-1.5 px-2 max-w-[140px] truncate">{row.producto_nombre}</td>
                <td className="py-1.5 px-2 max-w-[140px] truncate">
                  {row.productNameMatched || <span className="text-destructive">—</span>}
                </td>
                <td className="py-1.5 px-2">
                  <ConfidenceBadge confidence={row.matchConfidence} />
                </td>
                <td className="py-1.5 px-2">
                  <Badge variant="outline" className="text-[10px]">{row.tipo_consumo}</Badge>
                </td>
                {type === "COMPRA" && (
                  <>
                    <td className="py-1.5 px-2 text-right">{row.cantidad_envases}</td>
                    <td className="py-1.5 px-2 text-right">{formatCLP(Number(row.costo_neto_envase) || 0)}</td>
                    <td className="py-1.5 px-2 text-right font-medium">{row.computedBaseQty}</td>
                  </>
                )}
                {type === "TRANSFERENCIA" && (
                  <>
                    <td className="py-1.5 px-2">{row.ubicacion_destino}</td>
                    <td className="py-1.5 px-2 text-right font-medium">{row.computedBaseQty}</td>
                  </>
                )}
                {type === "CONTEO" && (
                  <>
                    <td className="py-1.5 px-2 text-right">{row.stock_teorico_exportado ?? "—"}</td>
                    <td className="py-1.5 px-2 text-right font-medium">{row.stock_real_contado}</td>
                    <td className={`py-1.5 px-2 text-right font-medium ${diff < 0 ? "text-destructive" : diff > 0 ? "text-emerald-600" : ""}`}>
                      {diff > 0 ? `+${diff}` : diff}
                    </td>
                  </>
                )}
                <td className="py-1.5 px-2">
                  {row.isValid ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <span className="text-[10px] text-destructive" title={row.errors.join("; ")}>
                      {row.errors[0]}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

// ── Main dialog ──────────────────────────────────────────────────────────────

export const StockImportPreviewDialog = ({
  open, onOpenChange, parseResult, onConfirm, isProcessing, mode = "immediate",
}: StockImportPreviewDialogProps) => {
  const { compras, transferencias, conteos } = useMemo(() => {
    if (!parseResult) return { compras: [], transferencias: [], conteos: [] };
    return {
      compras: parseResult.rows.filter((r) => r.tipo_movimiento === "COMPRA"),
      transferencias: parseResult.rows.filter((r) => r.tipo_movimiento === "TRANSFERENCIA"),
      conteos: parseResult.rows.filter((r) => r.tipo_movimiento === "CONTEO"),
    };
  }, [parseResult]);

  if (!parseResult) return null;

  const { summary } = parseResult;
  const hasErrors = summary.invalid > 0;
  const hasSinMatch = parseResult.rows.some((r) => r.matchConfidence === "sin_match" && r.isValid === false);
  const totalValid = summary.valid;

  const isPending = mode === "pending";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            {isPending ? "Preview — Guardar como Pendiente" : "Confirmar Importación"}
          </DialogTitle>
          <DialogDescription>
            {isPending
              ? "Revisa los movimientos. Al guardar, quedarán pendientes de aprobación."
              : "Revisa los movimientos antes de confirmar"}
          </DialogDescription>
        </DialogHeader>

        {/* Badges */}
        <div className="flex flex-wrap items-center gap-2 py-2">
          {compras.length > 0 && (
            <Badge variant="outline" className="gap-1">
              <ShoppingCart className="h-3 w-3" />{summary.compras} compras
            </Badge>
          )}
          {transferencias.length > 0 && (
            <Badge variant="outline" className="gap-1">
              <ArrowRightLeft className="h-3 w-3" />{summary.transferencias} transferencias
            </Badge>
          )}
          {conteos.length > 0 && (
            <Badge variant="outline" className="gap-1">
              <ClipboardCheck className="h-3 w-3" />{summary.conteos} conteos
            </Badge>
          )}
          <Badge variant={hasErrors ? "destructive" : "secondary"} className="gap-1">
            {hasErrors ? <AlertCircle className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3 text-emerald-500" />}
            {totalValid} válidas / {summary.invalid} errores
          </Badge>
          {(summary.omitidos ?? 0) > 0 && (
            <Badge variant="outline" className="gap-1 bg-muted text-muted-foreground">
              {summary.omitidos} omitidas (sin contar / vacías)
            </Badge>
          )}
          {isPending && (
            <Badge variant="outline" className="gap-1 bg-amber-500/10 text-amber-700 border-amber-200">
              <Clock className="h-3 w-3" />Pendiente aprobación
            </Badge>
          )}
        </div>

        {/* Executive summary */}
        {compras.length > 0 && <ExecutiveSummary rows={compras} type="COMPRA" />}
        {transferencias.length > 0 && <ExecutiveSummary rows={transferencias} type="TRANSFERENCIA" />}
        {conteos.length > 0 && <ExecutiveSummary rows={conteos} type="CONTEO" />}

        {/* Tabs with detail */}
        <Tabs
          defaultValue={compras.length > 0 ? "compras" : transferencias.length > 0 ? "transferencias" : "conteos"}
          className="flex-1 flex flex-col min-h-0"
        >
          <TabsList className="w-full justify-start">
            {compras.length > 0 && <TabsTrigger value="compras">Compras ({compras.length})</TabsTrigger>}
            {transferencias.length > 0 && <TabsTrigger value="transferencias">Transferencias ({transferencias.length})</TabsTrigger>}
            {conteos.length > 0 && <TabsTrigger value="conteos">Conteos ({conteos.length})</TabsTrigger>}
          </TabsList>

          <ScrollArea className="flex-1 border rounded-lg mt-2">
            {compras.length > 0 && (
              <TabsContent value="compras" className="p-2 mt-0">
                <MovementTable rows={compras} type="COMPRA" />
              </TabsContent>
            )}
            {transferencias.length > 0 && (
              <TabsContent value="transferencias" className="p-2 mt-0">
                <MovementTable rows={transferencias} type="TRANSFERENCIA" />
              </TabsContent>
            )}
            {conteos.length > 0 && (
              <TabsContent value="conteos" className="p-2 mt-0">
                <MovementTable rows={conteos} type="CONTEO" />
              </TabsContent>
            )}
          </ScrollArea>
        </Tabs>

        {/* Error alerts */}
        {hasSinMatch && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Hay productos sin match. Corrija el Excel o agregue los productos al catálogo antes de continuar.
            </AlertDescription>
          </Alert>
        )}
        {hasErrors && !hasSinMatch && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Hay {summary.invalid} fila(s) con errores. Solo se guardarán las filas válidas.
            </AlertDescription>
          </Alert>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isProcessing}>
            Cancelar
          </Button>
          <Button
            onClick={onConfirm}
            disabled={isProcessing || totalValid === 0}
            className="primary-gradient"
          >
            {isProcessing ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Guardando...</>
            ) : isPending ? (
              <><Clock className="mr-2 h-4 w-4" />Guardar como pendiente ({totalValid})</>
            ) : (
              <><CheckCircle2 className="mr-2 h-4 w-4" />Confirmar ({totalValid} movimientos)</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
