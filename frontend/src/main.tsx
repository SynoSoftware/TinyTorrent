import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ToastProvider } from "@heroui/toast";
import { HotkeysProvider } from "react-hotkeys-hook";
import "@/index.css";
import "@/i18n/index";
import App from "@/app/App";
import DevTest from "@/app/components/DevRecoveryPlayground";
import { DEV_RECOVERY_PLAYGROUND_PATH } from "@/app/dev/recovery/scenarios";
import { ClientProvider } from "@/app/providers/TorrentClientProvider";
import { DEFAULT_KEYBOARD_SCOPE } from "@/shared/hooks/useKeyboardScope";
import { KEY_SCOPE, CONFIG, applyCssTokenBases } from "@/config/logic";
import { ConnectionConfigProvider } from "@/app/context/ConnectionConfigContext";
import { SessionProvider } from "@/app/context/SessionContext";
import { PreferencesProvider } from "@/app/context/PreferencesContext";
import { AppShellStateProvider } from "@/app/context/AppShellStateContext";

// Apply CSS variable bases from constants.json before rendering.
applyCssTokenBases();

const APP_INITIAL_HOTKEY_SCOPES = [DEFAULT_KEYBOARD_SCOPE, KEY_SCOPE.App];
const APP_TOAST_PROPS = {
    timeout: CONFIG.ui.toast_display_duration_ms,
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
    className: "z-top p-panel",
} as const;

const rootPathname =
    typeof window === "undefined" ? "" : window.location.pathname;
const AppEntry =
    import.meta.env.DEV &&
    rootPathname === DEV_RECOVERY_PLAYGROUND_PATH
    ? DevTest
    : App;

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
