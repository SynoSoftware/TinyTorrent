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

export const getTorrentEtaDisplay = (torrent: Torrent, t: TFunction) => {
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

    const relativeLabel = formatTime(torrent.eta);
    return {
        value: formatEtaAbsolute(torrent.eta),
        tooltip: t("table.eta", { time: relativeLabel }),
    } as const;
};
