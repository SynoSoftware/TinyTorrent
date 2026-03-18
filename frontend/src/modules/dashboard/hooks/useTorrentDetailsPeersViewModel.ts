import {
    useCallback,
    useEffect,
    useMemo,
    useState,
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
import { useVirtualizer } from "@tanstack/react-virtual";
import { registry } from "@/config/logic";
import useLayoutMetrics from "@/shared/hooks/useLayoutMetrics";
import { formatBytes, formatPercent, formatSpeed } from "@/shared/utils/format";
import type { TorrentPeerEntity } from "@/services/rpc/entities";
import type { PeerContextAction } from "@/modules/dashboard/types/contracts";
import { useTorrentClipboard } from "@/modules/dashboard/hooks/useTorrentClipboard";

const { layout } = registry;

type PeerContextMenuState = {
    peer: TorrentPeerEntity;
    x: number;
    y: number;
};

type PeerRuntimeRow = {
    key: string;
    originalIndex: number;
    peer: TorrentPeerEntity;
    address: string;
    port: number;
    connectionLabel: string;
    connectionDirection: "incoming" | "outgoing";
    connectionEncrypted: boolean;
    connectionTooltip: string;
    stateLabel: string;
    stateTooltip: string;
    clientLabel: string;
    progressValue: number;
    progressLabel: string;
    downRateValue: number | undefined;
    downRateLabel: string;
    upRateValue: number | undefined;
    upRateLabel: string;
    downloadedValue: number | undefined;
    downloadedLabel: string;
    uploadedValue: number | undefined;
    uploadedLabel: string;
};

export type PeerRowViewModel = PeerRuntimeRow & {
    index: number;
    start: number;
    size: number;
};

export interface TorrentDetailsPeersViewModel {
    state: {
        isEmpty: boolean;
        contextMenu: PeerContextMenuState | null;
    };
    metrics: {
        paddingTop: number;
        paddingBottom: number;
    };
    labels: {
        emptyMessage: string;
        copyIpAction: string;
        addPeerAction: string;
        banIpAction: string;
    };
    table: {
        headerGroups: HeaderGroup<PeerRuntimeRow>[];
    };
    data: {
        rows: PeerRowViewModel[];
    };
    actions: {
        openContextMenu: (
            event: ReactMouseEvent<HTMLElement>,
            peer: TorrentPeerEntity,
        ) => void;
        closeContextMenu: () => void;
        runContextAction: (action: PeerContextAction) => void;
    };
}

interface UseTorrentDetailsPeersViewModelParams {
    torrentId: string | number | null;
    peers: TorrentPeerEntity[];
    emptyMessage: string;
    listRef: RefObject<HTMLDivElement | null>;
    onPeerContextAction?: (
        action: PeerContextAction,
        peer: TorrentPeerEntity,
    ) => void;
    sortBySpeed?: boolean;
}

const compareStringsAscending = (left: string, right: string) =>
    left.localeCompare(right, undefined, { sensitivity: "base" });

const compareNumbersAscending = (
    left: number | undefined,
    right: number | undefined,
) => {
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

const comparePeerFallback = (left: PeerRuntimeRow, right: PeerRuntimeRow) =>
    compareStringsAscending(left.address, right.address) ||
    compareNumbersAscending(left.port, right.port) ||
    left.originalIndex - right.originalIndex;

const formatMetric = (
    value: number,
    formatter: (input: number) => string,
) =>
    Number.isFinite(value) && value >= 0 ? formatter(value) : "-";

const buildStateLabel = (
    peer: TorrentPeerEntity,
    t: ReturnType<typeof useTranslation>["t"],
) => {
    if (peer.isDownloadingFrom && peer.isUploadingTo) {
        return t("peers.state.exchanging");
    }
    if (peer.isDownloadingFrom) {
        return t("peers.state.receiving");
    }
    if (peer.isUploadingTo) {
        return t("peers.state.sending");
    }
    return t("peers.state.no_active_transfer");
};

const buildStateTooltip = (
    peer: TorrentPeerEntity,
    t: ReturnType<typeof useTranslation>["t"],
) => {
    const lines: string[] = [];

    if (peer.isDownloadingFrom) {
        lines.push(t("peers.flags.downloading"));
    }
    if (peer.isUploadingTo) {
        lines.push(t("peers.flags.uploading"));
    }
    if (peer.peerIsChoking) {
        lines.push(t("peers.flags.not_receiving"));
    }
    if (peer.clientIsChoking) {
        lines.push(t("peers.flags.not_sending"));
    }
    if (peer.clientIsInterested) {
        lines.push(t("peers.flags.requesting"));
    }
    if (peer.peerIsInterested) {
        lines.push(t("peers.flags.peer_requesting"));
    }
    if (peer.flagStr.includes("O")) {
        lines.push(t("peers.flags.optimistic"));
    }

    return lines.join("\n");
};
const buildConnectionTooltip = (
    peer: TorrentPeerEntity,
    connectionLabel: string,
    t: ReturnType<typeof useTranslation>["t"],
) =>
    [
        `${t("peers.connection.transport")}: ${connectionLabel}`,
        `${t("peers.connection.direction")}: ${t(
            peer.isIncoming
                ? "peers.connection.incoming"
                : "peers.connection.outgoing",
        )}`,
        ...(peer.isEncrypted
            ? [
                  `${t("peers.connection.encryption")}: ${t(
                      "peers.connection.encrypted",
                  )}`,
              ]
            : []),
        ...(peer.flagStr.includes("H")
            ? [
                  `${t("peers.connection.discovery")}: ${t(
                      "peers.flags.dht_discovery",
                  )}`,
              ]
            : []),
        ...(!peer.flagStr.includes("H") && peer.flagStr.includes("X")
            ? [
                  `${t("peers.connection.discovery")}: ${t(
                      "peers.flags.pex_discovery",
                  )}`,
              ]
            : []),
    ].join("\n");

const createPeerColumns = (
    t: ReturnType<typeof useTranslation>["t"],
): ColumnDef<PeerRuntimeRow>[] => [
    {
        id: "address",
        header: t("peers.columns.ip_address"),
        accessorFn: (row) => row.address,
        sortingFn: (left, right) =>
            compareStringsAscending(left.original.address, right.original.address) ||
            comparePeerFallback(left.original, right.original),
    },
    {
        id: "port",
        header: t("peers.columns.port"),
        accessorFn: (row) => row.port,
        sortingFn: (left, right) =>
            compareNumbersAscending(left.original.port, right.original.port) ||
            comparePeerFallback(left.original, right.original),
    },
    {
        id: "connection",
        header: t("peers.columns.connection"),
        accessorFn: (row) => row.connectionLabel,
        sortingFn: (left, right) =>
            compareStringsAscending(
                left.original.connectionLabel,
                right.original.connectionLabel,
            ) || comparePeerFallback(left.original, right.original),
    },
    {
        id: "state",
        header: t("peers.columns.state"),
        accessorFn: (row) => row.stateLabel,
        sortingFn: (left, right) =>
            compareStringsAscending(left.original.stateLabel, right.original.stateLabel) ||
            comparePeerFallback(left.original, right.original),
    },
    {
        id: "client",
        header: t("peers.columns.client"),
        accessorFn: (row) => row.clientLabel,
        sortingFn: (left, right) =>
            compareStringsAscending(left.original.clientLabel, right.original.clientLabel) ||
            comparePeerFallback(left.original, right.original),
    },
    {
        id: "progress",
        header: t("peers.columns.progress"),
        accessorFn: (row) => row.progressValue,
        sortingFn: (left, right) =>
            compareNumbersAscending(
                left.original.progressValue,
                right.original.progressValue,
            ) || comparePeerFallback(left.original, right.original),
    },
    {
        id: "down",
        header: t("peers.columns.down_speed"),
        accessorFn: (row) => row.downRateValue,
        sortingFn: (left, right) =>
            compareNumbersAscending(
                left.original.downRateValue,
                right.original.downRateValue,
            ) || comparePeerFallback(left.original, right.original),
    },
    {
        id: "up",
        header: t("peers.columns.up_speed"),
        accessorFn: (row) => row.upRateValue,
        sortingFn: (left, right) =>
            compareNumbersAscending(left.original.upRateValue, right.original.upRateValue) ||
            comparePeerFallback(left.original, right.original),
    },
    {
        id: "downloaded",
        header: t("peers.columns.downloaded"),
        accessorFn: (row) => row.downloadedValue,
        sortingFn: (left, right) =>
            compareNumbersAscending(
                left.original.downloadedValue,
                right.original.downloadedValue,
            ) || comparePeerFallback(left.original, right.original),
    },
    {
        id: "uploaded",
        header: t("peers.columns.uploaded"),
        accessorFn: (row) => row.uploadedValue,
        sortingFn: (left, right) =>
            compareNumbersAscending(left.original.uploadedValue, right.original.uploadedValue) ||
            comparePeerFallback(left.original, right.original),
    },
];

export const useTorrentDetailsPeersViewModel = ({
    torrentId,
    peers,
    emptyMessage,
    listRef,
    onPeerContextAction,
    sortBySpeed = false,
}: UseTorrentDetailsPeersViewModelParams): TorrentDetailsPeersViewModel => {
    const { t } = useTranslation();
    const { copyToClipboard } = useTorrentClipboard();
    const { rowHeight, fileContextMenuMargin, fileContextMenuWidth } =
        useLayoutMetrics();
    const [sorting, setSorting] = useState<SortingState>([]);
    const [contextMenu, setContextMenu] = useState<PeerContextMenuState | null>(
        null,
    );

    useEffect(() => {
        setSorting([]);
        setContextMenu(null);
    }, [torrentId]);

    const safePeers = useMemo(
        () =>
            (peers ?? []).filter(
                (peer) =>
                    typeof peer.address === "string" &&
                    peer.address.trim().length > 0,
            ),
        [peers],
    );
    const isEmpty = safePeers.length === 0;

    const baseRows = useMemo<PeerRuntimeRow[]>(() => {
        const nextPeers = sortBySpeed
            ? [...safePeers].sort((left, right) => {
                  const leftScore =
                      (Number.isFinite(left.rateToClient)
                          ? left.rateToClient
                          : 0) +
                      (Number.isFinite(left.rateToPeer)
                          ? left.rateToPeer
                          : 0);
                  const rightScore =
                      (Number.isFinite(right.rateToClient)
                          ? right.rateToClient
                          : 0) +
                      (Number.isFinite(right.rateToPeer)
                          ? right.rateToPeer
                          : 0);
                  return rightScore - leftScore;
              })
            : safePeers;

        return nextPeers.map((peer, originalIndex) => {
            const address = String(peer.address ?? "").trim();
            const port =
                typeof peer.port === "number" && Number.isFinite(peer.port)
                    ? peer.port
                    : 0;
            const connectionLabel = peer.isUtp ? "uTP" : "TCP";
            const stateLabel = buildStateLabel(peer, t);
            const clientLabel =
                typeof peer.clientName === "string" && peer.clientName.trim()
                    ? peer.clientName.trim()
                    : "-";

            return {
                key: `${address}|${String(port)}|${String(originalIndex)}`,
                originalIndex,
                peer,
                address,
                port,
                connectionLabel,
                connectionDirection: peer.isIncoming ? "incoming" : "outgoing",
                connectionEncrypted: peer.isEncrypted,
                connectionTooltip: buildConnectionTooltip(
                    peer,
                    connectionLabel,
                    t,
                ),
                stateLabel,
                stateTooltip: buildStateTooltip(peer, t),
                clientLabel,
                progressValue:
                    typeof peer.progress === "number" && Number.isFinite(peer.progress)
                        ? peer.progress
                        : 0,
                progressLabel: formatPercent(
                    (typeof peer.progress === "number" && Number.isFinite(peer.progress)
                        ? peer.progress
                        : 0) * 100,
                ),
                downRateValue:
                    typeof peer.rateToClient === "number" &&
                    Number.isFinite(peer.rateToClient)
                        ? peer.rateToClient
                        : undefined,
                downRateLabel: formatMetric(peer.rateToClient, formatSpeed),
                upRateValue:
                    typeof peer.rateToPeer === "number" &&
                    Number.isFinite(peer.rateToPeer)
                        ? peer.rateToPeer
                        : undefined,
                upRateLabel: formatMetric(peer.rateToPeer, formatSpeed),
                downloadedValue:
                    typeof peer.bytesToClient === "number" &&
                    Number.isFinite(peer.bytesToClient)
                        ? peer.bytesToClient
                        : undefined,
                downloadedLabel: formatMetric(peer.bytesToClient, formatBytes),
                uploadedValue:
                    typeof peer.bytesToPeer === "number" &&
                    Number.isFinite(peer.bytesToPeer)
                        ? peer.bytesToPeer
                        : undefined,
                uploadedLabel: formatMetric(peer.bytesToPeer, formatBytes),
            };
        });
    }, [safePeers, sortBySpeed, t]);

    const columns = useMemo(() => createPeerColumns(t), [t]);

    // eslint-disable-next-line react-hooks/incompatible-library
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

    const sortedRows = table.getRowModel().rows;

    const rowVirtualizer = useVirtualizer({
        count: sortedRows.length,
        getScrollElement: () => listRef.current,
        estimateSize: () => rowHeight || 34,
        overscan: layout.table.overscan,
    });

    const virtualItems = rowVirtualizer.getVirtualItems();
    const rows = useMemo<PeerRowViewModel[]>(() => {
        if (virtualItems.length === 0) {
            const fallbackSize = rowHeight || 34;
            return sortedRows.map((row, index) => ({
                ...row.original,
                index,
                start: index * fallbackSize,
                size: fallbackSize,
            }));
        }
        return virtualItems.flatMap((virtualRow) => {
            const row = sortedRows[virtualRow.index];
            if (!row) {
                return [];
            }
            return [
                {
                    ...row.original,
                    index: virtualRow.index,
                    start: virtualRow.start,
                    size: virtualRow.size,
                },
            ];
        });
    }, [rowHeight, sortedRows, virtualItems]);
    const paddingTop = virtualItems.length > 0 ? (virtualItems[0]?.start ?? 0) : 0;
    const paddingBottom =
        virtualItems.length > 0
            ? Math.max(
                  0,
                  rowVirtualizer.getTotalSize() -
                      ((virtualItems[virtualItems.length - 1]?.end as number) ?? 0),
              )
            : 0;

    const closeContextMenu = useCallback(() => {
        setContextMenu(null);
    }, []);

    useEffect(() => {
        window.addEventListener("pointerdown", closeContextMenu);
        return () => window.removeEventListener("pointerdown", closeContextMenu);
    }, [closeContextMenu]);

    const openContextMenu = useCallback(
        (event: ReactMouseEvent<HTMLElement>, peer: TorrentPeerEntity) => {
            event.preventDefault();
            const rect = listRef.current?.getBoundingClientRect();
            if (!rect) {
                return;
            }

            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;
            const margin = fileContextMenuMargin;
            const menuWidth = fileContextMenuWidth || 220;
            const estimatedMenuHeight = (rowHeight || 34) * 4;
            const boundedX = Math.min(
                Math.max(x, margin),
                rect.width - menuWidth - margin,
            );
            const maxY = Math.max(
                margin,
                rect.height - estimatedMenuHeight - margin,
            );
            const boundedY = Math.min(Math.max(y, margin), maxY);
            setContextMenu({ peer, x: boundedX, y: boundedY });
        },
        [
            fileContextMenuMargin,
            fileContextMenuWidth,
            listRef,
            rowHeight,
        ],
    );

    const runContextAction = useCallback(
        (action: PeerContextAction) => {
            if (!contextMenu) {
                return;
            }

            if (action === "copy_ip") {
                void copyToClipboard(contextMenu.peer.address.trim());
            }

            onPeerContextAction?.(action, contextMenu.peer);
            setContextMenu(null);
        },
        [contextMenu, copyToClipboard, onPeerContextAction],
    );

    return {
        state: {
            isEmpty,
            contextMenu,
        },
        metrics: {
            paddingTop,
            paddingBottom,
        },
        labels: {
            emptyMessage,
            copyIpAction: t("peers.action_copy_ip"),
            addPeerAction: t("peers.action_add_peer"),
            banIpAction: t("peers.action_ban_ip"),
        },
        table: {
            headerGroups: table.getHeaderGroups(),
        },
        data: {
            rows,
        },
        actions: {
            openContextMenu,
            closeContextMenu,
            runContextAction,
        },
    };
};
