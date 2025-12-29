import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type DocumentType = "boleta" | "factura";
type ProviderType = "mock" | "bsale" | "nubox" | "sii";

interface IssueRequest {
  saleId: string;
  documentType: DocumentType;
  isRetry?: boolean;
}

interface SaleData {
  id: string;
  sale_number: string;
  total_amount: number;
  point_of_sale: string;
  items: Array<{
    name: string;
    quantity: number;
    unit_price: number;
    subtotal: number;
  }>;
}

interface ProviderResult {
  success: boolean;
  folio?: string;
  pdfUrl?: string;
  providerRef?: string;
  errorMessage?: string;
}

// Mock provider - for development only
async function mockProviderIssue(sale: SaleData, documentType: DocumentType, config: Record<string, unknown>): Promise<ProviderResult> {
  const successRate = (config.success_rate as number) ?? 0.95;
  
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 300 + Math.random() * 500));
  
  const isSuccess = Math.random() < successRate;
  
  if (!isSuccess) {
    return {
      success: false,
      errorMessage: "Error de conexión con el proveedor de facturación electrónica (mock)",
    };
  }
  
  const prefix = documentType === "boleta" ? "BOL" : "FAC";
  const folio = `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000).toString().padStart(4, "0")}`;
  const providerRef = `MOCK-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const pdfUrl = `https://mock-invoicing.local/documents/${folio}.pdf`;
  
  return {
    success: true,
    folio,
    pdfUrl,
    providerRef,
  };
}

