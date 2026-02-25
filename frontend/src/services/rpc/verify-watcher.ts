import { scheduler } from "@/app/services/scheduler";
import { RECOVERY_VERIFY_WATCH_INTERVAL_MS, GHOST_TIMEOUT_MS } from "@/config/logic";
import type { EngineAdapter } from "@/services/rpc/engine-adapter";
import { STATUS } from "@/shared/status";

const VERIFY_WATCH_TIMEOUT_MS = GHOST_TIMEOUT_MS;

interface VerifyWatchResult {
    success: boolean;
    leftUntilDone: number | null;
    state?: string;
    aborted?: boolean;
}

const isCheckingState = (state?: string) => {
    if (!state) return false;
    const normalized = state.toLowerCase();
    return normalized === STATUS.torrent.CHECKING || normalized === "check_wait" || normalized === "check_waiting";
};

const isTerminalErrorState = (state?: string) => state === STATUS.torrent.ERROR;

const delay = (ms: number) =>
    new Promise<void>((resolve) => {
        scheduler.scheduleTimeout(resolve, ms);
    });

export async function watchVerifyCompletion(
    client: EngineAdapter,
    torrentId: string,
    signal?: AbortSignal,
): Promise<VerifyWatchResult> {
    if (!client.getTorrentDetails) {
        return { success: true, leftUntilDone: null };
    }
    const deadline = Date.now() + VERIFY_WATCH_TIMEOUT_MS;
    let lastLeft: number | null = null;
    let lastState: string | undefined;

    while (Date.now() < deadline) {
        if (signal?.aborted) {
            return {
                success: false,
                leftUntilDone: lastLeft,
                state: lastState,
                aborted: true,
            };
        }
        try {
            const detail = await client.getTorrentDetails(torrentId, {
                profile: "standard",
                includeTrackerStats: false,
            });
            const state = detail.state;
            const left = typeof detail.leftUntilDone === "number" ? detail.leftUntilDone : null;
            lastLeft = left;
            lastState = state;
            if (!isCheckingState(state)) {
                return {
                    success: !isTerminalErrorState(state),
                    leftUntilDone: left,
                    state,
                };
            }
        } catch {
            // Best effort polling until timeout.
        }
        await delay(RECOVERY_VERIFY_WATCH_INTERVAL_MS);
    }

    return {
        success: false,
        leftUntilDone: lastLeft,
        state: lastState,
    };
}
