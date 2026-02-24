/**
 * PrintingPanel – QZ Tray printing configuration panel for /sales.
 *
 * Features:
 * - Connection status with auto-connect on mount
 * - Printer discovery and selection
 * - Test print button
 * - Save printer to localStorage
 * - Setup guide for first-time users
 *
 * NOTE: QZ Tray only prints. Electronic invoicing (SII) is a separate future integration.
 */

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Printer,
  CheckCircle,
  XCircle,
  Loader2,
  RefreshCw,
  Wifi,
  WifiOff,
  ChevronDown,
  ChevronUp,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import {
  ensureQZConnected,
  isQZConnected,
  listPrinters,
  printRaw,
  type ReceiptData,
} from "@/lib/printing/qz";

const PRINTER_STORAGE_KEY = "stockia_printer_name";

interface PrintingPanelProps {
  venueName?: string;
}

export function PrintingPanel({ venueName }: PrintingPanelProps) {
  const [status, setStatus] = useState<"idle" | "connecting" | "connected" | "disconnected">("idle");
  const [printers, setPrinters] = useState<string[]>([]);
  const [selectedPrinter, setSelectedPrinter] = useState<string>(
    () => localStorage.getItem(PRINTER_STORAGE_KEY) || ""
  );
  const [isSearching, setIsSearching] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  // Auto-connect on mount
  useEffect(() => {
    connectQZ();
  }, []);

  const connectQZ = useCallback(async () => {
    setStatus("connecting");
    try {
      await ensureQZConnected();
      setStatus("connected");
      toast.success("QZ Tray conectado", { duration: 2000 });
      // Auto-search printers to trigger permission popup
      await searchPrinters();
    } catch (e: any) {
      setStatus("disconnected");
      const msg = e?.message || "desconocido";
      console.error("[PrintingPanel] Connect error:", msg, e);
      if (msg.includes("signature") || msg.includes("sign") || msg.includes("Sign")) {
        toast.error(`Error de firma QZ: ${msg}`, { duration: 8000 });
      } else if (msg.includes("certificate")) {
        toast.error(`Error certificado QZ: ${msg}`, { duration: 8000 });
      } else {
        toast.error(`QZ Tray no disponible: ${msg}`, { duration: 5000 });
      }
    }
  }, []);

  const searchPrinters = useCallback(async () => {
    setIsSearching(true);
    try {
      const found = await listPrinters();
      setPrinters(found);
      if (found.length === 0) {
        toast.info("No se encontraron impresoras");
      }
    } catch (e: any) {
      const msg = e?.message || "desconocido";
      toast.error(`Error buscando impresoras: ${msg}`, { duration: 5000 });
      console.error("[PrintingPanel] Search printers error:", msg, e);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const savePrinter = useCallback((name: string) => {
    setSelectedPrinter(name);
    localStorage.setItem(PRINTER_STORAGE_KEY, name);
    toast.success("Impresora guardada: " + name);
  }, []);

  const printTest = useCallback(async () => {
    if (!selectedPrinter) {
      toast.error("Selecciona una impresora primero");
      return;
    }

    setIsPrinting(true);
    const testData: ReceiptData = {
      saleNumber: "TEST-001",
      venueName: venueName || "STOCKIA",
      posName: "Prueba",
      dateTime: new Date().toLocaleString("es-CL"),
      items: [
        { name: "Producto de prueba", quantity: 1, price: 1000 },
        { name: "Otro producto", quantity: 2, price: 2500 },
      ],
      total: 6000,
      paymentMethod: "cash",
      pickupToken: "TEST-QR-TOKEN-12345",
    };

    const result = await printRaw(selectedPrinter, testData);
    setIsPrinting(false);

    if (result.success) {
      toast.success("Ticket de prueba impreso correctamente");
    } else {
      toast.error("Error imprimiendo: " + (result.error || "desconocido"));
    }
  }, [selectedPrinter, venueName]);

  const statusIcon = status === "connected"
    ? <Wifi className="w-3.5 h-3.5 text-green-500" />
    : status === "connecting"
    ? <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
    : <WifiOff className="w-3.5 h-3.5 text-destructive" />;

  const statusText = status === "connected"
    ? "Conectado"
    : status === "connecting"
    ? "Conectando…"
    : "No conectado";

  return (
    <Card className="border-border/50">
      {/* Compact header – always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-muted/30 transition-colors rounded-lg"
      >
        <div className="flex items-center gap-2">
          <Printer className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">Impresión</span>
          <Badge
            variant="outline"
            className={`text-[10px] px-1.5 py-0 ${
              status === "connected"
                ? "border-green-500/40 text-green-600 bg-green-500/10"
                : status === "disconnected"
                ? "border-destructive/40 text-destructive bg-destructive/10"
                : "border-muted"
            }`}
          >
            {statusIcon}
            <span className="ml-1">{statusText}</span>
          </Badge>
          {selectedPrinter && status === "connected" && (
            <span className="text-[10px] text-muted-foreground truncate max-w-[120px]">
              · {selectedPrinter}
            </span>
          )}
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="px-3 pb-3 space-y-3 border-t border-border/30 pt-3">
          {/* Connection */}
          <div className="flex items-center gap-2">
            {status !== "connected" ? (
              <Button
                onClick={connectQZ}
                disabled={status === "connecting"}
                size="sm"
                className="flex-1"
              >
                {status === "connecting" ? (
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                ) : (
                  <Wifi className="w-4 h-4 mr-1" />
                )}
                Conectar QZ Tray
              </Button>
            ) : (
              <div className="flex items-center gap-1 text-sm text-green-600">
                <CheckCircle className="w-4 h-4" />
                <span>QZ Tray conectado</span>
              </div>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={connectQZ}
              title="Reconectar"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          </div>

          {/* Printer selector */}
          {status === "connected" && (
            <div className="space-y-2">
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={searchPrinters}
                  disabled={isSearching}
                  className="text-xs"
                >
                  {isSearching ? (
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3 h-3 mr-1" />
                  )}
                  Buscar impresoras
                </Button>
              </div>

              {printers.length > 0 && (
                <div className="space-y-2">
                  <Select
                    value={selectedPrinter}
                    onValueChange={(val) => savePrinter(val)}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Selecciona impresora" />
                    </SelectTrigger>
                    <SelectContent>
                      {printers.map((p) => (
                        <SelectItem key={p} value={p} className="text-xs">
                          {p}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {selectedPrinter && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={printTest}
                      disabled={isPrinting}
                      className="w-full text-xs"
                    >
                      {isPrinting ? (
                        <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                      ) : (
                        <Printer className="w-3 h-3 mr-1" />
                      )}
                      Imprimir prueba
                    </Button>
                  )}
                </div>
              )}

              {printers.length === 0 && !isSearching && (
                <p className="text-[11px] text-muted-foreground">
                  Haz clic en "Buscar impresoras" para detectar las impresoras disponibles.
                </p>
              )}
            </div>
          )}

          {/* Setup guide */}
          <button
            onClick={() => setShowGuide(!showGuide)}
            className="flex items-center gap-1 text-[11px] text-primary hover:underline"
          >
            <Info className="w-3 h-3" />
            {showGuide ? "Ocultar guía" : "¿Primera vez? Ver guía de configuración"}
          </button>

          {showGuide && (
            <div className="p-3 bg-muted/50 rounded-lg text-[11px] space-y-1.5 text-muted-foreground">
              <p className="font-medium text-foreground">Configuración por equipo (una sola vez):</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>
                  Instala{" "}
                  <a
                    href="https://qz.io/download/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline text-primary"
                  >
                    QZ Tray
                  </a>{" "}
                  en este computador
                </li>
                <li>Abre STOCKIA en el navegador o PWA</li>
                <li>Haz clic en <strong>Conectar QZ Tray</strong></li>
                <li>Acepta el permiso en el popup de QZ</li>
                <li>Busca y selecciona tu impresora</li>
                <li>Prueba con <strong>Imprimir prueba</strong></li>
              </ol>
              <p className="text-[10px] italic mt-2">
                QZ Tray solo imprime. La boleta electrónica (SII) es una integración futura separada.
              </p>
            </div>
          )}

          {/* Disconnected help */}
          {status === "disconnected" && (
            <div className="p-2 bg-amber-500/10 border border-amber-500/30 rounded text-[11px] text-amber-700">
              <p className="font-medium">QZ Tray no detectado</p>
              <p>Verifica que QZ Tray esté instalado y ejecutándose en este equipo.</p>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
