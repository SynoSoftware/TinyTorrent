import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ToastProvider } from "@heroui/toast";
import { HotkeysProvider } from "react-hotkeys-hook";
import "@/index.css";
import "@/i18n/index";
import App from "@/app/App";
import { ClientProvider } from "@/app/providers/TorrentClientProvider";
import { DEFAULT_KEYBOARD_SCOPE } from "@/shared/hooks/useKeyboardScope";
import { registry } from "@/config/logic";
import { Shortcuts } from "@/app/controlPlane/shortcuts";
import { applyCssTokenBases } from "@/app/bootstrap/applyCssTokenBases";
import { ConnectionConfigProvider } from "@/app/context/ConnectionConfigContext";
import { SessionProvider } from "@/app/context/SessionContext";
import { PreferencesProvider } from "@/app/context/PreferencesContext";
import { AppShellStateProvider } from "@/app/context/AppShellStateContext";
const { timing, ui } = registry;

// Apply CSS variable bases from constants.json before rendering.
applyCssTokenBases();

const APP_INITIAL_HOTkeyScopeS = [DEFAULT_KEYBOARD_SCOPE, Shortcuts.scopes.App];
const APP_TOAST_PROPS = {
    timeout: timing.ui.toastMs,
    hideCloseButton: true,
    variant: "flat",
    radius: "lg",
    classNames: {
        base: "border border-default/20 bg-content1/80 backdrop-blur-xl shadow-medium",
        title: "text-sm font-semibold text-foreground",
        description: "text-xs text-foreground/70",
    },
} as const;
const APP_TOAST_REGION_PROPS = {
    className:
        "fixed inset-0 z-top p-panel pointer-events-none overflow-x-hidden overflow-y-auto flex flex-col items-end justify-end gap-tools",
} as const;

const mount = async () => {
    createRoot(document.getElementById("root")!).render(
        <StrictMode>
            <HotkeysProvider initiallyActiveScopes={APP_INITIAL_HOTkeyScopeS}>
                <PreferencesProvider>
                    <ConnectionConfigProvider>
                        <ClientProvider>
                            <SessionProvider>
                                <AppShellStateProvider>
                                    <App />
                                    <ToastProvider
                                        placement="bottom-right"
                                        maxVisibleToasts={6}
                                        toastProps={APP_TOAST_PROPS}
                                        regionProps={APP_TOAST_REGION_PROPS}
                                    />
                                </AppShellStateProvider>
                            </SessionProvider>
                        </ClientProvider>
                    </ConnectionConfigProvider>
                </PreferencesProvider>
            </HotkeysProvider>
        </StrictMode>,
    );
};

void mount();

