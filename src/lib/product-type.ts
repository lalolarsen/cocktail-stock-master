/**
 * Product Classification — Source of Truth
 *
 * Rule:
 *   isBottle = capacity_ml IS NOT NULL AND capacity_ml > 0
 *   isUnit   = NOT isBottle
 *
 * The `products.unit` field is used ONLY as a visual label.
 * All business logic (CPP, COGS, stock intake, replenishment,
 * waste, open-bottle tracking) MUST use these helpers.
 */

/** Minimal shape required to classify a product */
export interface ProductLike {
  capacity_ml?: number | null;
  unit?: string;
}

/**
 * Returns true if the product is a bottle measured in ml.
 * Source of truth: capacity_ml IS NOT NULL AND capacity_ml > 0.
 */
export function isBottle(product: ProductLike | null | undefined): boolean {
  if (!product) return false;
  return typeof product.capacity_ml === "number" && product.capacity_ml > 0;
}

/**
 * Returns true if the product is a discrete unit (not a bottle).
 */
export function isUnit(product: ProductLike | null | undefined): boolean {
  return !isBottle(product);
}

/**
 * Returns the display unit label for a product.
 * Uses products.unit if available; falls back to "ml" / "ud".
 */
export function unitLabel(product: ProductLike | null | undefined): string {
  if (!product) return "ud";
  if (product.unit) return product.unit;
  return isBottle(product) ? "ml" : "ud";
}

/**
 * For bottle products: returns cost per ml given cost per bottle.
 * For unit products: returns cost per unit unchanged.
 */
export function costPerUnitOfMeasure(
  product: ProductLike & { cost_per_unit?: number },
): number {
  const cpp = product.cost_per_unit ?? 0;
  if (isBottle(product) && product.capacity_ml! > 0) {
    return cpp / product.capacity_ml!;
  }
  return cpp;
}

/**
 * CPP (Costo Promedio Ponderado) calculation.
 *
 * For bottle products: both currentStock and addedQty are in ml.
 * oldBottleCost / newBottleCost are per-BOTTLE costs.
 * Returns the new per-BOTTLE cost after intake.
 *
 * For unit products: standard weighted average on units.
 */
export function calculateCPP(params: {
  product: ProductLike;
  currentStock: number;      // ml (bottles) or units
  oldCostPerUnit: number;    // per-bottle (bottles) or per-unit
  addedQty: number;          // ml (bottles) or units
  newCostPerUnit: number;    // per-bottle (bottles) or per-unit
}): number {
  const { product, currentStock, oldCostPerUnit, addedQty, newCostPerUnit } = params;

  if (isBottle(product)) {
    const cap = product.capacity_ml!;
    const oldBottles = currentStock / cap;
    const newBottles = addedQty / cap;
    const totalBottles = oldBottles + newBottles;
    if (totalBottles <= 0) return newCostPerUnit;
    return (oldCostPerUnit * oldBottles + newCostPerUnit * newBottles) / totalBottles;
  }

  // Unit product
  const totalQty = currentStock + addedQty;
  if (totalQty <= 0) return newCostPerUnit;
  return (oldCostPerUnit * currentStock + newCostPerUnit * addedQty) / totalQty;
}
