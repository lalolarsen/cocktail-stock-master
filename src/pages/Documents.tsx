import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  RefreshCw,
  FileText,
  Search,
  Download,
  ArrowLeft,
  Eye,
  FileCheck,
  Hourglass,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { formatCLP } from "@/lib/currency";
import { retryDocument } from "@/lib/invoicing";
import { toast } from "sonner";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { DocumentDetailsDrawer } from "@/components/dashboard/DocumentDetailsDrawer";
import { DocumentStatusBadge, getErrorSummary } from "@/components/dashboard/DocumentStatusBadge";

interface SalesDocument {
  id: string;
  sale_id: string;
  document_type: "boleta" | "factura";
  provider: string;
  provider_ref: string | null;
  status: "pending" | "processing" | "issued" | "failed" | "cancelled";
  folio: string | null;
  pdf_url: string | null;
  error_message: string | null;
  retry_count: number;
  last_attempt_at: string | null;
  next_retry_at: string | null;
  issued_at: string | null;
  created_at: string;
  updated_at?: string;
  sale: {
    sale_number: string;
    total_amount: number;
    point_of_sale: string;
    created_at: string;
    seller_id: string;
    jornada?: {
      fecha: string;
      numero_jornada: number;
    } | null;
    sale_items?: Array<{
      quantity: number;
      unit_price: number;
      subtotal: number;
      cocktails: {
        name: string;
      } | null;
    }>;
  } | null;
}

interface InvoicingConfig {
  active_provider: string;
}

