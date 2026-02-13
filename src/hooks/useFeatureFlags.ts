/**
 * Stub — feature flags removed. Always returns enabled.
 */
export type FeatureKey = string;

interface UseFeatureFlagsReturn {
  flags: Record<string, boolean>;
  isLoading: boolean;
  isEnabled: (key: string) => boolean;
  refetch: () => Promise<void>;
}

export function useFeatureFlags(): UseFeatureFlagsReturn {
  return {
    flags: {},
    isLoading: false,
    isEnabled: () => true,
    refetch: async () => {},
  };
}

/** @deprecated Always returns true */
export async function checkFeatureFlag(
  _supabaseClient: any,
  _venueId: string,
  _featureKey: string
): Promise<boolean> {
  return true;
}
