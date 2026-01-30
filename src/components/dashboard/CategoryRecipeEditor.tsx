import { useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Zap, AlertCircle, GlassWater } from "lucide-react";

interface Product {
  id: string;
  name: string;
  category: string;
  unit: string;
}

interface IngredientEntry {
  product_id: string;
  quantity: number;
  is_mixer_slot?: boolean;
}

// Category-specific recipe templates
const CATEGORY_TEMPLATES: Record<string, {
  label: string;
  description: string;
  slots: {
    label: string;
    filterCategory?: string; // Filter products by category (ml, g, units)
    filterKeywords?: string[]; // Filter by name keywords
    defaultQuantity: number;
    quantityLabel: string;
    required: boolean;
    isMixerSlot?: boolean; // When true, bartender can select alternative at redemption
  }[];
}> = {
  destilados: {
    label: "Destilados",
    description: "90ml de destilado + bebida 220cc (mixer seleccionable en barra)",
    slots: [
      {
        label: "Destilado",
        filterCategory: "ml",
        defaultQuantity: 90,
        quantityLabel: "ml",
        required: true,
        isMixerSlot: false,
      },
      {
        label: "Bebida/Mixer",
        filterCategory: "units",
        defaultQuantity: 1,
        quantityLabel: "unidad",
        required: true,
        isMixerSlot: true, // Bartender selects at redemption
      },
    ],
  },
  shots: {
    label: "Shots",
    description: "Cantidad específica de destilado",
    slots: [
      {
        label: "Destilado/Licor",
        filterCategory: "ml",
        defaultQuantity: 45,
        quantityLabel: "ml",
        required: true,
      },
    ],
  },
  cocteleria: {
    label: "Coctelería",
    description: "Receta con múltiples ingredientes",
    slots: [], // Free-form, no predefined slots
  },
  botellas: {
    label: "Botellas",
    description: "Botella completa de inventario",
    slots: [
      {
        label: "Botella",
        filterCategory: "ml",
        defaultQuantity: 750,
        quantityLabel: "ml",
        required: true,
      },
    ],
  },
  espumantes: {
    label: "Espumantes",
    description: "Botella de espumante",
    slots: [
      {
        label: "Espumante",
        filterCategory: "ml",
        defaultQuantity: 750,
        quantityLabel: "ml",
        required: true,
      },
    ],
  },
  botellines: {
    label: "Botellines",
    description: "Botellín o lata individual",
    slots: [
      {
        label: "Producto",
        filterCategory: "units",
        defaultQuantity: 1,
        quantityLabel: "unidad",
        required: true,
      },
    ],
  },
  cervezas_shop: {
    label: "Cervezas Shop",
    description: "Cerveza individual",
    slots: [
      {
        label: "Cerveza",
        filterCategory: "units",
        defaultQuantity: 1,
        quantityLabel: "unidad",
        required: true,
      },
    ],
  },
  sin_alcohol: {
    label: "Sin Alcohol",
    description: "Bebida sin alcohol",
    slots: [
      {
        label: "Bebida",
        defaultQuantity: 1,
        quantityLabel: "unidad",
        required: true,
      },
    ],
  },
};

interface CategoryRecipeEditorProps {
  category: string;
  ingredients: IngredientEntry[];
  products: Product[];
  onChange: (ingredients: IngredientEntry[]) => void;
}

