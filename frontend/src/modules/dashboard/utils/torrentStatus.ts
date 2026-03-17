import type { TFunction } from "i18next";
import type { TorrentEntity as Torrent, TorrentStatus } from "@/services/rpc/entities";
import type { OptimisticStatusEntry } from "@/modules/dashboard/types/contracts";
import { registry } from "@/config/logic";
import { status } from "@/shared/status";

const { timing } = registry;

type ActiveTransportState =
    | typeof status.torrent.downloading
    | typeof status.torrent.seeding;

type TorrentSpeedHistoryLike = {
    down: readonly number[];
    up: readonly number[];
};

export const getEffectiveTorrentState = (
    torrent: Pick<Torrent, "state">,
    optimisticStatus?: OptimisticStatusEntry,
): TorrentStatus => optimisticStatus?.state ?? torrent.state;

export function resetTorrentStatusPresentationRuntimeState() {
    // No-op by contract.
    // qBittorrent-style stalled derivation is snapshot-based and does not keep
    // client-side timers or session runtime state.
}

export const isTorrentPausableState = (torrentState?: TorrentStatus | null) =>
    torrentState === status.torrent.downloading ||
    torrentState === status.torrent.seeding ||
    torrentState === status.torrent.checking ||
    torrentState === status.torrent.queued ||
    torrentState === status.torrent.stalled;

export const getTorrentStatusLabelKey = (torrentState?: TorrentStatus | null) => {
    switch (torrentState) {
        case status.torrent.downloading:
            return "table.status_dl";
        case status.torrent.seeding:
            return "table.status_seed";
        case status.torrent.paused:
            return "table.status_pause";
        case status.torrent.checking:
            return "table.status_checking";
        case status.torrent.queued:
            return "table.status_queued";
        case status.torrent.stalled:
            return "table.status_stalled";
        case status.torrent.error:
            return "table.status_error";
        default:
            return null;
    }
};

export interface TorrentStatusPresentation {
    // Authoritative daemon state after optimistic local overrides.
    transportState: TorrentStatus | null;
    // UI-only annotation layered over the transport state.
    overlayState: TorrentStatus | null;
    // The state the compact chip should use for iconography and tone.
    // This allows stalled overlays to keep their visual treatment even when
    // the text label preserves qBittorrent's seeding wording.
    visualState: TorrentStatus | null;
    isOptimisticMoving: boolean;
    label: string | null;
    tooltip: string | null;
}

type StallPresentationFacts = Pick<
    Torrent,
    "state" | "speed" | "peerSummary"
>;

const isActiveTransportState = (
    transportState: TorrentStatus,
): transportState is ActiveTransportState =>
    transportState === status.torrent.downloading ||
    transportState === status.torrent.seeding;

const getRelevantPayloadRate = (
    torrent: Pick<Torrent, "speed">,
    transportState: ActiveTransportState,
) =>
    transportState === status.torrent.downloading
        ? torrent.speed.down
        : torrent.speed.up;

const getRelevantRateHistory = (
    speedHistory: TorrentSpeedHistoryLike | undefined,
    transportState: ActiveTransportState,
) => {
    if (!speedHistory) {
        return [];
    }
    return transportState === status.torrent.downloading
        ? speedHistory.down
        : speedHistory.up;
};

const getRecentRateWindow = (history: readonly number[]) =>
    history.slice(-timing.ui.stalledActivityHistoryWindow);

const hasSufficientRateHistory = (history: readonly number[]) =>
    history.length >= timing.ui.stalledActivityHistoryWindow;

const hasRecentTransferActivity = (history: readonly number[]) =>
    history.some((sample) => sample > 0);

// Presentation contract:
// - `stalled` is UI-derived only. It is not daemon truth and must never drive transport.
// - It mirrors qBittorrent's transport-facing rule: active download/seed mode
//   with zero relevant payload throughput maps to a stalled overlay.
// - Peer counts may explain the idle reason in tooltips but never decide the
//   stalled overlay.
// - UX is informational: unified idle label plus a reason explaining why transfer is idle.
const derivePresentationOverlayState = (
    torrent: StallPresentationFacts,
    baseState: TorrentStatus,
    speedHistory?: TorrentSpeedHistoryLike,
): TorrentStatus | null => {
    if (!isActiveTransportState(baseState)) {
        return null;
    }

    const relevantPayloadRate = getRelevantPayloadRate(torrent, baseState);
    const relevantRateHistory = getRelevantRateHistory(speedHistory, baseState);
    const recentRateWindow = getRecentRateWindow(relevantRateHistory);

    if (relevantPayloadRate > 0) {
        return null;
    }

    if (!hasSufficientRateHistory(recentRateWindow)) {
        return null;
    }

    return hasRecentTransferActivity(recentRateWindow)
        ? null
        : status.torrent.stalled;
};

const getStallReasonLabelKey = (
    torrent: Pick<Torrent, "peerSummary">,
) =>
    torrent.peerSummary.connected > 0
        ? "table.status_no_data_transfer"
        : "table.status_no_active_connections";

const getStallTooltip = (
    torrent: Pick<Torrent, "peerSummary">,
    t: TFunction,
) => {
    const reason = t(getStallReasonLabelKey(torrent));
    return `${t("table.status_waiting_for_peers")} • ${reason}`;
};

const shouldPreserveTransportSeedingLabel = (
    transportState: TorrentStatus,
    overlayState: TorrentStatus | null,
) =>
    transportState === status.torrent.seeding &&
    overlayState === status.torrent.stalled;

export const getTorrentStatusPresentation = (
    torrent: Pick<
        Torrent,
        "id" | "state" | "errorString" | "peerSummary" | "speed"
    >,
    t: TFunction,
    optimisticStatus?: OptimisticStatusEntry,
    speedHistory?: TorrentSpeedHistoryLike,
): TorrentStatusPresentation => {
    if (optimisticStatus?.operation === "moving") {
        const label = t("table.status_moving");
        return {
            transportState: null,
            overlayState: null,
            visualState: null,
            isOptimisticMoving: true,
            label,
            tooltip: label,
        };
    }

    const transportState = getEffectiveTorrentState(torrent, optimisticStatus);
    const overlayState = derivePresentationOverlayState(
        torrent,
        transportState,
        speedHistory,
    );
    const preserveTransportSeedingLabel = shouldPreserveTransportSeedingLabel(
        transportState,
        overlayState,
    );
    const visualState = overlayState ?? transportState;
    const labelState = preserveTransportSeedingLabel
        ? transportState
        : visualState;
    const statusLabelKey = getTorrentStatusLabelKey(labelState);
    const label =
        statusLabelKey != null
            ? t(statusLabelKey)
            : typeof labelState === "string" && labelState.length > 0
              ? labelState
                : null;

    if (!label) {
        return {
            transportState,
            overlayState,
            visualState,
            isOptimisticMoving: false,
            label: null,
            tooltip: null,
        };
    }

    return {
        transportState,
        overlayState,
        visualState,
        isOptimisticMoving: false,
        label,
        tooltip:
            overlayState === status.torrent.stalled
                ? preserveTransportSeedingLabel
                    ? `${label} • ${getStallTooltip(torrent, t)}`
                    : getStallTooltip(torrent, t)
                : torrent.errorString && torrent.errorString.trim().length > 0
                  ? torrent.errorString
                  : label,
    };
};
