import { useState } from "react";
import { Printer, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useUserRole } from "@/hooks/useUserRole";
import { registerReprint, trackedPrint, type PrintOutcome, type PrintSource, type ReprintInfo } from "@/lib/printing/print-tracker";

interface Props {
  source: PrintSource;
  refKey: string;
  label: string;
  jornadaId?: string | null;
  posId?: string | null;
  info?: ReprintInfo;
  /** Debe imprimir con la leyenda REIMPRESIÓN */
  print: () => Promise<PrintOutcome>;
  onDone?: () => void;
  className?: string;
}

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-CL", { timeZone: "America/Santiago", hour: "2-digit", minute: "2-digit" });

/** Reimpresión única: 1 vez por comprobante; admin/gerencia pueden reimprimir más. */
export function ReprintButton({ source, refKey, label, jornadaId, posId, info, print, onDone, className }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const { roles } = useUserRole();
  const isSupervisor = !!roles?.some((r) => r === "admin" || r === "gerencia");
  const blocked = !!info && !isSupervisor;

  const doReprint = async () => {
    setBusy(true);
    // Imprimir primero, dentro del toque, para que Chrome no bloquee RawBT.
    const printing = trackedPrint({ source, refKey, label: `${label} (reimpresión)`, jornadaId, posId, print }, "reprint");
    const reg = await registerReprint({ source, refKey, label, jornadaId, posId });
    await printing;
    setBusy(false);
    setOpen(false);
    if (!reg.ok) toast.error(reg.limit ? "Ya se reimprimió. Pide a un administrador." : "No se pudo registrar la reimpresión");
    else toast.success("Reimpresión enviada");
    onDone?.();
  };

  if (blocked) {
    return (
      <div className={`text-right text-xs text-muted-foreground leading-tight ${className ?? ""}`}>
        Reimpreso{info.reprintedBy ? ` por ${info.reprintedBy}` : ""}
        <br />a las {fmtTime(info.reprintedAt)}
      </div>
    );
  }

  return (
    <>
      <Button variant="outline" size="lg" className={`h-12 gap-2 ${className ?? ""}`} onClick={() => setOpen(true)}>
        <Printer className="w-4 h-4" />
        {info ? "Reimprimir (admin)" : "Reimprimir (1 vez)"}
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Reimprimir {label}?</AlertDialogTitle>
            <AlertDialogDescription>
              Saldrá con la palabra REIMPRESIÓN y quedará registrado a tu nombre. Solo se permite una vez.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-12">Cancelar</AlertDialogCancel>
            <AlertDialogAction className="h-12 gap-2" disabled={busy} onClick={(e) => { e.preventDefault(); void doReprint(); }}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />} Reimprimir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
