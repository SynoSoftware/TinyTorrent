/* eslint-disable react-refresh/only-export-components */
import { createContext, type ReactNode, useContext } from "react";
import type { UiMode } from "@/app/utils/uiMode";
import type { Torrent, TorrentDetail } from "@/modules/dashboard/types/torrent";
import type {
    MissingFilesClassification,
    RecoveryOutcome,
} from "@/services/recovery/recovery-controller";
import type { RecoveryGateAction } from "@/app/types/recoveryGate";
import type { OpenFolderOutcome } from "@/app/types/openFolder";

export type SetLocationSurface =
    | "context-menu"
    | "general-tab"
    | "recovery-modal";

export interface SetLocationCapability {
    canBrowse: boolean;
    supportsManual: boolean;
}

export type SetLocationOptions = {
    mode?: "browse" | "manual";
    surface?: SetLocationSurface;
};

export type SetLocationOutcome =
    | { status: "picked" }
    | { status: "manual_opened" }
    | { status: "cancelled" }
    | {
          status: "unsupported";
          reason: "browse_unavailable" | "manual_unavailable";
      }
    | {
          status: "conflict";
          reason: "already_owned" | "owned_elsewhere";
      }
      | {
          status: "failed";
          reason: "dispatch_failed" | "browse_failed" | "invalid_target";
      };

export type SetLocationConfirmOutcome =
    | { status: "submitted" }
    | { status: "verifying" }
    | { status: "validation_error" }
    | { status: "missing_target" }
    | { status: "failed" }
    | { status: "canceled" };

export type OpenRecoveryModalOutcome =
    | { status: "opened" }
    | { status: "already_open" }
    | { status: "busy" }
    | { status: "not_actionable" };

export interface LocationEditorState {
    surface: SetLocationSurface;
    torrentKey: string;
    initialPath: string;
    inputPath: string;
    status: "idle" | "submitting" | "verifying";
    awaitingRecoveryFingerprint?: string | null;
    error?: string;
    intentId: number;
}

export interface RecoverySessionInfo {
    torrent: Torrent | TorrentDetail;
    action: RecoveryGateAction;
    outcome: RecoveryOutcome;
    classification: MissingFilesClassification;
    autoCloseAtMs?: number;
}

export interface RecoveryContextValue {
    uiMode: UiMode;
    canOpenFolder: boolean;
    handleOpenFolder: (path?: string | null) => Promise<OpenFolderOutcome>;
    handleRetry: () => Promise<void>;
    handleDownloadMissing: (
        torrent: Torrent,
        options?: { recreateFolder?: boolean },
    ) => Promise<void>;
    handleSetLocation: (
        torrent: Torrent | TorrentDetail,
        options?: SetLocationOptions,
    ) => Promise<SetLocationOutcome>;
    setLocationCapability: SetLocationCapability;
    setLocationState: LocationEditorState | null;
    cancelSetLocation: () => void;
    releaseSetLocation: () => void;
    confirmSetLocation: () => Promise<SetLocationConfirmOutcome>;
    handleLocationChange: (value: string) => void;
    openRecoveryModal: (
        torrent: Torrent | TorrentDetail,
    ) => OpenRecoveryModalOutcome;
    recoverySession: RecoverySessionInfo | null;
    getRecoverySessionForKey: (
        torrentKey: string | null,
    ) => RecoverySessionInfo | null;
}
// TODO: Clarify RecoveryContext contract: expose only minimal recovery/set-location API, keep internal orchestration (queues, drafts, state machine) hidden behind a view-model/provider; align contract with Recovery UX acceptance specs.
// TODO: Deprecate `serverClass` + `connectionMode` from this context. Replace with:
// TODO: - `uiMode: "Full" | "Rpc"` (full desktop vs RPC-only)
// TODO: - derived booleans needed for recovery/set-location (canBrowse/canOpenFolder/supportsManual)

const RecoveryContext = createContext<RecoveryContextValue | null>(null);

export function RecoveryProvider({
    value,
    children,
}: {
    value: RecoveryContextValue;
    children: ReactNode;
}) {
    return (
        <RecoveryContext.Provider value={value}>
            {children}
        </RecoveryContext.Provider>
    );
}

export function useRecoveryContext(): RecoveryContextValue {
    const context = useContext(RecoveryContext);
    if (!context) {
        throw new Error(
            "useRecoveryContext must be used within RecoveryProvider",
        );
    }
    return context;
}
