// Client-side invoicing service - calls Edge Function for secure provider execution
import { supabase } from '@/integrations/supabase/client';
import type { DocumentType } from './types';

interface IssueDocumentResult {
  success: boolean;
  documentId?: string;
  folio?: string;
  pdfUrl?: string;
  errorMessage?: string;
  isExisting?: boolean;
  isPending?: boolean;
}

/**
 * Issues an electronic document for a sale via Edge Function.
 * This ensures provider API keys are never exposed to the client.
 * 
 * Features:
 * - Idempotent: Returns existing document if already issued
 * - Concurrency safe: Prevents duplicate pending documents
 * - Retry support: Failed documents can be retried safely
 */
export async function issueDocument(
  saleId: string,
  documentType: DocumentType,
  isRetry: boolean = false
): Promise<IssueDocumentResult> {
  try {
    const { data, error } = await supabase.functions.invoke('issue-document', {
      body: {
        saleId,
        documentType,
        isRetry,
      },
    });

    if (error) {
      console.error('Error calling issue-document function:', error);
      return {
        success: false,
        errorMessage: error.message || 'Error al conectar con el servicio de facturación',
      };
    }

    return data as IssueDocumentResult;
  } catch (error) {
    console.error('Unexpected error in issueDocument:', error);
    return {
      success: false,
      errorMessage: error instanceof Error ? error.message : 'Error desconocido',
    };
  }
}

/**
 * Retry a failed document issuance.
 * Only works for documents with status 'failed'.
 */
export async function retryDocument(documentId: string): Promise<IssueDocumentResult> {
  try {
    // First get the document details
    const { data: doc, error: fetchError } = await supabase
      .from('sales_documents')
      .select('sale_id, document_type, status')
      .eq('id', documentId)
      .single();

    if (fetchError || !doc) {
      return {
        success: false,
        errorMessage: 'Documento no encontrado',
      };
    }

    if (doc.status !== 'failed') {
      return {
        success: false,
        errorMessage: `No se puede reintentar un documento con estado: ${doc.status}`,
      };
    }

    // Call issue with retry flag
    return issueDocument(doc.sale_id, doc.document_type as DocumentType, true);
  } catch (error) {
    console.error('Error in retryDocument:', error);
    return {
      success: false,
      errorMessage: error instanceof Error ? error.message : 'Error desconocido',
    };
  }
}
