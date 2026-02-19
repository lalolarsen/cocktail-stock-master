import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
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

export interface IngredientEntry {
  product_id: string;
  quantity: number;
  is_mixer_slot?: boolean;
  /** 'MIXER_TRADICIONAL' | 'REDBULL' — only set when is_mixer_slot = true */
  mixer_category?: "MIXER_TRADICIONAL" | "REDBULL";
}

interface CategoryRecipeEditorProps {
  category: string;
  ingredients: IngredientEntry[];
  products: Product[];
  onChange: (ingredients: IngredientEntry[]) => void;
}

// ── Category normalisation helpers ────────────────────────────────────────────

const MIXER_TRAD_CATS = new Set([
  "mixers_tradicionales",
  "mixer_tradicional",
  "mixers tradicionales",
]);

const MIXER_REDBULL_CATS = new Set([
  "redbull",
  "mixers_redbull",
  "red bull",
]);

function isMixerTradicional(cat: string) {
  return MIXER_TRAD_CATS.has(normalizeCategory(cat));
}

function isMixerRedbull(cat: string) {
  return MIXER_REDBULL_CATS.has(normalizeCategory(cat));
}

function isBottleProduct(p: Product) {
  return typeof p.capacity_ml === "number" && p.capacity_ml > 0;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionHeader({
  icon: Icon,
  title,
  subtitle,
  accent,
}: {
  icon: React.ElementType;
  title: string;
  subtitle?: string;
  accent?: string;
}) {
  return (
    <div className={`flex items-center gap-2 pb-1 border-b ${accent ?? ""}`}>
      <Icon className="h-4 w-4 text-muted-foreground" />
      <span className="text-sm font-semibold">{title}</span>
      {subtitle && (
        <span className="text-xs text-muted-foreground ml-1">{subtitle}</span>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export const CategoryRecipeEditor = ({
  category,
  ingredients,
  products,
  onChange,
}: CategoryRecipeEditorProps) => {
  // Fetch mixer products live from DB (category-driven)
  const [mixerTrad, setMixerTrad] = useState<Product[]>([]);
  const [mixerRedbull, setMixerRedbull] = useState<Product[]>([]);

  useEffect(() => {
    // Derive from already-fetched products prop (no extra query needed)
    setMixerTrad(products.filter((p) => isMixerTradicional(p.category)));
    setMixerRedbull(products.filter((p) => isMixerRedbull(p.category)));
  }, [products]);

  // ── Derived lists ──────────────────────────────────────────────────────────

  // Bottle ingredients (capacity_ml > 0)
  const mlIngredients = ingredients.filter(
    (ing) => !ing.is_mixer_slot && isBottleProduct(products.find((p) => p.id === ing.product_id) ?? {} as Product)
  );

  // Unit ingredients (not bottle, not mixer)
  const udIngredients = ingredients.filter(
    (ing) =>
      !ing.is_mixer_slot &&
      !isBottleProduct(products.find((p) => p.id === ing.product_id) ?? {} as Product)
  );

  // Mixer slots
  const mixerIngredients = ingredients.filter((ing) => ing.is_mixer_slot);

  // Products available per section
  const bottleProducts = products.filter(
    (p) => isBottleProduct(p) && !isMixerTradicional(p.category) && !isMixerRedbull(p.category)
  );

  const unitProducts = products.filter(
    (p) =>
      !isBottleProduct(p) &&
      !isMixerTradicional(p.category) &&
      !isMixerRedbull(p.category)
  );

  // ── Helpers to mutate ingredient list ─────────────────────────────────────

  /** Replace ingredients at their original indices */
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
    onChange([...ingredients, { product_id: "", quantity: 0, is_mixer_slot: false }]);
  };

  const addUdIngredient = () => {
    onChange([...ingredients, { product_id: "", quantity: 1, is_mixer_slot: false }]);
  };

  const addMixerTrad = () => {
    onChange([
      ...ingredients,
      { product_id: "", quantity: 1, is_mixer_slot: true, mixer_category: "MIXER_TRADICIONAL" },
    ]);
  };

  const addMixerRedbull = () => {
    onChange([
      ...ingredients,
      { product_id: "", quantity: 1, is_mixer_slot: true, mixer_category: "REDBULL" },
    ]);
  };

  // ── Render rows for a given section ───────────────────────────────────────

  const renderMlRows = () => {
    const idxList = ingredients
      .map((ing, i) => ({ ing, i }))
      .filter(
        ({ ing }) =>
          !ing.is_mixer_slot &&
          isBottleProduct(products.find((p) => p.id === ing.product_id) ?? ({} as Product))
      );

    return idxList.map(({ ing, i }) => (
      <div key={i} className="flex gap-2 items-center">
        <Select
          value={ing.product_id || "__placeholder__"}
          onValueChange={(v) =>
            updateEntry(i, { product_id: v === "__placeholder__" ? "" : v, is_mixer_slot: false })
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
  };

  const renderUdRows = () => {
    const idxList = ingredients
      .map((ing, i) => ({ ing, i }))
      .filter(
        ({ ing }) =>
          !ing.is_mixer_slot &&
          !isBottleProduct(products.find((p) => p.id === ing.product_id) ?? ({} as Product))
      );

    return idxList.map(({ ing, i }) => (
      <div key={i} className="flex gap-2 items-center">
        <Select
          value={ing.product_id || "__placeholder__"}
          onValueChange={(v) =>
            updateEntry(i, { product_id: v === "__placeholder__" ? "" : v, is_mixer_slot: false })
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
  };

  const renderMixerRows = () => {
    const idxList = ingredients
      .map((ing, i) => ({ ing, i }))
      .filter(({ ing }) => ing.is_mixer_slot);

    return idxList.map(({ ing, i }) => {
      const isTrad = ing.mixer_category !== "REDBULL";
      const availableProducts = isTrad ? mixerTrad : mixerRedbull;
      const accentClass = isTrad
        ? "border-blue-200 bg-blue-50/50"
        : "border-yellow-200 bg-yellow-50/50";

      return (
        <div key={i} className={`flex gap-2 items-center p-2 rounded-lg border ${accentClass}`}>
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
      );
    });
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* ── SECTION 1: ML (Botellas) ─────────────────────────────────────────── */}
      <div className="space-y-2">
        <SectionHeader
          icon={FlaskConical}
          title="Ingredientes (Botellas — ML)"
          subtitle="opcional"
        />
        <div className="space-y-2">
          {renderMlRows()}
          {mlIngredients.length === 0 && (
            <p className="text-xs text-muted-foreground py-1">
              Sin ingredientes ML. Agrega botellas si la receta lo requiere.
            </p>
          )}
        </div>
        <Button type="button" variant="outline" size="sm" onClick={addMlIngredient}>
          <Plus className="w-3 h-3 mr-1" />
          Agregar botella (ML)
        </Button>
      </div>

      {/* ── SECTION 2: UD (Botellines / Unidades) ───────────────────────────── */}
      <div className="space-y-2">
        <SectionHeader
          icon={GlassWater}
          title="Ingredientes (Unidades — UD)"
          subtitle="opcional"
        />
        <div className="space-y-2">
          {renderUdRows()}
          {udIngredients.length === 0 && (
            <p className="text-xs text-muted-foreground py-1">
              Sin ingredientes por unidad.
            </p>
          )}
        </div>
        <Button type="button" variant="outline" size="sm" onClick={addUdIngredient}>
          <Plus className="w-3 h-3 mr-1" />
          Agregar unidad (UD)
        </Button>
      </div>

      {/* ── SECTION 3: Mixers (opcional) ─────────────────────────────────────── */}
      <div className="space-y-2">
        <SectionHeader
          icon={Zap}
          title="Mixers (Opcional)"
          subtitle="se descuentan de categoría /Productos"
        />
        <div className="space-y-2">
          {renderMixerRows()}
          {mixerIngredients.length === 0 && (
            <p className="text-xs text-muted-foreground py-1">
              Sin mixers. La receta no pedirá selección de mixer en barra.
            </p>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button type="button" variant="outline" size="sm" onClick={addMixerTrad}>
            <Plus className="w-3 h-3 mr-1" />
            🥤 Mixer Tradicional
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={addMixerRedbull}>
            <Plus className="w-3 h-3 mr-1" />
            ⚡ Red Bull
          </Button>
        </div>
        {(mixerTrad.length === 0 || mixerRedbull.length === 0) && (
          <p className="text-[11px] text-muted-foreground">
            {mixerTrad.length === 0 && (
              <span>
                No hay productos en "Mixers tradicionales" en /Productos.{" "}
              </span>
            )}
            {mixerRedbull.length === 0 && (
              <span>No hay productos en "Redbull" en /Productos.</span>
            )}
          </p>
        )}
      </div>
    </div>
  );
};
