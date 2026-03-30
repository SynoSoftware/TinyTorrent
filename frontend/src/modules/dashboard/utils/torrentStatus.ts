import type { TFunction } from "i18next";
import type { TorrentEntity as Torrent, TorrentTransportStatus } from "@/services/rpc/entities";
import type { OptimisticStatusEntry } from "@/modules/dashboard/types/contracts";
import { registry } from "@/config/logic";
import { status, type TorrentStatus } from "@/shared/status";
import type { SpeedHistorySnapshot } from "@/shared/hooks/speedHistoryStore";

const { timing } = registry;
const STALLED_OBSERVATION_WINDOW_MS =
    timing.ui.stalledActivityHistoryWindow * timing.heartbeat.detailMs;
let appStartupAtMs = Date.now();

type ActiveTransportState =
    | typeof status.torrent.downloading
    | typeof status.torrent.seeding;
type TorrentPresentationVisualState = TorrentStatus | "connecting";
type TorrentOverlayState = typeof status.torrent.stalled;
type TorrentPresentationMode =
    | "moving"
    | "connecting"
    | "stalled"
    | "idle-seeding"
    | "transport";

export type TorrentSpeedHistory = {
    down: readonly number[];
    up: readonly number[];
};
type RawTorrentSpeedHistory =
    | readonly (number | null)[]
    | SpeedHistorySnapshot;
type StalledObservationEntry = {
    transportState: ActiveTransportState;
    observedAtMs: number;
};
const stalledObservationByTorrentId = new Map<string, StalledObservationEntry>();

export const getEffectiveTorrentState = (
    torrent: Pick<Torrent, "state">,
    optimisticStatus?: OptimisticStatusEntry,
): TorrentTransportStatus => optimisticStatus?.state ?? torrent.state;

export function resetTorrentStatusRuntimeState() {
    stalledObservationByTorrentId.clear();
    appStartupAtMs = Date.now();
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
    transportState: TorrentTransportStatus | null;
    // UI-only annotation layered over the transport state.
    overlayState: TorrentOverlayState | null;
    // Presentation-only startup grace shown before idle observation is credible.
    startupGrace: boolean;
    // The state the compact chip should use for iconography and tone.
    // This allows stalled overlays to keep their visual treatment even when
    // the text label preserves qBittorrent's seeding wording.
    visualState: TorrentPresentationVisualState | null;
    // Seeding has a second presentation distinct from active upload:
    // same "seeding" label, but an idle visual/tooltip once upload has been
    // locally idle long enough to be credible.
    isIdleSeeding: boolean;
    isOptimisticMoving: boolean;
    label: string | null;
    tooltip: string | null;
}

export interface TorrentStatusView {
    visualState: TorrentPresentationVisualState | null;
}

type StallPresentationFacts = Pick<
    Torrent,
    "id" | "state" | "speed" | "peerSummary" | "added"
>;

