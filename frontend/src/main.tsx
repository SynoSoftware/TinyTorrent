import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ToastProvider } from "@heroui/toast";
import { HotkeysProvider } from "react-hotkeys-hook";
import "@/index.css";
import "@/i18n/index";
import App from "@/app/App";
import { ClientProvider } from "@/app/providers/TorrentClientProvider";
import { DEFAULT_KEYBOARD_SCOPE } from "@/shared/hooks/useKeyboardScope";
import { KEY_SCOPE, CONFIG, applyCssTokenBases } from "@/config/logic";
import { ConnectionConfigProvider } from "@/app/context/ConnectionConfigContext";
import { SessionProvider } from "@/app/context/SessionContext";
import { PreferencesProvider } from "@/app/context/PreferencesContext";
import { AppShellStateProvider } from "@/app/context/AppShellStateContext";

// Apply CSS variable bases from constants.json before rendering.
applyCssTokenBases();

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <HotkeysProvider
            initiallyActiveScopes={[DEFAULT_KEYBOARD_SCOPE, KEY_SCOPE.App]}
        >
            <PreferencesProvider>
                <ConnectionConfigProvider>
                    <ClientProvider>
                        <SessionProvider>
                            <AppShellStateProvider>
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
                            </AppShellStateProvider>
                        </SessionProvider>
                    </ClientProvider>
                </ConnectionConfigProvider>
            </PreferencesProvider>
        </HotkeysProvider>
    </StrictMode>
);
