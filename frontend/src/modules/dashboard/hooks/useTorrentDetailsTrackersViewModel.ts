import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TorrentTrackerEntity } from "@/services/rpc/entities";
import type { TorrentDispatchOutcome } from "@/app/actions/torrentDispatch";

type TrackerMutationOutcome = Pick<TorrentDispatchOutcome, "status">;

interface UseTorrentDetailsTrackersViewModelParams {
    targetIds: Array<string | number>;
    scope: "inspected" | "selection";
    trackers: TorrentTrackerEntity[];
    emptyMessage: string;
    serverTime?: number;
    addTrackers: (
        targetIds: Array<string | number>,
        trackers: string[],
    ) => Promise<TrackerMutationOutcome>;
    replaceTrackers: (
        targetIds: Array<string | number>,
        trackers: string[],
    ) => Promise<TrackerMutationOutcome>;
    removeTrackers: (
        targetIds: Array<string | number>,
        trackerIds: number[],
    ) => Promise<TrackerMutationOutcome>;
}

type TrackerStatusTone = "pending" | "online" | "partial";

export interface TrackerRowViewModel {
    key: string;
    announce: string;
    trackerId: number | null;
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
        isMutating: boolean;
        scope: "inspected" | "selection";
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
        replaceLabel: string;
        removeLabel: string;
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
        submitReplace: () => void;
        removeTracker: (row: TrackerRowViewModel) => void;
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

const toTrackerIdentity = (tracker: TorrentTrackerEntity) =>
    `${String(tracker.id ?? "")}|${tracker.announce}`;

const parseTrackersInput = (value: string) => {
    const seen = new Set<string>();
    const parsed: string[] = [];
    value
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .forEach((line) => {
            if (seen.has(line)) return;
            seen.add(line);
            parsed.push(line);
        });
    return parsed;
};

const buildOptimisticTracker = (
    announce: string,
    idSeed: number,
): TorrentTrackerEntity => ({
    id: idSeed,
    announce,
    tier: 0,
    announceState: 0,
    lastAnnounceTime: 0,
    lastAnnounceResult: "",
    lastAnnounceSucceeded: false,
    lastScrapeTime: 0,
    lastScrapeResult: "",
    lastScrapeSucceeded: false,
    seederCount: NaN,
    leecherCount: NaN,
    scrapeState: 0,
});

export const useTorrentDetailsTrackersViewModel = ({
    targetIds,
    scope,
    trackers,
    emptyMessage,
    serverTime,
    addTrackers,
    replaceTrackers,
    removeTrackers,
}: UseTorrentDetailsTrackersViewModelParams): TorrentDetailsTrackersViewModel => {
    const { t } = useTranslation();
    const [showAdd, setShowAdd] = useState(false);
    const [newTrackers, setNewTrackers] = useState("");
    const [isMutating, setIsMutating] = useState(false);
    const [optimisticTrackers, setOptimisticTrackers] = useState<
        TorrentTrackerEntity[] | null
    >(null);

    const unknownLabel = t("labels.unknown");
    const safeTrackers = useMemo(() => trackers ?? [], [trackers]);
    const visibleTrackers = optimisticTrackers ?? safeTrackers;
    const isEmpty = visibleTrackers.length === 0;

    const executeMutation = useCallback(
        async (
            nextTrackers: TorrentTrackerEntity[],
            mutate: () => Promise<TrackerMutationOutcome>,
        ) => {
            setOptimisticTrackers(nextTrackers);
            setIsMutating(true);
            try {
                await mutate();
                setOptimisticTrackers(null);
            } catch {
                setOptimisticTrackers(null);
            } finally {
                setIsMutating(false);
            }
        },
        [],
    );

    const rows = useMemo<TrackerRowViewModel[]>(
        () =>
            visibleTrackers.map((tracker, index) => {
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
                    Number.isFinite(Number(tracker.seederCount))
                        ? String(tracker.seederCount)
                        : unknownLabel;
                const leechers =
                    Number.isFinite(Number(tracker.leecherCount))
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
                    announce: tracker.announce,
                    trackerId:
                        typeof tracker.id === "number" && Number.isFinite(tracker.id)
                            ? tracker.id
                            : null,
                    hostname,
                    nextAnnounceLabel: formatCountdown(nextAnnounceSeconds),
                    peersLabel,
                    statusLabel,
                    statusTone,
                    isOnlineIndicator,
                };
            }),
        [visibleTrackers, unknownLabel, serverTime, t]
    );

    const closeAdd = useCallback(() => {
        setShowAdd(false);
    }, []);

    const toggleAdd = useCallback(() => {
        setShowAdd((previous) => !previous);
    }, []);

    const submitAdd = useCallback(() => {
        const newTrackerUrls = parseTrackersInput(newTrackers);
        if (!newTrackerUrls.length || !targetIds.length || isMutating) return;
        const existingTrackerUrls = new Set(
            visibleTrackers.map((tracker) => tracker.announce),
        );
        const trackersToAdd = newTrackerUrls.filter(
            (trackerUrl) => !existingTrackerUrls.has(trackerUrl),
        );
        if (!trackersToAdd.length) {
            setShowAdd(false);
            setNewTrackers("");
            return;
        }

        const nowSeed = Date.now() * -1;
        const nextTrackers = [
            ...visibleTrackers,
            ...trackersToAdd.map((announce, index) =>
                buildOptimisticTracker(announce, nowSeed - index),
            ),
        ];
        setShowAdd(false);
        setNewTrackers("");
        void executeMutation(nextTrackers, () =>
            addTrackers(targetIds, trackersToAdd),
        );
    }, [
        addTrackers,
        executeMutation,
        isMutating,
        newTrackers,
        targetIds,
        visibleTrackers,
    ]);

    const submitReplace = useCallback(() => {
        const replacementTrackers = parseTrackersInput(newTrackers);
        if (!targetIds.length || isMutating || !replacementTrackers.length) return;

        const nowSeed = Date.now() * -1;
        const nextTrackers = replacementTrackers.map((announce, index) =>
            buildOptimisticTracker(announce, nowSeed - index),
        );

        setShowAdd(false);
        setNewTrackers("");
        void executeMutation(nextTrackers, () =>
            replaceTrackers(targetIds, replacementTrackers),
        );
    }, [
        executeMutation,
        isMutating,
        newTrackers,
        replaceTrackers,
        targetIds,
    ]);

    const removeTracker = useCallback(
        (row: TrackerRowViewModel) => {
            const trackerId = row.trackerId;
            if (isMutating || !targetIds.length || trackerId == null) return;
            const nextTrackers = visibleTrackers.filter(
                (tracker) =>
                    toTrackerIdentity(tracker) !== `${trackerId}|${row.announce}`,
            );
            void executeMutation(nextTrackers, () =>
                removeTrackers(targetIds, [trackerId]),
            );
        },
        [executeMutation, isMutating, removeTrackers, targetIds, visibleTrackers],
    );

    return {
        state: {
            isEmpty,
            showAdd,
            newTrackers,
            isMutating,
            scope,
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
            cancelLabel: t("toolbar.close"),
            addLabel: t("torrent_modal.trackers.add_action"),
            replaceLabel: t("torrent_modal.trackers.replace_action"),
            removeLabel: t("torrent_modal.trackers.remove_action"),
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
            submitReplace,
            removeTracker,
        },
    };
};
