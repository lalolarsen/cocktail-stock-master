import { useState, useRef, useCallback, useMemo, useEffect, KeyboardEvent } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { formatCLP } from "@/lib/currency";
import {
  Send, Plus, Trash2, Copy, ScanBarcode, Package, Zap, X,
} from "lucide-react";
import type { ReplenishmentProduct, StockLocation, BulkRow, TransferLine } from "./types";

interface Props {
  products: ReplenishmentProduct[];
  barLocations: StockLocation[];
  getBalance: (productId: string, locationId: string) => number;
  onConfirm: (lines: TransferLine[]) => void;
  submitting: boolean;
}

let rowCounter = 0;
function newRowId() {
  return `row-${++rowCounter}`;
}

export function BulkTransferGrid({ products, barLocations, getBalance, onConfirm, submitting }: Props) {
  const [defaultBarId, setDefaultBarId] = useState(barLocations[0]?.id || "");
  const [useDefaultBar, setUseDefaultBar] = useState(true);
  const [rows, setRows] = useState<BulkRow[]>([{ id: newRowId(), productId: "", quantity: "", barId: defaultBarId, selected: false }]);
  const [scanMode, setScanMode] = useState(false);
  const scanRef = useRef<HTMLInputElement>(null);
  const qtyRefs = useRef<Map<string, HTMLInputElement>>(new Map());

  // Product lookup maps
  const productByCode = useMemo(() => {
    const map = new Map<string, ReplenishmentProduct>();
    for (const p of products) {
      map.set(p.code.toLowerCase(), p);
      map.set(p.name.toLowerCase(), p);
    }
    return map;
  }, [products]);

  const productsWithStock = useMemo(() => products.filter(p => p.warehouseStock > 0), [products]);

  // Sync default bar to new rows
  useEffect(() => {
    if (useDefaultBar && defaultBarId) {
      setRows(prev => prev.map(r => r.barId ? r : { ...r, barId: defaultBarId }));
    }
  }, [defaultBarId, useDefaultBar]);

  const addRow = useCallback((productId = "", focusQty = false) => {
    const id = newRowId();
    setRows(prev => [...prev, {
      id,
      productId,
      quantity: "",
      barId: useDefaultBar ? defaultBarId : "",
      selected: false,
    }]);
    if (focusQty) {
      setTimeout(() => qtyRefs.current.get(id)?.focus(), 50);
    }
  }, [defaultBarId, useDefaultBar]);

  const updateRow = useCallback((id: string, field: keyof BulkRow, value: string | boolean) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  }, []);

  const removeSelected = useCallback(() => {
    setRows(prev => {
      const remaining = prev.filter(r => !r.selected);
      return remaining.length > 0 ? remaining : [{ id: newRowId(), productId: "", quantity: "", barId: defaultBarId, selected: false }];
    });
  }, [defaultBarId]);

  const duplicateSelected = useCallback(() => {
    setRows(prev => {
      const dupes = prev.filter(r => r.selected).map(r => ({
        ...r, id: newRowId(), selected: false,
      }));
      return [...prev, ...dupes];
    });
  }, []);

  const clearAll = useCallback(() => {
    setRows([{ id: newRowId(), productId: "", quantity: "", barId: defaultBarId, selected: false }]);
  }, [defaultBarId]);

  // Scan mode handler
  const handleScan = useCallback((value: string) => {
    const term = value.trim().toLowerCase();
    if (!term) return;
    const found = productByCode.get(term);
    if (!found) {
      toast.error(`Producto no encontrado: ${value}`);
      return;
    }
    if (found.warehouseStock <= 0) {
      toast.error(`Sin stock: ${found.name}`);
      return;
    }
    const id = newRowId();
    setRows(prev => [...prev, {
      id,
      productId: found.id,
      quantity: "",
      barId: useDefaultBar ? defaultBarId : "",
      selected: false,
    }]);
    setTimeout(() => qtyRefs.current.get(id)?.focus(), 50);
  }, [productByCode, defaultBarId, useDefaultBar]);

  const handleScanKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const input = e.currentTarget;
      handleScan(input.value);
      input.value = "";
    }
  };

  // Keyboard nav on qty inputs
  const handleQtyKeyDown = (e: KeyboardEvent<HTMLInputElement>, rowId: string) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (scanMode) {
        scanRef.current?.focus();
      } else {
        addRow("", false);
      }
    }
  };

  // Build transfer lines for confirmation
  const buildLines = useCallback((): TransferLine[] | null => {
    const lines: TransferLine[] = [];
    for (const row of rows) {
      if (!row.productId || !row.quantity) continue;
      const product = products.find(p => p.id === row.productId);
      if (!product) continue;
      const qty = parseFloat(row.quantity);
      if (isNaN(qty) || qty <= 0) continue;
      const barId = row.barId || defaultBarId;
      if (!barId) {
        toast.error("Selecciona barra destino para todas las filas");
        return null;
      }
      if (qty > product.warehouseStock) {
        toast.error(`${product.name}: excede stock (${product.warehouseStock} ${product.unit})`);
        return null;
      }
      const bar = barLocations.find(b => b.id === barId);
      lines.push({
        product,
        quantity: qty,
        estimatedCost: qty * product.unitCost,
        barId,
        barName: bar?.name || "",
      });
    }
    if (lines.length === 0) {
      toast.error("Agrega al menos un producto con cantidad");
      return null;
    }
    return lines;
  }, [rows, products, barLocations, defaultBarId]);

  const handleSubmit = () => {
    const lines = buildLines();
    if (lines) onConfirm(lines);
  };

  // Summary stats
  const summary = useMemo(() => {
    let totalCost = 0;
    let lineCount = 0;
    for (const row of rows) {
      if (!row.productId || !row.quantity) continue;
      const product = products.find(p => p.id === row.productId);
      const qty = parseFloat(row.quantity);
      if (!product || isNaN(qty) || qty <= 0) continue;
      totalCost += qty * product.unitCost;
      lineCount++;
    }
    return { totalCost, lineCount };
  }, [rows, products]);

  const allSelected = rows.length > 0 && rows.every(r => r.selected);
  const someSelected = rows.some(r => r.selected);

  return (
    <div className="space-y-4">
      {/* Top controls: default bar + scan mode */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[200px] space-y-1.5">
              <label className="text-sm font-medium">Barra destino default</label>
              <Select value={defaultBarId} onValueChange={setDefaultBarId}>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Seleccionar barra" />
                </SelectTrigger>
                <SelectContent>
                  {barLocations.map(b => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer pb-2">
              <Checkbox
                checked={useDefaultBar}
                onCheckedChange={(v) => setUseDefaultBar(!!v)}
              />
              Usar en todas las filas
            </label>
            <Button
              variant={scanMode ? "default" : "outline"}
              className="h-11 gap-2"
              onClick={() => {
                setScanMode(!scanMode);
                if (!scanMode) setTimeout(() => scanRef.current?.focus(), 100);
              }}
            >
              <ScanBarcode className="h-4 w-4" />
              {scanMode ? "Escaneo ON" : "Modo Escaneo"}
            </Button>
          </div>

          {/* Scan input */}
          {scanMode && (
            <div className="flex items-center gap-2 p-3 bg-primary/5 border border-primary/20 rounded-lg">
              <ScanBarcode className="h-5 w-5 text-primary shrink-0" />
              <Input
                ref={scanRef}
                placeholder="Escanear código o nombre de producto…"
                className="text-lg h-12 font-mono"
                onKeyDown={handleScanKeyDown}
                autoFocus
              />
              <Badge variant="secondary" className="shrink-0">Enter para agregar</Badge>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => addRow()}>
          <Plus className="h-3.5 w-3.5" /> Agregar fila
        </Button>
        {someSelected && (
          <>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={duplicateSelected}>
              <Copy className="h-3.5 w-3.5" /> Duplicar
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 text-destructive" onClick={removeSelected}>
              <Trash2 className="h-3.5 w-3.5" /> Eliminar
            </Button>
          </>
        )}
        <Button variant="ghost" size="sm" className="gap-1.5 ml-auto" onClick={clearAll}>
          <X className="h-3.5 w-3.5" /> Vaciar tabla
        </Button>
      </div>

      {/* Grid table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="p-3 w-10">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={(v) => setRows(prev => prev.map(r => ({ ...r, selected: !!v })))}
                  />
                </th>
                <th className="p-3 text-left font-medium min-w-[200px]">Producto</th>
                <th className="p-3 text-left font-medium w-16">Tipo</th>
                <th className="p-3 text-right font-medium w-24">Stock</th>
                <th className="p-3 text-left font-medium w-32">Cantidad</th>
                {!useDefaultBar && <th className="p-3 text-left font-medium min-w-[140px]">Barra</th>}
                <th className="p-3 text-right font-medium w-28">Costo est.</th>
                <th className="p-3 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const product = products.find(p => p.id === row.productId);
                const qty = parseFloat(row.quantity) || 0;
                const cost = product ? qty * product.unitCost : 0;
                const overStock = product ? qty > product.warehouseStock : false;

                return (
                  <tr key={row.id} className={`border-b transition-colors ${overStock ? "bg-destructive/5" : "hover:bg-muted/30"}`}>
                    <td className="p-3">
                      <Checkbox
                        checked={row.selected}
                        onCheckedChange={(v) => updateRow(row.id, "selected", !!v)}
                      />
                    </td>
                    <td className="p-3">
                      <Select value={row.productId} onValueChange={(v) => updateRow(row.id, "productId", v)}>
                        <SelectTrigger className="h-11 text-sm">
                          <SelectValue placeholder="Buscar producto…" />
                        </SelectTrigger>
                        <SelectContent>
                          <ScrollArea className="max-h-60">
                            {productsWithStock.map(p => (
                              <SelectItem key={p.id} value={p.id}>
                                <span className="flex items-center gap-2">
                                  <span className="truncate">{p.name}</span>
                                  <span className="text-muted-foreground text-xs">{p.code}</span>
                                </span>
                              </SelectItem>
                            ))}
                          </ScrollArea>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="p-3">
                      <Badge variant="outline" className="text-xs">
                        {product?.isVolumetric ? "ml" : "ud"}
                      </Badge>
                    </td>
                    <td className="p-3 text-right font-mono text-xs">
                      {product ? `${product.warehouseStock} ${product.unit}` : "—"}
                    </td>
                    <td className="p-3">
                      <Input
                        ref={(el) => {
                          if (el) qtyRefs.current.set(row.id, el);
                          else qtyRefs.current.delete(row.id);
                        }}
                        type="number"
                        min="0"
                        step={product?.isVolumetric ? "1" : "1"}
                        max={product?.warehouseStock}
                        value={row.quantity}
                        onChange={(e) => updateRow(row.id, "quantity", e.target.value)}
                        onKeyDown={(e) => handleQtyKeyDown(e, row.id)}
                        placeholder="0"
                        className={`h-11 font-mono text-base ${overStock ? "border-destructive" : ""}`}
                      />
                    </td>
                    {!useDefaultBar && (
                      <td className="p-3">
                        <Select value={row.barId} onValueChange={(v) => updateRow(row.id, "barId", v)}>
                          <SelectTrigger className="h-11">
                            <SelectValue placeholder="Barra" />
                          </SelectTrigger>
                          <SelectContent>
                            {barLocations.map(b => (
                              <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                    )}
                    <td className="p-3 text-right font-mono text-sm">
                      {qty > 0 && product ? formatCLP(cost) : "—"}
                    </td>
                    <td className="p-3">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => setRows(prev => prev.length > 1 ? prev.filter(r => r.id !== row.id) : prev)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Summary + Confirm */}
      {summary.lineCount > 0 && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Líneas: </span>
                  <span className="font-semibold">{summary.lineCount}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Costo total: </span>
                  <span className="font-bold text-lg">{formatCLP(summary.totalCost)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Destino: </span>
                  <span className="font-medium">
                    {useDefaultBar
                      ? barLocations.find(b => b.id === defaultBarId)?.name || "—"
                      : "Múltiples barras"
                    }
                  </span>
                </div>
              </div>
              <Button
                size="lg"
                className="gap-2 h-12 px-8 text-base"
                onClick={handleSubmit}
                disabled={submitting || summary.lineCount === 0}
              >
                <Send className="h-5 w-5" />
                {submitting ? "Procesando…" : "Confirmar envío masivo"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
