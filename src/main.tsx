import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { warmupPrintJs } from "@/lib/printing/qz";

// Pre-mount the print-js iframe so the very first POS print of the
// session always triggers the print dialog (otherwise print-js's lazy
// iframe creation can swallow the first job silently).
if (typeof window !== "undefined") {
  if (document.readyState === "complete" || document.readyState === "interactive") {
    warmupPrintJs();
  } else {
    window.addEventListener("DOMContentLoaded", () => warmupPrintJs(), { once: true });
  }

  // Force the service worker to check for updates whenever the POS tab
  // regains focus. Combined with skipWaiting/clientsClaim in vite.config,
  // this stops always-on tablets from running a stale bundle for hours,
  // which was one of the root causes of "login roto en ciertos POS".
  if ("serviceWorker" in navigator) {
    const checkForUpdates = () => {
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => regs.forEach((r) => r.update().catch(() => {})))
        .catch(() => {});
    };
    window.addEventListener("focus", checkForUpdates);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") checkForUpdates();
    });
    // Also on load, after a small delay so it doesn't block first paint.
    window.addEventListener("load", () => {
      setTimeout(checkForUpdates, 3000);
    });
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

