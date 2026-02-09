import { IS_NATIVE_HOST } from "@/config/logic";
import { infraLogger } from "@/shared/utils/infraLogger";

type NativeShellEventPayload =
    | string
    | {
          link?: string;
      };
type NativeShellRequestMessage = {
    type: "request";
    id: string;
    name: string;
    payload?: unknown;
};

type NativeShellResponseMessage = {
    type: "response";
    id: string;
    success: boolean;
    payload?: unknown;
    error?: string;
};

export type NativeShellEventName = "magnet-link";

type NativeShellEventMessage = {
    type: "event";
    name: NativeShellEventName;
    payload?: NativeShellEventPayload;
};

type PendingRequest = {
    resolve: (value: NativeShellRequestOutcome<unknown>) => void;
    timeoutId?: ReturnType<typeof setTimeout>;
    signal?: AbortSignal;
    abortHandler?: () => void;
};

type NativeShellListener = (payload?: NativeShellEventPayload) => void;

type NativeShellBridge = {
    postMessage: (message: NativeShellRequestMessage) => void;
    addEventListener: (
        type: "message",
        listener: (event: { data?: unknown }) => void
    ) => void;
    removeEventListener?: (
        type: "message",
        listener: (event: { data?: unknown }) => void
    ) => void;
};

const pendingRequests = new Map<string, PendingRequest>();
const eventListeners = new Map<
    NativeShellEventName,
    Set<NativeShellListener>
>();
const DEFAULT_BRIDGE_TIMEOUT_MS = 10_000;
let requestCounter = 1;
let listenerInstalled = false;
let teardownListenerInstalled = false;

export type NativeShellRequestFailureKind =
    | "unavailable"
    | "timeout"
    | "canceled"
    | "failed";

export type NativeShellRequestOutcome<T> =
    | { kind: "ok"; value: T }
    | { kind: NativeShellRequestFailureKind; message: string };

export interface NativeShellRequestOptions {
    timeoutMs?: number;
    signal?: AbortSignal;
}

function hasNativeHostFlag(): boolean {
    if (typeof window === "undefined") {
        return false;
    }
    const nativeFlag = (
        window as unknown as { __TINY_TORRENT_NATIVE__?: unknown }
    ).__TINY_TORRENT_NATIVE__;
    return nativeFlag === true;
}

function getBridge(): NativeShellBridge | null {
    if (typeof window === "undefined") {
        return null;
    }
    const nav = window as unknown as {
        chrome?: { webview?: NativeShellBridge };
    };
    return nav.chrome?.webview ?? null;
}

function ensureBridgeListener() {
    if (listenerInstalled) {
        return;
    }
    const bridge = getBridge();
    if (!bridge || typeof bridge.addEventListener !== "function") {
        return;
    }
    bridge.addEventListener("message", handleBridgeMessage);
    listenerInstalled = true;
}

function ensureRuntimeTeardownListener() {
    if (teardownListenerInstalled) {
        return;
    }
    if (typeof window === "undefined") {
        return;
    }
    window.addEventListener("beforeunload", () => {
        resetNativeBridgePendingRequests();
    });
    teardownListenerInstalled = true;
}

function handleBridgeMessage(messageEvent: { data?: unknown }) {
    const payload = messageEvent.data;
    if (!payload || typeof payload !== "object") {
        return;
    }
    if ((payload as NativeShellResponseMessage).type === "response") {
        const response = payload as NativeShellResponseMessage;
        if (response.success) {
            resolvePendingRequest(response.id, {
                kind: "ok",
                value: response.payload,
            });
        } else {
            resolvePendingRequest(response.id, {
                kind: "failed",
                message: response.error ?? "Native shell request failed",
            });
        }
        return;
    }
    if ((payload as NativeShellEventMessage).type === "event") {
        const event = payload as NativeShellEventMessage;
        const listeners = eventListeners.get(event.name);
        if (!listeners) {
            return;
        }
        for (const listener of [...listeners]) {
            try {
                listener(event.payload);
            } catch (error) {
                // Swallow errors from listeners to keep channel stable.
                infraLogger.error(
                    {
                        scope: "runtime",
                        event: "native_shell_listener_error",
                        message: "Native shell listener raised an exception",
                    },
                    error instanceof Error ? error : { error: String(error) },
                );
            }
        }
    }
}

function disposePendingRequest(pending: PendingRequest) {
    if (pending.timeoutId) {
        clearTimeout(pending.timeoutId);
    }
    if (pending.signal && pending.abortHandler) {
        pending.signal.removeEventListener("abort", pending.abortHandler);
    }
}

function resolvePendingRequest(
    id: string,
    outcome: NativeShellRequestOutcome<unknown>,
) {
    const pending = pendingRequests.get(id);
    if (!pending) {
        return;
    }
    pendingRequests.delete(id);
    disposePendingRequest(pending);
    pending.resolve(outcome);
}

export function resetNativeBridgePendingRequests() {
    for (const [id, pending] of pendingRequests) {
        pendingRequests.delete(id);
        disposePendingRequest(pending);
        pending.resolve({
            kind: "canceled",
            message: "Native shell request canceled during teardown",
        });
    }
}

