import type { TFunction } from "i18next";
import type { TorrentEntity as Torrent } from "@/services/rpc/entities";
import { registry } from "@/config/logic";
import { status } from "@/shared/status";
import { formatEtaAbsolute, formatTime } from "@/shared/utils/format";

const { visualizations } = registry;
const ETA_DISPLAY = visualizations.details.eta;

const isEtaOmittedByState = (torrent: Torrent) =>
    torrent.state === status.torrent.checking ||
    torrent.state === status.torrent.queued ||
    torrent.state === status.torrent.paused ||
    torrent.state === status.torrent.seeding;

const getStateEtaTooltip = (torrent: Torrent, t: TFunction) => {
    if (torrent.state === status.torrent.checking) {
        return t("labels.status.torrent.checking");
    }
    if (torrent.state === status.torrent.queued) {
        return t("labels.status.torrent.queued");
    }
    if (torrent.state === status.torrent.paused) {
        return t("labels.status.torrent.paused");
    }
    if (torrent.state === status.torrent.seeding) {
        return t("labels.status.torrent.seeding");
    }
    return null;
};

const hasCredibleEta = (torrent: Torrent) =>
    torrent.state === status.torrent.downloading &&
    Number.isFinite(torrent.eta) &&
    torrent.eta >= 0 &&
    torrent.eta < ETA_DISPLAY.max_seconds &&
    torrent.speed.down > ETA_DISPLAY.min_credible_rate_bps;

const formatEtaDurationLabel = (seconds: number, t: TFunction) => {
    if (seconds < 60) {
        return t("table.eta_less_than_minute");
    }
    if (seconds < 3600) {
        return `${Math.floor(seconds / 60)}m`;
    }
    return formatTime(seconds);
};

export const getTorrentEtaSortValue = (torrent: Torrent) =>
    hasCredibleEta(torrent) ? torrent.eta : Number.MAX_SAFE_INTEGER;

const getUnavailableEtaDisplay = (torrent: Torrent, t: TFunction) => {
    const stateTooltip = getStateEtaTooltip(torrent, t);
    if (isEtaOmittedByState(torrent)) {
        return {
            value: "-",
            tooltip: stateTooltip ?? t("table.eta_unknown"),
        } as const;
    }

    if (!hasCredibleEta(torrent)) {
        return {
            value: t("table.eta_unknown"),
            tooltip: t("table.eta_unknown"),
        } as const;
    }

    return null;
};

export const getTorrentEtaDisplay = (torrent: Torrent, t: TFunction) => {
    const unavailable = getUnavailableEtaDisplay(torrent, t);
    if (unavailable) {
        return unavailable;
    }

    const relativeLabel = formatEtaDurationLabel(torrent.eta, t);
    return {
        value: formatEtaAbsolute(torrent.eta),
        tooltip: t("table.eta", { time: relativeLabel }),
    } as const;
};

export const getTorrentEtaTableDisplay = (torrent: Torrent, t: TFunction) => {
    const unavailable = getUnavailableEtaDisplay(torrent, t);
    if (unavailable) {
        return unavailable;
    }

    const absoluteLabel = formatEtaAbsolute(torrent.eta);
    return {
        value: formatEtaDurationLabel(torrent.eta, t),
        tooltip: t("table.eta", { time: absoluteLabel }),
    } as const;
};
