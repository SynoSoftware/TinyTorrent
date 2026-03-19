/* eslint-disable react-hooks/refs */
import { type ReactNode } from "react";
import { cn } from "@heroui/react";
import { flexRender } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronsUpDown, Copy, Link2, Pencil, RefreshCcw, Trash2, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { registry } from "@/config/logic";
import AppTooltip from "@/shared/ui/components/AppTooltip";
import { GlassPanel } from "@/shared/ui/layout/GlassPanel";
import { ModalEx } from "@/shared/ui/layout/ModalEx";
import { CONTEXT_MENU, DETAILS, FORM, INPUT, SURFACE } from "@/shared/ui/layout/glass-surface";
import type {
    TorrentDetailsTrackersViewModel,
    TrackerRowViewModel,
} from "@/modules/dashboard/hooks/useTorrentDetailsTrackersViewModel";
const { visuals } = registry;

interface TrackersTabProps {
    viewModel: TorrentDetailsTrackersViewModel;
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

const TrackerRow = ({ row, viewModel }: { row: TrackerRowViewModel; viewModel: TorrentDetailsTrackersViewModel }) => (
    <tr
        key={row.key}
        className={cn(
            DETAILS.table.tableRow,
            "cursor-default",
            row.selected && visuals.trackerTable.rowSelected,
        )}
        onClick={(event) => viewModel.actions.handleRowClick(event, row.key, row.index)}
        onContextMenu={(event) => viewModel.actions.openContextMenu(event, row.key, row.index)}
    >
        <td
            className={cn(
                DETAILS.table.tableBody,
                visuals.trackerTable.bodyCell,
                "px-tight py-panel align-middle",
            )}
        >
            <div className="flex min-w-0 items-center gap-tight">
                <div className={visuals.trackerTable.statusDot[row.statusTone]} />
                <span className="truncate">{row.statusLabel}</span>
            </div>
        </td>
        <td
            className={cn(
                DETAILS.table.tableBody,
                visuals.trackerTable.bodyCell,
                "px-tight py-panel align-middle",
            )}
        >
            <AppTooltip content={row.announce}>
                <div className={cn("min-w-0 truncate", visuals.trackerTable.trackerCell)}>
                    <span className="truncate">{row.announce}</span>
                </div>
            </AppTooltip>
        </td>
        <td
            className={cn(
                DETAILS.table.tableBody,
                visuals.trackerTable.bodyCell,
                visuals.trackerTable.tierCell,
                "px-tight py-panel align-middle text-center",
            )}
        >
                <span
                    className={cn(
                        SURFACE.atom.insetRounded,
                        visuals.trackerTable.tierBadge,
                        "inline-flex min-w-0 items-center px-tight py-tight",
                    )}
                >
                {row.tierLabel}
            </span>
        </td>
        <td className={cn(DETAILS.table.tableBody, visuals.trackerTable.bodyCell, visuals.trackerTable.metricCell, "px-tight py-panel align-middle text-right tabular-nums")}>{row.seedsLabel}</td>
        <td className={cn(DETAILS.table.tableBody, visuals.trackerTable.bodyCell, visuals.trackerTable.metricCell, "px-tight py-panel align-middle text-right tabular-nums")}>{row.leechesLabel}</td>
        <td className={cn(DETAILS.table.tableBody, visuals.trackerTable.bodyCell, visuals.trackerTable.metricCell, "px-tight py-panel align-middle text-right tabular-nums")}>{row.downloadCountLabel}</td>
        <td className={cn(DETAILS.table.tableBody, visuals.trackerTable.bodyCell, visuals.trackerTable.metricCell, "px-tight py-panel align-middle text-right tabular-nums")}>{row.downloadersLabel}</td>
        <td className={cn(DETAILS.table.tableBody, visuals.trackerTable.bodyCell, visuals.trackerTable.timeCell, "px-tight py-panel align-middle text-right tabular-nums")}>
            <AppTooltip content={row.lastAnnounceTooltip}>
                <span className="truncate">{row.lastAnnounceLabel}</span>
            </AppTooltip>
        </td>
        <td className={cn(DETAILS.table.tableBody, visuals.trackerTable.bodyCell, visuals.trackerTable.timeCell, "px-tight py-panel align-middle text-right tabular-nums")}>
            <AppTooltip content={row.nextAnnounceTooltip}>
                <span className="truncate">{row.nextAnnounceLabel}</span>
            </AppTooltip>
        </td>
        <td
            className={cn(
                DETAILS.table.tableBody,
                visuals.trackerTable.bodyCell,
                "px-tight py-panel align-middle",
            )}
        >
            <AppTooltip content={row.messageTooltip}>
                <div className={cn("truncate", visuals.trackerTable.messageCell)}>{row.messageText}</div>
            </AppTooltip>
        </td>
    </tr>
);

export const TrackersTab = ({
    viewModel,
    isStandalone = false,
}: TrackersTabProps) => {
    const shell = (content: ReactNode) =>
        isStandalone ? <GlassPanel className={DETAILS.table.panel}>{content}</GlassPanel> : content;

    const trackerActions = viewModel.actions;
    const trackerState = viewModel.state;
    const trackerLabels = viewModel.labels;
    const trackerData = viewModel.data;
    const trackerTable = viewModel.table;
    const trackerRefs = viewModel.refs;

    if (trackerState.isEmpty) {
        return shell(
            <div className={DETAILS.table.emptyPanel}>
                <p className={DETAILS.table.emptyText}>{trackerLabels.emptyMessage}</p>
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
        <div className={DETAILS.table.root}>
            <div className={DETAILS.table.body}>
                {shell(
                    <div
                        ref={trackerRefs.listRef}
                        className={cn(DETAILS.table.scroll, "relative outline-none")}
                        tabIndex={0}
                        onKeyDown={trackerActions.handleListKeyDown}
                    >
                        <table className={cn(DETAILS.table.table, "table-fixed")}>
                            <colgroup>
                                {TRACKER_COLUMN_WIDTHS.map((width, index) => (
                                    <col key={`${index}:${width}`} style={{ width }} />
                                ))}
                            </colgroup>
                            <thead className={DETAILS.table.tableHeadRow}>
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
                                                        DETAILS.table.tableHeadCell,
                                                        SURFACE.chrome.sticky,
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
                                    <TrackerRow key={row.key} row={row} viewModel={viewModel} />
                                ))}
                            </tbody>
                        </table>
                        {trackerState.contextMenu ? (
                            <TrackerContextMenu
                                actions={trackerActions}
                                labels={trackerLabels}
                                state={trackerState}
                            />
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
            className={CONTEXT_MENU.panel}
            style={CONTEXT_MENU.builder.panelStyle({
                x: state.contextMenu.x,
                y: state.contextMenu.y,
            })}
            onPointerDown={(event) => event.stopPropagation()}
        >
            <div className={CONTEXT_MENU.header}>
                <Link2 className={CONTEXT_MENU.headerIcon} />
                <span className={CONTEXT_MENU.headerText}>{labels.selectionSummary}</span>
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
                label={
                    state.selectedCount > 1 ? labels.removeManyLabel : labels.removeLabel
                }
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
        className={danger ? CONTEXT_MENU.dangerActionButton : CONTEXT_MENU.actionButton}
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
            <div className={FORM.workflow.fillRoot}>
                <div className={FORM.workflow.fillSection}>
                    <label className={FORM.workflow.label}>
                        <Link2 className={FORM.workflow.labelIcon} />
                        {labels.modalFieldLabel}
                    </label>
                    <div className={FORM.workflow.fillBody}>
                        <div className={INPUT.fillCodeTextareaFrame}>
                            <textarea
                                ref={trackerInputRef}
                                autoFocus
                                value={state.editor.value}
                                onChange={(event) => actions.setEditorValue(event.target.value)}
                                placeholder={labels.modalPlaceholder}
                                className={INPUT.fillCodeTextarea}
                                spellCheck={false}
                                onKeyDown={(event) => {
                                    if (
                                        event.key === "Enter" &&
                                        (event.ctrlKey || event.metaKey)
                                    ) {
                                        event.preventDefault();
                                        void actions.submitEditor();
                                    }
                                }}
                            />
                        </div>
                    </div>
                </div>
                {state.editor.error ? (
                    <p className={cn(visuals.typography.textRoles.helper, visuals.trackerTable.modalError)}>
                        {state.editor.error}
                    </p>
                ) : null}
            </div>
        </ModalEx>
    );
};

export default TrackersTab;
