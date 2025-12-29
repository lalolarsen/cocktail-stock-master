// Provider-agnostic invoicing types

export type DocumentType = 'boleta' | 'factura';
export type DocumentStatus = 'pending' | 'issued' | 'failed' | 'cancelled';
export type ProviderType = 'mock' | 'bsale' | 'nubox' | 'sii';

export interface SaleData {
  id: string;
  saleNumber: string;
  totalAmount: number;
  pointOfSale: string;
  items: SaleItem[];
}

export interface SaleItem {
  name: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface IssueRequest {
  sale: SaleData;
  documentType: DocumentType;
}

export interface IssueResult {
  success: boolean;
  folio?: string;
  pdfUrl?: string;
  providerRef?: string;
  issuedAt?: string;
  errorMessage?: string;
}

export interface InvoiceProvider {
  name: ProviderType;
  issue(request: IssueRequest): Promise<IssueResult>;
}

export interface InvoicingConfig {
  activeProvider: ProviderType;
  config: Record<string, unknown>;
}
