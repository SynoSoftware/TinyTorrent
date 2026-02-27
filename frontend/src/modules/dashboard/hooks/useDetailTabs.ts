import {
    createElement,
    useCallback,
    useEffect,
    useMemo,
    type KeyboardEvent,
    type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import type { DashboardDetailViewModel } from "@/app/viewModels/useAppViewModel";
import { usePreferences } from "@/app/context/PreferencesContext";
import { useActionFeedback } from "@/app/hooks/useActionFeedback";
import { GeneralTab } from "@/modules/dashboard/components/TorrentDetails_General";
import { ContentTab } from "@/modules/dashboard/components/TorrentDetails_Content";
import { PiecesTab } from "@/modules/dashboard/components/TorrentDetails_Pieces";
import { TrackersTab } from "@/modules/dashboard/components/TorrentDetails_Trackers";
import { PeersTab } from "@/modules/dashboard/components/TorrentDetails_Peers";
import { SpeedTab } from "@/modules/dashboard/components/TorrentDetails_Speed";
import type { DetailTab } from "@/modules/dashboard/types/contracts";
import {
    resolveShortcutIntentFromKeyboardEvent,
} from "@/app/controlPlane/shortcuts";
import { ShortcutIntents } from "@/shared/controlPlane/shortcutVocabulary";
import {
    type TorrentDispatchOutcome,
} from "@/app/actions/torrentDispatch";

type TrackerMutationOutcome = Pick<TorrentDispatchOutcome, "status">;

const {
    NavigateNextTab,
    NavigatePreviousTab,
    NavigateFirstTab,
    NavigateLastTab,
} = ShortcutIntents;

const detailTabNavigationIntents = [
    NavigateNextTab,
    NavigatePreviousTab,
    NavigateFirstTab,
    NavigateLastTab,
] as const;

const isEditableKeyTarget = (target: EventTarget | null): boolean => {
    if (!(target instanceof HTMLElement)) {
        return false;
    }

    const tagName = target.tagName;
    if (
        tagName === "INPUT" ||
        tagName === "TEXTAREA" ||
        tagName === "SELECT"
    ) {
        return true;
    }

    return target.isContentEditable || target.closest("[contenteditable='true']") !== null;
};

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

    return {
        active,
        setActive,
    };
};

export interface TorrentDetailTabSurfaces {
    general: {
        torrent: NonNullable<DashboardDetailViewModel["detailData"]>;
        canSetLocation: boolean;
        onTorrentAction: DashboardDetailViewModel["tabs"]["general"]["handleTorrentAction"];
        setLocation: DashboardDetailViewModel["tabs"]["general"]["setLocation"];
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
        targetIds: Array<string | number>;
        scope: DashboardDetailViewModel["tabs"]["trackers"]["scope"];
        trackers: NonNullable<
            NonNullable<DashboardDetailViewModel["detailData"]>["trackers"]
        >;
        emptyMessage: string;
        isStandalone?: boolean;
        addTrackers: DashboardDetailViewModel["tabs"]["trackers"]["addTrackers"];
        replaceTrackers: DashboardDetailViewModel["tabs"]["trackers"]["replaceTrackers"];
        removeTrackers: DashboardDetailViewModel["tabs"]["trackers"]["removeTrackers"];
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

export interface TorrentDetailTabDefinition {
    id: DetailTab;
    labelKey: string;
    isVisible?: (surfaces: TorrentDetailTabSurfaces) => boolean;
    render: (surfaces: TorrentDetailTabSurfaces) => ReactNode;
}

export const TAB_DEFS: readonly TorrentDetailTabDefinition[] = [
    {
        id: "general",
        labelKey: "inspector.tab.general",
        isVisible: (surfaces) => surfaces.general !== null,
        render: (surfaces) =>
            surfaces.general ? createElement(GeneralTab, surfaces.general) : null,
    },
    {
        id: "content",
        labelKey: "inspector.tab.content",
        isVisible: (surfaces) => surfaces.content !== null,
        render: (surfaces) =>
            surfaces.content ? createElement(ContentTab, surfaces.content) : null,
    },
    {
        id: "pieces",
        labelKey: "inspector.tab.pieces",
        isVisible: (surfaces) => surfaces.pieces !== null,
        render: (surfaces) =>
            surfaces.pieces ? createElement(PiecesTab, surfaces.pieces) : null,
    },
    {
        id: "trackers",
        labelKey: "inspector.tab.trackers",
        isVisible: (surfaces) => surfaces.trackers !== null,
        render: (surfaces) =>
            surfaces.trackers
                ? createElement(TrackersTab, surfaces.trackers)
                : null,
    },
    {
        id: "peers",
        labelKey: "inspector.tab.peers",
        isVisible: (surfaces) => surfaces.peers !== null,
        render: (surfaces) =>
            surfaces.peers ? createElement(PeersTab, surfaces.peers) : null,
    },
    {
        id: "speed",
        labelKey: "inspector.tab.speed",
        isVisible: (surfaces) => surfaces.speed !== null,
        render: (surfaces) =>
            surfaces.speed ? createElement(SpeedTab, surfaces.speed) : null,
    },
] as const;

interface UseTorrentDetailTabCoordinatorParams {
    viewModel: DashboardDetailViewModel;
    isStandalone?: boolean;
}

interface UseTorrentDetailTabCoordinatorResult {
    active: DetailTab;
    setActive: (tab: DetailTab | ((t: DetailTab) => DetailTab)) => void;
    handleKeyDown: (event: KeyboardEvent) => void;
    activeSurface: ReactNode;
    tabs: Array<Pick<TorrentDetailTabDefinition, "id" | "labelKey">>;
}

export const useTorrentDetailTabCoordinator = ({
    viewModel,
    isStandalone = false,
}: UseTorrentDetailTabCoordinatorParams): UseTorrentDetailTabCoordinatorResult => {
    const { t } = useTranslation();
    const { showFeedback } = useActionFeedback();
    const torrent = viewModel.detailData;
    const {
        active,
        setActive,
    } = useDetailTabs({
        inspectorTabCommand: viewModel.tabs.navigation.inspectorTabCommand,
        onInspectorTabCommandHandled:
            viewModel.tabs.navigation.onInspectorTabCommandHandled,
    });

    const runTrackerMutation = useCallback(
        async (
            mutate: () => Promise<TrackerMutationOutcome>,
        ) => {
            const outcome = await mutate();
            if (outcome.status === "unsupported") {
                showFeedback(t("torrent_modal.controls.not_supported"), "warning");
            } else if (outcome.status === "failed") {
                showFeedback(t("toolbar.feedback.failed"), "danger");
            }
            return outcome;
        },
        [showFeedback, t],
    );

    const addTrackers = useCallback<DashboardDetailViewModel["tabs"]["trackers"]["addTrackers"]>(
        (targetIds, trackers) =>
            runTrackerMutation(() =>
                viewModel.tabs.trackers.addTrackers(targetIds, trackers),
            ),
        [runTrackerMutation, viewModel.tabs.trackers],
    );

    const replaceTrackers = useCallback<DashboardDetailViewModel["tabs"]["trackers"]["replaceTrackers"]>(
        (targetIds, trackers) =>
            runTrackerMutation(() =>
                viewModel.tabs.trackers.replaceTrackers(targetIds, trackers),
            ),
        [runTrackerMutation, viewModel.tabs.trackers],
    );

    const removeTrackers = useCallback<DashboardDetailViewModel["tabs"]["trackers"]["removeTrackers"]>(
        (targetIds, trackerIds) =>
            runTrackerMutation(() =>
                viewModel.tabs.trackers.removeTrackers(targetIds, trackerIds),
            ),
        [runTrackerMutation, viewModel.tabs.trackers],
    );

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
                canSetLocation: viewModel.tabs.general.canSetLocation,
                onTorrentAction: viewModel.tabs.general.handleTorrentAction,
                setLocation: viewModel.tabs.general.setLocation,
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
                targetIds: viewModel.tabs.trackers.targetIds,
                scope: viewModel.tabs.trackers.scope,
                trackers: torrent.trackers ?? [],
                emptyMessage: t("torrent_modal.trackers.empty_backend"),
                isStandalone,
                addTrackers,
                replaceTrackers,
                removeTrackers,
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
    }, [
        addTrackers,
        isStandalone,
        removeTrackers,
        replaceTrackers,
        t,
        torrent,
        viewModel.tabs.content.handleFileSelectionChange,
        viewModel.tabs.general.canSetLocation,
        viewModel.tabs.general.handleTorrentAction,
        viewModel.tabs.general.setLocation,
        viewModel.tabs.peers.handlePeerContextAction,
        viewModel.tabs.peers.peerSortStrategy,
        viewModel.tabs.trackers.scope,
        viewModel.tabs.trackers.targetIds,
    ]);

