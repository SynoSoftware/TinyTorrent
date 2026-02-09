import {
    type MouseEvent,
    type RefObject,
    useCallback,
    useEffect,
    useMemo,
    useState,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useTranslation } from "react-i18next";
import useLayoutMetrics from "@/shared/hooks/useLayoutMetrics";
import { formatSpeed } from "@/shared/utils/format";
import type { TorrentPeerEntity } from "@/services/rpc/entities";
import type { PeerContextAction } from "@/modules/dashboard/types/peerContextAction";
import { useTorrentClipboard } from "@/modules/dashboard/hooks/useTorrentClipboard";

type PeerContextMenuState = {
    peer: TorrentPeerEntity;
    x: number;
    y: number;
};

const FLAG_MAP: Record<string, string> = {
    D: "peers.flags.downloading",
    U: "peers.flags.uploading",
    K: "peers.flags.uninterested_remote",
    I: "peers.flags.uninterested_local",
    c: "peers.flags.choked_remote",
    X: "peers.flags.dex_discovery",
    H: "peers.flags.dht_discovery",
    E: "peers.flags.encrypted",
    P: "peers.flags.utp",
    u: "peers.flags.utp",
};

interface UseTorrentDetailsPeersViewModelParams {
    peers: TorrentPeerEntity[];
    listRef: RefObject<HTMLDivElement | null>;
    onPeerContextAction?: (
        action: PeerContextAction,
        peer: TorrentPeerEntity
    ) => void;
    sortBySpeed?: boolean;
    torrentProgress?: number;
}

export interface PeerRowViewModel {
    key: string;
    peer: TorrentPeerEntity;
    start: number;
    size: number;
    flagCodes: string[];
    isHovered: boolean;
    isUTP: boolean;
    isEncrypted: boolean;
    isHostile: boolean;
    clientName: string;
    downRateLabel: string;
    upRateLabel: string;
}

export interface TorrentDetailsPeersViewModel {
    state: {
        isEmpty: boolean;
        hoveredPeer: string | null;
        peerContextMenu: PeerContextMenuState | null;
    };
    metrics: {
        totalSize: number;
    };
    data: {
        peers: TorrentPeerEntity[];
        rowViewModels: PeerRowViewModel[];
    };
    labels: {
        emptyMessage: string;
        flagsHeader: string;
        endpointHeader: string;
        clientHeader: string;
        downstreamHeader: string;
        upstreamHeader: string;
        copyIpAction: string;
        addPeerAction: string;
        banIpAction: string;
    };
    actions: {
        setHoveredPeer: (value: string | null) => void;
        clearHoveredPeer: () => void;
        getFlagLabel: (flagCode: string) => string;
        openContextMenu: (event: MouseEvent, peer: TorrentPeerEntity) => void;
        closeContextMenu: () => void;
        runContextAction: (action: PeerContextAction) => void;
    };
}

