import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Loader2,
  RefreshCw,
  Download,
  Copy,
  CheckCircle2,
  AlertTriangle,
  Clock,
  XCircle,
  FileText,
  User,
  Calendar,
  CreditCard,
  MapPin,
  ShoppingCart,
} from "lucide-react";
import { formatCLP } from "@/lib/currency";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";

interface SaleItem {
  name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

interface SalesDocument {
  id: string;
  sale_id: string;
  document_type: "boleta" | "factura";
  provider: string;
  provider_ref: string | null;
  status: "pending" | "issued" | "failed" | "cancelled";
  folio: string | null;
  pdf_url: string | null;
  error_message: string | null;
  retry_count: number;
  last_attempt_at: string | null;
  next_retry_at: string | null;
  issued_at: string | null;
  created_at: string;
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

interface DocumentDetailsDrawerProps {
  document: SalesDocument | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRetry: (doc: SalesDocument) => void;
  isRetrying: boolean;
  isReadOnly: boolean;
}

export function DocumentDetailsDrawer({
  document,
  open,
  onOpenChange,
  onRetry,
  isRetrying,
  isReadOnly,
}: DocumentDetailsDrawerProps) {
  if (!document) return null;

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "-";
    return format(new Date(dateStr), "dd MMM yyyy HH:mm", { locale: es });
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
            <XCircle className="w-3 h-3 mr-1" />
            Cancelado
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiado al portapapeles`);
  };

  const saleItems: SaleItem[] = (document.sale?.sale_items || []).map((item) => ({
    name: item.cocktails?.name || "Producto",
    quantity: item.quantity,
    unit_price: Number(item.unit_price),
    subtotal: Number(item.subtotal),
  }));

  const canRetry =
    !isReadOnly && (document.status === "failed" || document.status === "pending");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Detalle de Documento
          </SheetTitle>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-120px)] mt-6 pr-4">
          <div className="space-y-6">
            {/* Document Info */}
            <section>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                Documento
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Estado</span>
                  {getStatusBadge(document.status)}
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Tipo</span>
                  <Badge variant="outline" className="capitalize">
                    {document.document_type}
                  </Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Proveedor</span>
                  <span className="text-sm font-medium">{document.provider}</span>
                </div>
                {document.folio && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Folio</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm bg-muted px-2 py-1 rounded">
                        {document.folio}
                      </span>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => copyToClipboard(document.folio!, "Folio")}
                      >
                        <Copy className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                )}
                {document.provider_ref && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Ref. Proveedor</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs bg-muted px-2 py-1 rounded">
                        {document.provider_ref}
                      </span>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() =>
                          copyToClipboard(document.provider_ref!, "Referencia")
                        }
                      >
                        <Copy className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                )}
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Creado</span>
                  <span className="text-sm">{formatDate(document.created_at)}</span>
                </div>
                {document.issued_at && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Emitido</span>
                    <span className="text-sm">{formatDate(document.issued_at)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Reintentos</span>
                  <Badge variant="outline">{document.retry_count}</Badge>
                </div>
                {document.last_attempt_at && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Último intento</span>
                    <span className="text-sm">{formatDate(document.last_attempt_at)}</span>
                  </div>
                )}
                {document.next_retry_at && document.status === "failed" && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Próximo reintento</span>
                    <span className="text-sm">{formatDate(document.next_retry_at)}</span>
                  </div>
                )}
                {document.error_message && (
                  <div className="mt-3 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                    <p className="text-sm text-destructive font-medium mb-1">Error</p>
                    <p className="text-sm text-destructive/80">{document.error_message}</p>
                  </div>
                )}
              </div>
            </section>

            <Separator />

            {/* Sale Info */}
            {document.sale && (
              <section>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                  Venta Asociada
                </h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground flex items-center gap-1">
                      <ShoppingCart className="w-3 h-3" />
                      Número
                    </span>
                    <span className="font-mono font-medium">
                      {document.sale.sale_number}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground flex items-center gap-1">
                      <CreditCard className="w-3 h-3" />
                      Total
                    </span>
                    <span className="font-semibold text-lg">
                      {formatCLP(document.sale.total_amount)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground flex items-center gap-1">
                      <User className="w-3 h-3" />
                      Vendedor ID
                    </span>
                    <span className="text-xs font-mono">
                      {document.sale.seller_id.slice(0, 8)}...
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      Terminal
                    </span>
                    <Badge variant="secondary" className="text-xs">
                      {document.sale.point_of_sale}
                    </Badge>
                  </div>
                  {document.sale.jornada && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        Jornada
                      </span>
                      <span className="text-sm">
                        #{document.sale.jornada.numero_jornada} -{" "}
                        {format(new Date(document.sale.jornada.fecha), "dd/MM/yyyy")}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Fecha venta</span>
                    <span className="text-sm">{formatDate(document.sale.created_at)}</span>
                  </div>
                </div>

                {/* Sale Items */}
                {saleItems.length > 0 && (
                  <div className="mt-4">
                    <h4 className="text-sm font-medium mb-2">Productos</h4>
                    <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                      {saleItems.map((item, index) => (
                        <div
                          key={index}
                          className="flex justify-between items-center text-sm"
                        >
                          <span>
                            {item.quantity}x {item.name}
                          </span>
                          <span className="font-medium">{formatCLP(item.subtotal)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            )}

            <Separator />

            {/* Actions */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                Acciones
              </h3>
              <div className="flex flex-col gap-2">
                {document.pdf_url && (
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => window.open(document.pdf_url!, "_blank")}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Abrir PDF
                  </Button>
                )}
                {canRetry && (
                  <Button
                    variant="default"
                    className="w-full justify-start"
                    onClick={() => onRetry(document)}
                    disabled={isRetrying}
                  >
                    {isRetrying ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4 mr-2" />
                    )}
                    Reintentar emisión
                  </Button>
                )}
                {!document.pdf_url && !canRetry && (
                  <p className="text-sm text-muted-foreground text-center py-2">
                    No hay acciones disponibles
                  </p>
                )}
              </div>
            </section>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}