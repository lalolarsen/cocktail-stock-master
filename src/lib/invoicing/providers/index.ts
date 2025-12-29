// Provider registry - add new providers here
import type { InvoiceProvider, ProviderType } from '../types';
import { MockProvider } from './mock';

type ProviderFactory = (config: Record<string, unknown>) => InvoiceProvider;

const providerRegistry: Record<ProviderType, ProviderFactory> = {
  mock: (config) => new MockProvider(config),
  // Future providers - implement and register here:
  bsale: () => { throw new Error('BSale provider not implemented'); },
  nubox: () => { throw new Error('Nubox provider not implemented'); },
  sii: () => { throw new Error('SII provider not implemented'); },
};

export function getProvider(type: ProviderType, config: Record<string, unknown> = {}): InvoiceProvider {
  const factory = providerRegistry[type];
  if (!factory) {
    throw new Error(`Unknown provider type: ${type}`);
  }
  return factory(config);
}

export function isProviderImplemented(type: ProviderType): boolean {
  try {
    getProvider(type, {});
    return true;
  } catch {
    return false;
  }
}
