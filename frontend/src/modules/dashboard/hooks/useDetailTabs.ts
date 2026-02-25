import {
    createElement,
    useCallback,
    useEffect,
    useMemo,
    type KeyboardEvent,
    type ReactNode,
} from "react";
import type { DetailTab } from "@/modules/dashboard/types/torrentDetail";
import { usePreferences } from "@/app/context/PreferencesContext";
import { useTranslation } from "react-i18next";
import type { DashboardDetailViewModel } from "@/app/viewModels/useAppViewModel";
import { GeneralTab } from "@/modules/dashboard/components/TorrentDetails_General";
import { ContentTab } from "@/modules/dashboard/components/TorrentDetails_Content";
import { PiecesTab } from "@/modules/dashboard/components/TorrentDetails_Pieces";
import { TrackersTab } from "@/modules/dashboard/components/TorrentDetails_Trackers";
import { PeersTab } from "@/modules/dashboard/components/TorrentDetails_Peers";
import { SpeedTab } from "@/modules/dashboard/components/TorrentDetails_Speed";

export const DETAIL_TABS: DetailTab[] = [
    "general",
    "content",
    "pieces",
    "trackers",
    "peers",
    "speed",
];

interface UseDetailTabsParams {
    inspectorTabCommand?: DetailTab | null;
    onInspectorTabCommandHandled?: () => void;
}

export const useDetailTabs = ({
    inspectorTabCommand,
    onInspectorTabCommandHandled,
}: UseDetailTabsParams) => {
    const {
        preferences: { inspectorTab },
        setInspectorTab,
    } = usePreferences();

    const active = inspectorTabCommand ?? inspectorTab ?? "general";

    const setActive = useCallback(
        (tab: DetailTab | ((t: DetailTab) => DetailTab)) => {
            const next = typeof tab === "function" ? tab(active) : tab;
            setInspectorTab(next);
        },
        [active, setInspectorTab]
    );

    useEffect(() => {
        if (!inspectorTabCommand) return;
        if (inspectorTab !== inspectorTabCommand) {
            setInspectorTab(inspectorTabCommand);
        }
        onInspectorTabCommandHandled?.();
    }, [
        inspectorTab,
        inspectorTabCommand,
        onInspectorTabCommandHandled,
        setInspectorTab,
    ]);

    const handleKeyDown = useCallback(
        (event: KeyboardEvent) => {
            const { key } = event;
            if (key === "ArrowRight") {
                const idx = DETAIL_TABS.indexOf(active);
                setActive(DETAIL_TABS[(idx + 1) % DETAIL_TABS.length]);
                event.preventDefault();
                return;
            }
            if (key === "ArrowLeft") {
                const idx = DETAIL_TABS.indexOf(active);
                setActive(
                    DETAIL_TABS[
                        (idx - 1 + DETAIL_TABS.length) % DETAIL_TABS.length
                    ]
                );
                event.preventDefault();
                return;
            }
            if (key === "Home") {
                setActive(DETAIL_TABS[0]);
                event.preventDefault();
                return;
            }
            if (key === "End") {
                setActive(DETAIL_TABS[DETAIL_TABS.length - 1]);
                event.preventDefault();
            }
        },
        [active, setActive]
    );

    return {
        active,
        setActive,
        handleKeyDown,
    };
};

export interface TorrentDetailTabSurfaces {
    general: {
        torrent: NonNullable<DashboardDetailViewModel["detailData"]>;
        downloadDir: string;
        activePeers: number;
    } | null;
    content: {
        torrent: NonNullable<DashboardDetailViewModel["detailData"]>;
        files: NonNullable<DashboardDetailViewModel["detailData"]>["files"];
        emptyMessage: string;
        onFilesToggle: DashboardDetailViewModel["tabs"]["content"]["handleFileSelectionChange"];
        isStandalone?: boolean;
    } | null;
    pieces: {
        piecePercent: number;
        pieceCount?: number;
        pieceSize?: number;
        pieceStates?: number[];
        pieceAvailability?: number[];
    } | null;
    trackers: {
        torrentId: string | number;
        torrentIds?: Array<string | number>;
        trackers: NonNullable<
            NonNullable<DashboardDetailViewModel["detailData"]>["trackers"]
        >;
        emptyMessage: string;
        isStandalone?: boolean;
    } | null;
    peers: {
        peers: NonNullable<
            NonNullable<DashboardDetailViewModel["detailData"]>["peers"]
        >;
        onPeerContextAction?: DashboardDetailViewModel["tabs"]["peers"]["handlePeerContextAction"];
        torrentProgress?: number;
        sortBySpeed?: boolean;
        isStandalone?: boolean;
    } | null;
    speed: {
        torrentId: string | number;
        torrentState?: string;
        isStandalone?: boolean;
    } | null;
}

