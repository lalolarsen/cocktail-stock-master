/**
 * QZ Tray – Core printing module (v2.2.3 CDN)
 *
 * Uses the global `qz` object loaded via <script> in index.html.
 * Certificate + signature validation via backend functions.
 *
 * RULES:
 * - connect: max 3 retries
 * - listPrinters: 3s hard timeout, single call only
 * - NO infinite loops, NO setInterval for printers
 * - All errors surface to caller
 * - Certificate is cached to avoid repeated fetches
 * - Printer results are cached to minimize QZ API calls / permission dialogs
 */

declare const qz: any;

export type QZConnectionStatus = "DISCONNECTED" | "CONNECTING" | "CONNECTED" | "ERROR";
export type PaperWidth = "58mm" | "80mm";

export interface QZDiagnostics {
  lastError: string | null;
  lastPayloadToSign: string | null;
  lastAttemptAt: string | null;
  websocketState: QZConnectionStatus;
}

const LEGACY_PRINTER_KEY = "stockia_printer_name";
const LEGACY_PAPER_WIDTH_KEY = "stockia_paper_width";

export function getPreferredPrinterStorageKey(venueId?: string, posId?: string): string {
  if (venueId && posId) return `preferred_printer:${venueId}:${posId}`;
  return LEGACY_PRINTER_KEY;
}

export function getPreferredPaperWidthStorageKey(venueId?: string, posId?: string): string {
  if (venueId && posId) return `preferred_paper_width:${venueId}:${posId}`;
  return LEGACY_PAPER_WIDTH_KEY;
}

let securityConfigured = false;
let websocketState: QZConnectionStatus = "DISCONNECTED";
let diagnostics: QZDiagnostics = {
  lastError: null,
  lastPayloadToSign: null,
  lastAttemptAt: null,
  websocketState,
};

// QZ Tray certificate (public – safe to embed in frontend)
const EMBEDDED_QZ_CERTIFICATE = `-----BEGIN CERTIFICATE-----
MIIDLTCCAhWgAwIBAgIUXE87unDt1KqeznKmSHnTHsmcjbQwDQYJKoZIhvcNAQEL
BQAwJjEQMA4GA1UEAwwHU1RPQ0tJQTESMBAGA1UECgwJSUFudGljaXBhMB4XDTI2
MDMxMDE3MDIwM1oXDTM2MDMwNzE3MDIwM1owJjEQMA4GA1UEAwwHU1RPQ0tJQTES
MBAGA1UECgwJSUFudGljaXBhMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKC
AQEAoolkZaG56ReEkrsU6R+kkOVhxqF8+RW40/F3hGESDybG2dlzW64bHhCJbf0I
pwrMrtl+8JvJpkQX0Hzq8aada6D4bSUbK0RnK86/u1ZWaRcverx+PS2I7evDYOD/
wh699fI4ee97zgRZuNpk4UGXymXThaux8pXiv1JL2Uf2C4PssGNw20Su6P7fE88m
+QLENrL4V4Scuq07TEu/6waRgkfZw+bNOO+ORLEfM8xIuwXv5Yv7VADzONcYCuHE
Gxxac4jwUL3Y5H7LazbZ/AA6HpxHa8ZLBqbh9Bwfd3eInLyYYt+f6rQfFQnBPVvj
jb+gxIrx3qzIgXft43rP2hYrKQIDAQABo1MwUTAdBgNVHQ4EFgQUIR58Z9yWNKrB
xquMryGF/lKUkVMwHwYDVR0jBBgwFoAUIR58Z9yWNKrBxquMryGF/lKUkVMwDwYD
VR0TAQH/BAUwAwEB/zANBgkqhkiG9w0BAQsFAAOCAQEAI4Y/1B/EkBBFjmCPb11q
WxcS0qIoKmfufeMu3aPq1V7gYT65StrKeJmp4IhDbtkQPg/HHFbd6ZMgEjP4rMt7
lYV3rHmWrgGrwSvx9Wwxe22uKL2fZXIh+iQrNutrcR9Q/JCBB215H5+Yjd9kH4/y
kI7HtpHKv/r5H4JluJTicdRSHd/aAcjMAOoINsQfy0B5b3ga6t8jCxYTgRID8HmA
l26P5wGvmq++zClhiN6BX6PWOybgViJx+NhzI+1e/uCNq0ae0FyhBO2X9ZwBNu8H
gp4Kh7RF8Sl8lgNwWZs+p8nO2SMWz1z0jCZIQKhQokAX01KvrIOF7iYLobyeCTtE
nQ==
-----END CERTIFICATE-----`;

