import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../index.css";
import "../i18n/index";
import App from "./App";
import { ClientProvider } from "./providers/TorrentClientProvider";
import { PerformanceHistoryProvider } from "../shared/hooks/usePerformanceHistory";
import { WorkspaceModalProvider } from "./WorkspaceModalContext";
import { HotkeysProvider } from "react-hotkeys-hook";
import { DEFAULT_KEYBOARD_SCOPE } from "../shared/hooks/useKeyboardScope";
import { ConnectionConfigProvider } from "./context/ConnectionConfigContext";

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <HotkeysProvider initiallyActiveScopes={[DEFAULT_KEYBOARD_SCOPE]}>
            <ConnectionConfigProvider>
                <ClientProvider>
                    <WorkspaceModalProvider>
                        <PerformanceHistoryProvider>
                            <App />
                        </PerformanceHistoryProvider>
                    </WorkspaceModalProvider>
                </ClientProvider>
            </ConnectionConfigProvider>
        </HotkeysProvider>
    </StrictMode>
);
