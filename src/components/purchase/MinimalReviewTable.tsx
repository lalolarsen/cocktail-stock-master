import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Info, Banknote, Undo2 } from "lucide-react";
import { formatCLP } from "@/lib/currency";
import { cn } from "@/lib/utils";
import type { ComputedLine } from "@/lib/purchase-calculator";

interface Product {
  id: string;
  name: string;
  code: string;
  category: string;
  unit: string;
}

interface MinimalReviewTableProps {
  lines: ComputedLine[];
  products: Product[];
  searchQuery: string;
  onUpdateLine: (id: string, updates: Partial<ComputedLine>) => void;
  onMarkAsExpense: (id: string) => void;
  onMarkAsInventory: (id: string) => void;
  onOpenDetail: (line: ComputedLine) => void;
  onCreateProduct: (lineId: string, rawName: string) => void;
}

export function MinimalReviewTable({
  lines,
  products,
  searchQuery,
  onUpdateLine,
  onMarkAsExpense,
  onMarkAsInventory,
  onOpenDetail,
  onCreateProduct,
}: MinimalReviewTableProps) {
  const filteredProducts = products.filter(
    (p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getStatusBadge = (line: ComputedLine) => {
    switch (line.status) {
      case "OK":
        return (
          <Badge variant="outline" className="border-green-400 bg-green-50 text-green-700">
            OK
          </Badge>
        );
      case "REVIEW_REQUIRED":
        return (
          <Badge variant="outline" className="border-red-400 bg-red-50 text-red-700">
            REVISAR
          </Badge>
        );
      case "EXPENSE":
        return (
          <Badge variant="outline" className="border-amber-400 bg-amber-50 text-amber-700">
            GASTO
          </Badge>
        );
      case "IGNORED":
        return (
          <Badge variant="outline" className="border-gray-300 bg-gray-50 text-gray-500">
            IGNORAR
          </Badge>
        );
      default:
        return null;
    }
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="min-w-[180px]">Producto</TableHead>
          <TableHead className="w-[90px]">Cant. Fact.</TableHead>
          <TableHead className="w-[80px]">Mult.</TableHead>
          <TableHead className="w-[90px]">Un. Reales</TableHead>
          <TableHead className="w-[110px] text-right">Costo Neto</TableHead>
          <TableHead className="w-[100px] text-right">Neto Línea</TableHead>
          <TableHead className="w-[90px] text-center">Estado</TableHead>
          <TableHead className="w-[70px]"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {lines.map((line) => (
          <TableRow 
            key={line.id}
            className={cn({
              "bg-red-50/50": line.status === "REVIEW_REQUIRED",
              "bg-amber-50/50": line.status === "EXPENSE",
              "bg-gray-50/50": line.status === "IGNORED",
            })}
          >
            {/* Producto (Selector) */}
            <TableCell>
              <div className="space-y-1">
                <div 
                  className="text-xs text-muted-foreground truncate max-w-[180px]"
                  title={line.raw_product_name}
                >
                  {line.raw_product_name}
                </div>
                {line.status !== "EXPENSE" && line.status !== "IGNORED" ? (
                  <div className="flex gap-1 items-center">
                    <Select
                      value={line.matched_product_id || ""}
                      onValueChange={(value) =>
                        onUpdateLine(line.id, { 
                          matched_product_id: value || null,
                          matched_product_name: products.find(p => p.id === value)?.name || null,
                          match_confidence: value ? 1.0 : 0,
                        })
                      }
                    >
                      <SelectTrigger className="h-8 text-xs w-[140px]">
                        <SelectValue placeholder="Seleccionar..." />
                      </SelectTrigger>
                      <SelectContent>
                        {filteredProducts.map((p) => (
                          <SelectItem key={p.id} value={p.id} className="text-xs">
                            {p.name} ({p.code})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => onCreateProduct(line.id, line.raw_product_name)}
                      title="Crear nuevo producto"
                      className="h-7 w-7"
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => onMarkAsExpense(line.id)}
                      title="Marcar como gasto"
                      className="h-7 w-7 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                    >
                      <Banknote className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex gap-1 items-center">
                    <span className="text-xs text-amber-700">Clasificado como gasto</span>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => onMarkAsInventory(line.id)}
                      title="Volver a inventario"
                      className="h-7 w-7"
                    >
                      <Undo2 className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>
            </TableCell>

            {/* Cantidad Factura */}
            <TableCell>
              {line.status !== "EXPENSE" ? (
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={line.qty_invoice}
                  onChange={(e) =>
                    onUpdateLine(line.id, { qty_invoice: parseFloat(e.target.value) || 0 })
                  }
                  className="h-7 w-16 text-xs text-center"
                />
              ) : (
                <span className="text-xs text-muted-foreground">-</span>
              )}
            </TableCell>

            {/* Multiplicador (editable) */}
            <TableCell>
              {line.status !== "EXPENSE" ? (
                <Input
                  type="number"
                  min="1"
                  step="1"
                  value={line.pack_multiplier}
                  onChange={(e) =>
                    onUpdateLine(line.id, { pack_multiplier: parseFloat(e.target.value) || 1 })
                  }
                  className="h-7 w-14 text-xs text-center"
                />
              ) : (
                <span className="text-xs text-muted-foreground">-</span>
              )}
            </TableCell>

            {/* Unidades Reales (calculado) */}
            <TableCell>
              {line.status !== "EXPENSE" ? (
                <span className="font-bold text-primary text-sm">
                  {line.real_units}
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">-</span>
              )}
            </TableCell>

            {/* Costo Neto Unitario (calculado) */}
            <TableCell className="text-right">
              {line.status !== "EXPENSE" ? (
                <span className={cn("font-medium text-sm", {
                  "text-green-700": line.net_unit_cost > 0,
                  "text-red-600": line.net_unit_cost <= 0,
                })}>
                  {formatCLP(line.net_unit_cost)}
                </span>
              ) : (
                <span className="text-sm text-amber-700">
                  {formatCLP(line.gross_line)}
                </span>
              )}
            </TableCell>

            {/* Neto Línea (calculado) */}
            <TableCell className="text-right">
              <span className="text-sm">
                {formatCLP(line.net_line_for_cost)}
              </span>
            </TableCell>

            {/* Estado */}
            <TableCell className="text-center">
              {getStatusBadge(line)}
            </TableCell>

            {/* Ver Detalle */}
            <TableCell>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => onOpenDetail(line)}
                title="Ver fórmula y detalle"
                className="h-7 w-7"
              >
                <Info className="h-3 w-3" />
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
