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
import { Plus, Info, Banknote, Undo2, Brain, Sparkles } from "lucide-react";
import { formatCLP } from "@/lib/currency";
import { cn } from "@/lib/utils";
import type { ComputedLine, TaxCategory } from "@/lib/purchase-calculator";
import { getTaxCategoryLabel } from "@/lib/purchase-calculator";

interface Product {
  id: string;
  name: string;
  code: string;
  category: string;
  unit: string;
}

// Extended line type with memory info
interface ComputedLineWithMemory extends ComputedLine {
  match_source?: "memory" | "fuzzy" | "none";
  from_memory?: boolean;
}

interface MinimalReviewTableProps {
  lines: ComputedLineWithMemory[];
  products: Product[];
  searchQuery: string;
  onUpdateLine: (id: string, updates: Partial<ComputedLine>) => void;
  onMarkAsExpense: (id: string) => void;
  onMarkAsInventory: (id: string) => void;
  onOpenDetail: (line: ComputedLine) => void;
  onCreateProduct: (lineId: string, rawName: string) => void;
}

const TAX_CATEGORY_OPTIONS: { value: TaxCategory; label: string; color: string }[] = [
  { value: 'NONE', label: 'Sin impuesto', color: 'bg-gray-100 text-gray-600' },
  { value: 'IABA10', label: 'IABA 10%', color: 'bg-blue-100 text-blue-700' },
  { value: 'IABA18', label: 'IABA 18%', color: 'bg-blue-200 text-blue-800' },
  { value: 'ILA_VINO_20_5', label: 'ILA Vino 20,5%', color: 'bg-purple-100 text-purple-700' },
  { value: 'ILA_CERVEZA_20_5', label: 'ILA Cerveza 20,5%', color: 'bg-amber-100 text-amber-700' },
  { value: 'ILA_DESTILADOS_31_5', label: 'ILA Dest. 31,5%', color: 'bg-red-100 text-red-700' },
];

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
      case "EXPENSE":
        return (
          <Badge variant="outline" className="border-amber-400 bg-amber-50 text-amber-700 text-xs">
            GASTO
          </Badge>
        );
      case "IGNORED":
        return (
          <Badge variant="outline" className="border-gray-300 bg-gray-50 text-gray-500 text-xs">
            IGNORAR
          </Badge>
        );
      default:
        return null;
    }
  };

  const getTaxCategoryChip = (category: TaxCategory) => {
    const option = TAX_CATEGORY_OPTIONS.find(o => o.value === category);
    if (!option || category === 'NONE') return null;
    return (
      <Badge variant="outline" className={cn("text-xs", option.color)}>
        {option.label}
      </Badge>
    );
  };

  return (
    <TooltipProvider>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[160px]">Nombre Factura</TableHead>
              <TableHead className="w-[60px] text-center">Memoria</TableHead>
              <TableHead className="min-w-[130px]">Match Producto</TableHead>
              <TableHead className="w-[70px] text-center">Cant.</TableHead>
              <TableHead className="w-[60px] text-center">Mult.</TableHead>
              <TableHead className="w-[70px] text-center">Un. Reales</TableHead>
              <TableHead className="w-[90px] text-right">P. Factura</TableHead>
              <TableHead className="w-[60px] text-center">Pack?</TableHead>
              <TableHead className="w-[60px] text-center">Desc.%</TableHead>
              <TableHead className="w-[90px] text-right">P. Neto Unit.</TableHead>
              <TableHead className="w-[110px]">Impuesto Esp.</TableHead>
              <TableHead className="w-[100px] text-right bg-green-50">
                <span className="text-green-700 font-semibold">Costo Inv.</span>
              </TableHead>
              <TableHead className="w-[70px] text-center">Estado</TableHead>
              <TableHead className="w-[40px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((line) => {
              const isExpenseOrIgnored = line.status === "EXPENSE" || line.status === "IGNORED";
              
              return (
                <TableRow 
                  key={line.id}
                  className={cn({
                    "bg-red-50/50": line.status === "REVIEW_REQUIRED",
                    "bg-amber-50/50": line.status === "EXPENSE",
                    "bg-gray-50/50": line.status === "IGNORED",
                  })}
                >
                  {/* Nombre Factura */}
                  <TableCell>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="text-xs truncate max-w-[160px] cursor-help">
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

                  {/* Memoria Indicator */}
                  <TableCell className="text-center">
                    {line.match_source === "memory" || line.from_memory ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex justify-center">
                            <Badge variant="outline" className="bg-purple-50 border-purple-300 text-purple-700 text-xs gap-1">
                              <Brain className="h-3 w-3" />
                              AUTO
                            </Badge>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="text-sm">Encontrado en memoria</p>
                          <p className="text-xs text-muted-foreground">
                            Confianza: {Math.round((line.match_confidence || 0) * 100)}%
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    ) : line.matched_product_id ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex justify-center">
                            <Badge variant="outline" className="bg-blue-50 border-blue-300 text-blue-700 text-xs gap-1">
                              <Sparkles className="h-3 w-3" />
                              FUZZY
                            </Badge>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="text-sm">Match por similitud</p>
                          <p className="text-xs text-muted-foreground">
                            Confianza: {Math.round((line.match_confidence || 0) * 100)}%
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <Badge variant="outline" className="text-xs bg-muted">
                        NUEVA
                      </Badge>
                    )}
                  </TableCell>

                  {/* Match Producto */}
                  <TableCell>
                    {!isExpenseOrIgnored ? (
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
                          <SelectTrigger className="h-7 text-xs w-[100px]">
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
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => onMarkAsExpense(line.id)}
                          title="Marcar como gasto"
                          className="h-6 w-6 text-amber-600 hover:text-amber-700"
                        >
                          <Banknote className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex gap-1 items-center">
                        <span className="text-xs text-amber-700">Gasto</span>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => onMarkAsInventory(line.id)}
                          title="Volver a inventario"
                          className="h-6 w-6"
                        >
                          <Undo2 className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </TableCell>

                  {/* Cantidad Factura */}
                  <TableCell className="text-center">
                    {!isExpenseOrIgnored ? (
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
                    ) : (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
                  </TableCell>

                  {/* Multiplicador (editable) */}
                  <TableCell className="text-center">
                    {!isExpenseOrIgnored ? (
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
                    ) : (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
                  </TableCell>

                  {/* Unidades Reales (calculado) */}
                  <TableCell className="text-center">
                    {!isExpenseOrIgnored ? (
                      <span className="font-bold text-primary text-sm">
                        {line.real_units}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
                  </TableCell>

                  {/* Precio Factura */}
                  <TableCell className="text-right">
                    {!isExpenseOrIgnored ? (
                      <span className="text-xs">
                        {formatCLP(line.invoice_unit_price_raw)}
                      </span>
                    ) : (
                      <span className="text-xs text-amber-700">
                        {formatCLP(line.gross_line)}
                      </span>
                    )}
                  </TableCell>

                  {/* Pack Switch */}
                  <TableCell className="text-center">
                    {!isExpenseOrIgnored ? (
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
                    ) : (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
                  </TableCell>

                  {/* Descuento % (editable) */}
                  <TableCell className="text-center">
                    {!isExpenseOrIgnored ? (
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
                    ) : (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
                  </TableCell>

                  {/* Precio Neto Unitario (calculado) */}
                  <TableCell className="text-right">
                    {!isExpenseOrIgnored ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className={cn("text-sm", {
                            "text-muted-foreground": line.unit_price_after_discount > 0,
                            "text-red-600": line.unit_price_after_discount <= 0,
                          })}>
                            {formatCLP(line.unit_price_after_discount)}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <div className="text-xs">
                            <p>P. Real: {formatCLP(line.unit_price_real)}</p>
                            <p>Desc: -{line.discount_pct}%</p>
                            <p className="font-bold">= {formatCLP(line.unit_price_after_discount)}</p>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
                  </TableCell>

                  {/* Impuesto Específico (dropdown + monto) */}
                  <TableCell>
                    {!isExpenseOrIgnored ? (
                      <div className="flex flex-col gap-1">
                        <Select
                          value={line.tax_category}
                          onValueChange={(value) =>
                            onUpdateLine(line.id, { tax_category: value as TaxCategory })
                          }
                        >
                          <SelectTrigger className="h-6 text-xs w-[90px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {TAX_CATEGORY_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value} className="text-xs">
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {line.tax_category !== 'NONE' && line.specific_tax_amount > 0 && (
                          <span className="text-xs text-blue-600">
                            +{formatCLP(line.specific_tax_amount)}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
                  </TableCell>

                  {/* NUEVO: Costo Unitario Inventario (VERDE) - incluye ILA/IABA */}
                  <TableCell className="text-right bg-green-50/50">
                    {!isExpenseOrIgnored ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className={cn("font-bold text-sm", {
                            "text-green-700": line.inventory_unit_cost > 0,
                            "text-red-600": line.inventory_unit_cost <= 0,
                          })}>
                            {formatCLP(line.inventory_unit_cost)}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <div className="text-xs">
                            <p>Neto unitario: {formatCLP(line.net_unit_cost)}</p>
                            {line.specific_tax_amount > 0 && (
                              <p className="text-blue-600">+ Imp. esp./unit: {formatCLP(Math.round(line.specific_tax_amount / line.real_units))}</p>
                            )}
                            <p className="font-bold text-green-700 mt-1">= {formatCLP(line.inventory_unit_cost)}</p>
                            <p className="text-muted-foreground mt-1">Este valor se usa para CPP</p>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <span className="text-xs text-amber-700">
                        {formatCLP(line.gross_line)}
                      </span>
                    )}
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
                      className="h-6 w-6"
                    >
                      <Info className="h-3 w-3" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </TooltipProvider>
  );
}
