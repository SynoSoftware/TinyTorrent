import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { Textarea, Tooltip, cn } from "@heroui/react";
import { flexRender } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronsUpDown, Copy, Link2, Plus, RefreshCcw, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { GlassPanel } from "@/shared/ui/layout/GlassPanel";
import { ModalEx } from "@/shared/ui/layout/ModalEx";
import { CONTEXT_MENU, DETAILS, INPUT, SURFACE } from "@/shared/ui/layout/glass-surface";
import { useTorrentDetailsTrackersViewModel } from "@/modules/dashboard/hooks/useTorrentDetailsTrackersViewModel";
import type { TorrentTrackerEntity } from "@/services/rpc/entities";
import type {
    TorrentDetailsTrackersViewModel,
    TrackerRowViewModel,
} from "@/modules/dashboard/hooks/useTorrentDetailsTrackersViewModel";
import type { TorrentDetailHeaderAction } from "@/modules/dashboard/types/torrentDetailHeader";

interface TrackersTabProps {
    torrentId: string | number | null;
    torrentName: string;
    trackers: TorrentTrackerEntity[];
    emptyMessage: string;
    isStandalone?: boolean;
    addTrackers: (
        torrentId: string | number,
        trackers: string[],
    ) => Promise<{ status: "applied" | "unsupported" | "failed" }>;
    removeTrackers: (
        torrentId: string | number,
        trackerIds: number[],
    ) => Promise<{ status: "applied" | "unsupported" | "failed" }>;
    reannounce: (torrentId: string | number) => Promise<{ status: "applied" | "unsupported" | "failed" }>;
    registerHeaderActions?: (actions: TorrentDetailHeaderAction[]) => void;
}

const TRACKER_COLUMN_WIDTHS = ["10%", "24%", "8%", "7%", "7%", "8%", "8%", "11%", "11%", "6%"] as const;

const TRACKER_UI = {
    scroll: `${DETAILS.table.scroll} relative outline-none`,
    table: `${DETAILS.table.table} table-fixed`,
    headerCell: `${DETAILS.table.tableHeadCell} ${SURFACE.chrome.sticky} top-0 z-sticky bg-content1/80 backdrop-blur-sm`,
    headerButton:
        "flex w-full items-center gap-tight text-left text-inherit transition-colors hover:text-foreground/80 whitespace-normal break-words",
    headerButtonEnd: "justify-end",
    row: `${DETAILS.table.tableRow} cursor-default`,
    rowSelected: "surface-layer-1 outline outline-1 -outline-offset-1 outline-primary/20",
    bodyCell: `${DETAILS.table.tableBody} border-b border-default/5 px-tight py-panel align-middle`,
    statusCell: "flex items-center gap-tight min-w-0",
    trackerCell: "min-w-0 truncate font-medium text-foreground/85",
    trackerText: "truncate",
    tierCell: "text-center text-foreground/60",
    metricCell: "text-right tabular-nums text-foreground/70",
    timeCell: "text-right tabular-nums text-foreground/60",
    messageCell: "truncate text-foreground/55",
    tierBadge: `${SURFACE.atom.insetRounded} inline-flex min-w-0 items-center px-tight py-tight text-label font-semibold text-foreground/65`,
    modalPanel: `${SURFACE.surface.panelInfo} p-panel space-y-panel`,
    modalError: "text-danger",
};

const getStatusDotClass = (tone: TrackerRowViewModel["statusTone"]) => {
    if (tone === "success") {
        return "size-dot rounded-full shadow-dot bg-success shadow-success/50";
    }
    if (tone === "warning") {
        return "size-dot rounded-full shadow-dot bg-warning shadow-warning/50";
    }
    if (tone === "danger") {
        return "size-dot rounded-full surface-layer-1 border border-danger/45";
    }
    return "size-dot rounded-full surface-layer-1 border border-default/20";
};

const sortIcon = (direction: false | "asc" | "desc") => {
    if (direction === "asc") {
        return ArrowUp;
    }
    if (direction === "desc") {
        return ArrowDown;
    }
    return ChevronsUpDown;
};