interface UseTorrentDetailTabCoordinatorParams {
    viewModel: DashboardDetailViewModel;
    isStandalone?: boolean;
}

interface UseTorrentDetailTabCoordinatorResult {
    active: DetailTab;
    setActive: (tab: DetailTab | ((t: DetailTab) => DetailTab)) => void;
    handleKeyDown: (event: KeyboardEvent) => void;
    surfaces: TorrentDetailTabSurfaces;
    activeSurface: ReactNode;
}

export const useTorrentDetailTabCoordinator = ({
    viewModel,
    isStandalone = false,
}: UseTorrentDetailTabCoordinatorParams): UseTorrentDetailTabCoordinatorResult => {
    const { t } = useTranslation();
    const torrent = viewModel.detailData;
    const {
        active,
        setActive,
        handleKeyDown,
    } = useDetailTabs({
        inspectorTabCommand: viewModel.tabs.navigation.inspectorTabCommand,
        onInspectorTabCommandHandled:
            viewModel.tabs.navigation.onInspectorTabCommandHandled,
    });

    const surfaces = useMemo<TorrentDetailTabSurfaces>(() => {
        if (!torrent) {
            return {
                general: null,
                content: null,
                pieces: null,
                trackers: null,
                peers: null,
                speed: null,
            };
        }

        return {
            general: {
                torrent,
                downloadDir: torrent.downloadDir ?? "",
                activePeers: torrent.peers?.length ?? 0,
            },
            content: {
                torrent,
                files: torrent.files ?? [],
                emptyMessage: t("torrent_modal.files_empty"),
                onFilesToggle: viewModel.tabs.content.handleFileSelectionChange,
                isStandalone,
            },
            pieces: {
                piecePercent: torrent.progress ?? 0,
                pieceCount: torrent.pieceCount,
                pieceSize: torrent.pieceSize,
                pieceStates: torrent.pieceStates,
                pieceAvailability: torrent.pieceAvailability,
            },
            trackers: {
                torrentId: torrent.id ?? torrent.hash,
                trackers: torrent.trackers ?? [],
                emptyMessage: t("torrent_modal.trackers.empty_backend"),
                isStandalone,
            },
            peers: {
                peers: torrent.peers ?? [],
                onPeerContextAction: viewModel.tabs.peers.handlePeerContextAction,
                torrentProgress: torrent.progress ?? 0,
                sortBySpeed: viewModel.tabs.peers.peerSortStrategy === "speed",
                isStandalone,
            },
            speed:
                torrent.id ?? torrent.hash
                    ? {
                          torrentId: torrent.id ?? torrent.hash,
                          torrentState:
                              typeof torrent.state === "string"
                                  ? torrent.state
                                  : undefined,
                          isStandalone,
                      }
                    : null,
        };
    }, [torrent, t, viewModel.tabs, isStandalone]);

    const activeSurface = useMemo(() => {
        if (active === "general" && surfaces.general) {
            return createElement(GeneralTab, surfaces.general);
        }
        if (active === "content" && surfaces.content) {
            return createElement(ContentTab, surfaces.content);
        }
        if (active === "pieces" && surfaces.pieces) {
            return createElement(PiecesTab, surfaces.pieces);
        }
        if (active === "trackers" && surfaces.trackers) {
            return createElement(TrackersTab, surfaces.trackers);
        }
        if (active === "peers" && surfaces.peers) {
            return createElement(PeersTab, surfaces.peers);
        }
        if (active === "speed" && surfaces.speed) {
            return createElement(SpeedTab, surfaces.speed);
        }
        return null;
    }, [active, surfaces]);

    return {
        active,
        setActive,
        handleKeyDown,
        surfaces,
        activeSurface,
    };
};