const isActiveTransportState = (
    transportState: TorrentTransportStatus,
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
    speedHistory: TorrentSpeedHistory | undefined,
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

const toUnixMs = (valueSeconds: number) => valueSeconds * 1000;

const readObservationEntry = (
    torrentId: string,
    transportState: ActiveTransportState,
    nowMs: number,
) => {
    const existing = stalledObservationByTorrentId.get(torrentId);
    if (existing?.transportState === transportState) {
        return existing;
    }

    const next = { transportState, observedAtMs: nowMs };
    stalledObservationByTorrentId.set(torrentId, next);
    return next;
};

const getObservationStartedAtMs = (
    torrentId: string,
    transportState: ActiveTransportState,
    nowMs: number,
) =>
    torrentId.length > 0
        ? readObservationEntry(torrentId, transportState, nowMs).observedAtMs
        : nowMs;

const isInStartupGrace = (params: {
    torrent: StallPresentationFacts;
    transportState: ActiveTransportState;
    observationStartedAtMs: number;
    speedHistory?: TorrentSpeedHistory;
    nowMs: number;
}) => {
    if (params.transportState !== status.torrent.downloading) {
        return false;
    }

    const relevantPayloadRate = getRelevantPayloadRate(
        params.torrent,
        params.transportState,
    );
    if (relevantPayloadRate > 0) {
        return false;
    }

    const relevantRateHistory = getRelevantRateHistory(
        params.speedHistory,
        params.transportState,
    );
    if (hasRecentTransferActivity(getRecentRateWindow(relevantRateHistory))) {
        return false;
    }

    const appStartupGraceActive =
        params.nowMs - appStartupAtMs < timing.ui.startupStalledGraceMs;
    const activeTransportGraceActive =
        params.nowMs - params.observationStartedAtMs <
        timing.ui.startupStalledGraceMs;
    const torrentStartupGraceActive =
        typeof params.torrent.added === "number" &&
        Number.isFinite(params.torrent.added) &&
        params.nowMs - toUnixMs(params.torrent.added) <
            timing.ui.startupStalledGraceMs;

    return (
        appStartupGraceActive ||
        activeTransportGraceActive ||
        torrentStartupGraceActive
    );
};

const hasCredibleIdleTransportObservation = (params: {
    torrent: StallPresentationFacts;
    transportState: ActiveTransportState;
    speedHistory?: TorrentSpeedHistory;
    nowMs: number;
}) => {
    const torrentId = String(params.torrent.id ?? "");
    const observation =
        torrentId.length > 0
            ? readObservationEntry(torrentId, params.transportState, params.nowMs)
            : { transportState: params.transportState, observedAtMs: params.nowMs };
    const relevantPayloadRate = getRelevantPayloadRate(
        params.torrent,
        params.transportState,
    );
    const relevantRateHistory = getRelevantRateHistory(
        params.speedHistory,
        params.transportState,
    );
    const recentRateWindow = getRecentRateWindow(relevantRateHistory);

    if (relevantPayloadRate > 0) {
        return {
            credibleIdle: false,
            observationStartedAtMs: observation.observedAtMs,
        } as const;
    }

    if (!hasSufficientRateHistory(recentRateWindow)) {
        return {
            credibleIdle: false,
            observationStartedAtMs: observation.observedAtMs,
        } as const;
    }

    if (params.nowMs - observation.observedAtMs < STALLED_OBSERVATION_WINDOW_MS) {
        return {
            credibleIdle: false,
            observationStartedAtMs: observation.observedAtMs,
        } as const;
    }

    return {
        credibleIdle: !hasRecentTransferActivity(recentRateWindow),
        observationStartedAtMs: observation.observedAtMs,
    } as const;
};

// Presentation contract:
// - `stalled` is UI-derived only. It is not daemon truth and must never drive transport.
// - It mirrors qBittorrent's transport-facing rule: active download/seed mode
//   with zero relevant payload throughput maps to a stalled overlay.
// - Peer counts may explain the idle reason in tooltips but never decide the
//   stalled overlay.
// - UX is informational: unified idle label plus a reason explaining why transfer is idle.
const derivePresentationOverlayState = (
    torrent: StallPresentationFacts,
    baseState: TorrentTransportStatus,
    speedHistory?: TorrentSpeedHistory,
): TorrentOverlayState | null => {
    const torrentId = String(torrent.id ?? "");
    if (!isActiveTransportState(baseState)) {
        if (torrentId.length > 0) {
            stalledObservationByTorrentId.delete(torrentId);
        }
        return null;
    }

    const nowMs = Date.now();
    if (baseState !== status.torrent.downloading) {
        return null;
    }

    const idleObservation = hasCredibleIdleTransportObservation({
        torrent,
        transportState: baseState,
        speedHistory,
        nowMs,
    });

    if (!idleObservation.credibleIdle) {
        return null;
    }

    if (
        isInStartupGrace({
            torrent,
            transportState: baseState,
            observationStartedAtMs: idleObservation.observationStartedAtMs,
            speedHistory,
            nowMs,
        })
    ) {
        return null;
    }

    return status.torrent.stalled;
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

const getPresentationLabelState = (params: {
    mode: TorrentPresentationMode;
    transportState: TorrentTransportStatus | null;
    overlayState: TorrentOverlayState | null;
}): TorrentStatus | null => {
    if (params.mode === "stalled") {
        return params.overlayState;
    }
    if (params.mode === "transport" || params.mode === "idle-seeding") {
        return params.transportState;
    }
    return null;
};

const getPresentationLabel = (params: {
    mode: TorrentPresentationMode;
    transportState: TorrentTransportStatus | null;
    overlayState: TorrentOverlayState | null;
    t: TFunction;
}) => {
    if (params.mode === "connecting") {
        return params.t("labels.status.torrent.connecting");
    }

    const labelState = getPresentationLabelState(params);
    if (!labelState) {
        return null;
    }

    const statusLabelKey = getTorrentStatusLabelKey(labelState);
    if (statusLabelKey != null) {
        return params.t(statusLabelKey);
    }

    return labelState.length > 0 ? labelState : null;
};

export const getStatusSpeedHistory = (
    torrent: Pick<Torrent, "state">,
    rawHistory?: RawTorrentSpeedHistory,
): TorrentSpeedHistory => {
    if (isSpeedHistorySnapshot(rawHistory)) {
        const snapshot = rawHistory;
        return {
            down: snapshot.down.filter((value): value is number =>
                Number.isFinite(value),
            ),
            up: snapshot.up.filter((value): value is number =>
                Number.isFinite(value),
            ),
        };
    }

    const sanitizedHistory = (rawHistory ?? []).filter(
        (value): value is number => Number.isFinite(value),
    );

    return torrent.state === status.torrent.seeding
        ? { down: [], up: sanitizedHistory }
        : { down: sanitizedHistory, up: [] };
};

const isSpeedHistorySnapshot = (
    value: RawTorrentSpeedHistory | undefined,
): value is SpeedHistorySnapshot =>
    value !== undefined && !Array.isArray(value);

type StatusViewState = Omit<
    TorrentStatusPresentation,
    "label" | "tooltip"
> & {
    mode: TorrentPresentationMode;
};

const deriveStatusView = (
    torrent: Pick<
        Torrent,
        "id" | "state" | "errorString" | "peerSummary" | "speed" | "added"
    >,
    optimisticStatus?: OptimisticStatusEntry,
    speedHistory?: TorrentSpeedHistory,
): StatusViewState => {
    if (optimisticStatus?.operation === "moving") {
        return {
            mode: "moving",
            transportState: null,
            overlayState: null,
            startupGrace: false,
            visualState: null,
            isIdleSeeding: false,
            isOptimisticMoving: true,
        };
    }

    const transportState = getEffectiveTorrentState(torrent, optimisticStatus);
    const nowMs = Date.now();
    const idleSeedingObservation =
        transportState === status.torrent.seeding
            ? hasCredibleIdleTransportObservation({
                  torrent,
                  transportState,
                  speedHistory,
                  nowMs,
              })
            : null;
    const overlayState = derivePresentationOverlayState(
        torrent,
        transportState,
        speedHistory,
    );
    const startupGrace =
        overlayState == null &&
        transportState === status.torrent.downloading &&
        isInStartupGrace({
            torrent,
            transportState,
            observationStartedAtMs: getObservationStartedAtMs(
                String(torrent.id ?? ""),
                transportState,
                nowMs,
            ),
            speedHistory,
            nowMs,
        });
    const isIdleSeeding =
        transportState === status.torrent.seeding &&
        overlayState == null &&
        idleSeedingObservation?.credibleIdle === true;
    const mode: TorrentPresentationMode = startupGrace
        ? "connecting"
        : overlayState === status.torrent.stalled
          ? "stalled"
          : isIdleSeeding
            ? "idle-seeding"
            : "transport";
    const visualState =
        mode === "connecting"
            ? "connecting"
            : mode === "stalled"
              ? status.torrent.stalled
              : transportState;

    return {
        mode,
        transportState,
        overlayState,
        startupGrace,
        visualState,
        isIdleSeeding,
        isOptimisticMoving: false,
    };
};

export const getTorrentStatusView = (
    torrent: Pick<
        Torrent,
        "id" | "state" | "errorString" | "peerSummary" | "speed" | "added"
    >,
    optimisticStatus?: OptimisticStatusEntry,
    speedHistory?: TorrentSpeedHistory,
): TorrentStatusView => {
    const { visualState } = deriveStatusView(
        torrent,
        optimisticStatus,
        speedHistory,
    );

    return { visualState };
};

export const getTorrentStatusPresentation = (
    torrent: Pick<
        Torrent,
        "id" | "state" | "errorString" | "peerSummary" | "speed" | "added"
    >,
    t: TFunction,
    optimisticStatus?: OptimisticStatusEntry,
    speedHistory?: TorrentSpeedHistory,
): TorrentStatusPresentation => {
    const {
        mode,
        transportState,
        overlayState,
        startupGrace,
        visualState,
        isIdleSeeding,
        isOptimisticMoving,
    } = deriveStatusView(
        torrent,
        optimisticStatus,
        speedHistory,
    );

    if (mode === "moving" && isOptimisticMoving) {
        const label = t("table.status_moving");
        return {
            transportState,
            overlayState,
            startupGrace,
            visualState,
            isIdleSeeding,
            isOptimisticMoving,
            label,
            tooltip: label,
        };
    }

    const label = getPresentationLabel({
        mode,
        transportState,
        overlayState,
        t,
    });

    if (!label) {
        return {
            transportState,
            overlayState,
            startupGrace,
            visualState,
            isIdleSeeding,
            isOptimisticMoving,
            label: null,
            tooltip: null,
        };
    }

    return {
        transportState,
        overlayState,
        startupGrace,
        visualState,
        isIdleSeeding,
        isOptimisticMoving,
        label,
        tooltip:
            mode === "connecting"
                ? t("labels.status.torrent.connecting")
                : mode === "stalled"
                ? getStallTooltip(torrent, t)
                : mode === "idle-seeding"
                ? `${label} • ${getStallTooltip(torrent, t)}`
                : torrent.errorString && torrent.errorString.trim().length > 0
                  ? torrent.errorString
                  : label,
    };
};
