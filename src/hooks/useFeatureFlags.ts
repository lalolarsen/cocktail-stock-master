import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type FeatureKey = 
  | 'invoice_reader'
  | 'invoice_to_expense'
  | 'advanced_inventory'
  | 'advanced_reporting'
  | 'erp_accounting'
  | 'tickets_module';

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

      // Fetch feature flags for the venue
      const { data: featureFlags, error } = await supabase
        .from('feature_flags')
        .select('feature_key, enabled')
        .eq('venue_id', profile.venue_id);

      if (error) {
        console.error('Error fetching feature flags:', error);
        setFlags({});
        setIsLoading(false);
        return;
      }

      const flagsMap: FeatureFlags = {};
      featureFlags?.forEach(flag => {
        flagsMap[flag.feature_key] = flag.enabled;
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
    return flags[key] === true;
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
  const { data, error } = await supabaseClient
    .from('feature_flags')
    .select('enabled')
    .eq('venue_id', venueId)
    .eq('feature_key', featureKey)
    .single();

  if (error || !data) {
    return false;
  }

  return data.enabled === true;
}