const renderHeaderLabel = (value: unknown) =>
    typeof value === "string" || typeof value === "number" ? String(value) : null;

const TrackerRow = ({ row, viewModel }: { row: TrackerRowViewModel; viewModel: TorrentDetailsTrackersViewModel }) => (
    <tr
        key={row.key}
        className={cn(TRACKER_UI.row, row.selected && TRACKER_UI.rowSelected)}
        onClick={(event) => viewModel.actions.handleRowClick(event, row.key, row.index)}
        onContextMenu={(event) => viewModel.actions.openContextMenu(event, row.key, row.index)}
    >
        <td className={TRACKER_UI.bodyCell}>
            <div className={TRACKER_UI.statusCell}>
                <div className={getStatusDotClass(row.statusTone)} />
                <span className="truncate">{row.statusLabel}</span>
            </div>
        </td>
        <td className={TRACKER_UI.bodyCell}>
            <Tooltip content={row.announce} classNames={SURFACE.tooltip} delay={500}>
                <div className={TRACKER_UI.trackerCell}>
                    <span className={TRACKER_UI.trackerText}>{row.announce}</span>
                </div>
            </Tooltip>
        </td>
        <td className={cn(TRACKER_UI.bodyCell, TRACKER_UI.tierCell)}>
            <span className={TRACKER_UI.tierBadge}>{row.tierLabel}</span>
        </td>
        <td className={cn(TRACKER_UI.bodyCell, TRACKER_UI.metricCell)}>{row.seedsLabel}</td>
        <td className={cn(TRACKER_UI.bodyCell, TRACKER_UI.metricCell)}>{row.leechesLabel}</td>
        <td className={cn(TRACKER_UI.bodyCell, TRACKER_UI.metricCell)}>{row.downloadCountLabel}</td>
        <td className={cn(TRACKER_UI.bodyCell, TRACKER_UI.metricCell)}>{row.downloadersLabel}</td>
        <td className={cn(TRACKER_UI.bodyCell, TRACKER_UI.timeCell)}>
            <Tooltip content={row.lastAnnounceTooltip} classNames={SURFACE.tooltip} delay={500}>
                <span className="truncate">{row.lastAnnounceLabel}</span>
            </Tooltip>
        </td>
        <td className={cn(TRACKER_UI.bodyCell, TRACKER_UI.timeCell)}>
            <Tooltip content={row.nextAnnounceTooltip} classNames={SURFACE.tooltip} delay={500}>
                <span className="truncate">{row.nextAnnounceLabel}</span>
            </Tooltip>
        </td>
        <td className={TRACKER_UI.bodyCell}>
            <Tooltip content={row.messageTooltip} classNames={SURFACE.tooltip} delay={500}>
                <div className={TRACKER_UI.messageCell}>{row.messageText}</div>
            </Tooltip>
        </td>
    </tr>
);

