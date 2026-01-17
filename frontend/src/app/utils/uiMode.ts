import { normalizeHost, isLoopbackHost } from "./hosts";

export type UiMode = "Full" | "Rpc";

export interface UiCapabilities {
    uiMode: UiMode;
    shellAgentAvailable: boolean;
    isLoopback: boolean;
    canBrowse: boolean;
    canOpenFolder: boolean;
    supportsManual: boolean;
}

export function computeUiMode(
    host: string,
    shellAgentAvailable: boolean
): UiMode {
    const normalizedHost = normalizeHost(host);
    const loopback = Boolean(normalizedHost) && isLoopbackHost(normalizedHost);
    if (shellAgentAvailable && loopback) {
        return "Full";
    }
    return "Rpc";
}

export function deriveUiCapabilities(
    host: string,
    shellAgentAvailable: boolean
): UiCapabilities {
    const normalizedHost = normalizeHost(host);
    const loopback = Boolean(normalizedHost) && isLoopbackHost(normalizedHost);
    const uiMode = shellAgentAvailable && loopback ? "Full" : "Rpc";
    return {
        uiMode,
        shellAgentAvailable,
        isLoopback: loopback,
        canBrowse: uiMode === "Full",
        canOpenFolder: uiMode === "Full",
        supportsManual: true,
    };
}
