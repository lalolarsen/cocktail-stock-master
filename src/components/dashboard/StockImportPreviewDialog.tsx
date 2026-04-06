import { useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Loader2, Package, AlertCircle, CheckCircle2, ArrowRightLeft, ClipboardCheck, ShoppingCart } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ResolvedRow, ParseResult } from "@/lib/excel-inventory-parser";

interface StockImportPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parseResult: ParseResult | null;
  onConfirm: () => void;
  isProcessing: boolean;
}

const MovementTable = ({ rows, type }: { rows: ResolvedRow[]; type: string }) => {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground py-4 text-center">Sin filas</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="bg-muted/50 border-b sticky top-0">
          <tr>
            <th className="py-2 px-2 text-left font-medium">Fila</th>
            <th className="py-2 px-2 text-left font-medium">SKU</th>
            <th className="py-2 px-2 text-left font-medium">Producto</th>
            <th className="py-2 px-2 text-left font-medium">Tipo</th>
            {type === "COMPRA" && (
              <>
                <th className="py-2 px-2 text-right font-medium">Destino</th>
                <th className="py-2 px-2 text-right font-medium">Fmt (ml)</th>
                <th className="py-2 px-2 text-right font-medium">Envases</th>
                <th className="py-2 px-2 text-right font-medium">Base Calc.</th>
                <th className="py-2 px-2 text-right font-medium">Costo/Env</th>
              </>
            )}
            {type === "TRANSFERENCIA" && (
              <>
                <th className="py-2 px-2 text-left font-medium">Origen</th>
                <th className="py-2 px-2 text-left font-medium">Destino</th>
                <th className="py-2 px-2 text-right font-medium">Cant. Base</th>
              </>
            )}
            {type === "CONTEO" && (
              <>
                <th className="py-2 px-2 text-left font-medium">Ubicación</th>
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
                <td className="py-1.5 px-2 font-mono text-xs">{row.sku_base}</td>
                <td className="py-1.5 px-2 max-w-[160px] truncate">{row.producto_nombre}</td>
                <td className="py-1.5 px-2">
                  <Badge variant="outline" className="text-[10px]">{row.tipo_consumo}</Badge>
                </td>
                {type === "COMPRA" && (
                  <>
                    <td className="py-1.5 px-2 text-right">{row.ubicacion_destino}</td>
                    <td className="py-1.5 px-2 text-right">{row.formato_compra_ml || "-"}</td>
                    <td className="py-1.5 px-2 text-right">{row.cantidad_envases}</td>
                    <td className="py-1.5 px-2 text-right font-medium">{row.computedBaseQty}</td>
                    <td className="py-1.5 px-2 text-right">${Number(row.costo_neto_envase || 0).toLocaleString()}</td>
                  </>
                )}
                {type === "TRANSFERENCIA" && (
                  <>
                    <td className="py-1.5 px-2">{row.ubicacion_origen}</td>
                    <td className="py-1.5 px-2">{row.ubicacion_destino}</td>
                    <td className="py-1.5 px-2 text-right font-medium">{row.computedBaseQty}</td>
                  </>
                )}
                {type === "CONTEO" && (
                  <>
                    <td className="py-1.5 px-2">{row.ubicacion_destino}</td>
                    <td className="py-1.5 px-2 text-right">{row.stock_teorico_exportado ?? "-"}</td>
                    <td className="py-1.5 px-2 text-right font-medium">{row.stock_real_contado}</td>
                    <td className={`py-1.5 px-2 text-right font-medium ${diff < 0 ? "text-destructive" : diff > 0 ? "text-green-600" : ""}`}>
                      {diff > 0 ? `+${diff}` : diff}
                    </td>
                  </>
                )}
                <td className="py-1.5 px-2">
                  {row.isValid ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
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

export const StockImportPreviewDialog = ({
  open,
  onOpenChange,
  parseResult,
  onConfirm,
  isProcessing,
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
  const totalValid = summary.valid;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            Confirmar Importación de Inventario
          </DialogTitle>
          <DialogDescription>
            Revisa los movimientos antes de confirmar
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2 py-2">
          <Badge variant="outline" className="gap-1">
            <ShoppingCart className="h-3 w-3" />
            {summary.compras} compras
          </Badge>
          <Badge variant="outline" className="gap-1">
            <ArrowRightLeft className="h-3 w-3" />
            {summary.transferencias} transferencias
          </Badge>
          <Badge variant="outline" className="gap-1">
            <ClipboardCheck className="h-3 w-3" />
            {summary.conteos} conteos
          </Badge>
          <Badge variant={hasErrors ? "destructive" : "secondary"} className="gap-1">
            {hasErrors ? <AlertCircle className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3 text-green-500" />}
            {totalValid} válidas / {summary.invalid} errores
          </Badge>
        </div>

        <Tabs defaultValue={compras.length > 0 ? "compras" : transferencias.length > 0 ? "transferencias" : "conteos"} className="flex-1 flex flex-col min-h-0">
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

        {hasErrors && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Hay {summary.invalid} fila(s) con errores. Solo se procesarán las filas válidas.
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
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Procesando...
              </>
            ) : (
              <>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Confirmar ({totalValid} movimientos)
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
