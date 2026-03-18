import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type KeyboardEvent as ReactKeyboardEvent,
    type MouseEvent as ReactMouseEvent,
    type RefObject,
} from "react";
import { useTranslation } from "react-i18next";
import {
    getCoreRowModel,
    getSortedRowModel,
    type ColumnDef,
    type HeaderGroup,
    type SortingState,
    useReactTable,
} from "@tanstack/react-table";
import useLayoutMetrics from "@/shared/hooks/useLayoutMetrics";
import { normalizeTrackerInputText, normalizeTrackerUrls, serializeTrackerList } from "@/shared/domain/trackers";
import type { TorrentTrackerEntity } from "@/services/rpc/entities";
import type { TorrentDispatchOutcome } from "@/app/actions/torrentDispatch";
import { useTorrentClipboard } from "@/modules/dashboard/hooks/useTorrentClipboard";
import { formatRelativeTime } from "@/shared/utils/format";

type TrackerMutationOutcome = Pick<TorrentDispatchOutcome, "status">;
type TrackerStatusTone = "neutral" | "success" | "warning" | "danger";
type TrackerContextAction = "edit" | "remove" | "copy_url" | "copy_host" | "copy_all" | "reannounce";

interface TrackerContextMenuState {
    rowKey: string;
    x: number;
    y: number;
}

interface EditorState {
    isOpen: boolean;
    mode: "add" | "edit";
    targetRowKey: string | null;
    value: string;
    error: string | null;
}

interface UseTorrentDetailsTrackersViewModelParams {
    torrentId: string | number | null;
    torrentName: string;
    trackers: TorrentTrackerEntity[];
    emptyMessage: string;
    listRef: RefObject<HTMLDivElement | null>;
    addTrackers: (trackers: string[]) => Promise<TrackerMutationOutcome>;
    removeTrackers: (trackerIds: number[]) => Promise<TrackerMutationOutcome>;
    setTrackerList: (trackerList: string) => Promise<TrackerMutationOutcome>;
    reannounce: () => Promise<TrackerMutationOutcome>;
}

interface TrackerRuntimeRow {
    key: string;
    originalIndex: number;
    trackerId: number | null;
    announce: string;
    host: string;
    tier: number;
    removable: boolean;
    seederCount?: number;
    leecherCount?: number;
    downloadCount?: number;
    downloaderCount?: number;
    lastAnnounceTime?: number;
    nextAnnounceTime?: number;
    statusTone: TrackerStatusTone;
    statusLabel: string;
    nextAnnounceLabel: string;
    messageText: string;
    lastAnnounceTooltip: string;
    nextAnnounceTooltip: string;
    messageTooltip: string;
}

export interface TrackerRowViewModel extends TrackerRuntimeRow {
    index: number;
    selected: boolean;
    tierLabel: string;
    seedsLabel: string;
    leechesLabel: string;
    downloadCountLabel: string;
    downloadersLabel: string;
    lastAnnounceLabel: string;
}

export interface TorrentDetailsTrackersViewModel {
    state: {
        isEmpty: boolean;
        isMutating: boolean;
        editor: EditorState;
        contextMenu: TrackerContextMenuState | null;
        selectedCount: number;
        canRemove: boolean;
        canEdit: boolean;
        canCopySelection: boolean;
    };
    labels: {
        emptyMessage: string;
        addLabel: string;
        editLabel: string;
        removeLabel: string;
        removeManyLabel: string;
        reannounceLabel: string;
        copyAllLabel: string;
        copyUrlLabel: string;
        copyHostLabel: string;
        selectionSummary: string;
        modalTitle: string;
        modalPlaceholder: string;
        modalFieldLabel: string;
    };
    table: {
        headerGroups: HeaderGroup<TrackerRuntimeRow>[];
    };
    data: {
        rows: TrackerRowViewModel[];
    };
    refs: {
        trackerInputRef: RefObject<HTMLTextAreaElement | null>;
    };
    actions: {
        openAddModal: () => void;
        openEditModal: () => void;
        closeEditor: () => void;
        setEditorValue: (value: string) => void;
        submitEditor: () => Promise<void>;
        removeSelected: () => Promise<void>;
        reannounceTorrent: () => Promise<void>;
        copyAllTrackers: () => Promise<void>;
        handleRowClick: (event: ReactMouseEvent<HTMLElement>, rowKey: string, index: number) => void;
        openContextMenu: (event: ReactMouseEvent<HTMLElement>, rowKey: string, index: number) => void;
        closeContextMenu: () => void;
        runContextAction: (action: TrackerContextAction) => Promise<void>;
        handleListKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => void;
    };
}