let certificateCache: string | null = null;
let certificatePromise: Promise<string> | null = null;

function normalizeCertificatePem(rawPem: string): string {
  const normalized = rawPem
    .replace(/^"|"$/g, "")
    .replace(/\\\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n")
    .trim();

  if (
    !normalized.startsWith("-----BEGIN CERTIFICATE-----") ||
    !normalized.endsWith("-----END CERTIFICATE-----")
  ) {
    throw new Error("Certificado QZ inválido");
  }

  return normalized;
}

async function resolveCertificatePem(anonKey: string): Promise<string> {
  if (certificateCache) return certificateCache;
  if (certificatePromise) return certificatePromise;

  certificatePromise = (async () => {
    const embeddedPem = normalizeCertificatePem(EMBEDDED_QZ_CERTIFICATE);

    try {
      const certRes = await fetch(getFunctionUrl("qz-certificate"), {
        method: "GET",
        headers: { apikey: anonKey },
      });

      if (!certRes.ok) {
        console.warn("[QZ] qz-certificate failed, usando PEM embebido:", certRes.status);
        certificateCache = embeddedPem;
        return embeddedPem;
      }

      const backendPem = normalizeCertificatePem(await certRes.text());
      if (backendPem !== embeddedPem) {
        console.warn("[QZ] Certificado embebido distinto al backend; se usará backend.");
      }

      certificateCache = backendPem;
      return backendPem;
    } catch (error) {
      console.warn("[QZ] Fallback a certificado embebido:", getErrorMessage(error));
      certificateCache = embeddedPem;
      return embeddedPem;
    }
  })().finally(() => {
    certificatePromise = null;
  });

  return certificatePromise;
}

// Cache for printer list (avoids redundant QZ API calls / dialogs)
let cachedPrinters: string[] | null = null;
const PRINTER_CACHE_TTL_MS = 30_000; // 30s
let printerCacheTimestamp = 0;

const COLS_58MM = 32;
const COLS_80MM = 48;
const MAX_CONNECT_RETRIES = 3;
const LIST_PRINTERS_TIMEOUT_MS = 3000;

// ── Helpers ──

function updateDiagnostics(partial: Partial<QZDiagnostics>) {
  diagnostics = { ...diagnostics, ...partial, websocketState };
}

function setWebsocketState(state: QZConnectionStatus) {
  websocketState = state;
  updateDiagnostics({ websocketState: state });
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Error desconocido";
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
  let tid: ReturnType<typeof setTimeout> | undefined;
  const tp = new Promise<never>((_, reject) => {
    tid = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
  });
  return Promise.race([promise, tp]).finally(() => { if (tid) clearTimeout(tid); }) as Promise<T>;
}

function getFunctionUrl(name: string): string {
  const baseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (!baseUrl) throw new Error("Backend URL no configurada");
  return `${baseUrl}/functions/v1/${name}`;
}

// ── Security ──

function configureSecurity() {
  if (securityConfigured) return;
  if (typeof qz === "undefined") throw new Error("QZ no cargado");

  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!anonKey) throw new Error("Publishable key no configurada");

  // Set signature algorithm to SHA-256 (must match backend RSASSA-PKCS1-v1_5 SHA-256)
  if (typeof qz.security.setSignatureAlgorithm === "function") {
    qz.security.setSignatureAlgorithm("SHA256");
  }

  qz.security.setCertificatePromise(async () => {
    const pem = await resolveCertificatePem(anonKey);
    console.log("[QZ] Certificate loaded:", pem.substring(0, 50));
    return pem;
  });

  qz.security.setSignaturePromise(async (toSign: string) => {
    console.log("[QZ] Signing payload:", toSign.substring(0, 50));
    updateDiagnostics({
      lastPayloadToSign: toSign,
      lastAttemptAt: new Date().toISOString(),
      lastError: null,
    });

    try {
      const url = getFunctionUrl("qz-sign");
      console.log("[QZ] Calling qz-sign at:", url);
      const res = await fetch(url, {
        method: "POST",
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
          "Content-Type": "text/plain",
        },
        body: toSign,
      });

      const responseText = await res.text();
      console.log("[QZ] qz-sign response status:", res.status, "length:", responseText.length);
      if (!res.ok) {
        const msg = `Firma falló (${res.status}): ${responseText}`;
        console.error("[QZ] Signing failed:", msg);
        updateDiagnostics({ lastError: msg });
        throw new Error(msg);
      }

      const signature = responseText.trim().replace(/^"|"$/g, "");
      if (!signature) {
        const msg = "Firma vacía";
        console.error("[QZ] Empty signature returned");
        updateDiagnostics({ lastError: msg });
        throw new Error(msg);
      }

      if (!/^[A-Za-z0-9+/=]+$/.test(signature)) {
        const msg = "Firma inválida (formato base64 incorrecto)";
        console.error("[QZ] Invalid signature format");
        updateDiagnostics({ lastError: msg });
        throw new Error(msg);
      }

      console.log("[QZ] Signature result:", signature.substring(0, 50));
      return signature;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error de firma desconocido";
      console.error("[QZ] Signature promise error:", msg);
      updateDiagnostics({ lastError: msg });
      throw err;
    }
  });

  securityConfigured = true;
}


