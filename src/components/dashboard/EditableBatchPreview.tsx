import { useState, useEffect, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Edit2, Search, X } from "lucide-react";
import { formatCLP } from "@/lib/currency";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";

interface BatchRow {
  id: string;
  row_index: number;
  product_id: string | null;
  product_name_excel: string | null;
  product_name_matched: string | null;
  match_confidence: string | null;
  tipo_consumo: string | null;
  location_destino_id: string | null;
  location_origen_id: string | null;
  quantity: number | null;
  unit_cost: number | null;
  computed_base_qty: number | null;
  stock_teorico: number | null;
  stock_real: number | null;
  errors: string[] | null;
  is_valid: boolean;
  raw_data: Record<string, any>;
}

interface Product {
  id: string;
  name: string;
  code: string | null;
  capacity_ml: number | null;
}

const formatNum = (n: number) => {
  if (Number.isInteger(n)) return n.toString();
  return Number(n.toFixed(2)).toString();
};

interface EditableBatchPreviewProps {
  rows: BatchRow[];
  batchType: string;
  products: Product[];
  onRowsChange: (rows: BatchRow[]) => void;
}

const confidenceColor = (c: string | null) => {
  if (c === "alta") return "text-emerald-600";
  if (c === "media") return "text-amber-600";
  if (c === "baja") return "text-orange-600";
  return "text-destructive";
};

