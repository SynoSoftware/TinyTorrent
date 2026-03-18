import { useRef, type ReactNode } from "react";
import { Tooltip, cn } from "@heroui/react";
import { flexRender } from "@tanstack/react-table";
import {
    ArrowDown,
    ArrowUp,
    Ban,
    ChevronsUpDown,
    Copy,
    Info,
    Lock,
    PhoneIncoming,
    PhoneOutgoing,
    UserPlus,
} from "lucide-react";
import { GlassPanel } from "@/shared/ui/layout/GlassPanel";
import { CONTEXT_MENU, DETAILS, MODAL, SURFACE } from "@/shared/ui/layout/glass-surface";
import { useTorrentDetailsPeersViewModel } from "@/modules/dashboard/hooks/useTorrentDetailsPeersViewModel";
import type { TorrentPeerEntity } from "@/services/rpc/entities";
import type { PeerContextAction } from "@/modules/dashboard/types/contracts";
import { registry } from "@/config/logic";

const { visuals } = registry;

interface PeersTabProps {
    torrentId: string | number | null;
    peers: TorrentPeerEntity[];
    emptyMessage: string;
    onPeerContextAction?: (action: PeerContextAction, peer: TorrentPeerEntity) => void;
    sortBySpeed?: boolean;
    isStandalone?: boolean;
}

const PEER_COLUMN_WIDTHS = ["15%", "6%", "8%", "21%", "18%", "7%", "7%", "7%", "6%", "5%"] as const;
const TOOLTIP_DELAY = 500;

const PEER_COLUMN_ALIGN_END = new Set(["port", "progress", "down", "up", "downloaded", "uploaded"]);

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

const renderTooltipLines = (value: string) => (
    <div className="flex flex-col gap-tight whitespace-pre-wrap">
        {value.split("\n").map((line, index) => (
            <span key={`${index}:${line}`}>{line}</span>
        ))}
    </div>
);

const TruncatedTooltipText = ({ value, className }: { value: string; className?: string }) => (
    <Tooltip content={value} classNames={SURFACE.tooltip} delay={TOOLTIP_DELAY}>
        <span className={cn("block truncate", className)}>{value}</span>
    </Tooltip>
);

const StateCell = ({ label, ariaLabel, tooltip }: { label: string; ariaLabel: string; tooltip: string }) => {
    const content = (
        <span
            aria-label={ariaLabel}
            className={cn(
                "block truncate",
                label === "-" ? visuals.detailsTable.valueEmpty : visuals.detailsTable.valueSecondary,
            )}
        >
            {label}
        </span>
    );

    if (!tooltip) {
        return content;
    }

    return (
        <Tooltip content={renderTooltipLines(tooltip)} classNames={SURFACE.tooltip} delay={TOOLTIP_DELAY}>
            {content}
        </Tooltip>
    );
};

