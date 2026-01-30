import { useEffect, useState, useCallback } from "react";
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
    const [capabilities, setCapabilities] = useState<CapabilityStore>(
        DEFAULT_CAPABILITY_STORE,
    );

    useEffect(() => {
        if (!torrentClient) return;

        if (!torrentClient.setSequentialDownload) {
            Promise.resolve().then(() =>
                setCapabilities((prev) =>
                    prev.sequentialDownload === "unsupported"
                        ? prev
                        : { ...prev, sequentialDownload: "unsupported" },
                ),
            );
            return;
        }
        Promise.resolve().then(() =>
            setCapabilities((prev) =>
                prev.sequentialDownload === "unsupported"
                    ? { ...prev, sequentialDownload: "unknown" }
                    : prev,
            ),
        );
    }, [torrentClient]);

    useEffect(() => {
        if (!torrentClient) return;

        if (!torrentClient.setSuperSeeding) {
            Promise.resolve().then(() =>
                setCapabilities((prev) =>
                    prev.superSeeding === "unsupported"
                        ? prev
                        : { ...prev, superSeeding: "unsupported" },
                ),
            );
            return;
        }
        Promise.resolve().then(() =>
            setCapabilities((prev) =>
                prev.superSeeding === "unsupported"
                    ? { ...prev, superSeeding: "unknown" }
                    : prev,
            ),
        );
    }, [torrentClient]);

    const updateCapabilityState = useCallback(
        (
            capability: keyof CapabilityStore,
            state: CapabilityStore[keyof CapabilityStore],
        ) => {
            setCapabilities((prev) =>
                prev[capability] === state
                    ? prev
                    : { ...prev, [capability]: state },
            );
        },
        [],
    );

    return [capabilities, updateCapabilityState];
}
