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
import { ConnectionConfigProvider } from "./context/ConnectionConfigContext";
import { CONFIG } from "@/config/logic";
import { applyCssTokenBases } from "@/config/logic";
// Apply CSS variable bases from constants.json before rendering
applyCssTokenBases();

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <HotkeysProvider initiallyActiveScopes={[DEFAULT_KEYBOARD_SCOPE]}>
            <ConnectionConfigProvider>
                <ClientProvider>
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
                </ClientProvider>
            </ConnectionConfigProvider>
        </HotkeysProvider>
    </StrictMode>
);