// ── Connection ──

export function getQZDiagnostics(): QZDiagnostics {
  return { ...diagnostics, websocketState };
}

export function getQZConnectionStatus(): QZConnectionStatus {
  return websocketState;
}

/**
 * Connect to QZ Tray with retry (max 3 attempts).
 * Configures security on first call.
 */
export async function initQZ(): Promise<void> {
  if (typeof qz === "undefined") {
    setWebsocketState("ERROR");
    const msg = "QZ Tray no detectado. Instálalo desde qz.io";
    updateDiagnostics({ lastError: msg, lastAttemptAt: new Date().toISOString() });
    throw new Error(msg);
  }

  configureSecurity();

  if (qz.websocket.isActive()) {
    setWebsocketState("CONNECTED");
    return;
  }

  setWebsocketState("CONNECTING");
  updateDiagnostics({ lastAttemptAt: new Date().toISOString(), lastError: null });

  let lastErr: Error | null = null;
  for (let attempt = 1; attempt <= MAX_CONNECT_RETRIES; attempt++) {
    try {
      await qz.websocket.connect();
      setWebsocketState("CONNECTED");
      return;
    } catch (error) {
      lastErr = error instanceof Error ? error : new Error(getErrorMessage(error));
      console.warn(`[QZ] Connect attempt ${attempt}/${MAX_CONNECT_RETRIES} failed:`, lastErr.message);
      if (attempt < MAX_CONNECT_RETRIES) {
        await new Promise((r) => setTimeout(r, 500 * attempt));
      }
    }
  }

  setWebsocketState("ERROR");
  const msg = lastErr?.message || "No se pudo conectar a QZ Tray";
  updateDiagnostics({ lastError: msg });
  throw new Error(msg);
}

export async function ensureQZConnected(): Promise<void> {
  await initQZ();
}

export async function isQZConnected(): Promise<boolean> {
  try {
    if (typeof qz === "undefined") return false;
    return qz.websocket.isActive();
  } catch {
    return false;
  }
}

export async function disconnectQZ(): Promise<void> {
  if (typeof qz !== "undefined" && qz.websocket?.isActive()) {
    await qz.websocket.disconnect();
  }
  setWebsocketState("DISCONNECTED");
}

// ── Printer cache helpers ──

function isPrinterCacheValid(): boolean {
  return cachedPrinters !== null && (Date.now() - printerCacheTimestamp) < PRINTER_CACHE_TTL_MS;
}

