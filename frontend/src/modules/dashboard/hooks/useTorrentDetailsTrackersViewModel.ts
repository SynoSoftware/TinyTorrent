import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TorrentTrackerEntity } from "@/services/rpc/entities";

interface UseTorrentDetailsTrackersViewModelParams {
    trackers: TorrentTrackerEntity[];
    emptyMessage: string;
    serverTime?: number;
}

type TrackerStatusTone = "pending" | "online" | "partial";

export interface TrackerRowViewModel {
    key: string;
    hostname: string;
    nextAnnounceLabel: string;
    peersLabel: string;
    statusLabel: string;
    statusTone: TrackerStatusTone;
    isOnlineIndicator: boolean;
}

export interface TorrentDetailsTrackersViewModel {
    state: {
        isEmpty: boolean;
        showAdd: boolean;
        newTrackers: string;
    };
    labels: {
        emptyMessage: string;
        title: string;
        hostnameHeader: string;
        nextAnnounceHeader: string;
        peersHeader: string;
        statusHeader: string;
        toggleAddAriaLabel: string;
        addTitle: string;
        addPlaceholder: string;
        cancelLabel: string;
        addLabel: string;
        unknownLabel: string;
    };
    data: {
        rows: TrackerRowViewModel[];
    };
    actions: {
        toggleAdd: () => void;
        closeAdd: () => void;
        setNewTrackers: (value: string) => void;
        submitAdd: () => void;
    };
}

const formatCountdown = (seconds: number) => {
    if (seconds <= 0) return "--:--";
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
};

const deriveHostname = (
    announce: string | undefined,
    unknownLabel: string
): string => {
    if (!announce) return unknownLabel;
    try {
        return new URL(announce).hostname;
    } catch {
        return announce || unknownLabel;
    }
};

export const useTorrentDetailsTrackersViewModel = ({
    trackers,
    emptyMessage,
    serverTime,
}: UseTorrentDetailsTrackersViewModelParams): TorrentDetailsTrackersViewModel => {
    const { t } = useTranslation();
    const [showAdd, setShowAdd] = useState(false);
    const [newTrackers, setNewTrackers] = useState("");

    const unknownLabel = t("labels.unknown");
    const safeTrackers = useMemo(() => trackers ?? [], [trackers]);
    const isEmpty = safeTrackers.length === 0;

    const rows = useMemo<TrackerRowViewModel[]>(
        () =>
            safeTrackers.map((tracker, index) => {
                const keyBase = tracker.id ?? `${tracker.announce}-${tracker.tier}`;
                const key = `${keyBase}-${index}`;
                const isOnlineIndicator = tracker.lastAnnounceSucceeded === true;
                const hostname = deriveHostname(tracker.announce, unknownLabel);

                let nextAnnounceSeconds = 0;
                if (tracker.lastAnnounceTime && typeof serverTime === "number") {
                    const now = serverTime;
                    const elapsed = Math.floor(now / 1000) - tracker.lastAnnounceTime;
                    nextAnnounceSeconds = Math.max(0, 1800 - elapsed);
                }

                const seeders =
                    tracker.seederCount != null
                        ? String(tracker.seederCount)
                        : unknownLabel;
                const leechers =
                    tracker.leecherCount != null
                        ? String(tracker.leecherCount)
                        : unknownLabel;
                const peersLabel = `${seeders} / ${leechers}`;

                const hasAttempt = tracker.lastAnnounceTime != null;
                const lastSucceeded = tracker.lastAnnounceSucceeded === true;

                let statusTone: TrackerStatusTone = "pending";
                let statusLabel = t("torrent_modal.trackers.status_pending");

                if (hasAttempt && lastSucceeded) {
                    statusTone = "online";
                    statusLabel = t("torrent_modal.trackers.status_online");
                } else if (hasAttempt && !lastSucceeded) {
                    statusTone = "partial";
                    statusLabel = t("torrent_modal.trackers.status_partial");
                }

                return {
                    key,
                    hostname,
                    nextAnnounceLabel: formatCountdown(nextAnnounceSeconds),
                    peersLabel,
                    statusLabel,
                    statusTone,
                    isOnlineIndicator,
                };
            }),
        [safeTrackers, unknownLabel, serverTime, t]
    );

    const closeAdd = useCallback(() => {
        setShowAdd(false);
    }, []);

    const toggleAdd = useCallback(() => {
        setShowAdd((previous) => !previous);
    }, []);

    const submitAdd = useCallback(() => {
        setShowAdd(false);
    }, []);

    return {
        state: {
            isEmpty,
            showAdd,
            newTrackers,
        },
        labels: {
            emptyMessage,
            title: t("torrent_modal.trackers.title"),
            hostnameHeader: t("torrent_modal.trackers.hostname"),
            nextAnnounceHeader: t("torrent_modal.trackers.next_announce"),
            peersHeader: t("torrent_modal.trackers.peers_label"),
            statusHeader: t("torrent_modal.trackers.status"),
            toggleAddAriaLabel: t("torrent_modal.trackers.toggle_add"),
            addTitle: t("torrent_modal.trackers.add"),
            addPlaceholder: t("torrent_modal.trackers.add_placeholder"),
            cancelLabel: t("common.cancel"),
            addLabel: t("common.add"),
            unknownLabel,
        },
        data: {
            rows,
        },
        actions: {
            toggleAdd,
            closeAdd,
            setNewTrackers,
            submitAdd,
        },
    };
};
