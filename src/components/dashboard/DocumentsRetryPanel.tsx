import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, FileText, AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { formatCLP } from "@/lib/currency";
import { retryDocument } from "@/lib/invoicing";
import { toast } from "sonner";
import { format } from "date-fns";
import { es } from "date-fns/locale";
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

interface SalesDocument {
  id: string;
  sale_id: string;
  document_type: "boleta" | "factura";
  provider: string;
  status: "pending" | "issued" | "failed" | "cancelled";
  folio: string | null;
  pdf_url: string | null;
  error_message: string | null;
  retry_count: number;
  last_attempt_at: string | null;
  next_retry_at: string | null;
  created_at: string;
  sale: {
    sale_number: string;
    total_amount: number;
    point_of_sale: string;
  } | null;
}

export function DocumentsRetryPanel() {
  const [documents, setDocuments] = useState<SalesDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  useEffect(() => {
    fetchDocuments();
  }, [statusFilter]);

  const fetchDocuments = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("sales_documents")
        .select(`
          *,
          sale:sales (
            sale_number,
            total_amount,
            point_of_sale
          )
        `)
        .order("created_at", { ascending: false })
        .limit(100);

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter as "pending" | "issued" | "failed" | "cancelled");
      }

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

  const handleRetry = async (documentId: string) => {
    setRetrying(documentId);
    try {
      const result = await retryDocument(documentId);
      
      if (result.success) {
        toast.success(`Documento emitido: ${result.folio}`);
      } else {
        toast.error(result.errorMessage || "Error al reintentar");
      }
      
      fetchDocuments();
    } catch (error) {
      toast.error("Error al reintentar emisión");
    } finally {
      setRetrying(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "issued":
        return (
          <Badge className="bg-green-500/10 text-green-600 border-green-500/20">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            Emitido
          </Badge>
        );
      case "failed":
        return (
          <Badge variant="destructive">
            <AlertTriangle className="w-3 h-3 mr-1" />
            Fallido
          </Badge>
        );
      case "pending":
        return (
          <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20">
            <Clock className="w-3 h-3 mr-1" />
            Pendiente
          </Badge>
        );
      case "cancelled":
        return (
          <Badge variant="secondary">
            Cancelado
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "-";
    return format(new Date(dateStr), "dd MMM HH:mm", { locale: es });
  };

  if (loading) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </Card>
    );
  }

  const failedCount = documents.filter(d => d.status === "failed").length;

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <FileText className="w-5 h-5 text-primary" />
          <h2 className="text-xl font-semibold">Documentos Electrónicos</h2>
          {failedCount > 0 && (
            <Badge variant="destructive">{failedCount} fallidos</Badge>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filtrar por estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="failed">Fallidos</SelectItem>
              <SelectItem value="pending">Pendientes</SelectItem>
              <SelectItem value="issued">Emitidos</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={fetchDocuments}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Actualizar
          </Button>
        </div>
      </div>

      {documents.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          No hay documentos para mostrar
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Venta</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Folio</TableHead>
                <TableHead>Proveedor</TableHead>
                <TableHead>Reintentos</TableHead>
                <TableHead>Último Intento</TableHead>
                <TableHead>Error</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {documents.map((doc) => (
                <TableRow key={doc.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{doc.sale?.sale_number || "-"}</p>
                      <p className="text-sm text-muted-foreground">
                        {doc.sale ? formatCLP(doc.sale.total_amount) : "-"}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {doc.document_type === "boleta" ? "Boleta" : "Factura"}
                    </Badge>
                  </TableCell>
                  <TableCell>{getStatusBadge(doc.status)}</TableCell>
                  <TableCell>
                    {doc.folio ? (
                      <span className="font-mono text-sm">{doc.folio}</span>
                    ) : (
                      "-"
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="capitalize">
                      {doc.provider}
                    </Badge>
                  </TableCell>
                  <TableCell>{doc.retry_count}</TableCell>
                  <TableCell>{formatDate(doc.last_attempt_at)}</TableCell>
                  <TableCell>
                    {doc.error_message ? (
                      <span className="text-sm text-destructive max-w-[200px] truncate block" title={doc.error_message}>
                        {doc.error_message}
                      </span>
                    ) : (
                      "-"
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {doc.status === "failed" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleRetry(doc.id)}
                        disabled={retrying === doc.id}
                      >
                        {retrying === doc.id ? (
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
                        <FileText className="w-4 h-4 mr-1" />
                        Ver PDF
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
}