function setCachedPrinters(printers: string[]) {
  cachedPrinters = printers;
  printerCacheTimestamp = Date.now();
}

/** Invalidate printer cache (e.g. after force handshake). */
export function invalidatePrinterCache() {
  cachedPrinters = null;
  printerCacheTimestamp = 0;
}

// ── Printers ──

/**
 * Get default printer. Uses cache if available.
 */
export async function getDefaultPrinter(): Promise<string | null> {
  // If we have a cached list, return the first one
  if (isPrinterCacheValid() && cachedPrinters && cachedPrinters.length > 0) {
    return cachedPrinters[0];
  }

  await ensureQZConnected();
  try {
    const printer = await withTimeout(
      qz.printers.getDefault(),
      LIST_PRINTERS_TIMEOUT_MS,
      "Timeout obteniendo impresora predeterminada",
    );
    return (printer as string) || null;
  } catch {
    return null;
  }
}

/**
 * List all printers. 3s hard timeout. Single QZ API call only.
 * Returns cached results if available (30s TTL).
 * Does NOT fallback to getDefault() to avoid a second permission dialog.
 */
export async function listPrinters(timeoutMs = LIST_PRINTERS_TIMEOUT_MS): Promise<string[]> {
  // Return cached printers if still valid
  if (isPrinterCacheValid() && cachedPrinters) {
    return cachedPrinters;
  }

  await ensureQZConnected();
  updateDiagnostics({ lastAttemptAt: new Date().toISOString(), lastError: null });

  try {
    const printers = await withTimeout(
      qz.printers.find(),
      timeoutMs,
      `No se pudo listar impresoras (timeout ${timeoutMs / 1000}s)`,
    );
    const result = Array.isArray(printers) ? printers : [];
    setCachedPrinters(result);
    return result;
  } catch (error) {
    const message = getErrorMessage(error);
    console.warn("[QZ] find() failed:", message);
    updateDiagnostics({ lastError: message });
    throw new Error(message);
  }
}

export async function findPrinter(nameContains: string): Promise<string | null> {
  // Check cache first to avoid an extra QZ API call / dialog
  if (isPrinterCacheValid() && cachedPrinters) {
    const match = cachedPrinters.find(
      (p) => p.toLowerCase().includes(nameContains.toLowerCase()),
    );
    if (match) return match;
  }

  await ensureQZConnected();
  try {
    const printer = await qz.printers.find(nameContains);
    return printer || null;
  } catch {
    return null;
  }
}

/**
 * Force handshake: single find() call to trigger Site Manager permission popup
 * and list all printers. Only makes ONE QZ API call instead of two.
 */
export async function forceHandshake(): Promise<{ defaultPrinter: string | null; allPrinters: string[] }> {
  await ensureQZConnected();

  // Invalidate cache so we make a fresh call
  invalidatePrinterCache();

  // Single call: find() lists all printers AND triggers the permission popup
  let allPrinters: string[] = [];
  try {
    const result = await withTimeout(qz.printers.find(), LIST_PRINTERS_TIMEOUT_MS, "Timeout find");
    allPrinters = Array.isArray(result) ? result : [];
    setCachedPrinters(allPrinters);
  } catch (err) {
    console.warn("[QZ] find in handshake:", getErrorMessage(err));
  }

  return { defaultPrinter: allPrinters.length > 0 ? allPrinters[0] : null, allPrinters };
}

// ── Printing ──

export interface ReceiptData {
  saleNumber: string;
  venueName: string;
  posName: string;
  dateTime: string;
  items: Array<{ name: string; quantity: number; price: number }>;
  total: number;
  paymentMethod: string;
  pickupToken?: string;
}

