import { createRoot } from "react-dom/client";
import { ToastProvider } from "@heroui/react";
import { HotkeysProvider } from "react-hotkeys-hook";
import "@/index.css";
import "@/i18n/index";
import App from "@/app/App";
import { ClientProvider } from "@/app/providers/TorrentClientProvider";
import { DEFAULT_KEYBOARD_SCOPE } from "@/shared/hooks/useKeyboardScope";
import { Shortcuts } from "@/app/controlPlane/shortcuts";
import { applyCssTokenBases } from "@/app/bootstrap/applyCssTokenBases";
import { ConnectionConfigProvider } from "@/app/context/ConnectionConfigContext";
import { SessionProvider } from "@/app/context/SessionContext";
import { PreferencesProvider } from "@/app/context/PreferencesContext";
import { AppShellStateProvider } from "@/app/context/AppShellStateContext";
type TinyTorrentGlobal = typeof globalThis & {
    __ttPerformanceMeasurePatched?: boolean;
};

function installPerformanceMeasurePruner() {
    const perf = globalThis.performance;
    if (
        !perf ||
        typeof perf.getEntriesByType !== "function" ||
        typeof perf.clearMeasures !== "function"
    ) {
        return;
    }

    const globalState = globalThis as TinyTorrentGlobal;
    const isDevtoolsDetail = (value: unknown) => {
        if (!value || typeof value !== "object") {
            return false;
        }
        const detail = "detail" in value ? value.detail : null;
        return !!detail && typeof detail === "object" && "devtools" in detail;
    };

    if (!globalState.__ttPerformanceMeasurePatched) {
        const originalMeasure = perf.measure.bind(perf) as (...args: unknown[]) => void;
        const patchedMeasure = (...args: unknown[]) => {
            originalMeasure(...args);

            const [measureName, firstDetailLikeArg, secondDetailLikeArg] = args;
            const detailLikeArg = isDevtoolsDetail(firstDetailLikeArg)
                ? firstDetailLikeArg
                : secondDetailLikeArg;
            if (
                typeof measureName === "string" &&
                isDevtoolsDetail(detailLikeArg)
            ) {
                perf.clearMeasures(measureName);
            }
        };

        Object.defineProperty(perf, "measure", {
            configurable: true,
            writable: true,
            value: patchedMeasure,
        });
        globalState.__ttPerformanceMeasurePatched = true;
    }

    const prune = () => {
        const entries = perf.getEntriesByType("measure");
        if (entries.length === 0) {
            return;
        }

        const measureNames = new Set<string>();
        for (const entry of entries) {
            const detail =
                "detail" in entry &&
                entry.detail &&
                typeof entry.detail === "object"
                    ? (entry.detail as Record<string, unknown>)
                    : null;
            if (detail && "devtools" in detail) {
                measureNames.add(entry.name);
            }
        }

        if (measureNames.size === 0) {
            return;
        }

        for (const measureName of measureNames) {
            perf.clearMeasures(measureName);
        }

        if (typeof perf.clearMarks === "function") {
            perf.clearMarks();
        }
    };

    prune();
}

// Apply CSS variable bases from constants.json before rendering.
applyCssTokenBases();
installPerformanceMeasurePruner();

const APP_INITIAL_HOTkeyScopeS = [DEFAULT_KEYBOARD_SCOPE, Shortcuts.scopes.App];
const mount = async () => {
    createRoot(document.getElementById("root")!).render(
        <HotkeysProvider initiallyActiveScopes={APP_INITIAL_HOTkeyScopeS}>
            <PreferencesProvider>
                <ConnectionConfigProvider>
                    <ClientProvider>
                        <SessionProvider>
                            <AppShellStateProvider>
                                <App />
                                <ToastProvider
                                    className="fixed inset-0 z-top p-panel pointer-events-none overflow-x-hidden overflow-y-auto flex flex-col items-end justify-end gap-tools"
                                    placement="bottom end"
                                    maxVisibleToasts={6}
                                    width={460}
                                />
                            </AppShellStateProvider>
                        </SessionProvider>
                    </ClientProvider>
                </ConnectionConfigProvider>
            </PreferencesProvider>
        </HotkeysProvider>,
    );
};

void mount();