export const useTorrentDetailsPeersViewModel = ({
    peers,
    listRef,
    onPeerContextAction,
    sortBySpeed = false,
    torrentProgress = 0,
}: UseTorrentDetailsPeersViewModelParams): TorrentDetailsPeersViewModel => {
    const { t } = useTranslation();
    const { copyToClipboard } = useTorrentClipboard();
    const { rowHeight, fileContextMenuMargin, fileContextMenuWidth } =
        useLayoutMetrics();
    const [hoveredPeer, setHoveredPeerState] = useState<string | null>(null);
    const setHoveredPeer = useCallback((value: string | null) => {
        setHoveredPeerState(value);
    }, []);
    const clearHoveredPeer = useCallback(() => {
        setHoveredPeerState(null);
    }, []);

    const [peerContextMenu, setPeerContextMenu] =
        useState<PeerContextMenuState | null>(null);

    const safePeers = useMemo(() => peers ?? [], [peers]);
    const isEmpty = safePeers.length === 0;

    const orderedPeers = useMemo(() => {
        if (!sortBySpeed) return safePeers;
        return [...safePeers].sort(
            (a, b) =>
                b.rateToClient + b.rateToPeer - (a.rateToClient + a.rateToPeer)
        );
    }, [safePeers, sortBySpeed]);

    // eslint-disable-next-line react-hooks/incompatible-library
    const rowVirtualizer = useVirtualizer({
        count: orderedPeers.length,
        getScrollElement: () => listRef.current,
        estimateSize: () => rowHeight || 34,
        overscan: 10,
    });

    const closeContextMenu = useCallback(() => {
        setPeerContextMenu(null);
    }, []);

    useEffect(() => {
        window.addEventListener("pointerdown", closeContextMenu);
        return () => window.removeEventListener("pointerdown", closeContextMenu);
    }, [closeContextMenu]);

    const openContextMenu = useCallback(
        (event: MouseEvent, peer: TorrentPeerEntity) => {
            event.preventDefault();
            const rect = listRef.current?.getBoundingClientRect();
            if (!rect) return;

            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;
            const margin = fileContextMenuMargin;
            const menuWidth = fileContextMenuWidth || 200;

            const boundedX = Math.min(
                Math.max(x, margin),
                rect.width - menuWidth - margin
            );
            const boundedY = Math.min(
                Math.max(y, margin),
                rect.height - margin
            );

            setPeerContextMenu({ peer, x: boundedX, y: boundedY });
        },
        [fileContextMenuMargin, fileContextMenuWidth, listRef]
    );

    const runContextAction = useCallback(
        (action: PeerContextAction) => {
            if (!peerContextMenu) return;

            if (action === "copy_ip") {
                void copyToClipboard(peerContextMenu.peer.address);
            }

            onPeerContextAction?.(action, peerContextMenu.peer);
            setPeerContextMenu(null);
        },
        [copyToClipboard, onPeerContextAction, peerContextMenu]
    );

    const getFlagLabel = useCallback(
        (flagCode: string) => t(FLAG_MAP[flagCode] || "peers.flags.unknown"),
        [t]
    );

    const rowViewModels = useMemo<PeerRowViewModel[]>(
        () =>
            rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const peer = orderedPeers[virtualRow.index];
                const safeAddress =
                    (peer.address && String(peer.address).trim()) ||
                    (peer.clientName && String(peer.clientName).trim()) ||
                    `peer-${virtualRow.index}`;
                const isUTP =
                    peer.flagStr.includes("P") || peer.flagStr.includes("u");
                const isEncrypted = peer.flagStr.includes("E");
                const isHostile =
                    torrentProgress < 1 &&
                    peer.peerIsChoking &&
                    peer.clientIsInterested;

                return {
                    key: `${safeAddress}-${virtualRow.index}`,
                    peer,
                    start: virtualRow.start,
                    size: virtualRow.size,
                    flagCodes: peer.flagStr.split(""),
                    isHovered: hoveredPeer === peer.address,
                    isUTP,
                    isEncrypted,
                    isHostile,
                    clientName: peer.clientName || "-",
                    downRateLabel:
                        peer.rateToClient > 0 ? formatSpeed(peer.rateToClient) : "-",
                    upRateLabel:
                        peer.rateToPeer > 0 ? formatSpeed(peer.rateToPeer) : "-",
                };
            }),
        [hoveredPeer, orderedPeers, rowVirtualizer, torrentProgress]
    );

    return {
        state: {
            isEmpty,
            hoveredPeer,
            peerContextMenu,
        },
        metrics: {
            totalSize: rowVirtualizer.getTotalSize(),
        },
        data: {
            peers: safePeers,
            rowViewModels,
        },
        labels: {
            emptyMessage: t("torrent_modal.peers.empty_backend"),
            flagsHeader: t("peers.columns.flags"),
            endpointHeader: t("peers.columns.endpoint"),
            clientHeader: t("peers.columns.client_identification"),
            downstreamHeader: t("peers.columns.downstream"),
            upstreamHeader: t("peers.columns.upstream"),
            copyIpAction: t("peers.action_copy_ip"),
            addPeerAction: t("peers.action_add_peer"),
            banIpAction: t("peers.action_ban_ip"),
        },
        actions: {
            setHoveredPeer,
            clearHoveredPeer,
            getFlagLabel,
            openContextMenu,
            closeContextMenu,
            runContextAction,
        },
    };
};