function buildEscPosReceipt(data: ReceiptData, cols: number): string[] {
  const cmds: string[] = [];

  cmds.push("\x1B\x40"); // init
  cmds.push("\x1B\x61\x01"); // center

  cmds.push("\x1B\x21\x30"); // double height+width
  cmds.push(data.venueName + "\n");
  cmds.push("\x1B\x21\x00"); // reset

  cmds.push("=".repeat(cols) + "\n");
  cmds.push(`Venta: ${data.saleNumber}\n`);
  cmds.push(`POS: ${data.posName}\n`);
  cmds.push(`${data.dateTime}\n`);
  cmds.push("=".repeat(cols) + "\n");

  cmds.push("\x1B\x61\x00"); // left
  for (const item of data.items) {
    const line = `${item.quantity}x ${item.name}`;
    const price = `$${item.price.toLocaleString("es-CL")}`;
    const padding = Math.max(1, cols - line.length - price.length);
    cmds.push(line + " ".repeat(padding) + price + "\n");
  }

  cmds.push("-".repeat(cols) + "\n");
  cmds.push("\x1B\x61\x02"); // right
  cmds.push("\x1B\x21\x10"); // double width
  cmds.push(`TOTAL: $${data.total.toLocaleString("es-CL")}\n`);
  cmds.push("\x1B\x21\x00"); // reset
  cmds.push("\x1B\x61\x01"); // center

  cmds.push(`Pago: ${data.paymentMethod === "cash" ? "Efectivo" : "Tarjeta"}\n`);

  if (data.pickupToken) {
    cmds.push("\n");
    cmds.push("--- CANJE QR ---\n");
    cmds.push(`Token: ${data.pickupToken}\n`);
    cmds.push("\n");
  }

  cmds.push("\n");
  cmds.push("Gracias por tu compra\n");
  cmds.push("\n\n\n");
  cmds.push("\x1D\x56\x00"); // cut

  return cmds;
}

export async function printRaw(
  printerName: string,
  data: ReceiptData,
  paperWidth: PaperWidth = "80mm",
): Promise<{ success: boolean; error?: string }> {
  try {
    await ensureQZConnected();

    if (!printerName) {
      return { success: false, error: "Nombre de impresora no proporcionado" };
    }

    // Use printer name directly in config – avoids an extra qz.printers.find() call
    // which would trigger another permission dialog
    const config = qz.configs.create(printerName, { encoding: "UTF-8" });

    const cols =
      paperWidth === "58mm"
        ? COLS_58MM
        : paperWidth === "80mm"
          ? COLS_80MM
          : printerName.toLowerCase().includes("58")
            ? COLS_58MM
            : COLS_80MM;

    const printData: any[] = [];
    const escPosCommands = buildEscPosReceipt(data, cols);
    for (const cmd of escPosCommands) {
      printData.push({ type: "raw", format: "plain", data: cmd });
    }

    if (data.pickupToken) {
      const cutCmd = printData.pop();
      const footerCmd = printData.pop();
      const thanksCmd = printData.pop();

      const qrModuleSize = cols === COLS_58MM ? 4 : 5;
      const token = data.pickupToken;
      const storeLen = token.length + 3;

      printData.push({ type: "raw", format: "command", data: "\x1B\x61\x01" }); // center
      printData.push({ type: "raw", format: "plain", data: "\n" });

      printData.push({
        type: "raw",
        format: "command",
        data:
          "\x1D\x28\x6B\x04\x00\x31\x41\x32\x00" +
          "\x1D\x28\x6B\x03\x00\x31\x43" +
          String.fromCharCode(qrModuleSize) +
          "\x1D\x28\x6B\x03\x00\x31\x45\x31" +
          "\x1D\x28\x6B" +
          String.fromCharCode(storeLen & 0xff) +
          String.fromCharCode((storeLen >> 8) & 0xff) +
          "\x31\x50\x30" +
          token +
          "\x1D\x28\x6B\x03\x00\x31\x51\x30",
      });

      printData.push({ type: "raw", format: "plain", data: "\n\n" });
      if (thanksCmd) printData.push(thanksCmd);
      if (footerCmd) printData.push(footerCmd);
      if (cutCmd) printData.push(cutCmd);
    }

    await qz.print(config, printData);
    setWebsocketState("CONNECTED");
    return { success: true };
  } catch (error) {
    const message = getErrorMessage(error);
    updateDiagnostics({ lastError: message, lastAttemptAt: new Date().toISOString() });
    console.error("[QZ] Print error:", error);
    return { success: false, error: message || "Error de impresión" };
  }
}
