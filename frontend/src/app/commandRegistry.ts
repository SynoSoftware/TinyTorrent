import type { MutableRefObject } from "react";
import { KEYMAP, KEY_SCOPE, ShortcutIntent } from "@/config/logic";
import { STATUS } from "@/shared/status";
import type { FocusPart } from "@/app/context/FocusContext";
import type { CommandAction, CommandPaletteContext } from "@/app/components/CommandPalette";
import type { Torrent } from "@/modules/dashboard/types/torrent";
import type { TorrentDetail } from "@/modules/dashboard/types/torrent";
import type { TorrentTableAction } from "@/modules/dashboard/types/torrentTable";
import type { DetailTab, PeerSortStrategy } from "@/modules/dashboard/types/torrentDetail";
import { DASHBOARD_FILTERS, type DashboardFilter } from "@/modules/dashboard/types/dashboardFilter";
import type { TFunction } from "i18next";

export interface CommandPaletteDeps {
    t: TFunction;
    focusSearchInput: () => void;
    openAddTorrentPicker: () => void;
    openAddMagnet: () => void;
    openSettings: () => void;
    refreshTorrents: () => Promise<void>;
    setFilter: (value: DashboardFilter) => void;
    selectedTorrents: Torrent[];
    detailData: TorrentDetail | null;
    handleBulkAction: (action: TorrentTableAction) => void;
    handleRequestDetails: (torrent: Torrent) => Promise<void>;
    handleFileSelectionChange: (
        fileIndexes: number[],
        extend: boolean
    ) => Promise<void>;
    setInspectorTabCommand: (tab: DetailTab | null) => void;
    peerSortStrategy: PeerSortStrategy;
    setPeerSortStrategy: (strategy: PeerSortStrategy) => void;
}

interface CommandPaletteBaseGroups {
    actions: string;
    filters: string;
    search: string;
    context: string;
}

export function buildCommandPaletteActions({
    t,
    focusSearchInput,
    openAddTorrentPicker,
    openAddMagnet,
    openSettings,
    refreshTorrents,
    setFilter,
}: CommandPaletteDeps): CommandAction[] {
    const groups: CommandPaletteBaseGroups = {
        actions: t("command_palette.group.actions"),
        filters: t("command_palette.group.filters"),
        search: t("command_palette.group.search"),
        context: t("command_palette.group.context"),
    };

    return [
        {
            id: "add-torrent",
            group: groups.actions,
            title: t("command_palette.actions.add_torrent"),
            description: t("command_palette.actions.add_torrent_description"),
            onSelect: openAddTorrentPicker,
        },
        {
            id: "add-magnet",
            group: groups.actions,
            title: t("command_palette.actions.add_magnet"),
            description: t("command_palette.actions.add_magnet_description"),
            onSelect: openAddMagnet,
        },
        {
            id: "open-settings",
            group: groups.actions,
            title: t("command_palette.actions.open_settings"),
            description: t("command_palette.actions.open_settings_description"),
            onSelect: openSettings,
        },
        {
            id: "refresh-torrents",
            group: groups.actions,
            title: t("command_palette.actions.refresh"),
            description: t("command_palette.actions.refresh_description"),
            onSelect: refreshTorrents,
        },
        {
            id: "focus-search",
            group: groups.search,
            title: t("command_palette.actions.focus_search"),
            description: t("command_palette.actions.focus_search_description"),
            onSelect: focusSearchInput,
        },
        {
            id: "filter-all",
            group: groups.filters,
            title: t("nav.filter_all"),
            description: t("command_palette.filters.all_description"),
            onSelect: () => setFilter(DASHBOARD_FILTERS.ALL),
        },
        {
            id: "filter-downloading",
            group: groups.filters,
            title: t("nav.filter_downloading"),
            description: t("command_palette.filters.downloading_description"),
            onSelect: () => setFilter(DASHBOARD_FILTERS.DOWNLOADING),
        },
        {
            id: "filter-seeding",
            group: groups.filters,
            title: t("nav.filter_seeding"),
            description: t("command_palette.filters.seeding_description"),
            onSelect: () => setFilter(DASHBOARD_FILTERS.SEEDING),
        },
    ];
}

