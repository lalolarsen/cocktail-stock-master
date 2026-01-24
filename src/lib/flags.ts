import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCallback } from 'react';

export interface EffectiveFlag {
  flag_key: string;
  flag_name: string;
  description: string | null;
  enabled: boolean;
  is_overridden: boolean;
}

export type FlagsMap = Record<string, boolean>;

/**
 * Fetch effective flags for a venue using the RPC
 */
async function fetchEffectiveFlags(venueId: string): Promise<EffectiveFlag[]> {
  const { data, error } = await supabase.rpc('get_effective_flags', {
    p_venue_id: venueId,
  });

  if (error) {
    console.error('Error fetching effective flags:', error);
    return [];
  }

  return (data as EffectiveFlag[]) || [];
}

/**
 * Hook to get effective flags for a venue
 * Returns a map of { flag_key: boolean } for easy checking
 */
export function useFlags(venueId: string | null | undefined) {
  const query = useQuery({
    queryKey: ['effective-flags', venueId],
    queryFn: () => fetchEffectiveFlags(venueId!),
    enabled: !!venueId,
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
    retry: 2,
  });

  // Convert to a simple map for easy access
  const flagsMap: FlagsMap = {};
  if (query.data) {
    query.data.forEach((flag) => {
      flagsMap[flag.flag_key] = flag.enabled;
    });
  }

  return {
    flags: flagsMap,
    flagDetails: query.data || [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

/**
 * Hook for developer panel - includes mutation helpers
 */
export function useFlagsAdmin(venueId: string | null | undefined) {
  const queryClient = useQueryClient();
  const { flags, flagDetails, isLoading, isError, refetch } = useFlags(venueId);

  const setFlag = useCallback(
    async (flagKey: string, enabled: boolean) => {
      if (!venueId) return;

      const { error } = await supabase.rpc('set_venue_flag', {
        p_venue_id: venueId,
        p_flag_key: flagKey,
        p_enabled: enabled,
      });

      if (error) {
        console.error('Error setting flag:', error);
        throw error;
      }

      // Invalidate cache
      queryClient.invalidateQueries({ queryKey: ['effective-flags', venueId] });
    },
    [venueId, queryClient]
  );

  const resetToDefaults = useCallback(async () => {
    if (!venueId) return;

    const { error } = await supabase.rpc('reset_venue_flags', {
      p_venue_id: venueId,
    });

    if (error) {
      console.error('Error resetting flags:', error);
      throw error;
    }

    // Invalidate cache
    queryClient.invalidateQueries({ queryKey: ['effective-flags', venueId] });
  }, [venueId, queryClient]);

  return {
    flags,
    flagDetails,
    isLoading,
    isError,
    refetch,
    setFlag,
    resetToDefaults,
  };
}

/**
 * Check if a specific flag is enabled
 * Safe to call even if flags haven't loaded - returns defaultValue
 */
export function isEnabled(
  flags: FlagsMap,
  flagKey: string,
  defaultValue = false
): boolean {
  if (flagKey in flags) {
    return flags[flagKey];
  }
  return defaultValue;
}
