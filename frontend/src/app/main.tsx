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

function captureTinyTorrentTokenFromHash() {
    const hash = window.location.hash;
    if (!hash || hash.length < 2) return;
    const fragment = hash.startsWith("#") ? hash.slice(1) : hash;
    const params = new URLSearchParams(fragment);
    const token = params.get("tt-token");
    if (!token) return;

    sessionStorage.setItem("tt-auth-token", token);
    params.delete("tt-token");

    const newFragment = params.toString();
    const newUrl =
        window.location.pathname +
        window.location.search +
        (newFragment ? `#${newFragment}` : "");
    window.history.replaceState(null, "", newUrl);
}

captureTinyTorrentTokenFromHash();

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
