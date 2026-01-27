import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

// All feature keys available in the system
export type FeatureKey = 
  | 'ventas_alcohol'
  | 'ventas_tickets'
  | 'qr_cover'
  | 'inventario'
  | 'reposicion'
  | 'importacion_excel'
  | 'jornadas'
  | 'arqueo'
  | 'reportes'
  | 'contabilidad_basica'
  | 'contabilidad_avanzada'
  | 'lector_facturas'
  // Legacy keys (mapped to new keys)
  | 'tickets_module'
  | 'invoice_reader'
  | 'invoice_to_expense'
  | 'advanced_inventory'
  | 'advanced_reporting'
  | 'erp_accounting';

// Map legacy keys to new keys
const KEY_MAPPING: Record<string, string> = {
  'tickets_module': 'ventas_tickets',
  'invoice_reader': 'lector_facturas',
  'invoice_to_expense': 'contabilidad_basica',
  'advanced_inventory': 'inventario',
  'advanced_reporting': 'reportes',
  'erp_accounting': 'contabilidad_avanzada',
};

interface FeatureFlags {
  [key: string]: boolean;
}

interface UseFeatureFlagsReturn {
  flags: FeatureFlags;
  isLoading: boolean;
  isEnabled: (key: FeatureKey) => boolean;
  refetch: () => Promise<void>;
}

export function useFeatureFlags(): UseFeatureFlagsReturn {
  const [flags, setFlags] = useState<FeatureFlags>({});
  const [isLoading, setIsLoading] = useState(true);

  const fetchFlags = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setFlags({});
        setIsLoading(false);
        return;
      }

      // Get user's venue_id from profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('venue_id')
        .eq('id', user.id)
        .single();

      if (!profile?.venue_id) {
        setFlags({});
        setIsLoading(false);
        return;
      }

      // Fetch effective feature flags using RPC
      const { data: featureFlags, error } = await supabase.rpc('get_venue_flags', {
        p_venue_id: profile.venue_id
      });

      if (error) {
        console.error('Error fetching feature flags:', error);
        setFlags({});
        setIsLoading(false);
        return;
      }

      const flagsMap: FeatureFlags = {};
      featureFlags?.forEach((flag: { flag_key: string; enabled: boolean }) => {
        flagsMap[flag.flag_key] = flag.enabled;
      });

      setFlags(flagsMap);
    } catch (error) {
      console.error('Error in useFeatureFlags:', error);
      setFlags({});
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFlags();

    // Subscribe to auth changes to refetch flags
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      fetchFlags();
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [fetchFlags]);

  const isEnabled = useCallback((key: FeatureKey): boolean => {
    // Map legacy keys to new keys
    const mappedKey = KEY_MAPPING[key] || key;
    
    // Default to true for backwards compatibility if flag doesn't exist
    if (!(mappedKey in flags)) {
      return true;
    }
    return flags[mappedKey] === true;
  }, [flags]);

  return {
    flags,
    isLoading,
    isEnabled,
    refetch: fetchFlags,
  };
}

// Server-side check function for edge functions
export async function checkFeatureFlag(
  supabaseClient: any,
  venueId: string,
  featureKey: FeatureKey
): Promise<boolean> {
  const { data, error } = await supabaseClient.rpc('get_venue_flags', {
    p_venue_id: venueId
  });

  if (error || !data) {
    return false;
  }

  const flag = data.find((f: { flag_key: string }) => f.flag_key === featureKey);
  return flag?.enabled === true;
}
