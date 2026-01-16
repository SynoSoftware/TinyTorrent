import { useEffect, useMemo } from "react";
import Runtime from "@/app/runtime";
import { useConnectionConfig } from "@/app/context/ConnectionConfigContext";
import { shellAgent, type ShellUiMode } from "@/app/agents/shell-agent";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

const normalizeHost = (host: string) =>
    host.trim().replace(/^\[|\]$/g, "").toLowerCase();

const computeUiMode = (host: string): ShellUiMode => {
    if (!Runtime.isNativeHost) {
        return "Rpc";
    }
    const normalized = normalizeHost(host);
    if (LOOPBACK_HOSTS.has(normalized)) {
        return "Full";
    }
    return "Rpc";
};

export function useShellAgent() {
    const { activeProfile } = useConnectionConfig();
    const host = useMemo(
        () => normalizeHost(activeProfile.host || ""),
        [activeProfile.host]
    );
    const uiMode = useMemo(() => computeUiMode(host), [host]);
    useEffect(() => {
        shellAgent.setUiMode(uiMode);
    }, [uiMode]);
    return { shellAgent, uiMode };
}
