import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../index.css";
import "../i18n/index";
import App from "./App";
import { ClientProvider } from "./providers/TorrentClientProvider";
import { PerformanceHistoryProvider } from "../shared/hooks/usePerformanceHistory";
import { WorkspaceModalProvider } from "./WorkspaceModalContext";

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
