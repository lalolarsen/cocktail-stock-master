import { ReactNode } from 'react';
import { useFeatureFlags, FeatureKey } from '@/hooks/useFeatureFlags';
import { FeatureDisabled } from './FeatureDisabled';
import { Loader2 } from 'lucide-react';

interface FeatureGateProps {
  feature: FeatureKey;
  children: ReactNode;
  /** Custom fallback when feature is disabled. If not provided, shows FeatureDisabled component */
  fallback?: ReactNode;
  /** Feature name for the disabled message */
  featureName?: string;
  /** Show loading spinner while checking flags */
  showLoader?: boolean;
  /** If true, renders nothing instead of the disabled page (for inline elements) */
  hideOnly?: boolean;
}

/**
 * Component that conditionally renders children based on feature flag status.
 * If the feature is disabled, renders the fallback (or FeatureDisabled page).
 */
export function FeatureGate({ 
  feature, 
  children, 
  fallback,
  featureName,
  showLoader = false,
  hideOnly = false
}: FeatureGateProps) {
  const { isEnabled, isLoading } = useFeatureFlags();

  // While loading, optionally show spinner or nothing
  if (isLoading) {
    if (showLoader) {
      return (
        <div className="flex items-center justify-center p-8">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      );
    }
    return null;
  }

  if (!isEnabled(feature)) {
    // If hideOnly, just don't render anything
    if (hideOnly) {
      return null;
    }
    // If custom fallback provided, use it
    if (fallback !== undefined) {
      return <>{fallback}</>;
    }
    // Otherwise show the disabled page
    return <FeatureDisabled featureName={featureName} />;
  }

  return <>{children}</>;
}
