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
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
