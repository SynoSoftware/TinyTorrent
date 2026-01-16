import { useEffect, useMemo } from "react";
import Runtime from "@/app/runtime";
import { useConnectionConfig } from "@/app/context/ConnectionConfigContext";
import { shellAgent, type ShellUiMode } from "@/app/agents/shell-agent";
import { isLoopbackHost, normalizeHost } from "@/app/utils/hosts";

const computeUiMode = (host: string): ShellUiMode => {
    if (!Runtime.isNativeHost) {
        return "Rpc";
    }
    if (isLoopbackHost(host)) {
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
