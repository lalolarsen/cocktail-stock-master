import { ReactNode } from 'react';

interface FeatureGateProps {
  feature: string;
  children: ReactNode;
  fallback?: ReactNode;
  featureName?: string;
  showLoader?: boolean;
  hideOnly?: boolean;
}

/**
 * Passthrough — feature flags removed. Always renders children.
 */
export function FeatureGate({ children }: FeatureGateProps) {
  return <>{children}</>;
}
