import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, GlassWater, FlaskConical } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Product {
  id: string;
  name: string;
  category: string;
  unit: string;
  capacity_ml?: number | null;
}

/**
 * ingredient_type is the explicit source of truth for which section an ingredient belongs to.
 *
 * - "ML" → Botellas section
 * - "UD" → Unidades section (includes Latas/Redbull)
 */
export interface IngredientEntry {
  product_id: string;
  quantity: number;
  ingredient_type: "ML" | "UD";
}

function isBottleProduct(p: Product | undefined) {
  if (!p) return false;
  return typeof p.capacity_ml === "number" && p.capacity_ml > 0;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionHeader({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: React.ElementType;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex items-center gap-2 pb-1 border-b">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <span className="text-sm font-semibold">{title}</span>
      {subtitle && (
        <span className="text-xs text-muted-foreground ml-1">{subtitle}</span>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface CategoryRecipeEditorProps {
  category: string;
  ingredients: IngredientEntry[];
  products: Product[];
  onChange: (ingredients: IngredientEntry[]) => void;
}

export const CategoryRecipeEditor = ({
  ingredients,
  products,
  onChange,
}: CategoryRecipeEditorProps) => {
  const bottleProducts = products.filter((p) => isBottleProduct(p));
  const unitProducts = products.filter((p) => !isBottleProduct(p));

  // ── Mutators ──────────────────────────────────────────────────────────────

  const updateEntry = (index: number, partial: Partial<IngredientEntry>) => {
    const updated = [...ingredients];
    updated[index] = { ...updated[index], ...partial };
    onChange(updated);
  };

  const removeEntry = (index: number) => {
    onChange(ingredients.filter((_, i) => i !== index));
  };

  const addMlIngredient = () => {
    onChange([
      ...ingredients,
      { product_id: "", quantity: 0, ingredient_type: "ML" },
    ]);
  };

  const addUdIngredient = () => {
    onChange([
      ...ingredients,
      { product_id: "", quantity: 1, ingredient_type: "UD" },
    ]);
  };

  // ── Derived lists by explicit type ────────────────────────────────────────

  const mlEntries = ingredients
    .map((ing, i) => ({ ing, i }))
    .filter(({ ing }) => ing.ingredient_type === "ML");

  const udEntries = ingredients
    .map((ing, i) => ({ ing, i }))
    .filter(({ ing }) => ing.ingredient_type === "UD" || ing.ingredient_type === ("MIXER" as string));

  // ── Row renderers ─────────────────────────────────────────────────────────

  const renderMlRows = () =>
    mlEntries.map(({ ing, i }) => (
      <div key={i} className="flex gap-2 items-center">
        <Select
          value={ing.product_id || "__placeholder__"}
          onValueChange={(v) =>
            updateEntry(i, { product_id: v === "__placeholder__" ? "" : v })
          }
        >
          <SelectTrigger className="flex-1">
            <SelectValue placeholder="Seleccionar botella" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__placeholder__" disabled>
              Seleccionar botella
            </SelectItem>
            {bottleProducts.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}{" "}
                <span className="text-muted-foreground text-xs">
                  ({p.capacity_ml}ml)
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="number"
          className="w-24"
          placeholder="ml"
          value={ing.quantity || ""}
          onChange={(e) => updateEntry(i, { quantity: Number(e.target.value) })}
        />
        <span className="text-xs text-muted-foreground w-5">ml</span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => removeEntry(i)}
          className="h-9 w-9 text-destructive"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    ));

  const renderUdRows = () =>
    udEntries.map(({ ing, i }) => (
      <div key={i} className="flex gap-2 items-center">
        <Select
          value={ing.product_id || "__placeholder__"}
          onValueChange={(v) =>
            updateEntry(i, {
              product_id: v === "__placeholder__" ? "" : v,
              ingredient_type: "UD",
            })
          }
        >
          <SelectTrigger className="flex-1">
            <SelectValue placeholder="Seleccionar producto" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__placeholder__" disabled>
              Seleccionar producto
            </SelectItem>
            {unitProducts.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}{" "}
                <span className="text-muted-foreground text-xs">({p.unit})</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="number"
          className="w-24"
          placeholder="ud"
          value={ing.quantity || ""}
          onChange={(e) => updateEntry(i, { quantity: Number(e.target.value) })}
        />
        <span className="text-xs text-muted-foreground w-5">ud</span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => removeEntry(i)}
          className="h-9 w-9 text-destructive"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    ));

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* ── SECTION 1: ML (Botellas) ──────────────────────────────────────── */}
      <div className="space-y-2">
        <SectionHeader
          icon={FlaskConical}
          title="Ingredientes (Botellas — ML)"
          subtitle="opcional"
        />
        <div className="space-y-2">
          {renderMlRows()}
          {mlEntries.length === 0 && (
            <p className="text-xs text-muted-foreground py-1">
              Sin ingredientes ML.
            </p>
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addMlIngredient}
        >
          <Plus className="w-3 h-3 mr-1" />
          Agregar botella (ML)
        </Button>
      </div>

      {/* ── SECTION 2: UD (Unidades — incluye Latas/Redbull) ──────────────── */}
      <div className="space-y-2">
        <SectionHeader
          icon={GlassWater}
          title="Ingredientes (Unidades — UD)"
          subtitle="incluye Latas/Redbull"
        />
        <div className="space-y-2">
          {renderUdRows()}
          {udEntries.length === 0 && (
            <p className="text-xs text-muted-foreground py-1">
              Sin ingredientes por unidad.
            </p>
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addUdIngredient}
        >
          <Plus className="w-3 h-3 mr-1" />
          Agregar unidad (UD)
        </Button>
      </div>
    </div>
  );
};
