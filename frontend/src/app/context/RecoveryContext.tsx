import { createContext, type ReactNode, useContext } from "react";
import type { ServerClass } from "@/services/rpc/entities";
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

export type SetLocationUnsupportedReason =
    | "browse-unavailable"
    | "manual-disabled";

export type SetLocationPolicyReason = "inline-conflict";

export type ConnectionMode =
    | "transmission-remote"
    | "tinytorrent-remote"
    | "tinytorrent-local-shell";

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
    confirmInlineSetLocation: () => Promise<boolean>;
    handleInlineLocationChange: (value: string) => void;
    getLocationOutcome: (
        surface: SetLocationSurface,
        torrentKey: string | null
    ) => SetLocationOutcome | null;
}

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
