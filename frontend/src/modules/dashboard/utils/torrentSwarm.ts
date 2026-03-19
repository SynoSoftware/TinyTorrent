import type { TorrentEntity as Torrent, TorrentTrackerEntity } from "@/services/rpc/entities";
import type { OptimisticStatusEntry } from "@/modules/dashboard/types/contracts";
import {
    getTorrentStatusView,
    type TorrentSpeedHistory,
} from "@/modules/dashboard/utils/torrentStatus";
import { status } from "@/shared/status";

export type TorrentHealthState =
    | "healthy"
    | "degraded"
    | "unavailable"
    | "finding_peers"
    | "metadata"
    | "error";

export type TorrentSwarmRobustnessState =
    | "robust"
    | "fragile"
    | "critical";

export type TorrentTrackerCondition =
    | "working"
    | "degraded"
    | "failing"
    | "unavailable";

export interface TorrentSwarmHealth {
    isIncomplete: boolean;
    healthState: TorrentHealthState;
    robustnessState: TorrentSwarmRobustnessState | null;
    remainingBytes: number;
    reachableNowBytes: number;
    connectedPeerCount: number;
    activeWebseedCount: number;
    activeDownloadSources: number;
    missingPiecesUnavailable: number | null;
    missingPiecesSingleSource: number | null;
    missingPieceCount: number | null;
    hasPieceAvailability: boolean;
}

const LOCAL_ERROR_CODE = 3;
const RECENT_TRACKER_SUCCESS_WINDOW_SECONDS = 30 * 60;

const isFiniteNumber = (value: unknown): value is number =>
    typeof value === "number" && Number.isFinite(value);

const toFiniteNumber = (value: unknown, fallback = 0) =>
    isFiniteNumber(value) ? value : fallback;

const hasCompleteMetadata = (
    torrent: Pick<Torrent, "metadataPercentComplete">,
) => (torrent.metadataPercentComplete ?? 1) >= 1;

const isTorrentComplete = (
    torrent: Pick<Torrent, "state" | "isFinished" | "leftUntilDone" | "progress">,
) =>
    torrent.isFinished === true ||
    torrent.state === status.torrent.seeding ||
    (isFiniteNumber(torrent.progress) && torrent.progress >= 1) ||
    (isFiniteNumber(torrent.leftUntilDone) && torrent.leftUntilDone <= 0);

const getMissingPieceAvailabilities = (
    pieceAvailability?: readonly number[],
) =>
    pieceAvailability?.flatMap((value) =>
        isFiniteNumber(value) && value >= 0 ? [Math.max(0, Math.floor(value))] : [],
    ) ?? [];

