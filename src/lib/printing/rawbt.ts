/**
 * Entrega única a RawBT (tablets Android).
 * Detecta si Android realmente salió hacia RawBT: si la página se oculta o pierde
 * el foco en `timeoutMs`, el envío se considera "sent"; si no, "not_sent"
 * (típicamente Chrome bloqueó el salto por falta de un toque reciente).
 */
export type RawBtOutcome = "sent" | "not_sent";

export const isAndroid = () => typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);

export function sendToRawBt(base64Payload: string, timeoutMs = 2000): Promise<RawBtOutcome> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (outcome: RawBtOutcome) => {
      if (settled) return;
      settled = true;
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("pagehide", onBlur);
      clearTimeout(timer);
      resolve(outcome);
    };
    const onVis = () => {
      if (document.visibilityState === "hidden") finish("sent");
    };
    const onBlur = () => finish("sent");
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("blur", onBlur);
    window.addEventListener("pagehide", onBlur);
    const timer = window.setTimeout(() => finish("not_sent"), timeoutMs);
    try {
      window.location.assign(
        `intent:base64,${base64Payload}#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end;`,
      );
    } catch {
      finish("not_sent");
    }
  });
}
