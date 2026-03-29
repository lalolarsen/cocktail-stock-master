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
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Plus, Info, Brain, Sparkles } from "lucide-react";
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

interface ComputedLineWithMemory extends ComputedLine {
  match_source?: "memory" | "fuzzy" | "none";
  from_memory?: boolean;
}

interface MinimalReviewTableProps {
  lines: ComputedLineWithMemory[];
  products: Product[];
  searchQuery: string;
  onUpdateLine: (id: string, updates: Partial<ComputedLine>) => void;
  onOpenDetail: (line: ComputedLine) => void;
  onCreateProduct: (lineId: string, rawName: string) => void;
}

export function MinimalReviewTable({
  lines,
  products,
  searchQuery,
  onUpdateLine,
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
          <Badge variant="outline" className="border-green-400 bg-green-50 text-green-700 text-xs">
            OK
          </Badge>
        );
      case "REVIEW_REQUIRED":
        return (
          <Badge variant="outline" className="border-red-400 bg-red-50 text-red-700 text-xs">
            REVISAR
          </Badge>
        );
      default:
        return null;
    }
  };

  return (
    <TooltipProvider>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[180px]">Nombre Factura</TableHead>
              <TableHead className="w-[60px] text-center">Match</TableHead>
              <TableHead className="min-w-[140px]">Producto</TableHead>
              <TableHead className="w-[70px] text-center">Cant.</TableHead>
              <TableHead className="w-[60px] text-center">Mult.</TableHead>
              <TableHead className="w-[70px] text-center">Un. Reales</TableHead>
              <TableHead className="w-[60px] text-center">Pack?</TableHead>
              <TableHead className="w-[60px] text-center">Desc.%</TableHead>
              <TableHead className="w-[100px] text-right bg-green-50">
                <span className="text-green-700 font-semibold">COGS Neto</span>
              </TableHead>
              <TableHead className="w-[70px] text-center">Estado</TableHead>
              <TableHead className="w-[40px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((line) => (
              <TableRow
                key={line.id}
                className={cn({
                  "bg-red-50/50": line.status === "REVIEW_REQUIRED",
                })}
              >
                {/* Nombre Factura */}
                <TableCell>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="text-xs truncate max-w-[180px] cursor-help">
                        {line.raw_product_name}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs">
                      <p className="text-sm">{line.raw_product_name}</p>
                      {line.pack_reason && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Patrón detectado: {line.pack_reason}
                        </p>
                      )}
                    </TooltipContent>
                  </Tooltip>
                </TableCell>

                {/* Match Indicator */}
                <TableCell className="text-center">
                  {line.match_source === "memory" || line.from_memory ? (
                    <Badge variant="outline" className="bg-purple-50 border-purple-300 text-purple-700 text-xs gap-1">
                      <Brain className="h-3 w-3" />
                      AUTO
                    </Badge>
                  ) : line.matched_product_id ? (
                    <Badge variant="outline" className="bg-blue-50 border-blue-300 text-blue-700 text-xs gap-1">
                      <Sparkles className="h-3 w-3" />
                      FUZZY
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs bg-muted">
                      NUEVA
                    </Badge>
                  )}
                </TableCell>

                {/* Match Producto */}
                <TableCell>
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
                      <SelectTrigger className="h-7 text-xs w-[110px]">
                        <SelectValue placeholder="Seleccionar" />
                      </SelectTrigger>
                      <SelectContent>
                        {filteredProducts.map((p) => (
                          <SelectItem key={p.id} value={p.id} className="text-xs">
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => onCreateProduct(line.id, line.raw_product_name)}
                      title="Crear producto"
                      className="h-6 w-6"
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                </TableCell>

                {/* Cantidad */}
                <TableCell className="text-center">
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={line.qty_invoice}
                    onChange={(e) =>
                      onUpdateLine(line.id, { qty_invoice: parseFloat(e.target.value) || 0 })
                    }
                    className="h-6 w-14 text-xs text-center"
                  />
                </TableCell>

                {/* Multiplicador */}
                <TableCell className="text-center">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Input
                        type="number"
                        min="1"
                        step="1"
                        value={line.pack_multiplier}
                        onChange={(e) =>
                          onUpdateLine(line.id, { pack_multiplier: parseFloat(e.target.value) || 1 })
                        }
                        className="h-6 w-12 text-xs text-center"
                      />
                    </TooltipTrigger>
                    {line.pack_reason && (
                      <TooltipContent>
                        Detectado: {line.pack_reason}
                      </TooltipContent>
                    )}
                  </Tooltip>
                </TableCell>

                {/* Unidades Reales */}
                <TableCell className="text-center">
                  <span className="font-bold text-primary text-sm">
                    {line.real_units}
                  </span>
                </TableCell>

                {/* Pack Switch */}
                <TableCell className="text-center">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex justify-center">
                        <Switch
                          checked={line.pack_priced}
                          onCheckedChange={(checked) =>
                            onUpdateLine(line.id, { pack_priced: checked })
                          }
                          className="h-4 w-8"
                        />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      {line.pack_priced
                        ? `Precio por pack (÷${line.pack_multiplier})`
                        : 'Precio por unidad'}
                    </TooltipContent>
                  </Tooltip>
                </TableCell>

                {/* Descuento % */}
                <TableCell className="text-center">
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    value={line.discount_pct}
                    onChange={(e) =>
                      onUpdateLine(line.id, { discount_pct: parseFloat(e.target.value) || 0 })
                    }
                    className="h-6 w-12 text-xs text-center"
                  />
                </TableCell>

                {/* COGS Neto Unitario */}
                <TableCell className="text-right bg-green-50/50">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className={cn("font-bold text-sm", {
                        "text-green-700": line.net_unit_cost > 0,
                        "text-red-600": line.net_unit_cost <= 0,
                      })}>
                        {formatCLP(line.net_unit_cost)}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <div className="text-xs">
                        <p>P. Factura: {formatCLP(line.invoice_unit_price_raw)}</p>
                        {line.discount_pct > 0 && <p>Desc: -{line.discount_pct}%</p>}
                        <p className="font-bold text-green-700 mt-1">COGS Neto: {formatCLP(line.net_unit_cost)}</p>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TableCell>

                {/* Estado */}
                <TableCell className="text-center">
                  {getStatusBadge(line)}
                </TableCell>

                {/* Detalle */}
                <TableCell>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => onOpenDetail(line)}
                    title="Ver detalle"
                    className="h-6 w-6"
                  >
                    <Info className="h-3 w-3" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </TooltipProvider>
  );
}