export const deriveTorrentSwarmHealth = (
    torrent: Pick<
        Torrent,
        | "state"
        | "progress"
        | "isFinished"
        | "leftUntilDone"
        | "desiredAvailable"
        | "metadataPercentComplete"
        | "webseedsSendingToUs"
        | "peerSummary"
        | "error"
        | "pieceAvailability"
    >,
): TorrentSwarmHealth => {
    const remainingBytes = Math.max(0, toFiniteNumber(torrent.leftUntilDone, 0));
    const connectedPeerCount = Math.max(0, toFiniteNumber(torrent.peerSummary.connected, 0));
    const activeWebseedCount = Math.max(0, toFiniteNumber(torrent.webseedsSendingToUs, 0));
    const activeDownloadSources =
        Math.max(0, toFiniteNumber(torrent.peerSummary.getting, 0)) +
        activeWebseedCount;
    const desiredAvailable = Math.max(0, toFiniteNumber(torrent.desiredAvailable, 0));
    const missingPieceAvailabilities = getMissingPieceAvailabilities(
        torrent.pieceAvailability,
    );
    const hasPieceAvailability = missingPieceAvailabilities.length > 0;
    const missingPiecesUnavailable = hasPieceAvailability
        ? missingPieceAvailabilities.filter((value) => value === 0).length
        : null;
    const missingPiecesSingleSource = hasPieceAvailability
        ? missingPieceAvailabilities.filter((value) => value === 1).length
        : null;
    const missingPieceCount = hasPieceAvailability
        ? missingPieceAvailabilities.length
        : null;
    const hasZeroSourceMissingPieces = (missingPiecesUnavailable ?? 0) > 0;
    const isIncomplete = !isTorrentComplete(torrent);

    const hasActiveWebseedWithoutContradiction =
        activeWebseedCount > 0 && !hasZeroSourceMissingPieces;
    const hasFullyReachableRemainingBytes =
        desiredAvailable >= remainingBytes || hasActiveWebseedWithoutContradiction;
    const hasPartiallyReachableRemainingBytes =
        !hasFullyReachableRemainingBytes && desiredAvailable > 0;
    const reachableNowBytes =
        hasFullyReachableRemainingBytes
            ? remainingBytes
            : hasPartiallyReachableRemainingBytes
              ? Math.min(desiredAvailable, remainingBytes)
              : 0;

    let robustnessState: TorrentSwarmRobustnessState | null = null;

    if (
        isIncomplete &&
        missingPieceCount != null &&
        missingPiecesUnavailable != null &&
        missingPiecesSingleSource != null
    ) {
        if (missingPiecesUnavailable > 0) {
            robustnessState = "critical";
        } else {
            const fragileThreshold = Math.max(
                3,
                Math.ceil(0.01 * missingPieceCount),
            );
            robustnessState =
                missingPiecesSingleSource >= fragileThreshold ? "fragile" : "robust";
        }
    }

    const isConnectedIdle =
        isIncomplete &&
        connectedPeerCount > 0 &&
        reachableNowBytes > 0 &&
        activeDownloadSources === 0;
    const hasWeakAvailability =
        hasPartiallyReachableRemainingBytes ||
        robustnessState === "fragile" ||
        robustnessState === "critical" ||
        isConnectedIdle;
    const isFindingPeers =
        isIncomplete &&
        connectedPeerCount === 0 &&
        reachableNowBytes === 0;

    let healthState: TorrentHealthState = "healthy";
    if (torrent.error === LOCAL_ERROR_CODE) {
        healthState = "error";
    } else if (isIncomplete && !hasCompleteMetadata(torrent)) {
        healthState = "metadata";
    } else if (isFindingPeers) {
        healthState = "finding_peers";
    } else if (isIncomplete && reachableNowBytes === 0) {
        healthState = "unavailable";
    } else if (isIncomplete && hasWeakAvailability) {
        healthState = "degraded";
    }

    return {
        isIncomplete,
        healthState,
        robustnessState,
        remainingBytes,
        reachableNowBytes,
        connectedPeerCount,
        activeWebseedCount,
        activeDownloadSources,
        missingPiecesUnavailable,
        missingPiecesSingleSource,
        missingPieceCount,
        hasPieceAvailability,
    };
};

export const deriveTorrentDisplayHealth = (
    torrent: Pick<
        Torrent,
        | "id"
        | "state"
        | "progress"
        | "isFinished"
        | "leftUntilDone"
        | "desiredAvailable"
        | "metadataPercentComplete"
        | "webseedsSendingToUs"
        | "peerSummary"
        | "error"
        | "pieceAvailability"
        | "speed"
        | "added"
        | "errorString"
    >,
    optimisticStatus?: OptimisticStatusEntry,
    speedHistory?: TorrentSpeedHistory,
): TorrentSwarmHealth => {
    const swarm = deriveTorrentSwarmHealth(torrent);

    if (
        swarm.healthState === "error" ||
        swarm.healthState === "metadata"
    ) {
        return swarm;
    }

    const { visualState } = getTorrentStatusView(
        torrent,
        optimisticStatus,
        speedHistory,
    );

    if (visualState !== "connecting") {
        return swarm;
    }

    return {
        ...swarm,
        healthState:
            swarm.reachableNowBytes >= swarm.remainingBytes
                ? "healthy"
                : "finding_peers",
    };
};

export const getTorrentHealthLabelKey = (
    state: TorrentHealthState,
) => `torrent_modal.swarm.states.${state}` as const;

export const getTorrentHealthTableTooltipKey = (
    state: TorrentHealthState,
) => `torrent_modal.swarm.table_tooltips.${state}` as const;

export const getTorrentHealthGeneralTooltipKey = (
    state: TorrentHealthState,
) => `torrent_modal.swarm.general_tooltips.${state}` as const;

