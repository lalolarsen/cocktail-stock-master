export interface StockLocation {
  id: string;
  name: string;
  is_active?: boolean;
  type: "warehouse" | "bar";
}

export interface ReplenishmentProduct {
  id: string;
  name: string;
  code: string;
  category: string;
  unit: string; // "ml" or "ud"
  cost_per_unit: number; // WAC (for volumetric = full bottle cost)
  capacity_ml: number | null;
  warehouseStock: number;
  barStock: number;
  /** Cost per single unit (ml or ud) */
  unitCost: number;
  isVolumetric: boolean;
}

export interface TransferLine {
  product: ReplenishmentProduct;
  quantity: number;
  estimatedCost: number;
  barId?: string;
  barName?: string;
}

export interface BulkRow {
  id: string;
  productId: string;
  quantity: string;
  barId: string;
  selected: boolean;
}

export interface TransferHistoryRow {
  id: string;
  created_at: string;
  product_name: string;
  product_unit: string;
  quantity: number;
  unit_cost: number | null;
  total_cost: number | null;
  from_location: string;
  to_location: string;
  notes: string | null;
  capacity_ml: number | null;
}
