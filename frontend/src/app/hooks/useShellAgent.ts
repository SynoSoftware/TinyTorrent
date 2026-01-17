import { useEffect, useMemo } from "react";
import Runtime from "@/app/runtime";
import { useConnectionConfig } from "@/app/context/ConnectionConfigContext";
import { shellAgent, type ShellUiMode } from "@/app/agents/shell-agent";
import { normalizeHost } from "@/app/utils/hosts";
import { computeUiMode } from "@/app/utils/uiMode";

const computeMode = (host: string): ShellUiMode =>
    computeUiMode(host, Runtime.isNativeHost);

export function useShellAgent() {
    const { activeProfile } = useConnectionConfig();
    const host = useMemo(
        () => normalizeHost(activeProfile.host || ""),
        [activeProfile.host]
    );
    const uiMode = useMemo(() => computeMode(host), [host]);
    useEffect(() => {
        shellAgent.setUiMode(uiMode);
    }, [uiMode]);
    return { shellAgent, uiMode };
}