export const CategoryRecipeEditor = ({
  category,
  ingredients,
  products,
  onChange,
}: CategoryRecipeEditorProps) => {
  const normalizedCategory = category.toLowerCase().replace(/\s+/g, "_");
  const template = CATEGORY_TEMPLATES[normalizedCategory];
  const hasTemplate = template && template.slots.length > 0;

  // Filter products for a given slot
  const getFilteredProducts = (slot: typeof template.slots[0]) => {
    let filtered = products;
    
    if (slot.filterCategory) {
      filtered = filtered.filter(p => 
        p.category.toLowerCase() === slot.filterCategory ||
        p.unit.toLowerCase() === slot.filterCategory
      );
    }
    
    if (slot.filterKeywords && slot.filterKeywords.length > 0) {
      filtered = filtered.filter(p =>
        slot.filterKeywords!.some(kw => 
          p.name.toLowerCase().includes(kw.toLowerCase())
        )
      );
    }
    
    return filtered;
  };

  // Initialize ingredients based on template when category changes
  useEffect(() => {
    if (hasTemplate && ingredients.length === 0) {
      // Pre-fill with template slots including mixer slot flag
      const initial = template.slots.map(slot => ({
        product_id: "",
        quantity: slot.defaultQuantity,
        is_mixer_slot: slot.isMixerSlot || false,
      }));
      onChange(initial);
    }
  }, [normalizedCategory]);

  // Apply template with default quantities
  const applyTemplate = () => {
    if (!template) return;
    const initial = template.slots.map(slot => ({
      product_id: "",
      quantity: slot.defaultQuantity,
      is_mixer_slot: slot.isMixerSlot || false,
    }));
    onChange(initial);
  };

  // Add free-form ingredient (for cocteleria or extras)
  const addIngredient = () => {
    onChange([...ingredients, { product_id: "", quantity: 0 }]);
  };

  const removeIngredient = (index: number) => {
    onChange(ingredients.filter((_, i) => i !== index));
  };

  const updateIngredient = (
    index: number,
    field: "product_id" | "quantity",
    value: string | number
  ) => {
    const updated = [...ingredients];
    updated[index] = { ...updated[index], [field]: value };
    onChange(updated);
  };

  // Get product name by id
  const getProductName = (productId: string) => {
    const product = products.find(p => p.id === productId);
    return product?.name || "";
  };

  // Calculate cost if products have cost
  const estimatedIngredients = useMemo(() => {
    return ingredients.map((ing, index) => {
      const product = products.find(p => p.id === ing.product_id);
      return {
        ...ing,
        product,
        slotLabel: hasTemplate && template.slots[index] 
          ? template.slots[index].label 
          : `Ingrediente ${index + 1}`,
      };
    });
  }, [ingredients, products, hasTemplate, template]);

  // Render template-based editor
  if (hasTemplate) {
    return (
      <div className="space-y-4">
        {/* Template Info */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {template.label}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {template.description}
            </span>
          </div>
          <Button 
            type="button" 
            variant="ghost" 
            size="sm"
            onClick={applyTemplate}
            className="text-xs"
          >
            <Zap className="w-3 h-3 mr-1" />
            Resetear Plantilla
          </Button>
        </div>

        {/* Template Slots */}
        <div className="space-y-3">
          {template.slots.map((slot, index) => {
            const filteredProducts = getFilteredProducts(slot);
            const currentValue = ingredients[index] || { product_id: "", quantity: slot.defaultQuantity, is_mixer_slot: slot.isMixerSlot };
            
            // Mixer slots don't require product selection - it's chosen at redemption
            if (slot.isMixerSlot) {
              return (
                <Card key={index} className="p-3 border-dashed border-primary/50 bg-primary/5">
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <Label className="text-xs font-medium text-muted-foreground mb-1 block">
                        {slot.label} <Badge variant="secondary" className="ml-2 text-[10px]">Variable</Badge>
                      </Label>
                      <div className="flex items-center gap-2 h-10 px-3 rounded-md border bg-muted/50 text-muted-foreground text-sm">
                        <GlassWater className="w-4 h-4" />
                        <span>Elegido por cliente en barra</span>
                      </div>
                    </div>
                    <div className="w-28">
                      <Label className="text-xs font-medium text-muted-foreground mb-1 block">
                        Cantidad ({slot.quantityLabel})
                      </Label>
                      <Input
                        type="number"
                        value={currentValue.quantity || ""}
                        onChange={(e) => {
                          const updated = [...ingredients];
                          if (!updated[index]) {
                            updated[index] = { product_id: "", quantity: 0, is_mixer_slot: true };
                          }
                          updated[index].quantity = Number(e.target.value);
                          updated[index].is_mixer_slot = true;
                          onChange(updated);
                        }}
                      />
                    </div>
                  </div>
                </Card>
              );
            }
            
            return (
              <Card key={index} className="p-3">
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <Label className="text-xs font-medium text-muted-foreground mb-1 block">
                      {slot.label} {slot.required && <span className="text-destructive">*</span>}
                    </Label>
                    <Select
                      value={currentValue.product_id || "placeholder"}
                      onValueChange={(value) => {
                        const updated = [...ingredients];
                        if (!updated[index]) {
                          updated[index] = { product_id: "", quantity: slot.defaultQuantity };
                        }
                        updated[index].product_id = value === "placeholder" ? "" : value;
                        onChange(updated);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={`Seleccionar ${slot.label.toLowerCase()}`} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="placeholder" disabled>
                          Seleccionar {slot.label.toLowerCase()}
                        </SelectItem>
                        {filteredProducts.length > 0 ? (
                          filteredProducts.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name}
                            </SelectItem>
                          ))
                        ) : (
                          // If no filtered products, show all
                          products.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-28">
                    <Label className="text-xs font-medium text-muted-foreground mb-1 block">
                      Cantidad ({slot.quantityLabel})
                    </Label>
                    <Input
                      type="number"
                      value={currentValue.quantity || ""}
                      onChange={(e) => {
                        const updated = [...ingredients];
                        if (!updated[index]) {
                          updated[index] = { product_id: "", quantity: 0 };
                        }
                        updated[index].quantity = Number(e.target.value);
                        onChange(updated);
                      }}
                    />
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        {/* Extra Ingredients */}
        {ingredients.length > template.slots.length && (
          <div className="space-y-2 pt-2 border-t">
            <Label className="text-xs text-muted-foreground">Ingredientes Adicionales</Label>
            {ingredients.slice(template.slots.length).map((ing, idx) => {
              const actualIndex = template.slots.length + idx;
              return (
                <div key={actualIndex} className="flex gap-2 items-center">
                  <Select
                    value={ing.product_id || "placeholder"}
                    onValueChange={(value) => 
                      updateIngredient(actualIndex, "product_id", value === "placeholder" ? "" : value)
                    }
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Seleccionar producto" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="placeholder" disabled>Seleccionar producto</SelectItem>
                      {products.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    className="w-24"
                    placeholder="Cantidad"
                    value={ing.quantity || ""}
                    onChange={(e) => updateIngredient(actualIndex, "quantity", Number(e.target.value))}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeIngredient(actualIndex)}
                    className="h-9 w-9 text-destructive"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}

        <Button type="button" variant="outline" size="sm" onClick={addIngredient}>
          <Plus className="w-3 h-3 mr-1" />
          Agregar Ingrediente Extra
        </Button>
      </div>
    );
  }

  // Render free-form editor (cocteleria and others without template)
  return (
    <div className="space-y-4">
      {/* Info for cocteleria */}
      {normalizedCategory === "cocteleria" && (
        <div className="flex items-start gap-2 p-3 bg-muted/50 rounded-lg">
          <AlertCircle className="w-4 h-4 text-muted-foreground mt-0.5" />
          <div className="text-xs text-muted-foreground">
            <strong>Coctelería:</strong> Agrega todos los ingredientes necesarios para la receta del cóctel.
            Cada ingrediente se descontará del inventario al canjear.
          </div>
        </div>
      )}

      <div className="flex justify-between items-center">
        <Label>Ingredientes de la Receta</Label>
        <Button type="button" variant="outline" size="sm" onClick={addIngredient}>
          <Plus className="w-3 h-3 mr-1" />
          Agregar
        </Button>
      </div>

      {ingredients.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2">
          Sin receta definida. Agrega ingredientes para habilitar el descuento de stock.
        </p>
      ) : (
        <div className="space-y-2">
          {ingredients.map((ing, index) => (
            <div key={index} className="flex gap-2 items-center">
              <Select
                value={ing.product_id || "placeholder"}
                onValueChange={(value) => 
                  updateIngredient(index, "product_id", value === "placeholder" ? "" : value)
                }
              >
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Seleccionar producto" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="placeholder" disabled>Seleccionar producto</SelectItem>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} <span className="text-muted-foreground">({p.unit})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="number"
                className="w-24"
                placeholder="Cantidad"
                value={ing.quantity || ""}
                onChange={(e) => updateIngredient(index, "quantity", Number(e.target.value))}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeIngredient(index)}
                className="h-9 w-9 text-destructive"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
