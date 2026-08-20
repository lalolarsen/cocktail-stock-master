import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Banknote, CreditCard, Loader2 } from "lucide-react";
import { formatCLP } from "@/lib/currency";

export type PaymentMethod = "cash" | "card" | null;
export type DocumentTypeOption = "boleta" | "factura";

interface PaymentPanelProps {
  total: number;
  paymentMethod: PaymentMethod;
  onPaymentMethodChange: (method: "cash" | "card") => void;
  documentType: DocumentTypeOption;
  onDocumentTypeChange: (value: DocumentTypeOption) => void;
  receiptMode: string;
  loading: boolean;
  disabled?: boolean;
  /** Mensaje de estado operativo visible (ej: "Imprimiendo…"). */
  statusLabel?: string | null;
  onCharge: () => void;
}

/** Presentational payment block of the POS cart (method, document, total, charge). */
export function PaymentPanel({
  total,
  paymentMethod,
  onPaymentMethodChange,
  documentType,
  onDocumentTypeChange,
  receiptMode,
  loading,
  disabled = false,
  statusLabel = null,
  onCharge,
}: PaymentPanelProps) {
  const methodClass = (active: boolean) =>
    `flex items-center justify-center gap-2 rounded-md border py-3 text-base font-bold transition-colors min-h-[64px] ${
      active
        ? "border-primary bg-primary/15 text-primary"
        : "border-border text-foreground/80 hover:border-muted-foreground/40"
    }`;

  return (
    <div className="shrink-0 border-t border-border px-3 py-3 space-y-2.5">
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => onPaymentMethodChange("cash")} className={methodClass(paymentMethod === "cash")}>
          <Banknote className="w-5 h-5" /> Efectivo
        </button>
        <button type="button" onClick={() => onPaymentMethodChange("card")} className={methodClass(paymentMethod === "card")}>
          <CreditCard className="w-5 h-5" /> Tarjeta
        </button>
      </div>

      {!paymentMethod && (
        <p className="text-sm text-destructive text-center font-semibold">Selecciona medio de pago</p>
      )}

      {statusLabel && (
        <p className="text-sm text-primary text-center font-semibold">{statusLabel}</p>
      )}


      {(paymentMethod === "cash" || receiptMode === "unified") && (
        <Select value={documentType} onValueChange={(value) => onDocumentTypeChange(value as DocumentTypeOption)}>
          <SelectTrigger className="h-12 text-base">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="boleta">Boleta</SelectItem>
            <SelectItem value="factura">Factura</SelectItem>
          </SelectContent>
        </Select>
      )}

      {paymentMethod === "card" && receiptMode === "hybrid" && (
        <p className="text-xs text-muted-foreground text-center">
          El comprobante se emite desde el POS externo
        </p>
      )}

      <div className="flex items-baseline justify-between">
        <span className="text-base font-semibold tracking-widest text-muted-foreground uppercase">Total</span>
        <span className="text-4xl font-bold text-primary tabular-nums">{formatCLP(total)}</span>
      </div>

      <Button
        onClick={onCharge}
        disabled={loading || disabled || !paymentMethod}
        className="w-full h-16 text-lg font-bold tracking-widest uppercase"
        size="lg"
      >
        {loading ? (
          <>
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Cobrando…
          </>
        ) : (
          "Cobrar"
        )}
      </Button>
    </div>
  );
}
