// Re-export from centralized context for backwards compatibility
import { useAppSession } from "@/contexts/AppSessionContext";
import type { FeatureKey } from "@/contexts/AppSessionContext";

export type { FeatureKey };

interface UseFeatureFlagsReturn {
  flags: Record<string, boolean>;
  isLoading: boolean;
  isEnabled: (key: FeatureKey) => boolean;
  refetch: () => Promise<void>;
}

export function useFeatureFlags(): UseFeatureFlagsReturn {
  const { featureFlags, isLoading, isEnabled, refreshSession } = useAppSession();
  
  return {
    flags: featureFlags,
    isLoading,
    isEnabled,
    refetch: refreshSession,
  };
}

// Server-side check function for edge functions (keep as is)
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
