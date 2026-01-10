import { ReactNode } from 'react';
import { useFeatureFlags, FeatureKey } from '@/hooks/useFeatureFlags';

interface FeatureGateProps {
  feature: FeatureKey;
  children: ReactNode;
  fallback?: ReactNode;
}

/**
 * Component that conditionally renders children based on feature flag status.
 * If the feature is disabled, renders the fallback (or nothing).
 */
export function FeatureGate({ feature, children, fallback = null }: FeatureGateProps) {
  const { isEnabled, isLoading } = useFeatureFlags();

  // While loading, don't render anything to prevent flash
  if (isLoading) {
    return null;
  }

  if (!isEnabled(feature)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