export const TrackersTab = ({
    torrentId,
    torrentName,
    trackers,
    emptyMessage,
    isStandalone = false,
    addTrackers,
    removeTrackers,
    reannounce,
    registerHeaderActions,
}: TrackersTabProps) => {
    const listRef = useRef<HTMLDivElement | null>(null);
    const viewModel = useTorrentDetailsTrackersViewModel({
        torrentId,
        torrentName,
        trackers,
        emptyMessage,
        listRef,
        addTrackers,
        removeTrackers,
        reannounce,
    });

    const shell = (content: ReactNode) =>
        isStandalone ? <GlassPanel className={DETAILS.table.panel}>{content}</GlassPanel> : content;

    const trackerActions = viewModel.actions;
    const trackerState = viewModel.state;
    const trackerLabels = viewModel.labels;

    const headerActions = useMemo<TorrentDetailHeaderAction[]>(() => {
        if (!registerHeaderActions) {
            return [];
        }
        const actions: TorrentDetailHeaderAction[] = [];
        const canMutate = !trackerState.isMutating;
        if (torrentId != null && canMutate) {
            actions.push({
                icon: Plus,
                ariaLabel: viewModel.labels.addLabel,
                onPress: viewModel.actions.openAddModal,
                tone: "success",
            });
        }
        if (torrentId != null && canMutate && trackerState.canRemove && trackerState.selectedCount > 0) {
            actions.push({
                icon: Trash2,
                ariaLabel: trackerState.selectedCount > 1 ? trackerLabels.removeManyLabel : trackerLabels.removeLabel,
                onPress: () => {
                    void trackerActions.removeSelected();
                },
                tone: "danger",
            });
        }
        if (torrentId != null && canMutate) {
            actions.push({
                icon: RefreshCcw,
                ariaLabel: trackerLabels.reannounceLabel,
                onPress: () => {
                    void trackerActions.reannounceTorrent();
                },
                tone: "neutral",
            });
        }
        if (canMutate) {
            actions.push({
                icon: Copy,
                ariaLabel: trackerLabels.copyAllLabel,
                onPress: () => {
                    void trackerActions.copyAllTrackers();
                },
                tone: "default",
            });
        }
        return actions;
    }, [
        registerHeaderActions,
        torrentId,
        trackerState.isMutating,
        trackerState.canRemove,
        trackerState.selectedCount,
        trackerLabels.addLabel,
        trackerLabels.removeLabel,
        trackerLabels.removeManyLabel,
        trackerLabels.reannounceLabel,
        trackerLabels.copyAllLabel,
        trackerActions.openAddModal,
        trackerActions.removeSelected,
        trackerActions.reannounceTorrent,
        trackerActions.copyAllTrackers,
    ]);

    useEffect(() => {
        if (!registerHeaderActions) {
            return undefined;
        }
        registerHeaderActions(headerActions);
        return () => registerHeaderActions([]);
    }, [headerActions, registerHeaderActions]);

    if (viewModel.state.isEmpty) {
        return shell(
            <div className={DETAILS.table.emptyPanel}>
                <p className={DETAILS.table.emptyText}>{viewModel.labels.emptyMessage}</p>
                <TrackerEditorModal viewModel={viewModel} />
            </div>,
        );
    }

    return (
        <div className={DETAILS.table.root}>
            <div className={DETAILS.table.body}>
                {shell(
                    <div
                        ref={listRef}
                        className={TRACKER_UI.scroll}
                        tabIndex={0}
                        onKeyDown={viewModel.actions.handleListKeyDown}
                    >
                        <table className={TRACKER_UI.table}>
                            <colgroup>
                                {TRACKER_COLUMN_WIDTHS.map((width, index) => (
                                    <col key={`${index}:${width}`} style={{ width }} />
                                ))}
                            </colgroup>
                            <thead className={DETAILS.table.tableHeadRow}>
                                {viewModel.table.headerGroups.map((headerGroup) => (
                                    <tr key={headerGroup.id}>
                                        {headerGroup.headers.map((header) => {
                                            const label = renderHeaderLabel(
                                                flexRender(header.column.columnDef.header, header.getContext()),
                                            );
                                            const isSortable = header.column.getCanSort();
                                            const Icon = sortIcon(header.column.getIsSorted());
                                            const alignEnd =
                                                header.column.id === "seeders" ||
                                                header.column.id === "leechers" ||
                                                header.column.id === "downloadedCount" ||
                                                header.column.id === "downloaders" ||
                                                header.column.id === "lastAnnounce" ||
                                                header.column.id === "nextAnnounce";

                                            return (
                                                <th key={header.id} scope="col" className={TRACKER_UI.headerCell}>
                                                    {isSortable ? (
                                                        <button
                                                            type="button"
                                                            className={cn(
                                                                TRACKER_UI.headerButton,
                                                                alignEnd && TRACKER_UI.headerButtonEnd,
                                                            )}
                                                            onClick={header.column.getToggleSortingHandler()}
                                                        >
                                                            <span className="truncate">{label}</span>
                                                            <Icon className="toolbar-icon-size-sm shrink-0" />
                                                        </button>
                                                    ) : (
                                                        <span
                                                            className={cn("block truncate", alignEnd && "text-right")}
                                                        >
                                                            {label}
                                                        </span>
                                                    )}
                                                </th>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </thead>
                            <tbody>
                                {viewModel.data.rows.map((row) => (
                                    <TrackerRow key={row.key} row={row} viewModel={viewModel} />
                                ))}
                            </tbody>
                        </table>
                        {viewModel.state.contextMenu && <TrackerContextMenu viewModel={viewModel} />}
                    </div>,
                )}
            </div>
            <TrackerEditorModal viewModel={viewModel} />
        </div>
    );
};

const TrackerContextMenu = ({ viewModel }: { viewModel: TorrentDetailsTrackersViewModel }) => {
    if (!viewModel.state.contextMenu) {
        return null;
    }

    return (
        <div
            className={CONTEXT_MENU.panel}
            style={CONTEXT_MENU.builder.panelStyle({
                x: viewModel.state.contextMenu.x,
                y: viewModel.state.contextMenu.y,
            })}
            onPointerDown={(event) => event.stopPropagation()}
        >
            <div className={CONTEXT_MENU.header}>
                <Link2 className={CONTEXT_MENU.headerIcon} />
                <span className={CONTEXT_MENU.headerText}>{viewModel.labels.selectionSummary}</span>
            </div>
            <ContextButton
                label={
                    viewModel.state.selectedCount > 1 ? viewModel.labels.removeManyLabel : viewModel.labels.removeLabel
                }
                onPress={() => viewModel.actions.runContextAction("remove")}
                danger
                disabled={!viewModel.state.canRemove || viewModel.state.isMutating}
            />
            <ContextButton
                label={viewModel.labels.copyUrlLabel}
                onPress={() => viewModel.actions.runContextAction("copy_url")}
                disabled={!viewModel.state.canCopySelection}
            />
            <ContextButton
                label={viewModel.labels.copyHostLabel}
                onPress={() => viewModel.actions.runContextAction("copy_host")}
                disabled={!viewModel.state.canCopySelection}
            />
            <ContextButton
                label={viewModel.labels.copyAllLabel}
                onPress={() => viewModel.actions.runContextAction("copy_all")}
            />
            <ContextButton
                label={viewModel.labels.reannounceLabel}
                onPress={() => viewModel.actions.runContextAction("reannounce")}
                disabled={viewModel.state.isMutating}
            />
        </div>
    );
};

const ContextButton = ({
    label,
    onPress,
    danger = false,
    disabled = false,
}: {
    label: string;
    onPress: () => Promise<void>;
    danger?: boolean;
    disabled?: boolean;
}) => (
    <button
        type="button"
        className={danger ? CONTEXT_MENU.dangerActionButton : CONTEXT_MENU.actionButton}
        disabled={disabled}
        onClick={() => {
            if (disabled) {
                return;
            }
            void onPress();
        }}
    >
        {label}
    </button>
);

const TrackerEditorModal = ({ viewModel }: { viewModel: TorrentDetailsTrackersViewModel }) => {
    const { t } = useTranslation();
    return (
        <ModalEx
            open={viewModel.state.editor.isOpen}
            onClose={viewModel.actions.closeEditor}
            title={viewModel.labels.modalTitle}
            icon={Link2}
            size="sm"
            disableClose={viewModel.state.isMutating}
            secondaryAction={{
                label: t("modals.cancel"),
                onPress: viewModel.actions.closeEditor,
                disabled: viewModel.state.isMutating,
            }}
            primaryAction={{
                label: viewModel.labels.addLabel,
                onPress: () => {
                    void viewModel.actions.submitEditor();
                },
                loading: viewModel.state.isMutating,
                disabled: viewModel.state.isMutating,
            }}
        >
            <div className={TRACKER_UI.modalPanel}>
                <Textarea
                    value={viewModel.state.editor.value}
                    onValueChange={viewModel.actions.setEditorValue}
                    minRows={7}
                    placeholder={viewModel.labels.modalPlaceholder}
                    variant="bordered"
                    classNames={INPUT.codeTextareaClassNames}
                />
                {viewModel.state.editor.error ? (
                    <p className={TRACKER_UI.modalError}>{viewModel.state.editor.error}</p>
                ) : null}
            </div>
        </ModalEx>
    );
};

export default TrackersTab;