const EMPTY_EDITOR: EditorState = {
    isOpen: false,
    mode: "add",
    targetRowKey: null,
    value: "",
    error: null,
};

const formatDateTime = (timestamp?: number) => {
    if (!timestamp || timestamp <= 0) {
        return "-";
    }
    return new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    }).format(new Date(timestamp * 1000));
};

const formatMetric = (value?: number) =>
    typeof value === "number" && Number.isFinite(value) && value >= 0 ? String(value) : "-";


const parseTrackerHost = (tracker: Pick<TorrentTrackerEntity, "announce" | "host" | "sitename">, fallback: string) => {
    try {
        return new URL(tracker.announce).hostname || tracker.host || tracker.sitename || fallback;
    } catch {
        return tracker.host || tracker.sitename || tracker.announce || fallback;
    }
};

const compareNumbersAscending = (left: number | undefined, right: number | undefined) => {
    const leftFinite = typeof left === "number" && Number.isFinite(left);
    const rightFinite = typeof right === "number" && Number.isFinite(right);

    if (!leftFinite && !rightFinite) {
        return 0;
    }
    if (!leftFinite) {
        return 1;
    }
    if (!rightFinite) {
        return -1;
    }
    return left - right;
};

const compareStringsAscending = (left: string, right: string) =>
    left.localeCompare(right, undefined, {
        sensitivity: "base",
    });

const compareTrackerFallback = (left: TrackerRuntimeRow, right: TrackerRuntimeRow) =>
    compareStringsAscending(left.announce, right.announce) ||
    compareNumbersAscending(left.tier, right.tier) ||
    left.originalIndex - right.originalIndex;

const deriveTrackerStatus = (tracker: TorrentTrackerEntity, t: ReturnType<typeof useTranslation>["t"]) => {
    // Contract:
    // success => green, timed out/failed => red,
    // active/queued/waiting/inactive backup => yellow,
    // never announced => gray.
    const hasAnnounced = tracker.hasAnnounced ?? tracker.lastAnnounceTime > 0;
    const lastResult = tracker.lastAnnounceResult.trim();

    if (tracker.lastAnnounceTimedOut) {
        return {
            tone: "danger" as const,
            statusLabel: t("torrent_modal.trackers.status_timeout"),
            messageText: lastResult || t("torrent_modal.trackers.reannounce_timeout"),
        };
    }
    if (hasAnnounced && tracker.lastAnnounceSucceeded === false) {
        return {
            tone: "danger" as const,
            statusLabel: t("torrent_modal.trackers.status_error"),
            messageText: lastResult || t("torrent_modal.trackers.message_error"),
        };
    }
    if (tracker.announceState === 3) {
        return {
            tone: "warning" as const,
            statusLabel: t("torrent_modal.trackers.status_announcing"),
            messageText: t("torrent_modal.trackers.message_announcing"),
        };
    }
    if (tracker.announceState === 2) {
        return {
            tone: "warning" as const,
            statusLabel: t("torrent_modal.trackers.status_queued"),
            messageText: t("torrent_modal.trackers.message_queued"),
        };
    }
    if (tracker.announceState === 1) {
        return {
            tone: "warning" as const,
            statusLabel: t("torrent_modal.trackers.status_waiting"),
            messageText: t("torrent_modal.trackers.message_waiting"),
        };
    }
    if (tracker.isBackup) {
        return {
            tone: "warning" as const,
            statusLabel: t("torrent_modal.trackers.status_backup"),
            messageText: t("torrent_modal.trackers.message_backup"),
        };
    }
    if (hasAnnounced && tracker.lastAnnounceSucceeded) {
        return {
            tone: "success" as const,
            statusLabel: t("torrent_modal.trackers.status_working"),
            messageText: lastResult || t("torrent_modal.trackers.reannounce_completed"),
        };
    }
    return {
        tone: "neutral" as const,
        statusLabel: t("torrent_modal.trackers.status_not_contacted"),
        messageText: t("torrent_modal.trackers.message_not_contacted"),
    };
};

