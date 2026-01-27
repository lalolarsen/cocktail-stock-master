import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export type ReceiptMode = "hybrid" | "unified";

export interface ReceiptConfig {
  id: string;
  receiptMode: ReceiptMode;
  activeProvider: string;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  updateReceiptMode: (mode: ReceiptMode) => Promise<boolean>;
}

export function useReceiptConfig(): ReceiptConfig {
  const [id, setId] = useState<string>("");
  const [receiptMode, setReceiptMode] = useState<ReceiptMode>("hybrid");
  const [activeProvider, setActiveProvider] = useState<string>("mock");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchConfig = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from("invoicing_config")
        .select("id, receipt_mode, active_provider")
        .limit(1)
        .single();

      if (fetchError) {
        if (fetchError.code === "PGRST116") {
          // No config row exists, use defaults
          setReceiptMode("hybrid");
          setActiveProvider("mock");
        } else {
          throw fetchError;
        }
      } else if (data) {
        setId(data.id);
        setReceiptMode((data.receipt_mode as ReceiptMode) || "hybrid");
        setActiveProvider(data.active_provider || "mock");
      }
    } catch (err: any) {
      console.error("Error fetching receipt config:", err);
      setError(err.message || "Error al cargar configuración");
    } finally {
      setIsLoading(false);
    }
  };

  const updateReceiptMode = async (mode: ReceiptMode): Promise<boolean> => {
    try {
      // Get venue_id from user profile
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No user");
      
      const { data: profile } = await supabase
        .from("profiles")
        .select("venue_id")
        .eq("id", user.id)
        .single();
      
      if (!profile?.venue_id) throw new Error("No venue assigned");
      
      // Upsert the config - use known ID or create new
      const configId = id || "00000000-0000-0000-0000-000000000001";
      
      const { error: updateError } = await supabase
        .from("invoicing_config")
        .upsert({
          id: configId,
          receipt_mode: mode,
          updated_at: new Date().toISOString(),
          venue_id: profile.venue_id
        }, {
          onConflict: "id"
        });

      if (updateError) throw updateError;

      setReceiptMode(mode);
      setId(configId);
      return true;
    } catch (err: any) {
      console.error("Error updating receipt mode:", err);
      setError(err.message || "Error al actualizar configuración");
      return false;
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  return {
    id,
    receiptMode,
    activeProvider,
    isLoading,
    error,
    refetch: fetchConfig,
    updateReceiptMode,
  };
}
