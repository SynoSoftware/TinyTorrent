import { StrictMode, type ComponentType } from "react";
import { createRoot } from "react-dom/client";
import { ToastProvider } from "@heroui/toast";
import { HotkeysProvider } from "react-hotkeys-hook";
import "@/index.css";
import "@/i18n/index";
import App from "@/app/App";
import { ClientProvider } from "@/app/providers/TorrentClientProvider";
import { DEFAULT_KEYBOARD_SCOPE } from "@/shared/hooks/useKeyboardScope";
import { KEY_SCOPE, TOAST_DISPLAY_DURATION_MS, applyCssTokenBases } from "@/config/logic";
import { ConnectionConfigProvider } from "@/app/context/ConnectionConfigContext";
import { SessionProvider } from "@/app/context/SessionContext";
import { PreferencesProvider } from "@/app/context/PreferencesContext";
import { AppShellStateProvider } from "@/app/context/AppShellStateContext";

// Apply CSS variable bases from constants.json before rendering.
applyCssTokenBases();

const APP_INITIAL_HOTKEY_SCOPES = [DEFAULT_KEYBOARD_SCOPE, KEY_SCOPE.App];
const APP_TOAST_PROPS = {
    timeout: TOAST_DISPLAY_DURATION_MS,
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

const DEV_RECOVERY_PATH = "/__dev/recovery";

const resolveAppEntry = async (): Promise<ComponentType> => {
    const rootPathname = typeof window === "undefined" ? "" : window.location.pathname;
    if (import.meta.env.DEV && rootPathname === DEV_RECOVERY_PATH) {
        const module = await import("@/app/components/DevTest");
        return module.default;
    }
    return App;
};

const mount = async () => {
    const AppEntry = await resolveAppEntry();
    createRoot(document.getElementById("root")!).render(
        <StrictMode>
            <HotkeysProvider initiallyActiveScopes={APP_INITIAL_HOTKEY_SCOPES}>
                <PreferencesProvider>
                    <ConnectionConfigProvider>
                        <ClientProvider>
                            <SessionProvider>
                                <AppShellStateProvider>
                                    <AppEntry />
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