const HEALTH_SORT_RANK: Record<TorrentHealthState, number> = {
    healthy: 0,
    degraded: 1,
    finding_peers: 2,
    metadata: 3,
    unavailable: 4,
    error: 5,
};

export const getTorrentSwarmSortValue = (swarm: TorrentSwarmHealth) => {
    return HEALTH_SORT_RANK[swarm.healthState] ?? Number.MAX_SAFE_INTEGER;
};

const getRelevantTrackers = (
    trackers?: readonly TorrentTrackerEntity[],
) => {
    const enabledPrimaryTrackers =
        trackers?.filter(
            (tracker) =>
                typeof tracker.announce === "string" &&
                tracker.announce.trim().length > 0 &&
                tracker.isBackup !== true,
        ) ?? [];

    if (enabledPrimaryTrackers.length > 0) {
        return enabledPrimaryTrackers;
    }

    return (
        trackers?.filter(
            (tracker) =>
                typeof tracker.announce === "string" &&
                tracker.announce.trim().length > 0,
        ) ?? []
    );
};

const isRecentSuccess = (
    tracker: TorrentTrackerEntity,
    nowSeconds: number,
) => {
    const lastAnnounceAge =
        isFiniteNumber(tracker.lastAnnounceTime) && tracker.lastAnnounceTime > 0
            ? nowSeconds - tracker.lastAnnounceTime
            : Number.POSITIVE_INFINITY;
    const lastScrapeAge =
        isFiniteNumber(tracker.lastScrapeTime) && tracker.lastScrapeTime > 0
            ? nowSeconds - tracker.lastScrapeTime
            : Number.POSITIVE_INFINITY;

    return (
        (tracker.lastAnnounceSucceeded === true &&
            lastAnnounceAge <= RECENT_TRACKER_SUCCESS_WINDOW_SECONDS) ||
        (tracker.lastScrapeSucceeded === true &&
            lastScrapeAge <= RECENT_TRACKER_SUCCESS_WINDOW_SECONDS)
    );
};

const hasTrackerFailureEvidence = (tracker: TorrentTrackerEntity) =>
    tracker.lastAnnounceTimedOut === true ||
    tracker.lastScrapeTimedOut === true ||
    (tracker.lastAnnounceSucceeded === false &&
        tracker.lastAnnounceResult.trim().length > 0) ||
    (tracker.lastScrapeSucceeded === false &&
        tracker.lastScrapeResult.trim().length > 0);

export interface TorrentTrackerConditionSummary {
    condition: TorrentTrackerCondition;
    bestSeederCount?: number;
    bestLeecherCount?: number;
}

export const deriveTorrentTrackerCondition = (
    trackers: readonly TorrentTrackerEntity[] | undefined,
    nowSeconds: number,
): TorrentTrackerConditionSummary => {
    const relevantTrackers = getRelevantTrackers(trackers);

    if (relevantTrackers.length === 0) {
        return {
            condition: "unavailable",
            bestSeederCount: undefined,
            bestLeecherCount: undefined,
        };
    }

    const recentSuccessCount = relevantTrackers.filter((tracker) =>
        isRecentSuccess(tracker, nowSeconds),
    ).length;
    const failureCount = relevantTrackers.filter(hasTrackerFailureEvidence).length;

    let bestSeederCount: number | undefined;
    let bestLeecherCount: number | undefined;

    relevantTrackers.forEach((tracker) => {
        if (isFiniteNumber(tracker.seederCount) && tracker.seederCount >= 0) {
            bestSeederCount = Math.max(bestSeederCount ?? 0, tracker.seederCount);
        }
        if (isFiniteNumber(tracker.leecherCount) && tracker.leecherCount >= 0) {
            bestLeecherCount = Math.max(bestLeecherCount ?? 0, tracker.leecherCount);
        }
    });

    let condition: TorrentTrackerCondition;
    if (recentSuccessCount > 0 && failureCount === 0) {
        condition = "working";
    } else if (failureCount === relevantTrackers.length && recentSuccessCount === 0) {
        condition = "failing";
    } else {
        condition = "degraded";
    }

    return {
        condition,
        bestSeederCount,
        bestLeecherCount,
    };
};
