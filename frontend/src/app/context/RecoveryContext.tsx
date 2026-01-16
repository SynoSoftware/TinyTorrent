import { createContext, type ReactNode, useContext } from "react";
import type { ServerClass } from "@/services/rpc/entities";
import type { ShellUiMode } from "@/app/agents/shell-agent";
import type {
    Torrent,
    TorrentDetail,
} from "@/modules/dashboard/types/torrent";

export type SetLocationSurface =
    | "context-menu"
    | "general-tab"
    | "recovery-modal";

export interface SetLocationCapability {
    canBrowse: boolean;
    supportsManual: boolean;
}
// TODO: Align SetLocationCapability with `UiMode = Full | Rpc`:
// TODO: - `canBrowse` should mean “ShellAgent/ShellExtensions browse dialog is available AND we are connected to a localhost daemon”.
// TODO: - `supportsManual` is a UI policy knob (manual path entry allowed) and should remain true even in `UiMode=Rpc` unless explicitly disabled by product decision.
// TODO: This type must be produced by a single capability/locality provider and consumed by UI; do not recompute it in components/hooks.

export type SetLocationUnsupportedReason =
    | "browse-unavailable"
    | "manual-disabled";

export type SetLocationPolicyReason = "inline-conflict";

export type ConnectionMode =
    | "transmission-remote"
    | "tinytorrent-remote"
    | "tinytorrent-local-shell";
// TODO: Deprecate ConnectionMode in favor of `UiMode = Full | Rpc`.
// TODO: “tinytorrent-local-shell” is a UI bridge state, not a daemon identity; naming it as “tinytorrent” caused confusion.

export type SetLocationOutcome =
    | { kind: "browsed" }
    | { kind: "canceled" }
    | { kind: "manual"; surface: SetLocationSurface }
    | {
          kind: "unsupported";
          reason: SetLocationUnsupportedReason;
          surface: SetLocationSurface;
      }
    | { kind: "conflict"; reason: SetLocationPolicyReason; surface: SetLocationSurface };

export interface InlineSetLocationState {
    surface: SetLocationSurface;
    torrentKey: string;
    initialPath: string;
    inputPath: string;
    status: "idle" | "submitting" | "verifying";
    awaitingRecoveryFingerprint?: string | null;
    error?: string;
    intentId: number;
}

export interface RecoveryContextValue {
    serverClass: ServerClass;
    connectionMode: ConnectionMode;
    uiMode: ShellUiMode;
    canOpenFolder: boolean;
    handleRetry: () => Promise<void>;
    handleDownloadMissing: (
        torrent: Torrent,
        options?: { recreateFolder?: boolean }
    ) => Promise<void>;
    handleSetLocation: (
        torrent: Torrent | TorrentDetail,
        options?: { surface?: SetLocationSurface }
    ) => Promise<SetLocationOutcome>;
    setLocationCapability: SetLocationCapability;
    inlineSetLocationState: InlineSetLocationState | null;
    cancelInlineSetLocation: () => void;
    releaseInlineSetLocation: () => void;
    confirmInlineSetLocation: () => Promise<boolean>;
    handleInlineLocationChange: (value: string) => void;
    getLocationOutcome: (
        surface: SetLocationSurface,
        torrentKey: string | null
    ) => SetLocationOutcome | null;
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
            "useRecoveryContext must be used within RecoveryProvider"
        );
    }
    return context;
}