    const visibleTabDefs = useMemo(
        () =>
            TAB_DEFS.filter((definition) =>
                definition.isVisible ? definition.isVisible(surfaces) : true,
            ),
        [surfaces],
    );

    const visibleTabIds = useMemo(
        () => visibleTabDefs.map(({ id }) => id),
        [visibleTabDefs],
    );

    useEffect(() => {
        if (!visibleTabIds.length) {
            return;
        }
        if (visibleTabIds.includes(active)) {
            return;
        }
        setActive(visibleTabIds[0]);
    }, [active, setActive, visibleTabIds]);

    const handleKeyDown = useCallback(
        (event: KeyboardEvent) => {
            if (!visibleTabIds.length) {
                return;
            }
            const currentTarget = event.currentTarget;
            const target = event.target;
            if (
                event.defaultPrevented ||
                !(currentTarget instanceof HTMLElement) ||
                !(target instanceof Node) ||
                !currentTarget.contains(target) ||
                isEditableKeyTarget(target)
            ) {
                return;
            }

            const intent = resolveShortcutIntentFromKeyboardEvent(
                event,
                detailTabNavigationIntents,
            );
            if (!intent) {
                return;
            }

            const activeIndex = visibleTabIds.indexOf(active);
            const safeActiveIndex = activeIndex >= 0 ? activeIndex : 0;
            if (intent === NavigateNextTab) {
                setActive(
                    visibleTabIds[(safeActiveIndex + 1) % visibleTabIds.length],
                );
                event.preventDefault();
                return;
            }
            if (intent === NavigatePreviousTab) {
                setActive(
                    visibleTabIds[
                        (safeActiveIndex - 1 + visibleTabIds.length) %
                            visibleTabIds.length
                    ],
                );
                event.preventDefault();
                return;
            }
            if (intent === NavigateFirstTab) {
                setActive(visibleTabIds[0]);
                event.preventDefault();
                return;
            }
            if (intent === NavigateLastTab) {
                setActive(visibleTabIds[visibleTabIds.length - 1]);
                event.preventDefault();
            }
        },
        [active, setActive, visibleTabIds],
    );

    const activeSurface = useMemo(() => {
        const activeDefinition =
            visibleTabDefs.find((definition) => definition.id === active) ??
            visibleTabDefs[0];
        return activeDefinition ? activeDefinition.render(surfaces) : null;
    }, [active, surfaces, visibleTabDefs]);

    return {
        active,
        setActive,
        handleKeyDown,
        activeSurface,
        tabs: visibleTabDefs.map(({ id, labelKey }) => ({
            id,
            labelKey,
        })),
    };
};

