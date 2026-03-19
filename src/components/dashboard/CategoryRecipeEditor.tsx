import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, GlassWater, Zap, FlaskConical } from "lucide-react";
import { normalizeCategory } from "@/lib/categories";

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
 * We NEVER infer section from product data alone (product may be unselected / empty).
 *
 * - "ML"    → Botellas section
 * - "UD"    → Unidades section
 * - "MIXER" → Mixers section (is_mixer_slot = true)
 */
export interface IngredientEntry {
  product_id: string;
  quantity: number;
  ingredient_type: "ML" | "UD" | "MIXER";
  /** Only present when ingredient_type === "MIXER" */
  mixer_category?: "MIXER_TRADICIONAL" | "REDBULL";
  /** Kept for DB compatibility */
  is_mixer_slot?: boolean;
}

// ── Category normalisation helpers ────────────────────────────────────────────

const MIXER_CATS = new Set([
  "latas_redbull",
  "mixers_tradicionales",
  "mixer_tradicional",
  "mixers tradicionales",
  "redbull",
  "mixers_redbull",
  "red bull",
]);

function isMixerProduct(cat: string) {
  return MIXER_CATS.has(normalizeCategory(cat));
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
  const [mixerTrad, setMixerTrad] = useState<Product[]>([]);
  const [mixerRedbull, setMixerRedbull] = useState<Product[]>([]);

  useEffect(() => {
    setMixerTrad(products.filter((p) => isMixerTradicional(p.category)));
    setMixerRedbull(products.filter((p) => isMixerRedbull(p.category)));
  }, [products]);

  // Products available per section (exclude mixer categories)
  const bottleProducts = products.filter(
    (p) =>
      isBottleProduct(p) &&
      !isMixerTradicional(p.category) &&
      !isMixerRedbull(p.category)
  );

  const unitProducts = products.filter(
    (p) =>
      !isBottleProduct(p) &&
      !isMixerTradicional(p.category) &&
      !isMixerRedbull(p.category)
  );

  // ── Mutators ──────────────────────────────────────────────────────────────

  const updateEntry = (index: number, partial: Partial<IngredientEntry>) => {
    const updated = [...ingredients];
    updated[index] = { ...updated[index], ...partial };
    onChange(updated);
  };

  const removeEntry = (index: number) => {
    onChange(ingredients.filter((_, i) => i !== index));
  };

  // ── Add helpers ────────────────────────────────────────────────────────────

  const addMlIngredient = () => {
    onChange([
      ...ingredients,
      { product_id: "", quantity: 0, ingredient_type: "ML", is_mixer_slot: false },
    ]);
  };

  const addUdIngredient = () => {
    onChange([
      ...ingredients,
      { product_id: "", quantity: 1, ingredient_type: "UD", is_mixer_slot: false },
    ]);
  };

  const addMixerTrad = () => {
    onChange([
      ...ingredients,
      {
        product_id: "",
        quantity: 1,
        ingredient_type: "MIXER",
        mixer_category: "MIXER_TRADICIONAL",
        is_mixer_slot: true,
      },
    ]);
  };

  const addMixerRedbull = () => {
    onChange([
      ...ingredients,
      {
        product_id: "",
        quantity: 1,
        ingredient_type: "MIXER",
        mixer_category: "REDBULL",
        is_mixer_slot: true,
      },
    ]);
  };

  // ── Derived lists by explicit type ────────────────────────────────────────

  const mlEntries = ingredients
    .map((ing, i) => ({ ing, i }))
    .filter(({ ing }) => ing.ingredient_type === "ML");

  const udEntries = ingredients
    .map((ing, i) => ({ ing, i }))
    .filter(({ ing }) => ing.ingredient_type === "UD");

  const mixerEntries = ingredients
    .map((ing, i) => ({ ing, i }))
    .filter(({ ing }) => ing.ingredient_type === "MIXER");

  // ── Row renderers ─────────────────────────────────────────────────────────

  const renderMlRows = () =>
    mlEntries.map(({ ing, i }) => (
      <div key={i} className="flex gap-2 items-center">
        <Select
          value={ing.product_id || "__placeholder__"}
          onValueChange={(v) =>
            updateEntry(i, {
              product_id: v === "__placeholder__" ? "" : v,
            })
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

  const renderMixerRows = () =>
    mixerEntries.map(({ ing, i }) => {
      const isTrad = ing.mixer_category !== "REDBULL";
      const availableProducts = isTrad ? mixerTrad : mixerRedbull;
      const accentClass = isTrad
        ? "border-blue-200 bg-blue-50/50"
        : "border-yellow-200 bg-yellow-50/50";

      return (
        <div
          key={i}
          className={`flex gap-2 items-center p-2 rounded-lg border ${accentClass}`}
        >
          <Badge variant="outline" className="shrink-0 text-[10px]">
            {isTrad ? "🥤 Trad." : "⚡ RB"}
          </Badge>
          <Select
            value={ing.product_id || "__any__"}
            onValueChange={(v) =>
              updateEntry(i, { product_id: v === "__any__" ? "" : v })
            }
          >
            <SelectTrigger className="flex-1 bg-background">
              <SelectValue placeholder="Cualquiera (variable)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__any__">
                Cualquiera (elegido en barra)
              </SelectItem>
              {availableProducts.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="number"
            className="w-20 bg-background"
            placeholder="ud"
            value={ing.quantity || ""}
            onChange={(e) =>
              updateEntry(i, { quantity: Number(e.target.value) })
            }
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
      );
    });

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

      {/* ── SECTION 2: UD (Unidades) ──────────────────────────────────────── */}
      <div className="space-y-2">
        <SectionHeader
          icon={GlassWater}
          title="Ingredientes (Unidades — UD)"
          subtitle="opcional"
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

      {/* ── SECTION 3: Mixers (opcional) ──────────────────────────────────── */}
      <div className="space-y-2">
        <SectionHeader
          icon={Zap}
          title="Mixers (Opcional)"
          subtitle="desde categorías en /Productos"
        />
        <div className="space-y-2">
          {renderMixerRows()}
          {mixerEntries.length === 0 && (
            <p className="text-xs text-muted-foreground py-1">
              Sin mixers. La receta no pedirá selección en barra.
            </p>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addMixerTrad}
          >
            <Plus className="w-3 h-3 mr-1" />
            🥤 Mixer Tradicional
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addMixerRedbull}
          >
            <Plus className="w-3 h-3 mr-1" />
            ⚡ Red Bull
          </Button>
        </div>
        {(mixerTrad.length === 0 || mixerRedbull.length === 0) && (
          <p className="text-[11px] text-muted-foreground">
            {mixerTrad.length === 0 && (
              <span>Sin productos en "Mixers tradicionales" en /Productos. </span>
            )}
            {mixerRedbull.length === 0 && (
              <span>Sin productos en "Redbull" en /Productos.</span>
            )}
          </p>
        )}
      </div>
    </div>
  );
};