export function buildContextCommandActions(
    deps: CommandPaletteDeps,
    activePart: CommandPaletteContext["activePart"]
): CommandAction[] {
    const contextGroup = deps.t("command_palette.group.context");
    const entries: CommandAction[] = [];

    if (activePart === "table" && deps.selectedTorrents.length) {
        entries.push(
            {
                id: "context.pause_selected",
                group: contextGroup,
                title: deps.t("command_palette.actions.pause_selected"),
                description: deps.t(
                    "command_palette.actions.pause_selected_description"
                ),
                onSelect: () => {
                    void deps.handleBulkAction("pause");
                },
            },
            {
                id: "context.resume_selected",
                group: contextGroup,
                title: deps.t("command_palette.actions.resume_selected"),
                description: deps.t(
                    "command_palette.actions.resume_selected_description"
                ),
                onSelect: () => {
                    void deps.handleBulkAction("resume");
                },
            },
            {
                id: "context.recheck_selected",
                group: contextGroup,
                title: deps.t("command_palette.actions.recheck_selected"),
                description: deps.t(
                    "command_palette.actions.recheck_selected_description"
                ),
                onSelect: () => {
                    void deps.handleBulkAction("recheck");
                },
            }
        );

        const targetTorrent = deps.selectedTorrents[0];
        if (targetTorrent) {
            entries.push({
                id: "context.open_inspector",
                group: contextGroup,
                title: deps.t("command_palette.actions.open_inspector"),
                description: deps.t(
                    "command_palette.actions.open_inspector_description"
                ),
                onSelect: () => deps.handleRequestDetails(targetTorrent),
            });
        }
    }

    if (activePart === "inspector" && deps.detailData) {
        const fileIndexes =
            deps.detailData.files?.map((file) => file.index) ?? [];
        if (fileIndexes.length) {
            entries.push({
                id: "context.select_all_files",
                group: contextGroup,
                title: deps.t("command_palette.actions.select_all_files"),
                description: deps.t(
                    "command_palette.actions.select_all_files_description"
                ),
                onSelect: () => {
                    deps.setInspectorTabCommand("content");
                    return deps.handleFileSelectionChange(fileIndexes, true);
                },
            });
        }

        const hasPeers = Boolean(deps.detailData.peers?.length);
        if (hasPeers) {
            const isSpeedSorted = deps.peerSortStrategy === "speed";
            entries.push({
                id: isSpeedSorted
                    ? "context.inspector.reset_peer_sort"
                    : "context.inspector.sort_peers_by_speed",
                group: contextGroup,
                title: deps.t(
                    isSpeedSorted
                        ? "command_palette.actions.reset_peer_sort"
                        : "command_palette.actions.sort_peers_by_speed"
                ),
                description: deps.t(
                    isSpeedSorted
                        ? "command_palette.actions.reset_peer_sort_description"
                        : "command_palette.actions.sort_peers_by_speed_description"
                ),
                onSelect: () => {
                    deps.setInspectorTabCommand("peers");
                    deps.setPeerSortStrategy(isSpeedSorted ? "none" : "speed");
                },
            });
        }
    }

    return entries;
}

export interface CommandHotkeyOptions {
    scopes?: string | string[];
    enableOnFormTags?: boolean;
    enableOnContentEditable?: boolean;
}

export interface CommandHotkeyBinding {
    keys: string | string[];
    handler: (event: KeyboardEvent) => void;
    options?: CommandHotkeyOptions;
}

export interface CommandHotkeyBindings {
    selectAll: CommandHotkeyBinding;
    remove: CommandHotkeyBinding;
    showDetails: CommandHotkeyBinding;
    toggleInspector: CommandHotkeyBinding;
    togglePause: CommandHotkeyBinding;
    recheck: CommandHotkeyBinding;
    removeWithData: CommandHotkeyBinding;
}

export interface GlobalHotkeyRefs {
    torrentsRef: MutableRefObject<Torrent[]>;
    selectedIdsRef: MutableRefObject<string[]>;
    selectedTorrentsRef: MutableRefObject<Torrent[]>;
    activeIdRef: MutableRefObject<string | null>;
    detailDataRef: MutableRefObject<TorrentDetail | null>;
    handleRequestDetailsRef: MutableRefObject<
        ((torrent: Torrent) => Promise<void>) | undefined
    >;
    handleCloseDetailRef: MutableRefObject<(() => void) | undefined>;
    handleBulkActionRef: MutableRefObject<
        ((action: TorrentTableAction) => void) | undefined
    >;
    handleTorrentActionRef: MutableRefObject<
        ((action: TorrentTableAction, torrent: Torrent) => void) | undefined
    >;
}

export interface CreateGlobalHotkeyBindingsParams {
    refs: GlobalHotkeyRefs;
    setSelectedIds: (ids: string[]) => void;
    setActiveId: (id: string | null) => void;
    setActivePart: (part: FocusPart) => void;
}