export default function Documents() {
  const navigate = useNavigate();
  const { role, isReadOnly } = useUserRole();
  const [documents, setDocuments] = useState<SalesDocument[]>([]);
  const [loading, setLoading] = useState(true);
  // Track retrying by idempotency key (provider:saleId:documentType) to prevent duplicates
  const [retryingKeys, setRetryingKeys] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState("issued");
  const [searchQuery, setSearchQuery] = useState("");
  const [documentTypeFilter, setDocumentTypeFilter] = useState<string>("all");
  const [activeProvider, setActiveProvider] = useState<string>("mock");
  const [selectedDocument, setSelectedDocument] = useState<SalesDocument | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Ref to track current documents for realtime updates without closure issues
  const documentsRef = useRef<SalesDocument[]>([]);
  const selectedDocumentRef = useRef<SalesDocument | null>(null);

  // Keep refs in sync
  useEffect(() => {
    documentsRef.current = documents;
  }, [documents]);

  useEffect(() => {
    selectedDocumentRef.current = selectedDocument;
  }, [selectedDocument]);

  useEffect(() => {
    fetchInvoicingConfig();
    fetchDocuments();
  }, [activeTab]);

  // Realtime subscription for sales_documents changes
  useEffect(() => {
    const channel = supabase
      .channel('sales-documents-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'sales_documents',
        },
        async (payload) => {
          console.log('[Realtime] sales_documents change:', payload.eventType, payload.new);

          if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') {
            const updatedDoc = payload.new as any;
            
            // Fetch the full document with sale data to update correctly
            const { data: fullDoc } = await supabase
              .from('sales_documents')
              .select(`
                *,
                sale:sales (
                  sale_number,
                  total_amount,
                  point_of_sale,
                  created_at,
                  seller_id,
                  jornada:jornadas (
                    fecha,
                    numero_jornada
                  ),
                  sale_items (
                    quantity,
                    unit_price,
                    subtotal,
                    cocktails (
                      name
                    )
                  )
                )
              `)
              .eq('id', updatedDoc.id)
              .maybeSingle();

            if (fullDoc) {
              const typedDoc = fullDoc as SalesDocument;
              
              // Update document in list
              setDocuments(prev => {
                const existingIndex = prev.findIndex(d => d.id === typedDoc.id);
                if (existingIndex >= 0) {
                  // Update existing document
                  const updated = [...prev];
                  updated[existingIndex] = typedDoc;
                  return updated;
                } else {
                  // New document - add to list
                  return [typedDoc, ...prev];
                }
              });

              // Update selected document if it's the one that changed
              if (selectedDocumentRef.current?.id === typedDoc.id) {
                setSelectedDocument(typedDoc);
              }

              // Show toast for status transitions
              if (payload.eventType === 'UPDATE') {
                const oldStatus = (payload.old as any)?.status;
                const newStatus = updatedDoc.status;
                
                if (oldStatus !== newStatus) {
                  if (newStatus === 'issued') {
                    toast.success(`Documento ${typedDoc.folio || typedDoc.id.slice(0, 8)} emitido`, {
                      description: typedDoc.sale?.sale_number,
                    });
                  } else if (newStatus === 'failed') {
                    toast.error(`Documento ${typedDoc.id.slice(0, 8)} falló`, {
                      description: typedDoc.error_message || 'Error desconocido',
                    });
                  }
                }
              }
            }
          } else if (payload.eventType === 'DELETE') {
            const deletedId = (payload.old as any)?.id;
            if (deletedId) {
              setDocuments(prev => prev.filter(d => d.id !== deletedId));
              if (selectedDocumentRef.current?.id === deletedId) {
                setDrawerOpen(false);
                setSelectedDocument(null);
              }
            }
          }
        }
      )
      .subscribe((status) => {
        console.log('[Realtime] Subscription status:', status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchInvoicingConfig = async () => {
    try {
      const { data, error } = await supabase
        .from("invoicing_config")
        .select("active_provider")
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      if (data) {
        setActiveProvider(data.active_provider);
      }
    } catch (error) {
      console.error("Error fetching invoicing config:", error);
    }
  };

  const getStatusesForTab = (tab: string): ("pending" | "issued" | "failed" | "cancelled")[] => {
    switch (tab) {
      case "issued":
        return ["issued"];
      case "pending":
        return ["pending"];
      case "failed":
        return ["failed"];
      default:
        return ["issued"];
    }
  };

  const fetchDocuments = async () => {
    setLoading(true);
    try {
      const statuses = getStatusesForTab(activeTab);
      
      let query = supabase
        .from("sales_documents")
        .select(`
          *,
          sale:sales (
            sale_number,
            total_amount,
            point_of_sale,
            created_at,
            seller_id,
            jornada:jornadas (
              fecha,
              numero_jornada
            ),
            sale_items (
              quantity,
              unit_price,
              subtotal,
              cocktails (
                name
              )
            )
          )
        `)
        .in("status", statuses)
        .order("created_at", { ascending: false })
        .limit(200);

      const { data, error } = await query;

      if (error) throw error;
      setDocuments((data as SalesDocument[]) || []);
    } catch (error) {
      console.error("Error fetching documents:", error);
      toast.error("Error al cargar documentos");
    } finally {
      setLoading(false);
    }
  };

  const handleRetry = async (doc: SalesDocument) => {
    if (isReadOnly) {
      toast.error("No tienes permisos para reintentar documentos");
      return;
    }
    
    // Create deterministic idempotency key to prevent concurrent retries
    const idempotencyKey = `${doc.provider}:${doc.sale_id}:${doc.document_type}`;
    
    // Check if already retrying this document
    if (retryingKeys.has(idempotencyKey)) {
      toast.warning("Ya se está procesando este documento");
      return;
    }
    
    // Add to retrying set
    setRetryingKeys(prev => new Set(prev).add(idempotencyKey));
    
    try {
      const result = await retryDocument(doc.id);

      if (result.success) {
        toast.success(`Documento emitido: ${result.folio}`);
        // Update document in local state immediately
        setDocuments(prev => prev.map(d => 
          d.id === doc.id 
            ? { ...d, status: 'issued' as const, folio: result.folio || null, pdf_url: result.pdfUrl || null }
            : d
        ));
      } else if (result.isPending) {
        toast.info("El documento ya está siendo procesado");
      } else {
        toast.error(result.errorMessage || "Error al reintentar");
      }

      fetchDocuments();
    } catch (error) {
      toast.error("Error al reintentar emisión");
    } finally {
      // Remove from retrying set
      setRetryingKeys(prev => {
        const next = new Set(prev);
        next.delete(idempotencyKey);
        return next;
      });
    }
  };

  // Helper to check if a document is currently being retried
  const isRetrying = (doc: SalesDocument): boolean => {
    const idempotencyKey = `${doc.provider}:${doc.sale_id}:${doc.document_type}`;
    return retryingKeys.has(idempotencyKey);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "-";
    return format(new Date(dateStr), "dd MMM yyyy HH:mm", { locale: es });
  };

  const filteredDocuments = documents.filter((doc) => {
    const matchesSearch =
      searchQuery === "" ||
      doc.sale?.sale_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.folio?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesType =
      documentTypeFilter === "all" || doc.document_type === documentTypeFilter;

    return matchesSearch && matchesType;
  });

  const getCounts = () => {
    // We need to fetch counts separately, but for now we'll show the filtered count
    return {
      issued: activeTab === "issued" ? filteredDocuments.length : 0,
      pending: activeTab === "pending" ? filteredDocuments.length : 0,
      failed: activeTab === "failed" ? filteredDocuments.length : 0,
    };
  };

  const getProviderDisplayName = (provider: string) => {
    const providers: Record<string, string> = {
      mock: "Mock (Desarrollo)",
      bsale: "BSale",
      nubox: "Nubox",
      sii: "SII Directo",
    };
    return providers[provider] || provider;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b border-border/50 px-6 py-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate("/admin")}
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div>
                <h1 className="text-2xl font-bold gradient-text flex items-center gap-2">
                  <FileCheck className="w-6 h-6" />
                  Documentos
                </h1>
                <p className="text-sm text-muted-foreground">
                  Gestión de boletas y facturas emitidas y pendientes
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Badge
                variant="outline"
                className="px-3 py-1 text-sm bg-primary/5"
              >
                Proveedor activo:{" "}
                <span className="font-semibold ml-1">
                  {getProviderDisplayName(activeProvider)}
                </span>
              </Badge>
              {isReadOnly && (
                <Badge
                  variant="secondary"
                  className="flex items-center gap-1 bg-amber-500/10 text-amber-600 border-amber-500/20"
                >
                  <Eye className="w-3 h-3" />
                  Solo lectura
                </Badge>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <TabsList className="grid grid-cols-3 w-full sm:w-auto">
              <TabsTrigger value="issued" className="gap-2">
                <CheckCircle2 className="w-4 h-4" />
                Emitidos
              </TabsTrigger>
              <TabsTrigger value="pending" className="gap-2">
                <Hourglass className="w-4 h-4" />
                Pendientes
              </TabsTrigger>
              <TabsTrigger value="failed" className="gap-2">
                <AlertTriangle className="w-4 h-4" />
                Fallidos
              </TabsTrigger>
            </TabsList>

            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por venta o folio..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 w-64"
                />
              </div>
              <Select
                value={documentTypeFilter}
                onValueChange={setDocumentTypeFilter}
              >
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="boleta">Boleta</SelectItem>
                  <SelectItem value="factura">Factura</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon" onClick={fetchDocuments}>
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Tab Content */}
          <TabsContent value="issued">
            <DocumentsTable
              documents={filteredDocuments}
              loading={loading}
              isRetrying={isRetrying}
              onRetry={handleRetry}
              onRowClick={(doc) => {
                setSelectedDocument(doc);
                setDrawerOpen(true);
              }}
              formatDate={formatDate}
              isReadOnly={isReadOnly}
              showIssuedDate
            />
          </TabsContent>

          <TabsContent value="pending">
            <DocumentsTable
              documents={filteredDocuments}
              loading={loading}
              isRetrying={isRetrying}
              onRetry={handleRetry}
              onRowClick={(doc) => {
                setSelectedDocument(doc);
                setDrawerOpen(true);
              }}
              formatDate={formatDate}
              isReadOnly={isReadOnly}
            />
          </TabsContent>

          <TabsContent value="failed">
            <DocumentsTable
              documents={filteredDocuments}
              loading={loading}
              isRetrying={isRetrying}
              onRetry={handleRetry}
              onRowClick={(doc) => {
                setSelectedDocument(doc);
                setDrawerOpen(true);
              }}
              formatDate={formatDate}
              isReadOnly={isReadOnly}
              showRetryInfo
            />
          </TabsContent>
        </Tabs>

        {/* Document Details Drawer */}
        <DocumentDetailsDrawer
          document={selectedDocument}
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          onRetry={(doc) => {
            handleRetry(doc);
            setDrawerOpen(false);
          }}
          isRetrying={selectedDocument ? isRetrying(selectedDocument) : false}
          isReadOnly={isReadOnly}
        />
      </main>
    </div>
  );
}

interface DocumentsTableProps {
  documents: SalesDocument[];
  loading: boolean;
  isRetrying: (doc: SalesDocument) => boolean;
  onRetry: (doc: SalesDocument) => void;
  onRowClick: (doc: SalesDocument) => void;
  formatDate: (date: string | null) => string;
  isReadOnly: boolean;
  showRetryInfo?: boolean;
  showIssuedDate?: boolean;
}

function DocumentsTable({
  documents,
  loading,
  isRetrying,
  onRetry,
  onRowClick,
  formatDate,
  isReadOnly,
  showRetryInfo,
  showIssuedDate,
}: DocumentsTableProps) {
  if (loading) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </Card>
    );
  }

  if (documents.length === 0) {
    return (
      <Card className="p-6">
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <FileText className="w-12 h-12 mb-4 opacity-50" />
          <p className="text-lg font-medium">No hay documentos</p>
          <p className="text-sm">No se encontraron documentos con los filtros aplicados</p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Venta</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Folio</TableHead>
              <TableHead>Monto</TableHead>
              <TableHead>POS</TableHead>
              {showIssuedDate && <TableHead>Fecha Emisión</TableHead>}
              {showRetryInfo && (
                <>
                  <TableHead>Reintentos</TableHead>
                  <TableHead>Error</TableHead>
                </>
              )}
              <TableHead>Creado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {documents.map((doc) => (
              <TableRow 
                key={doc.id} 
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => onRowClick(doc)}
              >
                <TableCell>
                  <span className="font-mono font-medium">
                    {doc.sale?.sale_number || "-"}
                  </span>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="capitalize">
                    {doc.document_type}
                  </Badge>
                </TableCell>
                <TableCell><DocumentStatusBadge status={doc.status} /></TableCell>
                <TableCell>
                  {doc.folio ? (
                    <span className="font-mono text-sm bg-muted px-2 py-1 rounded">
                      {doc.folio}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell>
                  {doc.sale ? (
                    <span className="font-medium">
                      {formatCLP(doc.sale.total_amount)}
                    </span>
                  ) : (
                    "-"
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant="secondary" className="text-xs">
                    {doc.sale?.point_of_sale || "-"}
                  </Badge>
                </TableCell>
                {showIssuedDate && (
                  <TableCell className="text-sm">
                    {formatDate(doc.issued_at)}
                  </TableCell>
                )}
                {showRetryInfo && (
                  <>
                    <TableCell>
                      <Badge variant="outline">{doc.retry_count}</Badge>
                    </TableCell>
                    <TableCell>
                      {doc.error_message ? (
                        <span
                          className="text-sm text-destructive max-w-[200px] truncate block cursor-help"
                          title={doc.error_message}
                        >
                          {getErrorSummary(doc.error_message)}
                        </span>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                  </>
                )}
                <TableCell className="text-sm text-muted-foreground">
                  {formatDate(doc.created_at)}
                </TableCell>
                <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-end gap-2">
                    {doc.status === "failed" && !isReadOnly && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onRetry(doc)}
                        disabled={isRetrying(doc)}
                      >
                        {isRetrying(doc) ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <>
                            <RefreshCw className="w-4 h-4 mr-1" />
                            Reintentar
                          </>
                        )}
                      </Button>
                    )}
                    {doc.status === "issued" && doc.pdf_url && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => window.open(doc.pdf_url!, "_blank")}
                      >
                        <Download className="w-4 h-4 mr-1" />
                        PDF
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
