import { BulkStockIntakeGrid } from "./BulkStockIntakeGrid";

interface Product {
  id: string;
  name: string;
  code: string;
  category: string;
  unit: string;
}

interface WarehouseStockIntakeProps {
  warehouseId: string;
  products: Product[];
  onStockUpdated: () => void;
}

export function WarehouseStockIntake({
  warehouseId,
  products,
  onStockUpdated,
}: WarehouseStockIntakeProps) {
  return (
    <BulkStockIntakeGrid
      warehouseId={warehouseId}
      products={products}
      onStockUpdated={onStockUpdated}
    />
  );
}
