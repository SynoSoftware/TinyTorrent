import { Shortcuts } from "@/app/controlPlane/shortcuts";
import { status } from "@/shared/status";
import type { FocusPart } from "@/app/context/AppShellStateContext";
import type {
    CommandAction,
    CommandActionOutcome,
    CommandPaletteContext,
} from "@/app/components/CommandPalette";
import type { TorrentEntity as Torrent } from "@/services/rpc/entities";
import type { TorrentDetailEntity as TorrentDetail } from "@/services/rpc/entities";
import type { TorrentTableAction } from "@/modules/dashboard/types/torrentTable";
import type {
    DetailTab,
    PeerSortStrategy,
} from "@/modules/dashboard/types/contracts";
import {
    dashboardFilters,
    type DashboardFilter,
} from "@/modules/dashboard/types/dashboardFilter";
import type { TFunction } from "i18next";
import {
    commandOutcome,
    commandReason,
    isCommandCanceled,
    isCommandSuccess,
    isCommandUnsupported,
    type TorrentCommandOutcome,
} from "@/app/context/AppCommandContext";
import {
    BASE_PALETTE_COMMANDS,
    commandId,
    hotkeyCommandId,
    hotkeyShortcuts,
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

const commandPaletteOutcomeSuccess: CommandActionOutcome =
    commandOutcome.success();
const commandPaletteOutcomeFailed: CommandActionOutcome =
    commandOutcome.failed(commandReason.executionFailed);

const toCommandPaletteOutcome = (
    outcome: TorrentCommandOutcome,
): CommandActionOutcome => {
    if (isCommandSuccess(outcome)) {
        return commandPaletteOutcomeSuccess;
    }
    if (isCommandCanceled(outcome)) {
        return { status: "canceled", reason: outcome.reason };
    }
    if (isCommandUnsupported(outcome)) {
        return { status: "unsupported", reason: outcome.reason };
    }
    if (outcome.reason === commandReason.refreshFailed) {
        return { status: "failed", reason: "refresh_failed" };
    }
    return commandPaletteOutcomeFailed;
};

const completeAction = async (
    action: () => void | Promise<void>,
): Promise<CommandActionOutcome> => {
    await action();
    return commandPaletteOutcomeSuccess;
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
        [commandId.AddTorrent]: async () =>
            toCommandPaletteOutcome(await openAddTorrentPicker()),
        [commandId.AddMagnet]: async () =>
            toCommandPaletteOutcome(await openAddMagnet()),
        [commandId.OpenSettings]: () => completeAction(openSettings),
        [commandId.RefreshTorrents]: () => completeAction(refreshTorrents),
        [commandId.FocusSearch]: () => completeAction(focusSearchInput),
        [commandId.FilterAll]: () =>
            completeAction(() => setFilter(dashboardFilters.all)),
        [commandId.FilterDownloading]: () =>
            completeAction(() => setFilter(dashboardFilters.downloading)),
        [commandId.FilterSeeding]: () =>
            completeAction(() => setFilter(dashboardFilters.seeding)),
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
                id: commandId.ContextPauseSelected,
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
                id: commandId.ContextResumeSelected,
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
                id: commandId.ContextRecheckSelected,
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
                id: commandId.ContextOpenInspector,
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
                id: commandId.ContextSelectAllFiles,
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
                    ? commandId.ContextResetPeerSort
                    : commandId.ContextSortPeersBySpeed,
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
            primaryTorrent.state === status.torrent.downloading ||
            primaryTorrent.state === status.torrent.seeding;
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
        scopes: Shortcuts.scopes.Dashboard,
    };

    const hotkeyOptions: Record<HotkeyCommandId, CommandHotkeyOptions> = {
        [hotkeyCommandId.SelectAll]: baseOptions,
        [hotkeyCommandId.Remove]: baseOptions,
        [hotkeyCommandId.ShowDetails]: baseOptions,
        [hotkeyCommandId.ToggleInspector]: {
            scopes: Shortcuts.scopes.Dashboard,
            enableOnFormTags: true,
            enableOnContentEditable: true,
        },
        [hotkeyCommandId.TogglePause]: baseOptions,
        [hotkeyCommandId.Recheck]: baseOptions,
        [hotkeyCommandId.RemoveWithData]: baseOptions,
    };

    return {
        [hotkeyCommandId.SelectAll]: {
            keys: hotkeyShortcuts[hotkeyCommandId.SelectAll],
            handler: selectAllHandler,
            options: hotkeyOptions[hotkeyCommandId.SelectAll],
        },
        [hotkeyCommandId.Remove]: {
            keys: hotkeyShortcuts[hotkeyCommandId.Remove],
            handler: removeHandler,
            options: hotkeyOptions[hotkeyCommandId.Remove],
        },
        [hotkeyCommandId.ShowDetails]: {
            keys: hotkeyShortcuts[hotkeyCommandId.ShowDetails],
            handler: showDetailsHandler,
            options: hotkeyOptions[hotkeyCommandId.ShowDetails],
        },
        [hotkeyCommandId.ToggleInspector]: {
            keys: hotkeyShortcuts[hotkeyCommandId.ToggleInspector],
            handler: toggleInspectorHandler,
            options: hotkeyOptions[hotkeyCommandId.ToggleInspector],
        },
        [hotkeyCommandId.TogglePause]: {
            keys: hotkeyShortcuts[hotkeyCommandId.TogglePause],
            handler: togglePauseHandler,
            options: hotkeyOptions[hotkeyCommandId.TogglePause],
        },
        [hotkeyCommandId.Recheck]: {
            keys: hotkeyShortcuts[hotkeyCommandId.Recheck],
            handler: recheckHandler,
            options: hotkeyOptions[hotkeyCommandId.Recheck],
        },
        [hotkeyCommandId.RemoveWithData]: {
            keys: hotkeyShortcuts[hotkeyCommandId.RemoveWithData],
            handler: removeWithDataHandler,
            options: hotkeyOptions[hotkeyCommandId.RemoveWithData],
        },
    };
}


