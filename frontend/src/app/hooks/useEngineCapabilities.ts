import { useState, useCallback, useMemo } from "react";
import type { EngineAdapter } from "@/services/rpc/engine-adapter";
import type { CapabilityStore } from "@/app/types/capabilities";
import { DEFAULT_CAPABILITY_STORE } from "@/app/types/capabilities";

export function useEngineCapabilities(
    torrentClient: EngineAdapter | null | undefined,
): [
    CapabilityStore,
    (
        capability: keyof CapabilityStore,
        state: CapabilityStore[keyof CapabilityStore],
    ) => void,
] {
    // Local overrides applied by callers via updateCapabilityState.
    const [overrides, setOverrides] = useState<Partial<CapabilityStore>>({});

    const baseCapabilities = useMemo<CapabilityStore>(() => {
        const sequential = torrentClient?.setSequentialDownload
            ? "unknown"
            : "unsupported";
        const superSeeding = torrentClient?.setSuperSeeding
            ? "unknown"
            : "unsupported";
        return {
            ...DEFAULT_CAPABILITY_STORE,
            sequentialDownload:
                sequential as CapabilityStore["sequentialDownload"],
            superSeeding: superSeeding as CapabilityStore["superSeeding"],
        } as CapabilityStore;
    }, [torrentClient]);

    const capabilities = useMemo<CapabilityStore>(() => {
        return {
            ...baseCapabilities,
            ...(overrides as CapabilityStore),
        };
    }, [baseCapabilities, overrides]);

    const updateCapabilityState = useCallback(
        (
            capability: keyof CapabilityStore,
            state: CapabilityStore[keyof CapabilityStore],
        ) => {
            setOverrides((prev) =>
                prev[capability] === state
                    ? prev
                    : { ...prev, [capability]: state },
            );
        },
        [],
    );

    return [capabilities, updateCapabilityState];
}
