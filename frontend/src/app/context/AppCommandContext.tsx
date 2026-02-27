/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, type ReactNode } from "react";
import type { TorrentIntentExtended } from "@/app/intents/torrentIntents";
import type { TorrentEntity as Torrent } from "@/services/rpc/entities";
import type { TorrentTableAction } from "@/modules/dashboard/types/torrentTable";
import type { TorrentDispatchOutcome } from "@/app/actions/torrentDispatch";
import type { TransmissionFreeSpace } from "@/services/rpc/types";

export type SuccessReason = "queued" | "refresh_skipped";
export type FailedReason = "execution_failed" | "refresh_failed" | "blocked";
export type CommandReason =
    | SuccessReason
    | "no_selection"
    | "action_not_supported"
    | FailedReason;
export const commandReason = {
    queued: "queued",
    refreshSkipped: "refresh_skipped",
    noSelection: "no_selection",
    actionNotSupported: "action_not_supported",
    executionFailed: "execution_failed",
    refreshFailed: "refresh_failed",
    blocked: "blocked",
} as const satisfies Record<string, CommandReason>;

export type TorrentCommandOutcome =
    | {
          status: "success";
          reason?: SuccessReason;
      }
    | {
          status: "canceled";
          reason: "no_selection";
      }
    | {
          status: "unsupported";
          reason: "action_not_supported";
      }
    | {
          status: "failed";
          reason: FailedReason;
      };

export const commandOutcome = {
    success(reason?: SuccessReason): {
        status: "success";
        reason?: SuccessReason;
    } {
        return reason
            ? { status: "success", reason }
            : { status: "success" };
    },
    noSelection(): {
        status: "canceled";
        reason: "no_selection";
    } {
        return {
            status: "canceled",
            reason: "no_selection",
        };
    },
    unsupported(): {
        status: "unsupported";
        reason: "action_not_supported";
    } {
        return {
            status: "unsupported",
            reason: "action_not_supported",
        };
    },
    failed(reason: FailedReason): {
        status: "failed";
        reason: FailedReason;
    } {
        return { status: "failed", reason };
    },
} satisfies {
    success: (reason?: SuccessReason) => TorrentCommandOutcome;
    noSelection: () => TorrentCommandOutcome;
    unsupported: () => TorrentCommandOutcome;
    failed: (reason: FailedReason) => TorrentCommandOutcome;
};

export const isCommandSuccess = (
    outcome: TorrentCommandOutcome,
): outcome is Extract<TorrentCommandOutcome, { status: "success" }> =>
    outcome.status === "success";

export const isCommandCanceled = (
    outcome: TorrentCommandOutcome,
): outcome is Extract<TorrentCommandOutcome, { status: "canceled" }> =>
    outcome.status === "canceled";

export const isCommandUnsupported = (
    outcome: TorrentCommandOutcome,
): outcome is Extract<TorrentCommandOutcome, { status: "unsupported" }> =>
    outcome.status === "unsupported";

export const isCommandFailed = (
    outcome: TorrentCommandOutcome,
): outcome is Extract<TorrentCommandOutcome, { status: "failed" }> =>
    outcome.status === "failed";

export interface TorrentCommandAPI {
    handleTorrentAction: (action: TorrentTableAction, torrent: Torrent) => Promise<TorrentCommandOutcome>;
    handleBulkAction: (action: TorrentTableAction) => Promise<TorrentCommandOutcome>;
    setDownloadLocation: (params: { torrent: Torrent; path: string }) => Promise<TorrentCommandOutcome>;
    checkFreeSpace?: (path: string) => Promise<TransmissionFreeSpace>;
    openAddTorrentPicker: () => Promise<TorrentCommandOutcome>;
    openAddMagnet: (magnetLink?: string) => Promise<TorrentCommandOutcome>;
}

export interface TorrentActions {
    dispatch: (intent: TorrentIntentExtended) => Promise<TorrentDispatchOutcome>;
}

export interface AppCommandContextValue {
    dispatch: (intent: TorrentIntentExtended) => Promise<TorrentDispatchOutcome>;
    commandApi: TorrentCommandAPI;
}

const AppCommandContext = createContext<AppCommandContextValue | null>(null);

export function AppCommandProvider({ value, children }: { value: AppCommandContextValue; children: ReactNode }) {
    return <AppCommandContext.Provider value={value}>{children}</AppCommandContext.Provider>;
}

export function useAppCommandContext(): AppCommandContextValue {
    const context = useContext(AppCommandContext);
    if (!context) {
        throw new Error("useAppCommandContext must be used within AppCommandProvider");
    }
    return context;
}

export function useTorrentCommands(): TorrentCommandAPI {
    const { commandApi } = useAppCommandContext();
    return commandApi;
}

export function useRequiredTorrentActions(): TorrentActions {
    const { dispatch } = useAppCommandContext();
    return { dispatch };
}

