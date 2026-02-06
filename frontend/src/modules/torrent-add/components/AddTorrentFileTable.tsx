import {
    Button,
    Checkbox,
    Select,
    SelectItem,
    Spinner,
    cn,
} from "@heroui/react";
import {
    flexRender,
    getCoreRowModel,
    useReactTable,
    type CellContext,
    type ColumnDef,
    type ColumnSizingState,
    type RowSelectionState,
    type RowData,
    type Table,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useHotkeys } from "react-hotkeys-hook";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { AlertTriangle, ArrowDown } from "lucide-react";
import { CONFIG } from "@/config/logic";
import { formatBytes } from "@/shared/utils/format";
import { StatusIcon } from "@/shared/ui/components/StatusIcon";
import type { FileRow, SmartSelectCommand } from "@/modules/torrent-add/services/fileSelection";
import { resolveFileIcon } from "@/modules/torrent-add/utils/fileIcon";

const VIRTUALIZER_OVERSCAN = CONFIG.layout?.table?.overscan ?? 10;

const virtualRowTransform = (start: number) => ({
    transform: `translateY(${start}px)`,
});

type TorrentPriority = "low" | "normal" | "high";
type ResolvedState = "pending" | "ready" | "error";

type FileTableRow = {
    file: FileRow;
    priority: TorrentPriority;
};

type PriorityColumnMeta = {
    kind: "priority";
    onCycle: (index: number) => void;
    onSet: (index: number, value: TorrentPriority) => void;
};

type FileTableColumnMeta = {
    headerClassName?: string;
    cellClassName?: string;
    priority?: PriorityColumnMeta;
};

type FileTableMeta = {
    t: TFunction;
};

declare module "@tanstack/react-table" {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    interface ColumnMeta<TData extends RowData, TValue>
        extends FileTableColumnMeta {
        __ttFileTableMetaBrand__?: never;
    }
}

export interface AddTorrentFileTableState {
    files: FileRow[];
    filteredFiles: FileRow[];
    priorities: Map<number, TorrentPriority>;
    resolvedState: ResolvedState;
    rowHeight: number;
    selectedCount: number;
    selectedSize: number;
}

export interface AddTorrentFileTableActions {
    onCyclePriority: (index: number) => void;
    onRowClick: (index: number, shiftKey: boolean) => void;
    onRowSelectionChange: (
        next:
            | RowSelectionState
            | ((prev: RowSelectionState) => RowSelectionState)
    ) => void;
    onSetPriority: (index: number, value: TorrentPriority) => void;
    onSmartSelect: (command: SmartSelectCommand) => void;
}

export interface AddTorrentFileTableProps {
    actions: AddTorrentFileTableActions;
    layoutEnabled: boolean;
    rowSelection: RowSelectionState;
    state: AddTorrentFileTableState;
}

function renderPriorityCell(
    ctx: CellContext<FileTableRow, TorrentPriority>,
    meta: PriorityColumnMeta,
    t: TFunction
) {
    const { file, priority } = ctx.row.original;
    return (
        <div className="flex items-center min-w-0 justify-end">
            <div
                className="priority-trigger mr-tight transition-transform"
                data-no-row-toggle="true"
                title={t("modals.add_torrent.click_to_cycle_priority")}
                onClick={(event) => event.stopPropagation()}
            >
                <Button
                    isIconOnly
                    size="md"
                    variant="light"
                    onPress={() => meta.onCycle(file.index)}
                    aria-label={t("modals.add_torrent.click_to_cycle_priority")}
                    data-no-row-toggle="true"
                >
                    {priority === "high" && (
                        <ArrowDown className="rotate-180 toolbar-icon-size-md text-success" />
                    )}
                    {priority === "low" && (
                        <ArrowDown className="toolbar-icon-size-md text-warning" />
                    )}
                    {priority === "normal" && (
                        <span className="size-dot block bg-foreground/20 rounded-full mx-tight" />
                    )}
                </Button>
            </div>

            <Select
                aria-label={t("modals.add_torrent.col_priority")}
                selectedKeys={[priority]}
                onSelectionChange={(keys) =>
                    meta.onSet(file.index, Array.from(keys)[0] as TorrentPriority)
                }
                variant="flat"
                disallowEmptySelection
                className="min-w-0"
                data-no-row-toggle="true"
                classNames={{
                    trigger:
                        "h-button min-w-0 max-w-full bg-transparent data-[hover=true]:bg-content1/10 priority-trigger pl-tight",
                    value: "text-label uppercase font-bold text-right truncate",
                    popoverContent: "min-w-badge",
                }}
            >
                <SelectItem
                    key="high"
                    startContent={
                        <ArrowDown className="rotate-180 toolbar-icon-size-md text-success" />
                    }
                >
                    {t("modals.add_torrent.priority_high")}
                </SelectItem>
                <SelectItem
                    key="normal"
                    startContent={
                        <span className="size-dot block bg-foreground/20 rounded-full ml-tight" />
                    }
                >
                    {t("modals.add_torrent.priority_normal")}
                </SelectItem>
                <SelectItem
                    key="low"
                    startContent={
                        <ArrowDown className="toolbar-icon-size-md text-warning" />
                    }
                >
                    {t("modals.add_torrent.priority_low")}
                </SelectItem>
            </Select>
        </div>
    );
}

