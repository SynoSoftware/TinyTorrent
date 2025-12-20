import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ToastProvider } from "@heroui/toast";
import "../index.css";
import "../i18n/index";
import App from "./App";
import { ClientProvider } from "./providers/TorrentClientProvider";
import { PerformanceHistoryProvider } from "../shared/hooks/usePerformanceHistory";
import { WorkspaceModalProvider } from "./WorkspaceModalContext";
import { HotkeysProvider } from "react-hotkeys-hook";
import { DEFAULT_KEYBOARD_SCOPE } from "../shared/hooks/useKeyboardScope";
import { ConnectionConfigProvider } from "./context/ConnectionConfigContext";
import constants from "../config/constants.json";

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
                            <ToastProvider
                                placement="bottom-right"
                                toastOffset={16}
                                toastProps={{
                                    timeout: constants.ui.toast_display_duration_ms,
                                    hideCloseButton: true,
                                    variant: "flat",
                                    radius: "lg",
                                    classNames: {
                                        base: "border border-default/20 bg-content1/80 backdrop-blur-xl shadow-medium",
                                        title: "text-sm font-semibold text-foreground",
                                        description: "text-xs text-foreground/70",
                                    },
                                }}
                                regionProps={{
                                    className: "z-[12000]",
                                }}
                            />
                        </PerformanceHistoryProvider>
                    </WorkspaceModalProvider>
                </ClientProvider>
            </ConnectionConfigProvider>
        </HotkeysProvider>
    </StrictMode>
);
