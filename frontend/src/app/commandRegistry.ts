import { KEY_SCOPE } from "@/config/logic";
import { STATUS } from "@/shared/status";
import type { FocusPart } from "@/app/context/AppShellStateContext";
import type {
    CommandAction,
    CommandActionOutcome,
    CommandPaletteContext,
} from "@/app/components/CommandPalette";
import type { Torrent } from "@/modules/dashboard/types/torrent";
import type { TorrentDetail } from "@/modules/dashboard/types/torrent";
import type { TorrentTableAction } from "@/modules/dashboard/types/torrentTable";
import type {
    DetailTab,
    PeerSortStrategy,
} from "@/modules/dashboard/types/torrentDetail";
import {
    DASHBOARD_FILTERS,
    type DashboardFilter,
} from "@/modules/dashboard/types/dashboardFilter";
import type { TFunction } from "i18next";
import type { TorrentCommandOutcome } from "@/app/context/AppCommandContext";
import {
    BASE_PALETTE_COMMANDS,
    COMMAND_ID,
    HOTKEY_COMMAND_ID,
    HOTKEY_SHORTCUTS,
    type BasePaletteCommandId,
    type CommandGroupId,
    type HotkeyCommandId,
} from "@/app/commandCatalog";

export interface CommandPaletteDeps {
    t: TFunction;
    focusSearchInput: () => void;
    openAddTorrentPicker: () => Promise<TorrentCommandOutcome>;
    openAddMagnet: () => Promise<TorrentCommandOutcome>;
    openSettings: () => void;
    refreshTorrents: () => Promise<void>;
    setFilter: (value: DashboardFilter) => void;
    selectedTorrents: Torrent[];
    detailData: TorrentDetail | null;
    handleBulkAction: (
        action: TorrentTableAction,
    ) => Promise<TorrentCommandOutcome>;
    handleRequestDetails: (torrent: Torrent) => Promise<void>;
    handleFileSelectionChange: (
        fileIndexes: number[],
        extend: boolean,
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

const COMMAND_PALETTE_OUTCOME_SUCCESS: CommandActionOutcome = {
    status: "success",
};
const COMMAND_PALETTE_OUTCOME_FAILED: CommandActionOutcome = {
    status: "failed",
    reason: "execution_failed",
};

const toCommandPaletteOutcome = (
    outcome: TorrentCommandOutcome,
): CommandActionOutcome => {
    if (outcome.status === "success") {
        return COMMAND_PALETTE_OUTCOME_SUCCESS;
    }
    if (outcome.status === "canceled") {
        return { status: "canceled", reason: outcome.reason };
    }
    if (outcome.status === "unsupported") {
        return { status: "unsupported", reason: outcome.reason };
    }
    if (outcome.reason === "refresh_failed") {
        return { status: "failed", reason: "refresh_failed" };
    }
    return COMMAND_PALETTE_OUTCOME_FAILED;
};

const completeAction = async (
    action: () => void | Promise<void>,
): Promise<CommandActionOutcome> => {
    await action();
    return COMMAND_PALETTE_OUTCOME_SUCCESS;
};

export function buildCommandPaletteActions({
    t,
    focusSearchInput,
    openAddTorrentPicker,
    openAddMagnet,
    openSettings,
    refreshTorrents,
    setFilter,
}: CommandPaletteDeps): CommandAction[] {
    const groups: CommandPaletteBaseGroups &
        Record<Exclude<CommandGroupId, "context">, string> = {
        actions: t("command_palette.group.actions"),
        filters: t("command_palette.group.filters"),
        search: t("command_palette.group.search"),
        context: t("command_palette.group.context"),
    };

    const handlers: Record<BasePaletteCommandId, CommandAction["onSelect"]> = {
        [COMMAND_ID.AddTorrent]: async () =>
            toCommandPaletteOutcome(await openAddTorrentPicker()),
        [COMMAND_ID.AddMagnet]: async () =>
            toCommandPaletteOutcome(await openAddMagnet()),
        [COMMAND_ID.OpenSettings]: () => completeAction(openSettings),
        [COMMAND_ID.RefreshTorrents]: () => completeAction(refreshTorrents),
        [COMMAND_ID.FocusSearch]: () => completeAction(focusSearchInput),
        [COMMAND_ID.FilterAll]: () =>
            completeAction(() => setFilter(DASHBOARD_FILTERS.ALL)),
        [COMMAND_ID.FilterDownloading]: () =>
            completeAction(() => setFilter(DASHBOARD_FILTERS.DOWNLOADING)),
        [COMMAND_ID.FilterSeeding]: () =>
            completeAction(() => setFilter(DASHBOARD_FILTERS.SEEDING)),
    };

    return BASE_PALETTE_COMMANDS.map((entry) => ({
        id: entry.id,
        group: groups[entry.group],
        title: t(entry.titleKey),
        description: t(entry.descriptionKey),
        onSelect: handlers[entry.id],
    }));
}

export function buildContextCommandActions(
    deps: CommandPaletteDeps,
    activePart: CommandPaletteContext["activePart"],
): CommandAction[] {
    const contextGroup = deps.t("command_palette.group.context");
    const entries: CommandAction[] = [];

    if (activePart === "table" && deps.selectedTorrents.length) {
        entries.push(
            {
                id: COMMAND_ID.ContextPauseSelected,
                group: contextGroup,
                title: deps.t("command_palette.actions.pause_selected"),
                description: deps.t(
                    "command_palette.actions.pause_selected_description",
                ),
                onSelect: async () =>
                    toCommandPaletteOutcome(
                        await deps.handleBulkAction("pause"),
                    ),
            },
            {
                id: COMMAND_ID.ContextResumeSelected,
                group: contextGroup,
                title: deps.t("command_palette.actions.resume_selected"),
                description: deps.t(
                    "command_palette.actions.resume_selected_description",
                ),
                onSelect: async () =>
                    toCommandPaletteOutcome(
                        await deps.handleBulkAction("resume"),
                    ),
            },
            {
                id: COMMAND_ID.ContextRecheckSelected,
                group: contextGroup,
                title: deps.t("command_palette.actions.recheck_selected"),
                description: deps.t(
                    "command_palette.actions.recheck_selected_description",
                ),
                onSelect: async () =>
                    toCommandPaletteOutcome(
                        await deps.handleBulkAction("recheck"),
                    ),
            },
        );

        const targetTorrent = deps.selectedTorrents[0];
        if (targetTorrent) {
            entries.push({
                id: COMMAND_ID.ContextOpenInspector,
                group: contextGroup,
                title: deps.t("command_palette.actions.open_inspector"),
                description: deps.t(
                    "command_palette.actions.open_inspector_description",
                ),
                onSelect: () =>
                    completeAction(() =>
                        deps.handleRequestDetails(targetTorrent),
                    ),
            });
        }
    }

    if (activePart === "inspector" && deps.detailData) {
        const fileIndexes =
            deps.detailData.files?.map((file) => file.index) ?? [];
        if (fileIndexes.length) {
            entries.push({
                id: COMMAND_ID.ContextSelectAllFiles,
                group: contextGroup,
                title: deps.t("command_palette.actions.select_all_files"),
                description: deps.t(
                    "command_palette.actions.select_all_files_description",
                ),
                onSelect: () =>
                    completeAction(() => {
                        deps.setInspectorTabCommand("content");
                        return deps.handleFileSelectionChange(
                            fileIndexes,
                            true,
                        );
                    }),
            });
        }

        const hasPeers = Boolean(deps.detailData.peers?.length);
        if (hasPeers) {
            const isSpeedSorted = deps.peerSortStrategy === "speed";
            entries.push({
                id: isSpeedSorted
                    ? COMMAND_ID.ContextResetPeerSort
                    : COMMAND_ID.ContextSortPeersBySpeed,
                group: contextGroup,
                title: deps.t(
                    isSpeedSorted
                        ? "command_palette.actions.reset_peer_sort"
                        : "command_palette.actions.sort_peers_by_speed",
                ),
                description: deps.t(
                    isSpeedSorted
                        ? "command_palette.actions.reset_peer_sort_description"
                        : "command_palette.actions.sort_peers_by_speed_description",
                ),
                onSelect: () =>
                    completeAction(() => {
                        deps.setInspectorTabCommand("peers");
                        deps.setPeerSortStrategy(
                            isSpeedSorted ? "none" : "speed",
                        );
                    }),
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

export type CommandHotkeyBindings = Record<
    HotkeyCommandId,
    CommandHotkeyBinding
>;

export interface GlobalHotkeyStateSnapshot {
    torrents: Torrent[];
    selectedIds: string[];
    selectedTorrents: Torrent[];
    activeId: string | null;
    detailData: TorrentDetail | null;
}

export interface GlobalHotkeyController {
    getState: () => GlobalHotkeyStateSnapshot;
    handleRequestDetails: (torrent: Torrent) => Promise<void>;
    handleCloseDetail: () => void;
    handleBulkAction: (
        action: TorrentTableAction,
    ) => Promise<TorrentCommandOutcome>;
    handleTorrentAction: (
        action: TorrentTableAction,
        torrent: Torrent,
    ) => Promise<TorrentCommandOutcome>;
}

export interface CreateGlobalHotkeyBindingsParams {
    controller: GlobalHotkeyController;
    setSelectedIds: (ids: readonly string[]) => void;
    setActiveId: (id: string | null) => void;
    setActivePart: (part: FocusPart) => void;
}

function getPrimaryTorrentForAction(
    state: GlobalHotkeyStateSnapshot,
): Torrent | undefined {
    const selection = state.selectedTorrents;
    const primaryId = state.activeId;
    return (
        selection.find((torrent) => torrent.id === primaryId) ?? selection[0]
    );
}

export function createGlobalHotkeyBindings({
    controller,
    setSelectedIds,
    setActiveId,
    setActivePart,
}: CreateGlobalHotkeyBindingsParams): CommandHotkeyBindings {
    const selectAllHandler = (event: KeyboardEvent) => {
        event.preventDefault();
        const { torrents } = controller.getState();
        const ids = torrents
            .filter((torrent) => !torrent.isGhost)
            .flatMap((torrent) => (torrent.id ? [torrent.id] : []));
        setSelectedIds(ids);
        setActiveId(ids[0] ?? null);
    };

    const removeHandler = (event: KeyboardEvent) => {
        event.preventDefault();
        const { selectedIds } = controller.getState();
        if (!selectedIds.length) return;
        void controller.handleBulkAction("remove");
    };

    const showDetailsHandler = (event: KeyboardEvent) => {
        event.preventDefault();
        const primaryTorrent = getPrimaryTorrentForAction(
            controller.getState(),
        );
        if (!primaryTorrent) return;
        void controller.handleRequestDetails(primaryTorrent);
    };

    const toggleInspectorHandler = (event: KeyboardEvent) => {
        event.preventDefault();
        const state = controller.getState();
        const selection = state.selectedTorrents;
        const currentDetail = state.detailData;
        if (currentDetail) {
            controller.handleCloseDetail();
            setActivePart("table");
            return;
        }
        const target =
            selection.find((torrent) => torrent.id === state.activeId) ??
            selection[0];
        if (!target) return;
        setActivePart("inspector");
        void controller.handleRequestDetails(target);
    };

    const togglePauseHandler = (event: KeyboardEvent) => {
        event.preventDefault();
        const primaryTorrent = getPrimaryTorrentForAction(
            controller.getState(),
        );
        if (!primaryTorrent) return;
        const isActive =
            primaryTorrent.state === STATUS.torrent.DOWNLOADING ||
            primaryTorrent.state === STATUS.torrent.SEEDING;
        const action: TorrentTableAction = isActive ? "pause" : "resume";
        void controller.handleTorrentAction(action, primaryTorrent);
    };

    const recheckHandler = (event: KeyboardEvent) => {
        event.preventDefault();
        const { selectedIds } = controller.getState();
        if (!selectedIds.length) return;
        void controller.handleBulkAction("recheck");
    };

    const removeWithDataHandler = (event: KeyboardEvent) => {
        event.preventDefault();
        const { selectedIds } = controller.getState();
        if (!selectedIds.length) return;
        void controller.handleBulkAction("remove-with-data");
    };

    const baseOptions: CommandHotkeyOptions = {
        scopes: KEY_SCOPE.Dashboard,
    };

    const hotkeyOptions: Record<HotkeyCommandId, CommandHotkeyOptions> = {
        [HOTKEY_COMMAND_ID.SelectAll]: baseOptions,
        [HOTKEY_COMMAND_ID.Remove]: baseOptions,
        [HOTKEY_COMMAND_ID.ShowDetails]: baseOptions,
        [HOTKEY_COMMAND_ID.ToggleInspector]: {
            scopes: KEY_SCOPE.Dashboard,
            enableOnFormTags: true,
            enableOnContentEditable: true,
        },
        [HOTKEY_COMMAND_ID.TogglePause]: baseOptions,
        [HOTKEY_COMMAND_ID.Recheck]: baseOptions,
        [HOTKEY_COMMAND_ID.RemoveWithData]: baseOptions,
    };

    return {
        [HOTKEY_COMMAND_ID.SelectAll]: {
            keys: HOTKEY_SHORTCUTS[HOTKEY_COMMAND_ID.SelectAll],
            handler: selectAllHandler,
            options: hotkeyOptions[HOTKEY_COMMAND_ID.SelectAll],
        },
        [HOTKEY_COMMAND_ID.Remove]: {
            keys: HOTKEY_SHORTCUTS[HOTKEY_COMMAND_ID.Remove],
            handler: removeHandler,
            options: hotkeyOptions[HOTKEY_COMMAND_ID.Remove],
        },
        [HOTKEY_COMMAND_ID.ShowDetails]: {
            keys: HOTKEY_SHORTCUTS[HOTKEY_COMMAND_ID.ShowDetails],
            handler: showDetailsHandler,
            options: hotkeyOptions[HOTKEY_COMMAND_ID.ShowDetails],
        },
        [HOTKEY_COMMAND_ID.ToggleInspector]: {
            keys: HOTKEY_SHORTCUTS[HOTKEY_COMMAND_ID.ToggleInspector],
            handler: toggleInspectorHandler,
            options: hotkeyOptions[HOTKEY_COMMAND_ID.ToggleInspector],
        },
        [HOTKEY_COMMAND_ID.TogglePause]: {
            keys: HOTKEY_SHORTCUTS[HOTKEY_COMMAND_ID.TogglePause],
            handler: togglePauseHandler,
            options: hotkeyOptions[HOTKEY_COMMAND_ID.TogglePause],
        },
        [HOTKEY_COMMAND_ID.Recheck]: {
            keys: HOTKEY_SHORTCUTS[HOTKEY_COMMAND_ID.Recheck],
            handler: recheckHandler,
            options: hotkeyOptions[HOTKEY_COMMAND_ID.Recheck],
        },
        [HOTKEY_COMMAND_ID.RemoveWithData]: {
            keys: HOTKEY_SHORTCUTS[HOTKEY_COMMAND_ID.RemoveWithData],
            handler: removeWithDataHandler,
            options: hotkeyOptions[HOTKEY_COMMAND_ID.RemoveWithData],
        },
    };
}
