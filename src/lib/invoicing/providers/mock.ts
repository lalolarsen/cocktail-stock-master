// Mock provider for development and testing
import type { InvoiceProvider, IssueRequest, IssueResult } from '../types';

export class MockProvider implements InvoiceProvider {
  name = 'mock' as const;
  private successRate: number;

  constructor(config: Record<string, unknown> = {}) {
    this.successRate = (config.success_rate as number) ?? 0.95;
  }

  async issue(request: IssueRequest): Promise<IssueResult> {
    // Simulate network delay (300-800ms)
    await new Promise(resolve => setTimeout(resolve, 300 + Math.random() * 500));

    // Simulate occasional failures based on success rate
    const isSuccess = Math.random() < this.successRate;

    if (!isSuccess) {
      return {
        success: false,
        errorMessage: 'Error de conexión con el proveedor de facturación electrónica (mock)',
      };
    }

    // Generate mock folio number
    const prefix = request.documentType === 'boleta' ? 'BOL' : 'FAC';
    const folio = `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;

    // Generate mock provider reference
    const providerRef = `MOCK-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

    // Generate mock PDF URL
    const pdfUrl = `https://mock-invoicing.local/documents/${folio}.pdf`;

    return {
      success: true,
      folio,
      pdfUrl,
      providerRef,
      issuedAt: new Date().toISOString(),
    };
  }
}
