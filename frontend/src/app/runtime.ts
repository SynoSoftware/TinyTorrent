import { IS_NATIVE_HOST } from "@/config/logic";
import type { TransmissionFreeSpace } from "@/services/rpc/types";

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

export type NativeShellEventName = "magnet-link" | "auth-token";

type NativeShellEventMessage = {
    type: "event";
    name: NativeShellEventName;
    payload?: NativeShellEventPayload;
};

type PendingRequest = {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
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
let requestCounter = 1;
let listenerInstalled = false;

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

function handleBridgeMessage(messageEvent: { data?: unknown }) {
    const payload = messageEvent.data;
    if (!payload || typeof payload !== "object") {
        return;
    }
    if ((payload as NativeShellResponseMessage).type === "response") {
        const response = payload as NativeShellResponseMessage;
        const pending = pendingRequests.get(response.id);
        if (!pending) {
            return;
        }
        pendingRequests.delete(response.id);
        if (response.success) {
            pending.resolve(response.payload);
        } else {
            pending.reject(
                new Error(response.error ?? "Native shell request failed")
            );
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
                // eslint-disable-next-line no-console
                console.error("Native shell listener error", error);
            }
        }
    }
}

function sendBridgeRequest(name: string, payload?: unknown): Promise<unknown> {
    const bridge = getBridge();
    if (!bridge || typeof bridge.postMessage !== "function") {
        return Promise.reject(new Error("Native shell bridge unavailable"));
    }
    ensureBridgeListener();
    const id = `tt-${requestCounter++}`;
    return new Promise((resolve, reject) => {
        pendingRequests.set(id, { resolve, reject });
        try {
            const message: NativeShellRequestMessage = {
                type: "request",
                id,
                name,
                payload,
            };
            bridge.postMessage(message);
        } catch (error) {
            pendingRequests.delete(id);
            reject(error instanceof Error ? error : new Error(String(error)));
        }
    });
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
    request(name: string, payload?: unknown) {
        return sendBridgeRequest(name, payload);
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
    async checkFreeSpace(path: string): Promise<TransmissionFreeSpace> {
        const response = await sendBridgeRequest("check-free-space", { path });
        if (!response || typeof response !== "object") {
            throw new Error("Invalid free space response");
        }
        return response as TransmissionFreeSpace;
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
};
// TODO: Treat `NativeShell` as a *low-level bridge* (WebView host IPC), not an app-level capability surface.
// TODO: Create a ShellAgent/ShellExtensions adapter (hook or provider) that is the *only* UI import point and enforces the locality rules:
// TODO: - Do not expose ShellExtensions when connected to a non-loopback RPC endpoint (remote daemon) or when running in a plain browser (no bridge).
// TODO: - Prefer a single `uiMode = "Full" | "Rpc"` published by one provider; UI components should check uiMode, not `NativeShell.isAvailable`.
// TODO: The adapter must own/centralize all bridge calls/events so review is easy and "random NativeShell usage" cannot spread:
// TODO: - requests: browse directory, open file dialog, open path, window commands, system integration status/set, persist window state
// TODO: - events: magnet-link (and explicitly remove/avoid auth-token; Transmission-only)
// TODO: IMPORTANT: Transmission RPC already supports `free-space`. The UI's `checkFreeSpace` must call the daemon via `EngineAdapter.checkFreeSpace`.
// TODO: Delete the `check-free-space` bridge request and `NativeShell.checkFreeSpace` once all call sites use the daemon RPC method.

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