export const PeersTab = ({
    torrentId,
    peers,
    emptyMessage,
    onPeerContextAction,
    sortBySpeed = false,
    isStandalone = false,
}: PeersTabProps) => {
    const listRef = useRef<HTMLDivElement | null>(null);
    const viewModel = useTorrentDetailsPeersViewModel({
        torrentId,
        peers,
        emptyMessage,
        listRef,
        onPeerContextAction,
        sortBySpeed,
    });

    const shell = (content: ReactNode) =>
        isStandalone ? <GlassPanel className={DETAILS.table.panel}>{content}</GlassPanel> : content;

    if (viewModel.state.isEmpty) {
        return shell(
            <div className={DETAILS.table.emptyPanel}>
                <p className={DETAILS.table.emptyText}>{viewModel.labels.emptyMessage}</p>
            </div>,
        );
    }

    return (
        <div className={DETAILS.table.root}>
            <div className={DETAILS.table.body}>
                {shell(
                    <div ref={listRef} className={DETAILS.table.scroll}>
                        <table className={cn(DETAILS.table.table, "table-fixed")}>
                            <colgroup>
                                {PEER_COLUMN_WIDTHS.map((width, index) => (
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
                                            const alignEnd = PEER_COLUMN_ALIGN_END.has(header.column.id);

                                            return (
                                                <th
                                                    key={header.id}
                                                    scope="col"
                                                    className={cn(
                                                        DETAILS.table.tableHeadCell,
                                                        SURFACE.chrome.sticky,
                                                        "top-0 z-sticky",
                                                    )}
                                                >
                                                    {isSortable ? (
                                                        <button
                                                            type="button"
                                                            className={cn(
                                                                "flex w-full items-center gap-tight text-left",
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
                                {viewModel.metrics.paddingTop > 0 ? (
                                    <tr aria-hidden="true">
                                        <td
                                            colSpan={PEER_COLUMN_WIDTHS.length}
                                            className="border-0 p-0"
                                            style={{
                                                height: viewModel.metrics.paddingTop,
                                            }}
                                        />
                                    </tr>
                                ) : null}
                                {viewModel.data.rows.map((row) => (
                                    <tr
                                        key={row.key}
                                        className={cn(DETAILS.table.tableRow, "cursor-default")}
                                        onContextMenu={(event) => viewModel.actions.openContextMenu(event, row.peer)}
                                    >
                                        <td className={cn(DETAILS.table.tableBody, DETAILS.table.bodyCell)}>
                                            <span className={cn("block truncate", visuals.detailsTable.valueStrong)}>
                                                {row.address || "-"}
                                            </span>
                                        </td>
                                        <td className={cn(DETAILS.table.tableBody, DETAILS.table.bodyCellNumeric)}>
                                            {row.port > 0 ? String(row.port) : "-"}
                                        </td>
                                        <td className={cn(DETAILS.table.tableBody, DETAILS.table.bodyCell)}>
                                            <Tooltip
                                                content={renderTooltipLines(row.connectionTooltip)}
                                                classNames={SURFACE.tooltip}
                                                delay={TOOLTIP_DELAY}
                                            >
                                                <span
                                                    className={cn(
                                                        DETAILS.table.peerRow,
                                                        visuals.detailsTable.valueSecondary,
                                                    )}
                                                >
                                                    <span className="truncate">{row.connectionLabel}</span>
                                                    {row.connectionDirection === "incoming" ? (
                                                        <PhoneIncoming
                                                            aria-hidden="true"
                                                            className={cn(
                                                                MODAL.iconMd,
                                                                visuals.detailsTable.valueMuted,
                                                            )}
                                                            strokeWidth={visuals.icon.strokeWidth}
                                                        />
                                                    ) : (
                                                        <PhoneOutgoing
                                                            aria-hidden="true"
                                                            className={cn(
                                                                MODAL.iconMd,
                                                                visuals.detailsTable.valueMuted,
                                                            )}
                                                            strokeWidth={visuals.icon.strokeWidth}
                                                        />
                                                    )}
                                                    {row.connectionEncrypted ? (
                                                        <Lock
                                                            aria-hidden="true"
                                                            className={cn(
                                                                MODAL.iconMd,
                                                                visuals.detailsTable.valueMuted,
                                                            )}
                                                            strokeWidth={visuals.icon.strokeWidth}
                                                        />
                                                    ) : null}
                                                </span>
                                            </Tooltip>
                                        </td>
                                        <td className={cn(DETAILS.table.tableBody, DETAILS.table.bodyCell)}>
                                            <StateCell
                                                label={row.stateLabel}
                                                ariaLabel={row.stateLabel}
                                                tooltip={row.stateTooltip}
                                            />
                                        </td>
                                        <td className={cn(DETAILS.table.tableBody, DETAILS.table.bodyCell)}>
                                            {row.clientLabel !== "-" ? (
                                                <TruncatedTooltipText
                                                    value={row.clientLabel}
                                                    className={visuals.detailsTable.valueMuted}
                                                />
                                            ) : (
                                                <span className={visuals.detailsTable.valueEmpty}>-</span>
                                            )}
                                        </td>
                                        <td className={cn(DETAILS.table.tableBody, DETAILS.table.bodyCellNumeric)}>
                                            {row.progressLabel}
                                        </td>
                                        <td
                                            className={cn(
                                                DETAILS.table.tableBody,
                                                DETAILS.table.bodyCellNumeric,
                                                visuals.detailsTable.rateDown,
                                            )}
                                        >
                                            {row.downRateLabel}
                                        </td>
                                        <td
                                            className={cn(
                                                DETAILS.table.tableBody,
                                                DETAILS.table.bodyCellNumeric,
                                                visuals.detailsTable.rateUp,
                                            )}
                                        >
                                            {row.upRateLabel}
                                        </td>
                                        <td
                                            className={cn(
                                                DETAILS.table.tableBody,
                                                DETAILS.table.bodyCellNumeric,
                                                visuals.detailsTable.valueMuted,
                                            )}
                                        >
                                            {row.downloadedLabel}
                                        </td>
                                        <td
                                            className={cn(
                                                DETAILS.table.tableBody,
                                                DETAILS.table.bodyCellNumeric,
                                                visuals.detailsTable.valueMuted,
                                            )}
                                        >
                                            {row.uploadedLabel}
                                        </td>
                                    </tr>
                                ))}
                                {viewModel.metrics.paddingBottom > 0 ? (
                                    <tr aria-hidden="true">
                                        <td
                                            colSpan={PEER_COLUMN_WIDTHS.length}
                                            className="border-0 p-0"
                                            style={{
                                                height: viewModel.metrics.paddingBottom,
                                            }}
                                        />
                                    </tr>
                                ) : null}
                            </tbody>
                        </table>
                        {viewModel.state.contextMenu ? (
                            <div
                                className={CONTEXT_MENU.panel}
                                style={CONTEXT_MENU.builder.panelStyle({
                                    x: viewModel.state.contextMenu.x,
                                    y: viewModel.state.contextMenu.y,
                                })}
                                onPointerDown={(event) => event.stopPropagation()}
                            >
                                <div className={CONTEXT_MENU.header}>
                                    <Info className={CONTEXT_MENU.headerIcon} />
                                    <span className={CONTEXT_MENU.headerText}>
                                        {viewModel.state.contextMenu.peer.address}
                                    </span>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => viewModel.actions.runContextAction("copy_ip")}
                                    className={CONTEXT_MENU.actionButton}
                                >
                                    <Copy
                                        className="toolbar-icon-size-sm shrink-0"
                                        strokeWidth={visuals.icon.strokeWidth}
                                    />
                                    {viewModel.labels.copyIpAction}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => viewModel.actions.runContextAction("add_peer")}
                                    className={CONTEXT_MENU.actionButton}
                                >
                                    <UserPlus
                                        className="toolbar-icon-size-sm shrink-0"
                                        strokeWidth={visuals.icon.strokeWidth}
                                    />
                                    {viewModel.labels.addPeerAction}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => viewModel.actions.runContextAction("ban_ip")}
                                    className={CONTEXT_MENU.dangerActionButton}
                                >
                                    <Ban
                                        className="toolbar-icon-size-sm shrink-0"
                                        strokeWidth={visuals.icon.strokeWidth}
                                    />
                                    {viewModel.labels.banIpAction}
                                </button>
                            </div>
                        ) : null}
                    </div>,
                )}
            </div>
        </div>
    );
};

export default PeersTab;
