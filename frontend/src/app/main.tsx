import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ToastProvider } from "@heroui/toast";
import "../index.css";
import "../i18n/index";
import App from "./App";
import { ClientProvider } from "./providers/TorrentClientProvider";
import { WorkspaceModalProvider } from "./WorkspaceModalContext";
import { HotkeysProvider } from "react-hotkeys-hook";
import { DEFAULT_KEYBOARD_SCOPE } from "@/shared/hooks/useKeyboardScope";
import { KEY_SCOPE } from "@/config/logic";
import { ConnectionConfigProvider } from "./context/ConnectionConfigContext";
import { SessionProvider } from "./context/SessionContext";
import { CONFIG, IS_NATIVE_HOST } from "@/config/logic";
import { applyCssTokenBases } from "@/config/logic";
// Apply CSS variable bases from constants.json before rendering
applyCssTokenBases();

function applyNativeHostDataset() {
    const root = document.documentElement;
    const hasWebViewBridge = Boolean(
        (window as unknown as { chrome?: { webview?: unknown } }).chrome
            ?.webview
    );
    if (IS_NATIVE_HOST || hasWebViewBridge) {
        root.dataset.nativeHost = "true";
    } else {
        delete root.dataset.nativeHost;
    }
}

applyNativeHostDataset();
// TODO: Centralize runtime environment detection into a single authority:
// TODO: - `RuntimeEnvironment = Browser | WebViewHost` (bridge present) should be computed once and provided via context.
// TODO: - `uiMode = "Full" | "Rpc"` should be computed from (a) RPC endpoint locality (loopback) and (b) ShellAgent/ShellExtensions bridge availability.
// TODO: Avoid scattering “native host” heuristics across `main.tsx`, `runtime.ts`, and multiple components; this is a major source of regressions when AI edits the wrong layer.

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <HotkeysProvider
            initiallyActiveScopes={[DEFAULT_KEYBOARD_SCOPE, KEY_SCOPE.App]}
        >
            <ConnectionConfigProvider>
                <ClientProvider>
                    <SessionProvider>
                        <WorkspaceModalProvider>
                            <App />
                            <ToastProvider
                            placement="bottom-right"
                            toastOffset={16}
                            toastProps={{
                                timeout: CONFIG.ui.toast_display_duration_ms,
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
                                className: "z-top",
                            }}
                        />
                        </WorkspaceModalProvider>
                    </SessionProvider>
                </ClientProvider>
            </ConnectionConfigProvider>
        </HotkeysProvider>
    </StrictMode>
);