function getPrimaryTorrentForAction(
    refs: GlobalHotkeyRefs
): Torrent | undefined {
    const selection = refs.selectedTorrentsRef.current;
    const primaryId = refs.activeIdRef.current;
    return (
        selection.find((torrent) => torrent.id === primaryId) ?? selection[0]
    );
}

export function createGlobalHotkeyBindings({
    refs,
    setSelectedIds,
    setActiveId,
    setActivePart,
}: CreateGlobalHotkeyBindingsParams): CommandHotkeyBindings {
    const selectAllHandler = (event: KeyboardEvent) => {
        event.preventDefault();
        const ids = refs.torrentsRef.current
            .filter((torrent) => !torrent.isGhost)
            .flatMap((torrent) => (torrent.id ? [torrent.id] : []));
        setSelectedIds(ids);
        setActiveId(ids[0] ?? null);
    };

    const removeHandler = (event: KeyboardEvent) => {
        event.preventDefault();
        const handleBulk = refs.handleBulkActionRef.current;
        const selection = refs.selectedIdsRef.current;
        if (!handleBulk || !selection.length) return;
        void handleBulk("remove");
    };

    const showDetailsHandler = (event: KeyboardEvent) => {
        event.preventDefault();
        const handler = refs.handleRequestDetailsRef.current;
        const primaryTorrent = getPrimaryTorrentForAction(refs);
        if (!handler || !primaryTorrent) return;
        handler(primaryTorrent);
    };

    const toggleInspectorHandler = (event: KeyboardEvent) => {
        event.preventDefault();
        const closeDetail = refs.handleCloseDetailRef.current;
        const requestDetails = refs.handleRequestDetailsRef.current;
        const selection = refs.selectedTorrentsRef.current;
        const currentDetail = refs.detailDataRef.current;
        if (currentDetail) {
            closeDetail?.();
            setActivePart("table");
            return;
        }
        const target =
            selection.find((torrent) => torrent.id === refs.activeIdRef.current) ??
            selection[0];
        if (!target || !requestDetails) return;
        setActivePart("inspector");
        requestDetails(target);
    };

    const togglePauseHandler = (event: KeyboardEvent) => {
        event.preventDefault();
        const handler = refs.handleTorrentActionRef.current;
        const primaryTorrent = getPrimaryTorrentForAction(refs);
        if (!handler || !primaryTorrent) return;
        const isActive =
            primaryTorrent.state === STATUS.torrent.DOWNLOADING ||
            primaryTorrent.state === STATUS.torrent.SEEDING;
        const action: TorrentTableAction = isActive ? "pause" : "resume";
        void handler(action, primaryTorrent);
    };

    const recheckHandler = (event: KeyboardEvent) => {
        event.preventDefault();
        const handleBulk = refs.handleBulkActionRef.current;
        const selection = refs.selectedIdsRef.current;
        if (!handleBulk || !selection.length) return;
        void handleBulk("recheck");
    };

    const removeWithDataHandler = (event: KeyboardEvent) => {
        event.preventDefault();
        const handleBulk = refs.handleBulkActionRef.current;
        const selection = refs.selectedIdsRef.current;
        if (!handleBulk || !selection.length) return;
        void handleBulk("remove-with-data");
    };

    const baseOptions: CommandHotkeyOptions = {
        scopes: KEY_SCOPE.Dashboard,
    };

    return {
        selectAll: {
            keys: KEYMAP[ShortcutIntent.SelectAll],
            handler: selectAllHandler,
            options: baseOptions,
        },
        remove: {
            keys: KEYMAP[ShortcutIntent.Delete],
            handler: removeHandler,
            options: baseOptions,
        },
        showDetails: {
            keys: KEYMAP[ShortcutIntent.ShowDetails],
            handler: showDetailsHandler,
            options: baseOptions,
        },
        toggleInspector: {
            keys: "cmd+i,ctrl+i",
            handler: toggleInspectorHandler,
            options: {
                scopes: KEY_SCOPE.Dashboard,
                enableOnFormTags: true,
                enableOnContentEditable: true,
            },
        },
        togglePause: {
            keys: KEYMAP[ShortcutIntent.TogglePause],
            handler: togglePauseHandler,
            options: baseOptions,
        },
        recheck: {
            keys: KEYMAP[ShortcutIntent.Recheck],
            handler: recheckHandler,
            options: baseOptions,
        },
        removeWithData: {
            keys: KEYMAP[ShortcutIntent.RemoveWithData],
            handler: removeWithDataHandler,
            options: baseOptions,
        },
    };
}
