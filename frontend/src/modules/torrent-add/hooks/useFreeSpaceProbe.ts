import { useEffect, useRef, useState } from "react";
import type { TransmissionFreeSpace } from "@/services/rpc/types";

export type FreeSpaceProbeState =
    | { status: "idle" }
    | { status: "loading" }
    | { status: "ok"; value: TransmissionFreeSpace }
    | { status: "error"; reason: "unknown" };

export function useFreeSpaceProbe({
    checkFreeSpace,
    path,
    enabled,
}: {
    checkFreeSpace?: (path: string) => Promise<TransmissionFreeSpace>;
    path: string;
    enabled: boolean;
}): FreeSpaceProbeState {
    const [state, setState] = useState<FreeSpaceProbeState>({ status: "idle" });
    const runIdRef = useRef(0);

    useEffect(() => {
        const trimmed = path.trim();
        if (!checkFreeSpace || !enabled || !trimmed) {
            setState({ status: "idle" });
            return;
        }

        const runId = ++runIdRef.current;
        setState({ status: "loading" });

        checkFreeSpace(trimmed)
            .then((space) => {
                if (runIdRef.current !== runId) return;
                setState({ status: "ok", value: space });
            })
            .catch(() => {
                if (runIdRef.current !== runId) return;
                setState({ status: "error", reason: "unknown" });
            });
    }, [checkFreeSpace, enabled, path]);

    return state;
}

