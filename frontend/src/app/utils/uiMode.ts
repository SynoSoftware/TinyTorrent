import { normalizeHost, isLoopbackHost } from "@/app/utils/hosts";

export type UiMode = "Full" | "Rpc";

export interface UiCapabilities {
    uiMode: UiMode;
    shellAgentAvailable: boolean;
    isLoopback: boolean;
    canBrowse: boolean;
    canOpenFolder: boolean;
    supportsManual: boolean;
}

function resolveUiMode(
    normalizedHost: string,
    shellAgentAvailable: boolean,
): UiMode {
    const loopback = Boolean(normalizedHost) && isLoopbackHost(normalizedHost);
    if (shellAgentAvailable && loopback) {
        return "Full";
    }
    return "Rpc";
}

export function computeUiMode(
    host: string,
    shellAgentAvailable: boolean
): UiMode {
    const normalizedHost = normalizeHost(host);
    return resolveUiMode(normalizedHost, shellAgentAvailable);
}

export function deriveUiCapabilities(
    host: string,
    shellAgentAvailable: boolean
): UiCapabilities {
    const normalizedHost = normalizeHost(host);
    const loopback = Boolean(normalizedHost) && isLoopbackHost(normalizedHost);
    const uiMode = resolveUiMode(normalizedHost, shellAgentAvailable);
    return {
        uiMode,
        shellAgentAvailable,
        isLoopback: loopback,
        canBrowse: uiMode === "Full",
        canOpenFolder: uiMode === "Full",
        supportsManual: true,
    };
}