const createTrackerColumns = (t: ReturnType<typeof useTranslation>["t"]): ColumnDef<TrackerRuntimeRow>[] => [
    {
        id: "status",
        header: t("torrent_modal.trackers.status"),
        enableSorting: false,
        accessorFn: (row) => row.statusLabel,
    },
    {
        id: "tracker",
        header: t("torrent_modal.trackers.tracker"),
        accessorFn: (row) => row.announce,
        sortingFn: (left, right) =>
            compareStringsAscending(left.original.announce, right.original.announce) ||
            compareNumbersAscending(left.original.tier, right.original.tier) ||
            left.original.originalIndex - right.original.originalIndex,
    },
    {
        id: "tier",
        header: t("torrent_modal.trackers.tier"),
        accessorFn: (row) => row.tier,
        sortingFn: (left, right) =>
            compareNumbersAscending(left.original.tier, right.original.tier) ||
            compareTrackerFallback(left.original, right.original),
    },
    {
        id: "seeders",
        header: t("torrent_modal.trackers.seeds"),
        accessorFn: (row) => row.seederCount,
        sortingFn: (left, right) =>
            compareNumbersAscending(left.original.seederCount, right.original.seederCount) ||
            compareTrackerFallback(left.original, right.original),
    },
    {
        id: "leechers",
        header: t("torrent_modal.trackers.leeches"),
        accessorFn: (row) => row.leecherCount,
        sortingFn: (left, right) =>
            compareNumbersAscending(left.original.leecherCount, right.original.leecherCount) ||
            compareTrackerFallback(left.original, right.original),
    },
    {
        id: "downloadedCount",
        header: t("torrent_modal.trackers.downloaded_count"),
        accessorFn: (row) => row.downloadCount,
        sortingFn: (left, right) =>
            compareNumbersAscending(left.original.downloadCount, right.original.downloadCount) ||
            compareTrackerFallback(left.original, right.original),
    },
    {
        id: "downloaders",
        header: t("torrent_modal.trackers.downloaders"),
        accessorFn: (row) => row.downloaderCount,
        sortingFn: (left, right) =>
            compareNumbersAscending(left.original.downloaderCount, right.original.downloaderCount) ||
            compareTrackerFallback(left.original, right.original),
    },
    {
        id: "lastAnnounce",
        header: t("torrent_modal.trackers.last_announce"),
        accessorFn: (row) => row.lastAnnounceTime,
        sortingFn: (left, right) =>
            compareNumbersAscending(left.original.lastAnnounceTime, right.original.lastAnnounceTime) ||
            compareTrackerFallback(left.original, right.original),
    },
    {
        id: "nextAnnounce",
        header: t("torrent_modal.trackers.next_announce"),
        accessorFn: (row) => row.nextAnnounceTime,
        sortingFn: (left, right) =>
            compareNumbersAscending(left.original.nextAnnounceTime, right.original.nextAnnounceTime) ||
            compareTrackerFallback(left.original, right.original),
    },
    {
        id: "message",
        header: t("torrent_modal.trackers.message"),
        enableSorting: false,
        accessorFn: (row) => row.messageText,
    },
];

