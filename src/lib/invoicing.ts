// Mock electronic invoicing provider
// This simulates an API response from an invoicing provider like SII (Chile)

export type DocumentType = 'boleta' | 'factura';

export interface InvoiceRequest {
  saleId: string;
  saleNumber: string;
  totalAmount: number;
  documentType: DocumentType;
  pointOfSale: string;
  items: Array<{
    name: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
  }>;
}

export interface InvoiceResponse {
  success: boolean;
  folio?: string;
  pdfUrl?: string;
  issuedAt?: string;
  errorMessage?: string;
}

// Simulate a 95% success rate for the mock provider
const MOCK_SUCCESS_RATE = 0.95;

export async function issueDocument(request: InvoiceRequest): Promise<InvoiceResponse> {
  // Simulate network delay (300-800ms)
  await new Promise(resolve => setTimeout(resolve, 300 + Math.random() * 500));
  
  // Simulate occasional failures
  const isSuccess = Math.random() < MOCK_SUCCESS_RATE;
  
  if (!isSuccess) {
    return {
      success: false,
      errorMessage: 'Error de conexión con el proveedor de facturación electrónica',
    };
  }
  
  // Generate mock folio number
  const prefix = request.documentType === 'boleta' ? 'BOL' : 'FAC';
  const folio = `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
  
  // Generate mock PDF URL (in production, this would be the actual document URL)
  const pdfUrl = `https://mock-invoicing.local/documents/${folio}.pdf`;
  
  return {
    success: true,
    folio,
    pdfUrl,
    issuedAt: new Date().toISOString(),
  };
}
