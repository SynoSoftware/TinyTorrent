import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../index.css";
import "../i18n/index";
import App from "./App";
import { PerformanceHistoryProvider } from "../core/hooks/usePerformanceHistory";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PerformanceHistoryProvider>
      <App />
    </PerformanceHistoryProvider>
  </StrictMode>
);