function sendBridgeRequestOutcome(
    name: string,
    payload?: unknown,
    options?: NativeShellRequestOptions,
): Promise<NativeShellRequestOutcome<unknown>> {
    const bridge = getBridge();
    if (!bridge || typeof bridge.postMessage !== "function") {
        return Promise.resolve({
            kind: "unavailable",
            message: "Native shell bridge unavailable",
        });
    }
    ensureBridgeListener();
    ensureRuntimeTeardownListener();
    const id = `tt-${requestCounter++}`;
    return new Promise((resolve) => {
        const timeoutMs =
            typeof options?.timeoutMs === "number" && options.timeoutMs >= 0
                ? options.timeoutMs
                : DEFAULT_BRIDGE_TIMEOUT_MS;
        const signal = options?.signal;

        if (signal?.aborted) {
            resolve({
                kind: "canceled",
                message: "Native shell request canceled before dispatch",
            });
            return;
        }

        const pending: PendingRequest = {
            resolve,
            signal,
        };

        if (timeoutMs > 0) {
            pending.timeoutId = setTimeout(() => {
                resolvePendingRequest(id, {
                    kind: "timeout",
                    message: `Native shell request timed out after ${timeoutMs}ms`,
                });
            }, timeoutMs);
        }

        if (signal) {
            pending.abortHandler = () => {
                resolvePendingRequest(id, {
                    kind: "canceled",
                    message: "Native shell request canceled",
                });
            };
            signal.addEventListener("abort", pending.abortHandler);
        }

        pendingRequests.set(id, pending);
        try {
            const message: NativeShellRequestMessage = {
                type: "request",
                id,
                name,
                payload,
            };
            bridge.postMessage(message);
        } catch (error) {
            resolvePendingRequest(id, {
                kind: "failed",
                message:
                    error instanceof Error
                        ? error.message
                        : String(error),
            });
        }
    });
}

async function sendBridgeRequest(
    name: string,
    payload?: unknown,
    options?: NativeShellRequestOptions,
): Promise<unknown> {
    const outcome = await sendBridgeRequestOutcome(name, payload, options);
    if (outcome.kind === "ok") {
        return outcome.value;
    }
    const error = new Error(outcome.message);
    if (outcome.kind === "canceled") {
        (error as { name?: string }).name = "AbortError";
    }
    if (outcome.kind === "timeout") {
        (error as { name?: string }).name = "TimeoutError";
    }
    throw error;
}

function extractPathFromResponse(response: unknown): string | undefined {
    if (
        response &&
        typeof response === "object" &&
        typeof (response as { path?: unknown }).path === "string"
    ) {
        return (response as { path?: string }).path;
    }
    return undefined;
}

const runtimeIsNativeHost = () =>
    Boolean(IS_NATIVE_HOST) || hasNativeHostFlag() || Boolean(getBridge());

export const NativeShell = {
    get isAvailable() {
        return Boolean(runtimeIsNativeHost() && getBridge());
    },
    requestWithOutcome(
        name: string,
        payload?: unknown,
        options?: NativeShellRequestOptions,
    ) {
        return sendBridgeRequestOutcome(name, payload, options);
    },
    request(name: string, payload?: unknown, options?: NativeShellRequestOptions) {
        return sendBridgeRequest(name, payload, options);
    },
    onEvent(name: NativeShellEventName, handler: NativeShellListener) {
        if (!eventListeners.has(name)) {
            eventListeners.set(name, new Set());
        }
        const listeners = eventListeners.get(name)!;
        listeners.add(handler);
        ensureBridgeListener();
        return () => {
            listeners.delete(handler);
            if (!listeners.size) {
                eventListeners.delete(name);
            }
        };
    },
    async openFolderDialog(initialPath?: string) {
        const response = await sendBridgeRequest("browse-directory", {
            path: initialPath,
        });
        return extractPathFromResponse(response);
    },
    async browseDirectory(initialPath?: string) {
        return NativeShell.openFolderDialog(initialPath);
    },
    async openFileDialog() {
        const response = await sendBridgeRequest("open-file-dialog");
        return extractPathFromResponse(response);
    },
    async openPath(path: string) {
        await sendBridgeRequest("open-path", { path });
    },
    async sendWindowCommand(command: "minimize" | "maximize" | "close") {
        await sendBridgeRequest("window-command", { command });
    },
    async getSystemIntegrationStatus() {
        return sendBridgeRequest("get-system-integration-status") as Promise<{
            autorun: boolean;
            associations: boolean;
        }>;
    },
    async setSystemIntegration(features: {
        autorun?: boolean;
        associations?: boolean;
    }) {
        await sendBridgeRequest("set-system-integration", features);
    },
    resetPendingRequests() {
        resetNativeBridgePendingRequests();
    },
};
// TODO: Treat `NativeShell` as a *low-level bridge* (WebView host IPC), not an app-level capability surface.
// TODO: Create a ShellAgent/ShellExtensions adapter (hook or provider) that is the *only* UI import point and enforces the locality rules:
// TODO: - Do not expose ShellExtensions when connected to a non-loopback RPC endpoint (remote daemon) or when running in a plain browser (no bridge).
// TODO: - Prefer a single `uiMode = "Full" | "Rpc"` published by one provider; UI components should check uiMode, not `NativeShell.isAvailable`.
// TODO: The adapter must own/centralize all bridge calls/events so review is easy and "random NativeShell usage" cannot spread:
// TODO: - requests: browse directory, open file dialog, open path, window commands, system integration status/set, persist window state
// TODO: - events: magnet-link (Transmission-only)

export const Runtime = {
    get isNativeHost() {
        return runtimeIsNativeHost();
    },
    allowEditingProfiles: () => true,
    suppressBrowserZoomDefaults: () => runtimeIsNativeHost(),
    enableRemoteInputs: () => true,
    nativeShell: NativeShell,
};

export default Runtime;