function ProductPicker({ currentId, currentName, products, onSelect }: {
  currentId: string | null;
  currentName: string | null;
  products: Product[];
  onSelect: (p: Product) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search) return products.slice(0, 50);
    const q = search.toLowerCase();
    return products.filter(p =>
      p.name.toLowerCase().includes(q) || (p.code && p.code.toLowerCase().includes(q))
    ).slice(0, 50);
  }, [products, search]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-1 text-left max-w-[160px] group">
          <span className={`truncate text-xs ${currentId ? "text-foreground" : "text-destructive"}`}>
            {currentName || "Sin match"}
          </span>
          <Edit2 className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0 transition-opacity" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2" align="start">
        <div className="relative mb-2">
          <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar producto..."
            className="pl-7 h-8 text-xs"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
          {search && (
            <button className="absolute right-2 top-2.5" onClick={() => setSearch("")}>
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          )}
        </div>
        <ScrollArea className="max-h-48">
          {filtered.length === 0 ? (
            <p className="text-xs text-muted-foreground p-2">Sin resultados</p>
          ) : (
            filtered.map(p => (
              <button
                key={p.id}
                className={`w-full text-left px-2 py-1.5 rounded text-xs hover:bg-muted/60 flex items-center justify-between ${p.id === currentId ? "bg-primary/10" : ""}`}
                onClick={() => { onSelect(p); setOpen(false); setSearch(""); }}
              >
                <span className="truncate">{p.name}</span>
                {p.code && <span className="text-[10px] text-muted-foreground ml-2 shrink-0">{p.code}</span>}
              </button>
            ))
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

export function EditableBatchPreview({ rows, batchType, products, onRowsChange }: EditableBatchPreviewProps) {
  const updateRow = (idx: number, patch: Partial<BatchRow>) => {
    const updated = [...rows];
    updated[idx] = { ...updated[idx], ...patch };

    // Re-validate after edit
    const row = updated[idx];
    const errors: string[] = [];
    if (!row.product_id) errors.push("Sin producto asociado");
    if ((row.quantity === null || row.quantity <= 0) && batchType !== "CONTEO") errors.push("Cantidad inválida");
    if (batchType === "CONTEO" && (row.stock_real === null || row.stock_real < 0)) errors.push("Stock real inválido");

    updated[idx].is_valid = errors.length === 0;
    updated[idx].errors = errors.length > 0 ? errors : null;

    onRowsChange(updated);
  };

  const handleProductSelect = (idx: number, product: Product) => {
    updateRow(idx, {
      product_id: product.id,
      product_name_matched: product.name,
      match_confidence: "alta",
    });
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="bg-muted/50 border-b sticky top-0">
          <tr>
            <th className="py-2 px-2 text-left font-medium">#</th>
            <th className="py-2 px-2 text-left font-medium">Producto Excel</th>
            <th className="py-2 px-2 text-left font-medium">Producto asociado</th>
            <th className="py-2 px-2 text-left font-medium">Confianza</th>
            {batchType === "COMPRA" && (
              <>
                <th className="py-2 px-2 text-right font-medium">Cantidad</th>
                <th className="py-2 px-2 text-right font-medium">Costo/U</th>
              </>
            )}
            {batchType === "TRANSFERENCIA" && (
              <th className="py-2 px-2 text-right font-medium">Cantidad</th>
            )}
            {batchType === "CONTEO" && (
              <>
                <th className="py-2 px-2 text-right font-medium">Teórico</th>
                <th className="py-2 px-2 text-right font-medium">Real</th>
              </>
            )}
            <th className="py-2 px-2 text-left font-medium">Estado</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => (
            <tr key={r.id} className={`border-b ${!r.is_valid ? "bg-destructive/5" : "hover:bg-muted/30"}`}>
              <td className="py-1.5 px-2 text-muted-foreground">{r.row_index}</td>
              <td className="py-1.5 px-2 max-w-[140px] truncate text-muted-foreground">{r.product_name_excel || "—"}</td>
              <td className="py-1.5 px-2">
                <ProductPicker
                  currentId={r.product_id}
                  currentName={r.product_name_matched}
                  products={products}
                  onSelect={(p) => handleProductSelect(idx, p)}
                />
              </td>
              <td className="py-1.5 px-2">
                <span className={`text-[10px] font-medium ${confidenceColor(r.match_confidence)}`}>
                  {r.match_confidence || "—"}
                </span>
              </td>
              {batchType === "COMPRA" && (
                <>
                  <td className="py-1.5 px-2 text-right">
                    <Input
                      type="number"
                      className="h-6 w-16 text-xs text-right p-1 ml-auto"
                      value={r.quantity ?? ""}
                      onChange={(e) => updateRow(idx, { quantity: e.target.value ? Number(e.target.value) : null })}
                      min={0}
                    />
                  </td>
                  <td className="py-1.5 px-2 text-right">
                    <Input
                      type="number"
                      className="h-6 w-20 text-xs text-right p-1 ml-auto"
                      value={r.unit_cost ?? ""}
                      onChange={(e) => updateRow(idx, { unit_cost: e.target.value ? Number(e.target.value) : null })}
                      min={0}
                    />
                  </td>
                </>
              )}
              {batchType === "TRANSFERENCIA" && (
                <td className="py-1.5 px-2 text-right">
                  <Input
                    type="number"
                    className="h-6 w-16 text-xs text-right p-1 ml-auto"
                    value={r.quantity ?? ""}
                    onChange={(e) => updateRow(idx, { quantity: e.target.value ? Number(e.target.value) : null })}
                    min={0}
                  />
                </td>
              )}
              {batchType === "CONTEO" && (
                <>
                  <td className="py-1.5 px-2 text-right text-muted-foreground">{r.stock_teorico ?? "—"}</td>
                  <td className="py-1.5 px-2 text-right">
                    <Input
                      type="number"
                      className="h-6 w-16 text-xs text-right p-1 ml-auto"
                      value={r.stock_real ?? ""}
                      onChange={(e) => updateRow(idx, { stock_real: e.target.value ? Number(e.target.value) : null })}
                      min={0}
                    />
                  </td>
                </>
              )}
              <td className="py-1.5 px-2">
                {r.is_valid
                  ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  : <span className="text-[10px] text-destructive" title={(r.errors || []).join("; ")}>{(r.errors || [])[0] || "Error"}</span>
                }
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
