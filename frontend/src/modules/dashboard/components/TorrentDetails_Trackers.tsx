/* eslint-disable react-hooks/refs */
import { memo, type ReactNode } from "react";
import { cn } from "@heroui/react";
import { flexRender } from "@tanstack/react-table";
import {
    ArrowDown,
    ArrowUp,
    ChevronsUpDown,
    Copy,
    Link2,
    Pencil,
    RefreshCcw,
    Trash2,
    type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { registry } from "@/config/logic";
import { uiRoles } from "@/shared/ui/uiRoles";
import AppTooltip from "@/shared/ui/components/AppTooltip";
import { GlassPanel } from "@/shared/ui/layout/GlassPanel";
import { ModalEx } from "@/shared/ui/layout/ModalEx";
import { contextMenu, details, form, input, surface } from "@/shared/ui/layout/glass-surface";
import type {
    TorrentDetailsTrackersViewModel,
    TrackerRowViewModel,
} from "@/modules/dashboard/hooks/useTorrentDetailsTrackersViewModel";
const { visuals } = registry;

interface TrackersTabProps {
    viewModel: TorrentDetailsTrackersViewModel | null;
    isStandalone?: boolean;
}

const TRACKER_COLUMN_WIDTHS = ["10%", "24%", "8%", "7%", "7%", "8%", "8%", "11%", "11%", "6%"] as const;

type TrackerState = TorrentDetailsTrackersViewModel["state"];
type TrackerLabels = TorrentDetailsTrackersViewModel["labels"];
type TrackerActions = TorrentDetailsTrackersViewModel["actions"];
type TrackerRefs = TorrentDetailsTrackersViewModel["refs"];

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

const TRACKER_ROW_CLASS = cn(details.table.tableRow, "cursor-default");

const TRACKER_BODY_CELL_CLASS = cn(
    details.table.tableBody,
    visuals.trackerTable.bodyCell,
    "px-tight py-panel align-middle",
);

const TRACKER_METRIC_CELL_CLASS = cn(
    TRACKER_BODY_CELL_CLASS,
    visuals.trackerTable.metricCell,
    "text-right tabular-nums",
);

const TRACKER_TIME_CELL_CLASS = cn(TRACKER_BODY_CELL_CLASS, visuals.trackerTable.timeCell, "text-right tabular-nums");

const TrackerRow = memo(
    ({
        row,
        onRowClick,
        onContextMenu,
    }: {
        row: TrackerRowViewModel;
        onRowClick: TorrentDetailsTrackersViewModel["actions"]["handleRowClick"];
        onContextMenu: TorrentDetailsTrackersViewModel["actions"]["openContextMenu"];
    }) => (
        <tr
            key={row.key}
            className={cn(TRACKER_ROW_CLASS, row.selected && visuals.trackerTable.rowSelected)}
            onClick={(event) => onRowClick(event, row.key, row.index)}
            onContextMenu={(event) => onContextMenu(event, row.key, row.index)}
        >
            <td className={TRACKER_BODY_CELL_CLASS}>
                <div className="flex min-w-0 items-center gap-tight">
                    <div className={visuals.trackerTable.statusDot[row.statusTone]} />
                    <span className="truncate">{row.statusLabel}</span>
                </div>
            </td>
            <td className={TRACKER_BODY_CELL_CLASS}>
                <AppTooltip content={row.announce} native>
                    <div className={cn("min-w-0 truncate", visuals.trackerTable.trackerCell)}>
                        <span className="truncate">{row.announce}</span>
                    </div>
                </AppTooltip>
            </td>
            <td
                className={cn(
                    details.table.tableBody,
                    visuals.trackerTable.bodyCell,
                    visuals.trackerTable.tierCell,
                    "px-tight py-panel align-middle text-center",
                )}
            >
                <span
                    className={cn(
                        surface.atom.insetRounded,
                        visuals.trackerTable.tierBadge,
                        "inline-flex min-w-0 items-center px-tight py-tight",
                    )}
                >
                    {row.tierLabel}
                </span>
            </td>
            <td className={TRACKER_METRIC_CELL_CLASS}>{row.seedsLabel}</td>
            <td className={TRACKER_METRIC_CELL_CLASS}>{row.leechesLabel}</td>
            <td className={TRACKER_METRIC_CELL_CLASS}>{row.downloadCountLabel}</td>
            <td className={TRACKER_METRIC_CELL_CLASS}>{row.downloadersLabel}</td>
            <td className={TRACKER_TIME_CELL_CLASS}>
                <AppTooltip content={row.lastAnnounceTooltip} native>
                    <span className="truncate">{row.lastAnnounceLabel}</span>
                </AppTooltip>
            </td>
            <td className={TRACKER_TIME_CELL_CLASS}>
                <AppTooltip content={row.nextAnnounceTooltip} native>
                    <span className="truncate">{row.nextAnnounceLabel}</span>
                </AppTooltip>
            </td>
            <td className={TRACKER_BODY_CELL_CLASS}>
                <AppTooltip content={row.messageTooltip} native>
                    <div className={cn("truncate", visuals.trackerTable.messageCell)}>{row.messageText}</div>
                </AppTooltip>
            </td>
        </tr>
    ),
    (prevProps, nextProps) => {
        const prevRow = prevProps.row;
        const nextRow = nextProps.row;
        return (
            prevRow.key === nextRow.key &&
            prevRow.index === nextRow.index &&
            prevRow.selected === nextRow.selected &&
            prevRow.statusTone === nextRow.statusTone &&
            prevRow.statusLabel === nextRow.statusLabel &&
            prevRow.announce === nextRow.announce &&
            prevRow.tierLabel === nextRow.tierLabel &&
            prevRow.seedsLabel === nextRow.seedsLabel &&
            prevRow.leechesLabel === nextRow.leechesLabel &&
            prevRow.downloadCountLabel === nextRow.downloadCountLabel &&
            prevRow.downloadersLabel === nextRow.downloadersLabel &&
            prevRow.lastAnnounceLabel === nextRow.lastAnnounceLabel &&
            prevRow.lastAnnounceTooltip === nextRow.lastAnnounceTooltip &&
            prevRow.nextAnnounceLabel === nextRow.nextAnnounceLabel &&
            prevRow.nextAnnounceTooltip === nextRow.nextAnnounceTooltip &&
            prevRow.messageText === nextRow.messageText &&
            prevRow.messageTooltip === nextRow.messageTooltip &&
            prevProps.onRowClick === nextProps.onRowClick &&
            prevProps.onContextMenu === nextProps.onContextMenu
        );
    },
);

export const TrackersTab = ({ viewModel, isStandalone = false }: TrackersTabProps) => {
    const { t } = useTranslation();
    const shell = (content: ReactNode) =>
        isStandalone ? <GlassPanel className={details.table.panel}>{content}</GlassPanel> : content;

    if (!viewModel) {
        return shell(
            <div className={details.table.emptyPanel}>
                <p className={details.table.emptyText}>{t("torrent_modal.loading")}</p>
            </div>,
        );
    }

    const trackerActions = viewModel.actions;
    const trackerState = viewModel.state;
    const trackerLabels = viewModel.labels;
    const trackerData = viewModel.data;
    const trackerTable = viewModel.table;
    const trackerRefs = viewModel.refs;
    const handleTrackerRowClick = trackerActions.handleRowClick;
    const handleTrackerContextMenu = trackerActions.openContextMenu;

    if (trackerState.isEmpty) {
        return shell(
            <div className={details.table.emptyPanel}>
                <p className={details.table.emptyText}>{trackerLabels.emptyMessage}</p>
                <TrackerEditorModal
                    actions={trackerActions}
                    labels={trackerLabels}
                    trackerInputRef={trackerRefs.trackerInputRef}
                    state={trackerState}
                />
            </div>,
        );
    }

    return (
        <div className={details.table.root}>
            <div className={details.table.body}>
                {shell(
                    <div
                        ref={trackerRefs.listRef}
                        className={cn(details.table.scroll, "relative outline-none")}
                        tabIndex={0}
                        onKeyDown={trackerActions.handleListKeyDown}
                    >
                        <table className={cn(details.table.table, "table-fixed")}>
                            <colgroup>
                                {TRACKER_COLUMN_WIDTHS.map((width, index) => (
                                    <col key={`${index}:${width}`} style={{ width }} />
                                ))}
                            </colgroup>
                            <thead className={details.table.tableHeadRow}>
                                {trackerTable.headerGroups.map((headerGroup) => (
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
                                                <th
                                                    key={header.id}
                                                    scope="col"
                                                    className={cn(
                                                        details.table.tableHeadCell,
                                                        surface.chrome.sticky,
                                                        visuals.trackerTable.headerCell,
                                                        "top-0 z-sticky",
                                                    )}
                                                >
                                                    {isSortable ? (
                                                        <button
                                                            type="button"
                                                            className={cn(
                                                                "flex w-full items-center gap-tight text-left",
                                                                visuals.trackerTable.headerButton,
                                                                alignEnd && "justify-end",
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
                                {trackerData.rows.map((row) => (
                                    <TrackerRow
                                        key={row.key}
                                        row={row}
                                        onRowClick={handleTrackerRowClick}
                                        onContextMenu={handleTrackerContextMenu}
                                    />
                                ))}
                            </tbody>
                        </table>
                        {trackerState.contextMenu ? (
                            <TrackerContextMenu actions={trackerActions} labels={trackerLabels} state={trackerState} />
                        ) : null}
                    </div>,
                )}
            </div>
            <TrackerEditorModal
                actions={trackerActions}
                labels={trackerLabels}
                trackerInputRef={trackerRefs.trackerInputRef}
                state={trackerState}
            />
        </div>
    );
};

const TrackerContextMenu = ({
    actions,
    labels,
    state,
}: {
    actions: TrackerActions;
    labels: TrackerLabels;
    state: TrackerState;
}) => {
    if (!state.contextMenu) {
        return null;
    }

    return (
        <div
            className={contextMenu.panel}
            style={{
                top: state.contextMenu.y,
                left: state.contextMenu.x,
                minWidth: 200,
            }}
            onPointerDown={(event) => event.stopPropagation()}
        >
            <div className={contextMenu.header}>
                <Link2 className={contextMenu.headerIcon} />
                <span className={contextMenu.headerText}>{labels.selectionSummary}</span>
            </div>
            <ContextButton
                label={labels.editLabel}
                icon={Pencil}
                onPress={() => actions.runContextAction("edit")}
                disabled={!state.canEdit || state.isMutating}
            />
            <ContextButton
                label={labels.copyUrlLabel}
                icon={Link2}
                onPress={() => actions.runContextAction("copy_url")}
                disabled={!state.canCopySelection}
            />
            <ContextButton
                label={labels.copyHostLabel}
                icon={Copy}
                onPress={() => actions.runContextAction("copy_host")}
                disabled={!state.canCopySelection}
            />
            <ContextButton
                label={labels.copyAllLabel}
                icon={Copy}
                onPress={() => actions.runContextAction("copy_all")}
            />
            <ContextButton
                label={labels.reannounceLabel}
                icon={RefreshCcw}
                onPress={() => actions.runContextAction("reannounce")}
                disabled={state.isMutating}
            />
            <ContextButton
                label={state.selectedCount > 1 ? labels.removeManyLabel : labels.removeLabel}
                icon={Trash2}
                onPress={() => actions.runContextAction("remove")}
                danger
                disabled={!state.canRemove || state.isMutating}
            />
        </div>
    );
};

const ContextButton = ({
    label,
    icon: Icon,
    onPress,
    danger = false,
    disabled = false,
}: {
    label: string;
    icon: LucideIcon;
    onPress: () => Promise<void>;
    danger?: boolean;
    disabled?: boolean;
}) => (
    <button
        type="button"
        className={danger ? contextMenu.dangerActionButton : contextMenu.actionButton}
        disabled={disabled}
        onClick={() => {
            if (disabled) {
                return;
            }
            void onPress();
        }}
    >
        <Icon className="toolbar-icon-size-sm shrink-0" strokeWidth={visuals.icon.strokeWidth} />
        {label}
    </button>
);

const TrackerEditorModal = ({
    actions,
    labels,
    trackerInputRef,
    state,
}: {
    actions: TrackerActions;
    labels: TrackerLabels;
    trackerInputRef: TrackerRefs["trackerInputRef"];
    state: TrackerState;
}) => {
    const { t } = useTranslation();
    const isEditing = state.editor.mode === "edit";
    return (
        <ModalEx
            open={state.editor.isOpen}
            onClose={actions.closeEditor}
            title={labels.modalTitle}
            icon={Link2}
            size="sm"
            disableClose={state.isMutating}
            secondaryAction={{
                label: t("modals.cancel"),
                onPress: actions.closeEditor,
                disabled: state.isMutating,
            }}
            primaryAction={{
                label: isEditing ? labels.editLabel : labels.addLabel,
                onPress: () => {
                    void actions.submitEditor();
                },
                loading: state.isMutating,
                disabled: state.isMutating,
            }}
        >
            <div className={form.workflow.fillRoot}>
                <div className={form.workflow.fillSection}>
                    <label className={form.workflow.label}>
                        <Link2 className={form.workflow.labelIcon} />
                        {labels.modalFieldLabel}
                    </label>
                    <div className={form.workflow.fillBody}>
                        <div className={input.fillCodeTextareaFrame}>
                            <textarea
                                ref={trackerInputRef}
                                autoFocus
                                value={state.editor.value}
                                onChange={(event) => actions.setEditorValue(event.target.value)}
                                placeholder={labels.modalPlaceholder}
                                className={input.fillCodeTextarea}
                                spellCheck={false}
                                onKeyDown={(event) => {
                                    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                                        event.preventDefault();
                                        void actions.submitEditor();
                                    }
                                }}
                            />
                        </div>
                    </div>
                </div>
                {state.editor.error ? (
                    <p className={cn(visuals.typography.text.helper, uiRoles.text.danger)}>{state.editor.error}</p>
                ) : null}
            </div>
        </ModalEx>
    );
};

export default TrackersTab;
