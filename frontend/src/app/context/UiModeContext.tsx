import { createContext, type ReactNode, useContext, useMemo } from "react";
import { useConnectionConfig } from "@/app/context/ConnectionConfigContext";
import { useShellAgent } from "@/app/hooks/useShellAgent";
import { isLoopbackHost, normalizeHost } from "@/app/utils/hosts";
import type { ShellUiMode } from "@/app/agents/shell-agent";

export type UiMode = ShellUiMode;

export interface UiCapabilities {
    uiMode: UiMode;
    shellAgentAvailable: boolean;
    isLoopback: boolean;
    canBrowse: boolean;
    canOpenFolder: boolean;
    supportsManual: boolean;
}

const UiModeContext = createContext<UiCapabilities | null>(null);

export function UiModeProvider({ children }: { children: ReactNode }) {
    const { activeProfile } = useConnectionConfig();
    const { shellAgent, uiMode } = useShellAgent();
    const normalizedHost = useMemo(
        () => normalizeHost(activeProfile.host || ""),
        [activeProfile.host]
    );
    const loopback = useMemo(
        () => Boolean(normalizedHost && isLoopbackHost(normalizedHost)),
        [normalizedHost]
    );
    const shellAvailable = useMemo(() => shellAgent.isAvailable, [
        shellAgent,
    ]);
    const capabilities = useMemo(() => {
        const isFull =
            uiMode === "Full" && shellAvailable && Boolean(loopback);
        return {
            uiMode,
            shellAgentAvailable: shellAvailable,
            isLoopback: Boolean(loopback),
            canBrowse: isFull,
            canOpenFolder: isFull,
            supportsManual: true,
        };
    }, [uiMode, shellAvailable, loopback]);

    return (
        <UiModeContext.Provider value={capabilities}>
            {children}
        </UiModeContext.Provider>
    );
}

export function useUiModeCapabilities() {
    const context = useContext(UiModeContext);
    if (!context) {
        throw new Error(
            "useUiModeCapabilities must be used within UiModeProvider"
        );
    }
    return context;
}