function getGridTemplate(table: Table<FileTableRow>) {
    const headers = table.getFlatHeaders();
    return headers
        .map((header) => {
            const size = header.getSize();
            if (header.column.id === "name") {
                return `minmax(var(--tt-add-file-col-name-min-w), ${size}px)`;
            }
            return `${size}px`;
        })
        .join(" ");
}

export function AddTorrentFileTable({
    actions,
    layoutEnabled,
    rowSelection,
    state,
}: AddTorrentFileTableProps) {
    const { t } = useTranslation();
    const scrollParentRef = useRef<HTMLDivElement | null>(null);
    const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});

    const rowsData = useMemo<FileTableRow[]>(
        () =>
            state.filteredFiles.map((file) => ({
                file,
                priority: state.priorities.get(file.index) ?? "normal",
            })),
        [state.filteredFiles, state.priorities]
    );

    const columns = useMemo<ColumnDef<FileTableRow>[]>(
        () => [
            {
                id: "select",
                accessorFn: (row) => row.file.index,
                minSize: 72,
                size: 84,
                maxSize: 136,
                enableResizing: true,
                meta: {
                    headerClassName:
                        "relative flex items-center justify-center h-full pr-panel",
                    cellClassName:
                        "flex items-center justify-center h-full pr-panel",
                } as FileTableColumnMeta,
                header: ({ table }) => (
                    <div
                        data-no-row-toggle="true"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <Checkbox
                            aria-label={t("modals.add_torrent.col_select")}
                            isSelected={table.getIsAllRowsSelected()}
                            isIndeterminate={table.getIsSomeRowsSelected()}
                            onValueChange={(next) =>
                                table.toggleAllRowsSelected(next)
                            }
                            classNames={{
                                wrapper: "after:bg-primary",
                            }}
                            data-no-row-toggle="true"
                        />
                    </div>
                ),
                cell: ({ row }) => (
                    <div
                        data-file-row-checkbox="true"
                        data-no-row-toggle="true"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <Checkbox
                            aria-label={`${t("modals.add_torrent.col_select")}: ${row.original.file.path}`}
                            isSelected={row.getIsSelected()}
                            onValueChange={() => row.toggleSelected()}
                            classNames={{ wrapper: "after:bg-primary" }}
                            data-no-row-toggle="true"
                        />
                    </div>
                ),
            },
            {
                id: "name",
                accessorFn: (row) => row.file.path,
                minSize: 260,
                size: 360,
                enableResizing: false,
                meta: {
                    headerClassName: "flex items-center h-full pr-panel min-w-0",
                    cellClassName: "flex items-center gap-tools min-w-0 pr-panel",
                } as FileTableColumnMeta,
                header: () => (
                    <span className="text-label">
                        {t("modals.add_torrent.col_name")}
                    </span>
                ),
                cell: ({ row }) => {
                    const { Icon, toneClass } = resolveFileIcon(
                        row.original.file.path
                    );
                    return (
                        <>
                            <Icon
                                className={cn(
                                    "toolbar-icon-size-md shrink-0",
                                    toneClass
                                )}
                            />
                            <span
                                className={cn(
                                    "truncate select-text transition-colors text-foreground",
                                    row.getIsSelected() ? "opacity-100" : "opacity-90"
                                )}
                                title={row.original.file.path}
                            >
                                {row.original.file.path}
                            </span>
                        </>
                    );
                },
            },
            {
                id: "size",
                accessorFn: (row) => row.file.length,
                minSize: 110,
                size: 140,
                maxSize: 220,
                enableResizing: true,
                meta: {
                    headerClassName:
                        "relative flex items-center justify-end h-full font-mono pr-panel whitespace-nowrap",
                    cellClassName:
                        "font-mono text-scaled text-foreground/50 truncate text-right pr-panel",
                } as FileTableColumnMeta,
                header: () => (
                    <span className="text-label">
                        {t("modals.add_torrent.col_size")}
                    </span>
                ),
                cell: ({ row }) => formatBytes(row.original.file.length),
            },
            {
                id: "priority",
                accessorFn: (row) => row.priority,
                minSize: 180,
                size: 220,
                maxSize: 320,
                enableResizing: true,
                meta: {
                    headerClassName:
                        "relative flex items-center h-full pl-tight min-w-0",
                    cellClassName: "pr-panel flex justify-end min-w-0",
                    priority: {
                        kind: "priority",
                        onCycle: actions.onCyclePriority,
                        onSet: actions.onSetPriority,
                    },
                } as FileTableColumnMeta,
                header: () => (
                    <span className="text-label">
                        {t("modals.add_torrent.col_priority")}
                    </span>
                ),
                cell: (ctx) => {
                    const meta = ctx.column.columnDef
                        .meta as FileTableColumnMeta;
                    if (!meta.priority) return null;
                    return renderPriorityCell(ctx, meta.priority, t);
                },
            },
        ],
        [actions.onCyclePriority, actions.onSetPriority, t]
    );

    // eslint-disable-next-line react-hooks/incompatible-library
    const table = useReactTable({
        data: rowsData,
        columns,
        getRowId: (row) => `${row.file.index}`,
        state: {
            columnSizing,
            rowSelection,
        },
        onColumnSizingChange: setColumnSizing,
        onRowSelectionChange: actions.onRowSelectionChange,
        getCoreRowModel: getCoreRowModel(),
        columnResizeMode: "onChange",
        enableColumnResizing: true,
        enableRowSelection: true,
        meta: { t } satisfies FileTableMeta,
    });

    const tableRows = table.getRowModel().rows;
    const gridTemplateColumns = getGridTemplate(table);

    const virtualizer = useVirtualizer({
        count: tableRows.length,
        getScrollElement: () => scrollParentRef.current,
        estimateSize: () => state.rowHeight,
        overscan: VIRTUALIZER_OVERSCAN,
    });

    useHotkeys(
        "ctrl+a,meta+a",
        (event) => {
            event.preventDefault();
            actions.onSmartSelect("all");
        },
        {
            enabled: state.resolvedState === "ready",
            preventDefault: true,
            enableOnFormTags: true,
        },
        [actions, state.resolvedState]
    );
    useHotkeys(
        "ctrl+i,meta+i",
        (event) => {
            event.preventDefault();
            actions.onSmartSelect("invert");
        },
        {
            enabled: state.resolvedState === "ready",
            preventDefault: true,
            enableOnFormTags: true,
        },
        [actions, state.resolvedState]
    );

    const renderedRows = useMemo(
        () =>
            virtualizer.getVirtualItems().map((virtualItem) => {
                const row = tableRows[virtualItem.index];
                if (!row) return null;
                return (
                    <div
                        key={virtualItem.key}
                        data-index={virtualItem.index}
                        ref={virtualizer.measureElement}
                        style={{
                            position: "absolute",
                            top: 0,
                            left: 0,
                            width: "100%",
                            ...virtualRowTransform(virtualItem.start),
                        }}
                    >
                        <div
                            className={cn(
                                "grid items-center border-b border-default/5 cursor-pointer group select-none box-border text-scaled",
                                row.getIsSelected()
                                    ? "bg-primary/5 hover:bg-primary/10"
                                    : "bg-transparent hover:bg-content1/5"
                            )}
                            style={{
                                gridTemplateColumns,
                                height: state.rowHeight,
                                minHeight: state.rowHeight,
                            }}
                            onClick={(event) => {
                                if (
                                    (event.target as HTMLElement).closest(
                                        "[data-no-row-toggle='true']"
                                    )
                                ) {
                                    return;
                                }
                                actions.onRowClick(
                                    row.original.file.index,
                                    event.shiftKey
                                );
                            }}
                        >
                            {row.getVisibleCells().map((cell) => {
                                const meta = cell.column.columnDef
                                    .meta as FileTableColumnMeta;
                                return (
                                    <div
                                        key={cell.id}
                                        className={meta.cellClassName ?? ""}
                                    >
                                        {flexRender(
                                            cell.column.columnDef.cell,
                                            cell.getContext()
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                );
            }),
        [actions, gridTemplateColumns, state.rowHeight, tableRows, virtualizer]
    );

    return (
        <div className="flex flex-col flex-1 min-h-0 outline-none">
            <div className="flex-1 min-h-0 flex flex-col relative">
                {state.resolvedState !== "ready" ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-foreground/40 gap-tools z-modal-internal bg-background/50 backdrop-blur-sm">
                        {state.resolvedState === "pending" ? (
                            <Spinner color="primary" />
                        ) : (
                            <StatusIcon
                                Icon={AlertTriangle}
                                className="text-danger"
                            />
                        )}
                        <p className="font-mono text-label uppercase tracking-widest">
                            {state.resolvedState === "pending"
                                ? t("modals.add_magnet.resolving")
                                : t("modals.add_torrent.magnet_error")}
                        </p>
                    </div>
                ) : (
                    <div className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden custom-scrollbar">
                        <div
                            className={cn(
                                "w-full min-w-add-file-table h-full flex flex-col min-h-0",
                                !layoutEnabled && "pointer-events-none"
                            )}
                        >
                            <div
                                className="grid border-b border-default/20 bg-content1/10 backdrop-blur-md uppercase font-bold tracking-wider text-foreground/50 select-none z-sticky box-border h-row"
                                style={{ gridTemplateColumns }}
                            >
                                {table.getHeaderGroups().map((headerGroup) =>
                                    headerGroup.headers.map((header) => {
                                        const meta = header.column.columnDef
                                            .meta as FileTableColumnMeta;
                                        return (
                                            <div
                                                key={header.id}
                                                className={cn(
                                                    meta.headerClassName ?? "",
                                                    header.column.getCanResize() &&
                                                        "cursor-col-resize"
                                                )}
                                                onMouseDown={
                                                    header.column.getCanResize()
                                                        ? header.getResizeHandler()
                                                        : undefined
                                                }
                                                onTouchStart={
                                                    header.column.getCanResize()
                                                        ? header.getResizeHandler()
                                                        : undefined
                                                }
                                                onDoubleClick={
                                                    header.column.getCanResize()
                                                        ? (event) => {
                                                              event.preventDefault();
                                                              event.stopPropagation();
                                                              header.column.resetSize();
                                                          }
                                                        : undefined
                                                }
                                            >
                                                {flexRender(
                                                    header.column.columnDef
                                                        .header,
                                                    header.getContext()
                                                )}
                                            </div>
                                        );
                                    })
                                )}
                            </div>

                            <div
                                ref={scrollParentRef}
                                className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar"
                            >
                                <div
                                    style={{
                                        height: virtualizer.getTotalSize(),
                                        position: "relative",
                                    }}
                                >
                                    {renderedRows}
                                </div>
                            </div>

                            <div className="border-t border-default/20 p-tight text-label font-mono text-center text-foreground/40 bg-content1/10 flex justify-between px-panel">
                                <span>
                                    {t("modals.add_torrent.selection_footer", {
                                        selected: state.selectedCount,
                                        total: state.files.length,
                                    })}
                                </span>
                                <span>{formatBytes(state.selectedSize)}</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