export const useTorrentDetailsTrackersViewModel = ({
    torrentId,
    torrentName,
    trackers,
    emptyMessage,
    listRef,
    addTrackers,
    removeTrackers,
    setTrackerList,
    reannounce,
}: UseTorrentDetailsTrackersViewModelParams): TorrentDetailsTrackersViewModel => {
    const { t } = useTranslation();
    const { copyToClipboard } = useTorrentClipboard();
    const { rowHeight, fileContextMenuMargin, fileContextMenuWidth } = useLayoutMetrics();
    const [sorting, setSorting] = useState<SortingState>([{ id: "tier", desc: false }]);
    const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
    const [anchorKey, setAnchorKey] = useState<string | null>(null);
    const [isMutating, setIsMutating] = useState(false);
    const [editor, setEditor] = useState<EditorState>(EMPTY_EDITOR);
    const [contextMenu, setContextMenu] = useState<TrackerContextMenuState | null>(null);
    const trackerInputRef = useRef<HTMLTextAreaElement | null>(null);

    const safeTrackers = useMemo(() => trackers ?? [], [trackers]);
    const isEmpty = safeTrackers.length === 0;
    const unknownLabel = t("labels.unknown");
    const selectedKeySet = useMemo(() => new Set(selectedKeys), [selectedKeys]);

    const baseRows = useMemo<TrackerRuntimeRow[]>(
        () =>
            safeTrackers.map((tracker, originalIndex) => {
                const key = `${String(tracker.id ?? `${tracker.tier}-${originalIndex}`)}|${tracker.announce}`;
                const status = deriveTrackerStatus(tracker, t);
                const lastAnnounceTime =
                    typeof tracker.lastAnnounceTime === "number" && tracker.lastAnnounceTime > 0
                        ? tracker.lastAnnounceTime
                        : undefined;
                const nextAnnounceTime =
                    typeof tracker.nextAnnounceTime === "number" && tracker.nextAnnounceTime > 0
                        ? tracker.nextAnnounceTime
                        : undefined;

                let nextAnnounceLabel = "-";
                let nextAnnounceTooltip = t("torrent_modal.trackers.message_not_scheduled");
                if (tracker.announceState === 3) {
                    nextAnnounceLabel = t("torrent_modal.trackers.message_announcing");
                    nextAnnounceTooltip = nextAnnounceLabel;
                } else if (nextAnnounceTime) {
                    nextAnnounceLabel = formatRelativeTime(nextAnnounceTime);
                    nextAnnounceTooltip = formatDateTime(nextAnnounceTime);
                } else if (tracker.isBackup) {
                    nextAnnounceLabel = t("torrent_modal.trackers.message_backup");
                    nextAnnounceTooltip = nextAnnounceLabel;
                }

                return {
                    key,
                    originalIndex,
                    trackerId: typeof tracker.id === "number" && Number.isFinite(tracker.id) ? tracker.id : null,
                    announce: tracker.announce,
                    host: parseTrackerHost(tracker, unknownLabel),
                    tier: tracker.tier,
                    removable: typeof tracker.id === "number" && Number.isFinite(tracker.id),
                    seederCount:
                        typeof tracker.seederCount === "number" && Number.isFinite(tracker.seederCount)
                            ? tracker.seederCount
                            : undefined,
                    leecherCount:
                        typeof tracker.leecherCount === "number" && Number.isFinite(tracker.leecherCount)
                            ? tracker.leecherCount
                            : undefined,
                    downloadCount:
                        typeof tracker.downloadCount === "number" && Number.isFinite(tracker.downloadCount)
                            ? tracker.downloadCount
                            : undefined,
                    downloaderCount:
                        typeof tracker.downloaderCount === "number" && Number.isFinite(tracker.downloaderCount)
                            ? tracker.downloaderCount
                            : undefined,
                    lastAnnounceTime,
                    nextAnnounceTime,
                    statusTone: status.tone,
                    statusLabel: status.statusLabel,
                    nextAnnounceLabel,
                    messageText: status.messageText,
                    lastAnnounceTooltip: formatDateTime(lastAnnounceTime),
                    nextAnnounceTooltip,
                    messageTooltip: status.messageText,
                };
            }),
        [safeTrackers, t, unknownLabel],
    );

    const columns = useMemo(() => createTrackerColumns(t), [t]);

    const table = useReactTable({
        data: baseRows,
        columns,
        getRowId: (row) => row.key,
        state: { sorting },
        onSortingChange: setSorting,
        enableSortingRemoval: false,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
    });

    const rows: TrackerRowViewModel[] = useMemo(
        () =>
            table.getRowModel().rows.map((row) => ({
                ...row.original,
                index: row.index,
                selected: selectedKeySet.has(row.id),
                tierLabel: String(row.original.tier),
                seedsLabel: formatMetric(row.original.seederCount),
                leechesLabel: formatMetric(row.original.leecherCount),
                downloadCountLabel: formatMetric(row.original.downloadCount),
                downloadersLabel: formatMetric(row.original.downloaderCount),
                lastAnnounceLabel: row.original.lastAnnounceTime
                    ? formatRelativeTime(row.original.lastAnnounceTime)
                    : "-",
            })),
        [selectedKeySet, table],
    );

    useEffect(() => {
        setSelectedKeys([]);
        setAnchorKey(null);
        setContextMenu(null);
        setEditor(EMPTY_EDITOR);
    }, [torrentId]);

    useEffect(() => {
        const nextSelected = selectedKeys.filter((key) => rows.some((row) => row.key === key));
        if (nextSelected.length !== selectedKeys.length) {
            setSelectedKeys(nextSelected);
        }
        if (anchorKey && !rows.some((row) => row.key === anchorKey)) {
            setAnchorKey(null);
        }
    }, [anchorKey, rows, selectedKeys]);

    const selectedRows = useMemo(() => rows.filter((row) => selectedKeySet.has(row.key)), [rows, selectedKeySet]);
    const activeRow = useMemo(() => {
        if (anchorKey) {
            return rows.find((row) => row.key === anchorKey) ?? null;
        }
        return selectedRows[0] ?? null;
    }, [anchorKey, rows, selectedRows]);
    const activeEditableRow = useMemo(() => {
        if (selectedRows.length !== 1) {
            return null;
        }
        return activeRow;
    }, [activeRow, selectedRows.length]);
    const selectedRemovableIds = useMemo(
        () =>
            selectedRows.filter((row) => row.removable && row.trackerId != null).map((row) => row.trackerId as number),
        [selectedRows],
    );

    const getRowByKey = useCallback((rowKey: string) => rows.find((row) => row.key === rowKey) ?? null, [rows]);

    const getAnchorIndex = useCallback(() => {
        if (!anchorKey) {
            return -1;
        }
        return rows.findIndex((row) => row.key === anchorKey);
    }, [anchorKey, rows]);

    const selectOnly = useCallback((rowKey: string) => {
        setSelectedKeys([rowKey]);
        setAnchorKey(rowKey);
    }, []);

    const toggleSelection = useCallback((rowKey: string) => {
        setSelectedKeys((current) => {
            const next = new Set(current);
            if (next.has(rowKey)) {
                next.delete(rowKey);
            } else {
                next.add(rowKey);
            }
            return Array.from(next);
        });
        setAnchorKey(rowKey);
    }, []);

    const selectRange = useCallback(
        (rowKey: string, index: number) => {
            const anchorIndex = getAnchorIndex();
            if (anchorIndex < 0) {
                selectOnly(rowKey);
                return;
            }
            const start = Math.min(anchorIndex, index);
            const end = Math.max(anchorIndex, index);
            setSelectedKeys(rows.slice(start, end + 1).map((row) => row.key));
        },
        [getAnchorIndex, rows, selectOnly],
    );

    const openAddModal = useCallback(() => {
        setEditor({
            isOpen: true,
            mode: "add",
            targetRowKey: null,
            value: "",
            error: null,
        });
        setContextMenu(null);
    }, []);

    const openEditModal = useCallback(() => {
        if (!activeEditableRow) {
            return;
        }
        setEditor({
            isOpen: true,
            mode: "edit",
            targetRowKey: activeEditableRow.key,
            value: activeEditableRow.announce,
            error: null,
        });
        setContextMenu(null);
    }, [activeEditableRow]);

    const closeEditor = useCallback(() => {
        if (isMutating) {
            return;
        }
        setEditor(EMPTY_EDITOR);
    }, [isMutating]);

    const closeContextMenu = useCallback(() => {
        setContextMenu(null);
    }, []);

    useEffect(() => {
        window.addEventListener("pointerdown", closeContextMenu);
        return () => window.removeEventListener("pointerdown", closeContextMenu);
    }, [closeContextMenu]);

    useEffect(() => {
        if (!editor.isOpen) {
            return;
        }
        const frame = window.requestAnimationFrame(() => {
            trackerInputRef.current?.focus();
            trackerInputRef.current?.select();
        });
        return () => window.cancelAnimationFrame(frame);
    }, [editor.isOpen]);

    const executeMutation = useCallback(
        async (mutation: () => Promise<TrackerMutationOutcome>) => {
            setIsMutating(true);
            try {
                return await mutation();
            } finally {
                setIsMutating(false);
            }
        },
        [],
    );

    const removeSelected = useCallback(async () => {
        if (!selectedRemovableIds.length || isMutating) {
            return;
        }
        setContextMenu(null);
        const outcome = await executeMutation(() =>
            removeTrackers(selectedRemovableIds),
        );
        if (outcome.status === "applied") {
            setSelectedKeys([]);
        }
    }, [executeMutation, isMutating, removeTrackers, selectedRemovableIds]);

    const reannounceTorrent = useCallback(async () => {
        if (isMutating) {
            return;
        }
        setContextMenu(null);
        await executeMutation(reannounce);
    }, [executeMutation, isMutating, reannounce]);

    const copyAllTrackers = useCallback(async () => {
        await copyToClipboard(serializeTrackerList(safeTrackers));
        setContextMenu(null);
    }, [copyToClipboard, safeTrackers]);

    const setEditorError = useCallback(
        (error: string) => {
            setEditor((current) => ({
                ...current,
                error,
            }));
        },
        [],
    );

    const findEditableTrackerIndex = useCallback(
        (targetRow: TrackerRowViewModel) => {
            if (targetRow.trackerId != null) {
                const trackerId = targetRow.trackerId;
                const trackerIndex = safeTrackers.findIndex(
                    (tracker) => tracker.id === trackerId,
                );
                if (trackerIndex >= 0) {
                    return trackerIndex;
                }
            }

            return safeTrackers.findIndex(
                (tracker, index) =>
                    index === targetRow.originalIndex &&
                    tracker.announce === targetRow.announce,
            );
        },
        [safeTrackers],
    );

    const submitAddTrackers = useCallback(
        async (normalized: string[]) => {
            const existing = new Set(
                normalizeTrackerUrls(
                    safeTrackers.map((tracker) => tracker.announce),
                ),
            );
            const nextTrackers = normalized.filter(
                (tracker) => !existing.has(tracker),
            );
            if (nextTrackers.length === 0) {
                setEditorError(t("torrent_modal.trackers.modal_no_new"));
                return;
            }

            const outcome = await executeMutation(() =>
                addTrackers(nextTrackers),
            );
            if (outcome.status === "applied") {
                setEditor(EMPTY_EDITOR);
                return;
            }
            setEditorError(t("toolbar.feedback.failed"));
        },
        [
            addTrackers,
            executeMutation,
            safeTrackers,
            setEditorError,
            t,
        ],
    );

    const submitEditedTracker = useCallback(
        async (normalized: string[]) => {
            if (normalized.length !== 1) {
                setEditorError(t("torrent_modal.trackers.edit_modal_single"));
                return;
            }

            const targetRow = editor.targetRowKey
                ? getRowByKey(editor.targetRowKey)
                : activeEditableRow;
            if (!targetRow) {
                setEditorError(t("torrent_modal.trackers.selection_none"));
                return;
            }

            const nextAnnounce = normalized[0];
            if (nextAnnounce === targetRow.announce) {
                setEditor(EMPTY_EDITOR);
                return;
            }

            const duplicateExists = normalizeTrackerUrls(
                baseRows
                    .filter((row) => row.key !== targetRow.key)
                    .map((row) => row.announce),
            ).includes(nextAnnounce);
            if (duplicateExists) {
                setEditorError(
                    t("torrent_modal.trackers.edit_modal_duplicate"),
                );
                return;
            }

            const targetIndex = findEditableTrackerIndex(targetRow);
            if (targetIndex < 0) {
                setEditorError(t("torrent_modal.trackers.selection_none"));
                return;
            }

            const trackerList = serializeTrackerList(
                safeTrackers.map((tracker, index) =>
                    index === targetIndex
                        ? { ...tracker, announce: nextAnnounce }
                        : tracker,
                ),
            );
            const outcome = await executeMutation(() =>
                setTrackerList(trackerList),
            );
            if (outcome.status === "applied") {
                setEditor(EMPTY_EDITOR);
                return;
            }
            setEditorError(t("toolbar.feedback.failed"));
        },
        [
            activeEditableRow,
            baseRows,
            editor.targetRowKey,
            executeMutation,
            findEditableTrackerIndex,
            getRowByKey,
            safeTrackers,
            setEditorError,
            setTrackerList,
            t,
        ],
    );

    const submitEditor = useCallback(async () => {
        if (isMutating) {
            return;
        }

        const { normalized, invalid } = normalizeTrackerInputText(editor.value);
        if (invalid.length > 0) {
            setEditorError(
                t("torrent_modal.trackers.modal_invalid_url", {
                    value: invalid[0],
                }),
            );
            return;
        }

        if (normalized.length === 0) {
            setEditorError(t("torrent_modal.trackers.modal_empty"));
            return;
        }

        if (editor.mode === "edit") {
            await submitEditedTracker(normalized);
            return;
        }

        await submitAddTrackers(normalized);
    }, [
        editor.mode,
        editor.value,
        isMutating,
        setEditorError,
        submitAddTrackers,
        submitEditedTracker,
        t,
    ]);

    const copyActiveTrackerUrl = useCallback(async () => {
        if (!activeRow) {
            return;
        }
        await copyToClipboard(activeRow.announce);
    }, [activeRow, copyToClipboard]);

    const handleRowClick = useCallback(
        (event: ReactMouseEvent<HTMLElement>, rowKey: string, index: number) => {
            if (event.shiftKey) {
                selectRange(rowKey, index);
                return;
            }
            if (event.metaKey || event.ctrlKey) {
                toggleSelection(rowKey);
                return;
            }
            selectOnly(rowKey);
        },
        [selectOnly, selectRange, toggleSelection],
    );

    const openContextMenu = useCallback(
        (event: ReactMouseEvent<HTMLElement>, rowKey: string, index: number) => {
            event.preventDefault();
            if (!selectedKeySet.has(rowKey)) {
                selectOnly(rowKey);
            } else {
                setAnchorKey(rowKey);
            }

            const rect = listRef.current?.getBoundingClientRect();
            if (!rect) {
                return;
            }
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;
            const margin = fileContextMenuMargin;
            const menuWidth = fileContextMenuWidth || 220;
            const estimatedMenuHeight = (rowHeight || 34) * 7;
            const boundedX = Math.min(Math.max(x, margin), rect.width - menuWidth - margin);
            const maxY = Math.max(margin, rect.height - estimatedMenuHeight - margin);
            const boundedY = Math.min(Math.max(y, margin), maxY);
            setContextMenu({ rowKey, x: boundedX, y: boundedY });
            setAnchorKey(rows[index]?.key ?? rowKey);
        },
        [fileContextMenuMargin, fileContextMenuWidth, listRef, rowHeight, rows, selectOnly, selectedKeySet],
    );

    const runContextAction = useCallback(
        async (action: TrackerContextAction) => {
            const row = contextMenu ? getRowByKey(contextMenu.rowKey) : null;
            if (action === "copy_all") {
                await copyAllTrackers();
                return;
            }
            if (!row) {
                return;
            }
            if (action === "copy_url") {
                await copyToClipboard(row.announce);
                setContextMenu(null);
                return;
            }
            if (action === "edit") {
                openEditModal();
                return;
            }
            if (action === "copy_host") {
                await copyToClipboard(row.host);
                setContextMenu(null);
                return;
            }
            if (action === "remove") {
                await removeSelected();
                return;
            }
            await reannounceTorrent();
        },
        [contextMenu, copyAllTrackers, copyToClipboard, getRowByKey, openEditModal, reannounceTorrent, removeSelected],
    );

    const handleListKeyDown = useCallback(
        (event: ReactKeyboardEvent<HTMLDivElement>) => {
            if (event.key === "Delete") {
                event.preventDefault();
                void removeSelected();
                return;
            }
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c") {
                event.preventDefault();
                void copyActiveTrackerUrl();
                return;
            }
            if (event.key === "Enter") {
                return;
            }
            if (event.key === "Escape") {
                if (contextMenu) {
                    event.preventDefault();
                    setContextMenu(null);
                    return;
                }
                if (editor.isOpen) {
                    event.preventDefault();
                    closeEditor();
                }
            }
        },
        [closeEditor, contextMenu, copyActiveTrackerUrl, editor.isOpen, removeSelected],
    );

    return {
        state: {
            isEmpty,
            isMutating,
            editor,
            contextMenu,
            selectedCount: selectedRows.length,
            canRemove: selectedRemovableIds.length > 0,
            canEdit: activeEditableRow != null,
            canCopySelection: activeRow != null,
        },
        labels: {
            emptyMessage,
            addLabel: t("torrent_modal.trackers.add_action"),
            editLabel: t("torrent_modal.trackers.edit_action"),
            removeLabel: t("torrent_modal.trackers.remove_action"),
            removeManyLabel: t("torrent_modal.trackers.remove_many_action"),
            reannounceLabel: t("torrent_modal.trackers.reannounce_action"),
            copyAllLabel: t("torrent_modal.trackers.copy_all_action"),
            copyUrlLabel: t("torrent_modal.trackers.copy_url_action"),
            copyHostLabel: t("torrent_modal.trackers.copy_host_action"),
            selectionSummary:
                selectedRows.length > 0
                    ? t("torrent_modal.trackers.selection_summary", {
                          count: selectedRows.length,
                      })
                    : t("torrent_modal.trackers.selection_none"),
            modalTitle: t(
                editor.mode === "edit"
                    ? "torrent_modal.trackers.edit_modal_title"
                    : "torrent_modal.trackers.add_modal_title",
                {
                    name: torrentName,
                },
            ),
            modalPlaceholder: t("torrent_modal.trackers.add_placeholder"),
            modalFieldLabel: t("torrent_modal.trackers.tracker"),
        },
        table: {
            headerGroups: table.getHeaderGroups(),
        },
        data: {
            rows,
        },
        actions: {
            openAddModal,
            openEditModal,
            closeEditor,
            setEditorValue: (value: string) =>
                setEditor((current) => ({
                    ...current,
                    value,
                    error: null,
                })),
            submitEditor,
            removeSelected,
            reannounceTorrent,
            copyAllTrackers,
            handleRowClick,
            openContextMenu,
            closeContextMenu,
            runContextAction,
            handleListKeyDown,
        },
        refs: {
            trackerInputRef,
        },
    };
};