// Provider dispatcher - add real providers here
async function callProvider(
  provider: ProviderType,
  sale: SaleData,
  documentType: DocumentType,
  config: Record<string, unknown>
): Promise<ProviderResult> {
  switch (provider) {
    case "mock":
      return mockProviderIssue(sale, documentType, config);
    case "bsale":
      // TODO: Implement BSale provider using Deno.env.get("BSALE_API_KEY")
      return { success: false, errorMessage: "BSale provider not implemented" };
    case "nubox":
      // TODO: Implement Nubox provider
      return { success: false, errorMessage: "Nubox provider not implemented" };
    case "sii":
      // TODO: Implement SII direct integration
      return { success: false, errorMessage: "SII provider not implemented" };
    default:
      return { success: false, errorMessage: `Unknown provider: ${provider}` };
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    // Use service role for database operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { saleId, documentType, isRetry = false } = (await req.json()) as IssueRequest;

    if (!saleId || !documentType) {
      return new Response(
        JSON.stringify({ success: false, errorMessage: "Missing saleId or documentType" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get active provider configuration
    const { data: configData } = await supabase
      .from("invoicing_config")
      .select("active_provider, config")
      .limit(1)
      .maybeSingle();

    const activeProvider = (configData?.active_provider as ProviderType) || "mock";
    const providerConfig = (configData?.config as Record<string, unknown>) || {};

    // Generate idempotency key
    const idempotencyKey = `${activeProvider}:${saleId}:${documentType}`;

    // Check for existing document with same idempotency key
    const { data: existingDoc } = await supabase
      .from("sales_documents")
      .select("*")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();

    // If document exists and was issued successfully, return it (idempotent)
    if (existingDoc && existingDoc.status === "issued") {
      console.log(`[issue-document] Returning existing issued document: ${existingDoc.id}`);
      return new Response(
        JSON.stringify({
          success: true,
          documentId: existingDoc.id,
          folio: existingDoc.folio,
          pdfUrl: existingDoc.pdf_url,
          isExisting: true,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // If this is a retry, use the existing document record
    let documentId: string;
    let retryCount = 0;

    if (existingDoc && (existingDoc.status === "failed" || existingDoc.status === "pending")) {
      if (!isRetry && existingDoc.status === "pending") {
        // Concurrent request detected - return pending status
        console.log(`[issue-document] Document already pending: ${existingDoc.id}`);
        return new Response(
          JSON.stringify({
            success: false,
            errorMessage: "Document issuance already in progress",
            isPending: true,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      documentId = existingDoc.id;
      retryCount = (existingDoc.retry_count || 0) + (isRetry ? 1 : 0);
      
      // Update to pending status
      await supabase
        .from("sales_documents")
        .update({
          status: "pending",
          retry_count: retryCount,
          last_attempt_at: new Date().toISOString(),
        })
        .eq("id", documentId);
    } else {
      // Create new document record with pending status
      const { data: newDoc, error: insertError } = await supabase
        .from("sales_documents")
        .insert({
          sale_id: saleId,
          document_type: documentType,
          provider: activeProvider,
          idempotency_key: idempotencyKey,
          status: "pending",
          last_attempt_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (insertError) {
        // Unique constraint violation means concurrent insert - return existing
        if (insertError.code === "23505") {
          console.log(`[issue-document] Concurrent insert detected, fetching existing`);
          const { data: concurrentDoc } = await supabase
            .from("sales_documents")
            .select("*")
            .eq("idempotency_key", idempotencyKey)
            .single();
          
          if (concurrentDoc?.status === "issued") {
            return new Response(
              JSON.stringify({
                success: true,
                documentId: concurrentDoc.id,
                folio: concurrentDoc.folio,
                pdfUrl: concurrentDoc.pdf_url,
                isExisting: true,
              }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          
          return new Response(
            JSON.stringify({
              success: false,
              errorMessage: "Document issuance already in progress",
              isPending: true,
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        console.error("[issue-document] Insert error:", insertError);
        return new Response(
          JSON.stringify({ success: false, errorMessage: "Error creating document record" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      documentId = newDoc.id;
    }

    // Load sale data
    const { data: sale, error: saleError } = await supabase
      .from("sales")
      .select(`
        id,
        sale_number,
        total_amount,
        point_of_sale,
        sale_items (
          quantity,
          unit_price,
          subtotal,
          cocktails (name)
        )
      `)
      .eq("id", saleId)
      .single();

    if (saleError || !sale) {
      console.error("[issue-document] Sale not found:", saleError);
      await supabase
        .from("sales_documents")
        .update({ status: "failed", error_message: "Sale not found" })
        .eq("id", documentId);
      
      return new Response(
        JSON.stringify({ success: false, errorMessage: "Sale not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const saleData: SaleData = {
      id: sale.id,
      sale_number: sale.sale_number,
      total_amount: Number(sale.total_amount),
      point_of_sale: sale.point_of_sale,
      items: (sale.sale_items || []).map((item: any) => ({
        name: item.cocktails?.name || "Producto",
        quantity: item.quantity,
        unit_price: Number(item.unit_price),
        subtotal: Number(item.subtotal),
      })),
    };

    // Call the provider
    console.log(`[issue-document] Calling provider: ${activeProvider} for sale: ${saleId}`);
    const result = await callProvider(activeProvider, saleData, documentType, providerConfig);

    // Update document with result
    if (result.success) {
      await supabase
        .from("sales_documents")
        .update({
          status: "issued",
          folio: result.folio,
          pdf_url: result.pdfUrl,
          provider_ref: result.providerRef,
          issued_at: new Date().toISOString(),
          error_message: null,
          next_retry_at: null,
        })
        .eq("id", documentId);

      console.log(`[issue-document] Document issued successfully: ${documentId}, folio: ${result.folio}`);
    } else {
      // Schedule next retry (exponential backoff: 5min, 15min, 45min, etc.)
      const nextRetryMinutes = Math.min(5 * Math.pow(3, retryCount), 60 * 24); // Max 24 hours
      const nextRetryAt = new Date(Date.now() + nextRetryMinutes * 60 * 1000);

      await supabase
        .from("sales_documents")
        .update({
          status: "failed",
          error_message: result.errorMessage,
          next_retry_at: nextRetryAt.toISOString(),
        })
        .eq("id", documentId);

      console.log(`[issue-document] Document failed: ${documentId}, next retry at: ${nextRetryAt.toISOString()}`);
    }

    return new Response(
      JSON.stringify({
        success: result.success,
        documentId,
        folio: result.folio,
        pdfUrl: result.pdfUrl,
        errorMessage: result.errorMessage,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[issue-document] Unexpected error:", error);
    return new Response(
      JSON.stringify({ success: false, errorMessage: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
