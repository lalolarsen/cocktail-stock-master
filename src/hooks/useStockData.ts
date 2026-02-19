import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isBottle } from "@/lib/product-type";

export interface StockBreakdown {
  productId: string;
  warehouseStock: number;
  barStock: number;
  totalStock: number;
  locationDetails: {
    locationId: string;
    locationName: string;
    locationType: 'warehouse' | 'bar' | 'pos';
    quantity: number;
  }[];
}

export interface ProductWithStock {
  id: string;
  name: string;
  category: string;
  subcategory: string | null;
  unit: string;
  minimum_stock: number;
  cost_per_unit: number;
  capacity_ml: number | null;
  code: string;
  is_mixer: boolean;
  // Stock data from balances
  warehouseStock: number;
  barStock: number;
  totalStock: number;
  locationDetails: StockBreakdown['locationDetails'];
}

export interface StockStats {
  totalProducts: number;
  lowStockProducts: number; // Based on warehouse stock for restock planning
  lowStockBars: number; // Products with low bar stock
  totalValue: number;
  criticalAlerts: number;
}

export const useStockData = () => {
  const [products, setProducts] = useState<ProductWithStock[]>([]);
  const [stats, setStats] = useState<StockStats>({
    totalProducts: 0,
    lowStockProducts: 0,
    lowStockBars: 0,
    totalValue: 0,
    criticalAlerts: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStockData();

    // Subscribe to real-time updates for products and stock_balances
    const productsChannel = supabase
      .channel("stock-products-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "products" },
        () => fetchStockData()
      )
      .subscribe();

    const balancesChannel = supabase
      .channel("stock-balances-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "stock_balances" },
        () => fetchStockData()
      )
      .subscribe();

    const alertsChannel = supabase
      .channel("stock-alerts-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "stock_alerts" },
        () => fetchStockData()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(productsChannel);
      supabase.removeChannel(balancesChannel);
      supabase.removeChannel(alertsChannel);
    };
  }, []);

  const fetchStockData = async () => {
    try {
      // Fetch products
      const { data: productsData, error: productsError } = await supabase
        .from("products")
        .select("*")
        .order("name");

      if (productsError) throw productsError;

      // Fetch all stock balances with location info
      const { data: balancesData, error: balancesError } = await supabase
        .from("stock_balances")
        .select("product_id, quantity, location_id");

      if (balancesError) throw balancesError;

      // Fetch locations
      const { data: locationsData, error: locationsError } = await supabase
        .from("stock_locations")
        .select("id, name, type");

      if (locationsError) throw locationsError;

      // Fetch unread alerts
      const { data: alertsData, error: alertsError } = await supabase
        .from("stock_alerts")
        .select("*")
        .eq("is_read", false);

      if (alertsError) throw alertsError;

      // Create location lookup map
      const locationMap = new Map(
        locationsData?.map((loc) => [loc.id, { name: loc.name, type: loc.type as 'warehouse' | 'bar' | 'pos' }]) || []
      );

      // Build stock breakdown per product
      const stockByProduct = new Map<string, StockBreakdown>();

      balancesData?.forEach((balance) => {
        const location = locationMap.get(balance.location_id);
        if (!location) return;

        let breakdown = stockByProduct.get(balance.product_id);
        if (!breakdown) {
          breakdown = {
            productId: balance.product_id,
            warehouseStock: 0,
            barStock: 0,
            totalStock: 0,
            locationDetails: [],
          };
          stockByProduct.set(balance.product_id, breakdown);
        }

        const qty = Number(balance.quantity) || 0;
        breakdown.totalStock += qty;

        if (location.type === 'warehouse') {
          breakdown.warehouseStock += qty;
        } else if (location.type === 'bar') {
          breakdown.barStock += qty;
        }

        breakdown.locationDetails.push({
          locationId: balance.location_id,
          locationName: location.name,
          locationType: location.type,
          quantity: qty,
        });
      });

      // Combine products with stock data
      const productsWithStock: ProductWithStock[] = (productsData || []).map((product) => {
        const breakdown = stockByProduct.get(product.id);
        return {
          id: product.id,
          name: product.name,
          category: product.category,
          subcategory: product.subcategory || null,
          unit: product.unit,
          minimum_stock: product.minimum_stock,
          cost_per_unit: product.cost_per_unit || 0,
          capacity_ml: product.capacity_ml || null,
          code: product.code,
          is_mixer: product.is_mixer || false,
          warehouseStock: breakdown?.warehouseStock || 0,
          barStock: breakdown?.barStock || 0,
          totalStock: breakdown?.totalStock || 0,
          locationDetails: breakdown?.locationDetails || [],
        };
      });

      // Calculate stats
      const totalProducts = productsWithStock.length;
      
      // Low stock in warehouse (for restock planning)
      const lowStockProducts = productsWithStock.filter(
        (p) => p.warehouseStock <= p.minimum_stock
      ).length;

      // Low stock in bars (for service ability)
      const lowStockBars = productsWithStock.filter(
        (p) => p.barStock <= p.minimum_stock * 0.5 // 50% of minimum as bar threshold
      ).length;

      // Total value — for bottles: qty_ml × cost_per_ml; for units: qty × cost_per_unit
      const totalValue = productsWithStock.reduce((sum, p) => {
        const cap = p.capacity_ml;
        const bottle = isBottle(p);
        const costPerBase = bottle && cap && cap > 0 ? p.cost_per_unit / cap : p.cost_per_unit;
        return sum + p.totalStock * costPerBase;
      }, 0);

      setProducts(productsWithStock);
      setStats({
        totalProducts,
        lowStockProducts,
        lowStockBars,
        totalValue,
        criticalAlerts: alertsData?.length || 0,
      });
    } catch (error) {
      console.error("Error fetching stock data:", error);
    } finally {
      setLoading(false);
    }
  };

  return { products, stats, loading, refetch: fetchStockData };
};
