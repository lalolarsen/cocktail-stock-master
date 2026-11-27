/** Shared PC transport. A sale is one print job, never overlapping dialogs. */
export interface BrowserPrintResult {
  success: boolean;
  error?: string;
}

let queue: Promise<unknown> = Promise.resolve();

export function printBrowserDocument(html: string, css = ""): Promise<BrowserPrintResult> {
  // Start immediately when idle; a user-initiated retry keeps its activation.
  const result = queue.then(() => openDocument(html, css));
  queue = result.catch(() => undefined);
  return result;
}

function openDocument(html: string, css: string): Promise<BrowserPrintResult> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return Promise.resolve({ success: false, error: "El navegador no permite imprimir." });
  }
  if (document.querySelector('[data-pos-print="true"]')) {
    return Promise.resolve({ success: false, error: "Hay una impresión abierta. Ciérrala y revisa la cola antes de reintentar." });
  }
  return new Promise((resolve) => {
    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.setAttribute("data-pos-print", "true");
    // Keep a real layout viewport: zero-width frames can render blank previews.
    Object.assign(iframe.style, { position: "fixed", left: "-10000px", top: "0", width: "800px", height: "600px", border: "0" });
    let settled = false;
    let printing = false;
    let timer: ReturnType<typeof setTimeout>;
    const cleanup = () => {
      clearTimeout(timer);
      iframe.contentWindow?.removeEventListener("afterprint", afterPrint);
      iframe.remove();
    };
    const finish = (result: BrowserPrintResult, remove = true) => {
      if (!settled) { settled = true; resolve(result); }
      if (remove) cleanup();
    };
    const afterPrint = () => finish({ success: true });
    timer = setTimeout(() => finish({ success: false, error: "No se pudo cargar el comprobante. Toca Imprimir ahora." }), 15000);
    iframe.onload = async () => {
      if (printing || settled) return;
      printing = true;
      clearTimeout(timer);
      const win = iframe.contentWindow;
      if (!win) { finish({ success: false, error: "No se pudo abrir la impresión." }); return; }
      // Never destroy a document while Chrome/Windows still has its preview open.
      timer = setTimeout(() => finish({ success: false, error: "No se confirmó el cierre de la impresión. Revisa la cola antes de reintentar." }, false), 120000);
      win.addEventListener("afterprint", afterPrint);
      try {
        await win.document.fonts?.ready;
        await Promise.all(Array.from(win.document.images).map((img) => img.complete ? Promise.resolve() : new Promise<void>((done) => {
          img.addEventListener("load", () => done(), { once: true });
          img.addEventListener("error", () => done(), { once: true });
        })));
        if (settled) return;
        win.focus();
        win.print();
      } catch (error) {
        finish({ success: false, error: error instanceof Error ? error.message : "No se pudo abrir la impresión." });
      }
    };
    iframe.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><title>Comprobante STOCKIA</title><style>${css}</style></head><body>${html}</body></html>`;
    document.body.appendChild(iframe);
  });
}

export function printBrowserBatch(pieces: string[], css: string): Promise<BrowserPrintResult> {
  if (!pieces.length) return Promise.resolve({ success: true });
  return printBrowserDocument(pieces.map((piece) => `<section class="pos-print-piece">${piece}</section>`).join(""), `${css}\n.pos-print-piece + .pos-print-piece { break-before: page; page-break-before: always; }`);
}