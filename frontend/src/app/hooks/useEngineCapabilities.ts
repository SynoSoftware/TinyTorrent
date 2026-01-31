import { useMemo } from "react";
import type { EngineAdapter } from "@/services/rpc/engine-adapter";
import type { CapabilityStore } from "@/app/types/capabilities";

export function useEngineCapabilities(
    client: EngineAdapter | null,
): CapabilityStore {
    return useMemo<CapabilityStore>(
        () => ({
            sequentialDownload: client?.setSequentialDownload
                ? "supported"
                : "unsupported",
            superSeeding: client?.setSuperSeeding ? "supported" : "unsupported",
        }),
        [client],
    );
}

export default useEngineCapabilities;
