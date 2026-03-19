/**
 * Single source of truth for product categories.
 * Used by both Carta/Recetas (CocktailsMenu) and POS (CategoryProductGrid).
 *
 * Rules:
 * - order determines chip/section sort (lower = first)
 * - "otros" is always last
 * - "popular" is a virtual POS-only category (top sellers)
 */

import {
  Wine,
  Beer,
  GlassWater,
  Sparkles,
  Package,
  Tag,
  type LucideIcon,
} from "lucide-react";

export interface CategoryDef {
  /** Display label */
  label: string;
  /** Sort order (lower = first) */
  order: number;
  /** Icon for Carta view */
  icon: LucideIcon;
  /** Tailwind classes for POS chip (inactive state) */
  chipColor: string;
}

/**
 * Canonical category registry.
 * Keys are normalised (lowercase, underscored).
 */
export const CATEGORIES: Record<string, CategoryDef> = {
  botellas:      { label: "Botellas",       order: 1,  icon: Wine,       chipColor: "bg-amber-500/10 text-amber-700 border-amber-200" },
  espumantes:    { label: "Espumantes",     order: 2,  icon: Sparkles,   chipColor: "bg-yellow-500/10 text-yellow-700 border-yellow-200" },
  destilados:    { label: "Destilados",     order: 3,  icon: GlassWater, chipColor: "bg-amber-500/10 text-amber-700 border-amber-200" },
  cocteleria:    { label: "Coctelería",     order: 4,  icon: Wine,       chipColor: "bg-purple-500/10 text-purple-700 border-purple-200" },
  cocktails:     { label: "Cocktails",      order: 4,  icon: Wine,       chipColor: "bg-purple-500/10 text-purple-700 border-purple-200" },
  shots:         { label: "Shots",          order: 5,  icon: GlassWater, chipColor: "bg-red-500/10 text-red-700 border-red-200" },
  botellines:    { label: "Botellines",     order: 6,  icon: Beer,       chipColor: "bg-yellow-500/10 text-yellow-700 border-yellow-200" },
  cervezas:      { label: "Cervezas",       order: 7,  icon: Beer,       chipColor: "bg-yellow-500/10 text-yellow-700 border-yellow-200" },
  cervezas_shop: { label: "Cervezas Shop",  order: 7,  icon: Beer,       chipColor: "bg-yellow-500/10 text-yellow-700 border-yellow-200" },
  sin_alcohol:   { label: "Sin Alcohol",    order: 8,  icon: GlassWater, chipColor: "bg-green-500/10 text-green-700 border-green-200" },
  bebidas:       { label: "Bebidas",        order: 9,  icon: GlassWater, chipColor: "bg-blue-500/10 text-blue-700 border-blue-200" },
  snacks:        { label: "Snacks",         order: 10, icon: Package,    chipColor: "bg-orange-500/10 text-orange-700 border-orange-200" },
  latas_redbull:  { label: "Latas/Redbull",  order: 11, icon: Package,    chipColor: "bg-cyan-500/10 text-cyan-700 border-cyan-200" },
  promociones:   { label: "Promociones",    order: 12, icon: Tag,        chipColor: "bg-pink-500/10 text-pink-700 border-pink-200" },
  otros:         { label: "Otros",          order: 99, icon: Package,    chipColor: "bg-muted text-muted-foreground border-border" },
};

/** Fallback definition for unknown categories */
const FALLBACK: CategoryDef = {
  label: "Otros",
  order: 98,
  icon: Package,
  chipColor: "bg-muted text-muted-foreground border-border",
};

/**
 * Normalise a raw category string to a canonical key.
 * Handles nulls, whitespace and casing.
 */
export function normalizeCategory(raw: string | null | undefined): string {
  if (!raw) return "otros";
  const key = raw.trim().toLowerCase().replace(/\s+/g, "_");
  return key || "otros";
}

/**
 * Look up the definition for a (possibly un-normalised) category.
 */
export function getCategoryDef(category: string): CategoryDef {
  const key = normalizeCategory(category);
  return CATEGORIES[key] ?? { ...FALLBACK, label: category };
}

/**
 * Sort comparator for category keys (uses canonical order).
 */
export function compareCategoryOrder(a: string, b: string): number {
  const orderA = (CATEGORIES[a]?.order ?? 98);
  const orderB = (CATEGORIES[b]?.order ?? 98);
  return orderA - orderB;
}
