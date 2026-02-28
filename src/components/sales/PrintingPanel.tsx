import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Copy,
  Info,
  Loader2,
  Printer,
  RefreshCw,
  ShieldCheck,
  Wifi,
  WifiOff,
} from "lucide-react";
import { toast } from "sonner";
import {
  ensureQZConnected,
  forceHandshake,
  getPreferredPaperWidthStorageKey,
  getPreferredPrinterStorageKey,
  getQZDiagnostics,
  listPrinters,
  printRaw,
  type PaperWidth,
  type QZConnectionStatus,
  type ReceiptData,
} from "@/lib/printing/qz";

interface PrintingPanelProps {
  venueName?: string;
  venueId?: string;
  posId?: string;
}

const LEGACY_PRINTER_KEY = "stockia_printer_name";

export function PrintingPanel({ venueName, venueId, posId }: PrintingPanelProps) {
  const [status, setStatus] = useState<QZConnectionStatus>("DISCONNECTED");
  const [printers, setPrinters] = useState<string[]>([]);
  const [selectedPrinter, setSelectedPrinter] = useState("");
  const [paperWidth, setPaperWidth] = useState<PaperWidth>("80mm");
  const [isSearching, setIsSearching] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [diagnosticsData, setDiagnosticsData] = useState(() => getQZDiagnostics());

  const autoSearchDoneRef = useRef(false);

  const printerStorageKey = useMemo(
    () => getPreferredPrinterStorageKey(venueId, posId),
    [venueId, posId],
  );
  const paperWidthStorageKey = useMemo(
    () => getPreferredPaperWidthStorageKey(venueId, posId),
    [venueId, posId],
  );

  const refreshDiagnostics = useCallback(() => {
    setDiagnosticsData(getQZDiagnostics());
  }, []);

  // Load saved preferences
  useEffect(() => {
    const saved =
      localStorage.getItem(printerStorageKey) ||
      localStorage.getItem(LEGACY_PRINTER_KEY) ||
      "";
    setSelectedPrinter(saved);

    const savedPW = localStorage.getItem(paperWidthStorageKey) as PaperWidth | null;
    if (savedPW === "58mm" || savedPW === "80mm") setPaperWidth(savedPW);
  }, [paperWidthStorageKey, printerStorageKey]);

  // ── Connect ──
  const connectQZ = useCallback(async () => {
    setStatus("CONNECTING");
    setLastError(null);

    try {
      await ensureQZConnected();
      setStatus("CONNECTED");
      refreshDiagnostics();
      toast.success("QZ Tray conectado", { duration: 2000 });

      // Auto-search once after connect
      if (!autoSearchDoneRef.current) {
        autoSearchDoneRef.current = true;
        setIsSearching(true);
        try {
          const found = await listPrinters();
          setPrinters(found);
          if (found.length === 0) {
            toast.info("No se detectaron impresoras. Revisa QZ Tray → Site Manager.");
          }
        } catch (error) {
          const msg = error instanceof Error ? error.message : "Error desconocido";
          setLastError(msg);
          toast.error(`Impresoras: ${msg}`);
        } finally {
          setIsSearching(false);
          refreshDiagnostics();
        }
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Error desconocido";
      setStatus("ERROR");
      setLastError(msg);
      refreshDiagnostics();
      toast.error(msg);
    }
  }, [refreshDiagnostics]);

  // ── Search printers (manual) ──
  const searchPrinters = useCallback(async () => {
    if (status !== "CONNECTED") {
      toast.error("Conecta QZ Tray antes de buscar impresoras");
      return;
    }

    setIsSearching(true);
    setLastError(null);

    try {
      const found = await listPrinters();
      setPrinters(found);
      if (found.length === 0) {
        toast.info("No se detectaron impresoras");
      } else {
        toast.success(`${found.length} impresora(s) encontrada(s)`);
      }
      if (selectedPrinter && !found.includes(selectedPrinter)) {
        setSelectedPrinter("");
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Error desconocido";
      setLastError(msg);
      toast.error(`Impresoras: ${msg}`);
    } finally {
      setIsSearching(false);
      refreshDiagnostics();
    }
  }, [refreshDiagnostics, selectedPrinter, status]);

  // ── Force handshake (triggers Site Manager popup) ──
  const retryAuthorization = useCallback(async () => {
    if (status !== "CONNECTED") {
      toast.error("Conecta QZ Tray primero");
      return;
    }

    setIsSearching(true);
    setLastError(null);

    try {
      const result = await forceHandshake();
      setPrinters(result.allPrinters);
      if (result.allPrinters.length > 0) {
        toast.success(`${result.allPrinters.length} impresora(s) detectada(s)`);
      } else {
        toast.info("No se detectaron impresoras. Verifica QZ Tray → Site Manager.");
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Error desconocido";
      setLastError(msg);
      toast.error(msg);
    } finally {
      setIsSearching(false);
      refreshDiagnostics();
    }
  }, [refreshDiagnostics, status]);

  // ── Save preferences ──
  const savePrinter = useCallback(() => {
    if (!selectedPrinter) {
      toast.error("Selecciona una impresora para guardar");
      return;
    }
    localStorage.setItem(printerStorageKey, selectedPrinter);
    localStorage.setItem(LEGACY_PRINTER_KEY, selectedPrinter);
    toast.success(`Impresora guardada: ${selectedPrinter}`);
  }, [printerStorageKey, selectedPrinter]);

  const savePaperWidth = useCallback(
    (value: PaperWidth) => {
      setPaperWidth(value);
      localStorage.setItem(paperWidthStorageKey, value);
      toast.success(`Ancho guardado: ${value}`);
    },
    [paperWidthStorageKey],
  );

  // ── Test print ──
  const printTest = useCallback(async () => {
    if (!selectedPrinter) {
      toast.error("Selecciona una impresora primero");
      return;
    }

    setIsPrinting(true);
    const testData: ReceiptData = {
      saleNumber: "CAJ-TEST-001",
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

    try {
      const result = await printRaw(selectedPrinter, testData, paperWidth);
      if (result.success) {
        toast.success("Ticket de prueba impreso correctamente");
      } else {
        setLastError(result.error || "Error desconocido");
        toast.error(result.error || "Error de impresión");
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Error desconocido";
      setLastError(msg);
      toast.error(msg);
    } finally {
      setIsPrinting(false);
      refreshDiagnostics();
    }
  }, [paperWidth, refreshDiagnostics, selectedPrinter, venueName]);

  // ── Copy diagnostics ──
  const copyDiagnostics = useCallback(async () => {
    const content = [
      `Estado UI: ${status}`,
      `Estado WebSocket: ${diagnosticsData.websocketState}`,
      `Último intento: ${diagnosticsData.lastAttemptAt ?? "-"}`,
      `Último error: ${lastError ?? diagnosticsData.lastError ?? "-"}`,
      `Payload firmado: ${diagnosticsData.lastPayloadToSign ?? "-"}`,
      `Storage impresora: ${printerStorageKey}`,
      `Storage ancho: ${paperWidthStorageKey}`,
      `Impresoras detectadas: ${printers.join(", ") || "ninguna"}`,
    ].join("\n");

    await navigator.clipboard.writeText(content);
    toast.success("Diagnóstico copiado");
  }, [diagnosticsData, lastError, paperWidthStorageKey, printerStorageKey, printers, status]);

  // Auto-connect on mount
  useEffect(() => {
    void connectQZ();
  }, [connectQZ]);

  const statusLabel =
    status === "CONNECTED"
      ? "Conectado"
      : status === "CONNECTING"
        ? "Conectando"
        : status === "ERROR"
          ? "Error"
          : "Desconectado";

  return (
    <Card className="border-border/50">
      <button
        onClick={() => setExpanded((prev) => !prev)}
        className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-muted/30 transition-colors rounded-lg"
      >
        <div className="flex items-center gap-2">
          <Printer className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">Impresión</span>
          <Badge variant={status === "CONNECTED" ? "default" : status === "ERROR" ? "destructive" : "outline"}>
            {status === "CONNECTED" ? <Wifi className="w-3.5 h-3.5" /> : status === "CONNECTING" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <WifiOff className="w-3.5 h-3.5" />}
            <span className="ml-1">{statusLabel}</span>
          </Badge>
          {selectedPrinter && (
            <span className="text-[10px] text-muted-foreground truncate max-w-[130px]">· {selectedPrinter}</span>
          )}
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-3 border-t border-border/30 pt-3">
          {/* Connection + Search buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {status !== "CONNECTED" ? (
              <Button onClick={connectQZ} disabled={status === "CONNECTING"} size="sm">
                {status === "CONNECTING" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Wifi className="w-4 h-4 mr-1" />}
                Conectar QZ
              </Button>
            ) : (
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <CheckCircle className="w-4 h-4" />
                <span>QZ Tray conectado</span>
              </div>
            )}

            <Button variant="outline" size="sm" onClick={searchPrinters} disabled={status !== "CONNECTED" || isSearching}>
              {isSearching ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}
              Buscar impresoras
            </Button>

            <Button variant="outline" size="sm" onClick={retryAuthorization} disabled={status !== "CONNECTED" || isSearching}>
              <ShieldCheck className="w-4 h-4 mr-1" />
              Forzar autorización
            </Button>
          </div>

          {/* Error display */}
          {lastError && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <strong>Error:</strong> {lastError}
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Si no aparecen impresoras: QZ Tray → Advanced → Site Manager → autoriza este dominio.
          </p>

          {/* Printer selection + settings */}
          {status === "CONNECTED" && (
            <div className="space-y-2">
              <Select value={selectedPrinter} onValueChange={setSelectedPrinter}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder={printers.length === 0 ? "Sin impresoras detectadas" : "Selecciona impresora"} />
                </SelectTrigger>
                <SelectContent>
                  {printers.map((printer) => (
                    <SelectItem key={printer} value={printer} className="text-xs">
                      {printer}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button variant="outline" size="sm" onClick={savePrinter} className="w-full text-xs">
                Guardar impresora
              </Button>

              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Ancho papel</p>
                <Select value={paperWidth} onValueChange={(v) => savePaperWidth(v as PaperWidth)}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="58mm" className="text-xs">58mm</SelectItem>
                    <SelectItem value="80mm" className="text-xs">80mm</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {selectedPrinter && (
                <Button variant="outline" size="sm" onClick={printTest} disabled={isPrinting} className="w-full text-xs">
                  {isPrinting ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Printer className="w-3 h-3 mr-1" />}
                  Imprimir prueba térmica
                </Button>
              )}
            </div>
          )}

          {/* Guide + Diagnostics */}
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" size="sm" className="text-xs" onClick={() => setGuideOpen(true)}>
              <Info className="w-3 h-3 mr-1" />
              Guía de configuración
            </Button>
            <Button variant="ghost" size="sm" className="text-xs" onClick={() => setDiagnosticsOpen((prev) => !prev)}>
              {diagnosticsOpen ? "Ocultar diagnóstico" : "Mostrar diagnóstico"}
            </Button>
          </div>

          {diagnosticsOpen && (
            <div className="rounded-lg border border-border/50 bg-muted/30 p-3 text-xs space-y-2">
              <p><strong>Último error:</strong> {lastError ?? diagnosticsData.lastError ?? "-"}</p>
              <p><strong>Estado websocket:</strong> {diagnosticsData.websocketState}</p>
              <p><strong>Último intento:</strong> {diagnosticsData.lastAttemptAt ?? "-"}</p>
              <p><strong>Impresoras:</strong> {printers.join(", ") || "ninguna"}</p>
              <p className="break-all"><strong>Payload firmado:</strong> {diagnosticsData.lastPayloadToSign ?? "-"}</p>
              <Button variant="outline" size="sm" className="text-xs" onClick={copyDiagnostics}>
                <Copy className="w-3 h-3 mr-1" />
                Copiar diagnóstico
              </Button>
            </div>
          )}
        </div>
      )}

      <Dialog open={guideOpen} onOpenChange={setGuideOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Guía de configuración QZ Tray</DialogTitle>
            <DialogDescription>Configura impresión térmica por equipo y autoriza el dominio.</DialogDescription>
          </DialogHeader>
          <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-2">
            <li>Instala QZ Tray desde <strong>qz.io/download</strong>.</li>
            <li>Abre STOCKIA y presiona <strong>Conectar QZ</strong>.</li>
            <li>Acepta el popup de autorización de QZ Tray.</li>
            <li>Presiona <strong>Buscar impresoras</strong> o <strong>Forzar autorización</strong>.</li>
            <li>Selecciona una impresora y pulsa <strong>Guardar impresora</strong>.</li>
            <li>Si no aparecen impresoras: QZ Tray → Advanced → Site Manager → autorizar dominio.</li>
            <li>Imprime un ticket de prueba para verificar el tamaño correcto.</li>
          </ol>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
