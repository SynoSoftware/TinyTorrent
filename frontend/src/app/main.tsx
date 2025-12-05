import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../index.css";
import "../i18n/index";
import App from "./App";
import { ClientProvider } from "../core/client-context";
import { PerformanceHistoryProvider } from "../core/hooks/usePerformanceHistory";
import { WorkspaceModalProvider } from "./workspace-modal-context";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ClientProvider>
      <WorkspaceModalProvider>
        <PerformanceHistoryProvider>
          <App />
        </PerformanceHistoryProvider>
      </WorkspaceModalProvider>
    </ClientProvider>
  </StrictMode>
);
