import type { TFunction } from "i18next";
import type { TorrentEntity as Torrent } from "@/services/rpc/entities";
import { status } from "@/shared/status";
import { formatEtaAbsolute, formatTime } from "@/shared/utils/format";

const hasMeaningfulEta = (torrent: Torrent) =>
    torrent.state !== status.torrent.checking &&
    torrent.state !== status.torrent.seeding &&
    torrent.eta >= 0;

export const getTorrentEtaSortValue = (torrent: Torrent) =>
    hasMeaningfulEta(torrent) ? torrent.eta : Number.MAX_SAFE_INTEGER;

const getUnavailableEtaDisplay = (torrent: Torrent, t: TFunction) => {
    if (torrent.state === status.torrent.checking) {
        return {
            value: "-",
            tooltip: t("labels.status.torrent.checking"),
        } as const;
    }

    if (torrent.state === status.torrent.seeding) {
        return {
            value: "-",
            tooltip: t("labels.status.torrent.seeding"),
        } as const;
    }

    if (torrent.eta < 0) {
        return {
            value: "-",
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

    const relativeLabel = formatTime(torrent.eta);
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
        value: formatTime(torrent.eta),
        tooltip: t("table.eta", { time: absoluteLabel }),
    } as const;
};
