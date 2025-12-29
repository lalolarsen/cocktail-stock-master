-- Create enum for document types
CREATE TYPE public.document_type AS ENUM ('boleta', 'factura');

-- Create enum for document status
CREATE TYPE public.document_status AS ENUM ('pending', 'issued', 'failed', 'cancelled');

-- Create sales_documents table linked 1:1 with sales
CREATE TABLE public.sales_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sale_id UUID NOT NULL UNIQUE REFERENCES public.sales(id) ON DELETE CASCADE,
  document_type document_type NOT NULL DEFAULT 'boleta',
  folio TEXT,
  status document_status NOT NULL DEFAULT 'pending',
  pdf_url TEXT,
  issued_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.sales_documents ENABLE ROW LEVEL SECURITY;

-- RLS Policies matching sales table access patterns
CREATE POLICY "Admins can manage all sales documents"
ON public.sales_documents
FOR ALL
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view their own sales documents"
ON public.sales_documents
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.sales
    WHERE sales.id = sales_documents.sale_id
    AND sales.seller_id = auth.uid()
  )
);

CREATE POLICY "Sellers can create sales documents"
ON public.sales_documents
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.sales
    WHERE sales.id = sales_documents.sale_id
    AND sales.seller_id = auth.uid()
    AND has_role(auth.uid(), 'vendedor')
  )
);

-- Create indexes
CREATE INDEX idx_sales_documents_sale_id ON public.sales_documents(sale_id);
CREATE INDEX idx_sales_documents_status ON public.sales_documents(status);
CREATE INDEX idx_sales_documents_document_type ON public.sales_documents(document_type);

-- Add trigger for updated_at
CREATE TRIGGER update_sales_documents_updated_at
BEFORE UPDATE ON public.sales_documents
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();