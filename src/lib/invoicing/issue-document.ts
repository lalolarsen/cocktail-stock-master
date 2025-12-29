// Core document issuance logic - provider agnostic
import { supabase } from '@/integrations/supabase/client';
import { getProvider } from './providers';
import type { DocumentType, SaleData, ProviderType, InvoicingConfig } from './types';

interface IssueDocumentResult {
  success: boolean;
  documentId?: string;
  folio?: string;
  pdfUrl?: string;
  errorMessage?: string;
}

/**
 * Issues an electronic document for a sale.
 * This is the ONLY function that should be called from the POS.
 * It handles provider detection, document creation, and result persistence.
 */
export async function issueDocument(
  saleId: string,
  documentType: DocumentType
): Promise<IssueDocumentResult> {
  try {
    // 1. Load sale data with items
    const saleData = await loadSaleData(saleId);
    if (!saleData) {
      return { success: false, errorMessage: 'Venta no encontrada' };
    }

    // 2. Get active provider from config
    const config = await getInvoicingConfig();
    const provider = getProvider(config.activeProvider, config.config);

    // 3. Create pending document record
    const { data: doc, error: docError } = await supabase
      .from('sales_documents')
      .insert({
        sale_id: saleId,
        document_type: documentType,
        provider: config.activeProvider,
        status: 'pending',
      })
      .select('id')
      .single();

    if (docError || !doc) {
      console.error('Error creating document record:', docError);
      return { success: false, errorMessage: 'Error al crear registro de documento' };
    }

    // 4. Call provider adapter
    const result = await provider.issue({
      sale: saleData,
      documentType,
    });

    // 5. Update document with result
    const updateData = result.success
      ? {
          status: 'issued' as const,
          folio: result.folio,
          pdf_url: result.pdfUrl,
          provider_ref: result.providerRef,
          issued_at: result.issuedAt,
        }
      : {
          status: 'failed' as const,
          error_message: result.errorMessage,
        };

    await supabase
      .from('sales_documents')
      .update(updateData)
      .eq('id', doc.id);

    return {
      success: result.success,
      documentId: doc.id,
      folio: result.folio,
      pdfUrl: result.pdfUrl,
      errorMessage: result.errorMessage,
    };
  } catch (error) {
    console.error('Error in issueDocument:', error);
    return {
      success: false,
      errorMessage: error instanceof Error ? error.message : 'Error desconocido',
    };
  }
}

async function loadSaleData(saleId: string): Promise<SaleData | null> {
  const { data: sale, error: saleError } = await supabase
    .from('sales')
    .select(`
      id,
      sale_number,
      total_amount,
      point_of_sale,
      sale_items (
        quantity,
        unit_price,
        subtotal,
        cocktail:cocktails (name)
      )
    `)
    .eq('id', saleId)
    .single();

  if (saleError || !sale) {
    console.error('Error loading sale:', saleError);
    return null;
  }

  return {
    id: sale.id,
    saleNumber: sale.sale_number,
    totalAmount: Number(sale.total_amount),
    pointOfSale: sale.point_of_sale,
    items: (sale.sale_items || []).map((item: { quantity: number; unit_price: number; subtotal: number; cocktail: { name: string } | null }) => ({
      name: item.cocktail?.name || 'Producto',
      quantity: item.quantity,
      unitPrice: Number(item.unit_price),
      subtotal: Number(item.subtotal),
    })),
  };
}

async function getInvoicingConfig(): Promise<InvoicingConfig> {
  const { data, error } = await supabase
    .from('invoicing_config')
    .select('active_provider, config')
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    console.warn('No invoicing config found, using mock provider');
    return { activeProvider: 'mock', config: {} };
  }

  return {
    activeProvider: data.active_provider as ProviderType,
    config: (data.config as Record<string, unknown>) || {},
  };
}
