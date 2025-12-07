// TorrentTable.tsx v2.6
import {
    DndContext,
    DragOverlay,
    KeyboardSensor,
    MouseSensor,
    TouchSensor,
    closestCenter,
    useSensor,
    useSensors,
    type DragEndEvent,
    type DragStartEvent,
} from "@dnd-kit/core";
import {
    SortableContext,
    arrayMove,
    horizontalListSortingStrategy,
    useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
    Button,
    Checkbox,
    Dropdown,
    DropdownItem,
    DropdownMenu,
    DropdownTrigger,
    Modal,
    ModalBody,
    ModalContent,
    ModalFooter,
    ModalHeader,
    Skeleton,
    cn,
} from "@heroui/react";
import {
    flexRender,
    getCoreRowModel,
    getSortedRowModel,
    useReactTable,
    type ColumnDef,
    type Header,
    type Row,
    type RowSelectionState,
    type SortingState,
    type VisibilityState,
} from "@tanstack/react-table";
import { type VirtualItem, useVirtualizer } from "@tanstack/react-virtual";
import { AnimatePresence } from "framer-motion";
import {
    ArrowDown,
    ArrowUp,
    CheckCircle2,
    ChevronRight,
    Copy,
    FileUp,
    Gauge,
    Link,
    PauseCircle,
    PlayCircle,
    RotateCcw,
    Trash2,
} from "lucide-react";
import React, {
    memo,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type CSSProperties,
} from "react";
import { useTranslation } from "react-i18next";

import type { Torrent } from "../types/torrent";
import {
    COLUMN_DEFINITIONS,
    DEFAULT_COLUMN_ORDER,
    REQUIRED_COLUMN_IDS,
    type ColumnId,
} from "./ColumnDefinitions";
import { TABLE_LAYOUT } from "../config/layout";

// --- CONSTANTS ---
const STORAGE_KEY = "tiny-torrent.table-state.v2.6"; // Bumped version
const CELL_PADDING_CLASS = "pl-3 pr-4";
const CELL_BASE_CLASSES =
    "flex items-center overflow-hidden h-full truncate box-border";

// --- TYPES ---
export type TorrentTableAction =
    | "pause"
    | "resume"
    | "recheck"
    | "remove"
    | "remove-with-data"
    | "queue-move-top"
    | "queue-move-up"
    | "queue-move-down"
    | "queue-move-bottom";

type ContextMenuKey = TorrentTableAction | "cols";

interface TorrentTableProps {
    torrents: Torrent[];
    filter: string;
    isLoading?: boolean;
    onAction?: (action: TorrentTableAction, torrent: Torrent) => void;
    onRequestDetails?: (torrent: Torrent) => void;
}

// --- HELPERS ---
const createVirtualElement = (x: number, y: number) => ({
    getBoundingClientRect: () => ({
        width: 0,
        height: 0,
        top: y,
        right: x,
        bottom: y,
        left: x,
        x: x,
        y: y,
        toJSON: () => {},
    }),
});

// --- SUB-COMPONENT: DRAGGABLE HEADER ---
const DraggableHeader = memo(
    ({
        header,
        isOverlay = false,
        onContextMenu,
    }: {
        header: Header<Torrent, unknown>;
        isOverlay?: boolean;
        onContextMenu?: (e: React.MouseEvent) => void;
    }) => {
        const { column } = header;
        const {
            setNodeRef,
            attributes,
            listeners,
            transform,
            transition,
            isDragging,
        } = useSortable({ id: header.column.id });

        const style: CSSProperties = {
            transform: CSS.Translate.toString(transform),
            transition,
            width: column.getSize(),
            zIndex: isDragging || isOverlay ? 50 : 0,
            boxSizing: "border-box",
        };

        const sortState = column.getIsSorted();
        const canSort = column.getCanSort();
        const align = column.columnDef.meta?.align || "start";
        const isSelection = header.id === "selection";

        return (
            <div
                ref={setNodeRef}
                style={style}
                {...attributes}
                {...listeners}
                onClick={canSort ? column.getToggleSortingHandler() : undefined}
                onContextMenu={onContextMenu}
                className={cn(
                    "relative flex items-center h-10 border-r border-content1/10 transition-colors group select-none overflow-hidden",
                    "box-border",
                    // STABILITY FIX: Always add a transparent left border so it aligns with rows that have a colored left border
                    "border-l-2 border-l-transparent",
                    canSort
                        ? "cursor-pointer hover:bg-content1/10"
                        : "cursor-default",
                    isOverlay
                        ? "bg-content1/90 shadow-xl cursor-grabbing"
                        : "bg-transparent",
                    isDragging && !isOverlay ? "opacity-30" : "opacity-100"
                )}
            >
                <div
                    className={cn(
                        CELL_BASE_CLASSES,
                        "flex-1 gap-2",
                        "text-[10px] font-bold uppercase tracking-[0.15em] text-foreground/60",
                        isOverlay && "text-foreground",
                        // STANDARD PADDING: Not fancy math; pl-3 pr-4 keeps text away from handles.
                        CELL_PADDING_CLASS,
                        align === "center" && "justify-center",
                        align === "end" && "justify-end",
                        isSelection && "justify-center px-0"
                    )}
                >
                    {flexRender(column.columnDef.header, header.getContext())}
                    {sortState === "asc" && (
                        <ArrowUp size={12} className="text-primary shrink-0" />
                    )}
                    {sortState === "desc" && (
                        <ArrowDown
                            size={12}
                            className="text-primary shrink-0"
                        />
                    )}
                </div>

                {!isOverlay && header.column.getCanResize() && (
                    <div
                        onMouseDown={(e) => {
                            header.getResizeHandler()(e);
                            e.stopPropagation();
                        }}
                        onTouchStart={(e) => {
                            header.getResizeHandler()(e);
                            e.stopPropagation();
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="absolute right-0 top-0 h-full w-4 cursor-col-resize touch-none select-none flex justify-center items-center z-30"
                    >
                        <div
                            className={cn(
                                "w-[1px] h-4 bg-foreground/10 transition-colors rounded-full",
                                "group-hover:bg-primary/50",
                                column.getIsResizing() &&
                                    "bg-primary w-[2px] h-6"
                            )}
                        />
                    </div>
                )}
            </div>
        );
    }
);

// --- SUB-COMPONENT: VIRTUAL ROW ---
const VirtualRow = memo(
    ({
        row,
        virtualRow,
        isSelected,
        isContext,
        onClick,
        onDoubleClick,
        onContextMenu,
    }: {
        row: Row<Torrent>;
        virtualRow: VirtualItem;
        isSelected: boolean;
        isContext: boolean;
        onClick: (e: React.MouseEvent, rowId: string, index: number) => void;
        onDoubleClick: (torrent: Torrent) => void;
        onContextMenu: (e: React.MouseEvent, torrent: Torrent) => void;
    }) => {
        const rowStyle = useMemo<CSSProperties>(
            () => ({
                transform: `translateY(${virtualRow.start}px)`,
                height: `${TABLE_LAYOUT.rowHeight}px`,
                boxSizing: "border-box",
            }),
            [virtualRow.start]
        );

        return (
            <div
                data-index={virtualRow.index}
                className={cn(
                    "absolute top-0 left-0 flex items-center w-full border-b border-content1/5 transition-colors cursor-default",
                    "box-border",
                    // STABILITY FIX: Always have border-l-2. Use transparent when not selected.
                    "border-l-2",
                    isSelected
                        ? "bg-primary/10 border-l-primary"
                        : "border-l-transparent hover:bg-content1/10",
                    isContext && !isSelected && "bg-content1/20"
                )}
                style={rowStyle}
                onClick={(e) => onClick(e, row.id, virtualRow.index)}
                onDoubleClick={() => onDoubleClick(row.original)}
                onContextMenu={(e) => onContextMenu(e, row.original)}
            >
                {row.getVisibleCells().map((cell) => {
                    const align = cell.column.columnDef.meta?.align || "start";
                    return (
                        <div
                            key={cell.id}
                            style={{
                                width: cell.column.getSize(),
                                boxSizing: "border-box",
                            }}
                            className={cn(
                                CELL_BASE_CLASSES,
                                CELL_PADDING_CLASS,
                                align === "center" && "justify-center",
                                align === "end" && "justify-end",
                                cell.column.id === "selection" &&
                                    "justify-center px-0"
                            )}
                        >
                            {flexRender(
                                cell.column.columnDef.cell,
                                cell.getContext()
                            )}
                        </div>
                    );
                })}
            </div>
        );
    }
);

type QueueMenuAction = { key: TorrentTableAction; label: string };

const QueueSubmenu = memo(
    ({
        torrent,
        actions,
        title,
        onAction,
        closeMenu,
    }: {
        torrent: Torrent;
        actions: QueueMenuAction[];
        title: string;
        onAction?: (action: TorrentTableAction, torrent: Torrent) => void;
        closeMenu: () => void;
    }) => {
        const [isOpen, setIsOpen] = useState(false);

        const handleAction = useCallback(
            (action: TorrentTableAction) => {
                onAction?.(action, torrent);
                closeMenu();
                setIsOpen(false);
            },
            [closeMenu, onAction, torrent]
        );

        const handleOpenChange = useCallback((next: boolean) => {
            setIsOpen(next);
        }, []);

        return (
            <Dropdown
                placement="right-start"
                isOpen={isOpen}
                onOpenChange={handleOpenChange}
                offset={6}
                shouldFlip
            >
                <DropdownTrigger>
                    <button
                        type="button"
                        onMouseDown={(event) => event.stopPropagation()}
                        className="flex w-full items-center justify-between gap-2 px-4 py-2 text-xs font-bold uppercase tracking-[0.3em] text-foreground/40 hover:bg-content1/10 transition-colors rounded"
                    >
                        <span>{title}</span>
                        <ChevronRight
                            size={14}
                            className="text-foreground/60"
                        />
                    </button>
                </DropdownTrigger>
                <DropdownMenu
                    variant="flat"
                    className="min-w-[170px] bg-content1/80 border border-content1/20"
                >
                    {actions.map((action) => (
                        <DropdownItem
                            key={action.key}
                            className="pl-10 text-sm"
                            onPress={() => handleAction(action.key)}
                        >
                            {action.label}
                        </DropdownItem>
                    ))}
                </DropdownMenu>
            </Dropdown>
        );
    }
);

// --- MAIN COMPONENT ---
export function TorrentTable({
    torrents,
    filter,
    isLoading = false,
    onAction,
    onRequestDetails,
}: TorrentTableProps) {
    const { t } = useTranslation();
    const parentRef = useRef<HTMLDivElement>(null);
    const tableContainerRef = useRef<HTMLDivElement>(null);
    const queueMenuActions = useMemo<QueueMenuAction[]>(
        () => [
            { key: "queue-move-top", label: t("table.queue.move_top") },
            { key: "queue-move-up", label: t("table.queue.move_up") },
            { key: "queue-move-down", label: t("table.queue.move_down") },
            { key: "queue-move-bottom", label: t("table.queue.move_bottom") },
        ],
        [t]
    );

    // --- STATE ---
    const getInitialState = () => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            const defaults = {
                columnOrder: DEFAULT_COLUMN_ORDER,
                columnVisibility: {} as VisibilityState,
                columnSizing: {} as Record<string, number>,
                sorting: [] as SortingState,
            };

            if (!saved) return defaults;
            const parsed = JSON.parse(saved);
            const allDefKeys = Object.keys(COLUMN_DEFINITIONS);
            const validOrder = (
                parsed.columnOrder || DEFAULT_COLUMN_ORDER
            ).filter(
                (id: string) => id === "selection" || allDefKeys.includes(id)
            );

            allDefKeys.forEach((id) => {
                if (!validOrder.includes(id)) validOrder.push(id);
            });

            return {
                columnOrder: validOrder,
                columnVisibility: parsed.columnVisibility || {},
                columnSizing: parsed.columnSizing || {},
                sorting: parsed.sorting || [],
            };
        } catch {
            return {
                columnOrder: DEFAULT_COLUMN_ORDER,
                columnVisibility: {},
                columnSizing: {},
                sorting: [],
            };
        }
    };

    const [initialState] = useState(getInitialState);
    const [sorting, setSorting] = useState<SortingState>(initialState.sorting);
    const [columnOrder, setColumnOrder] = useState<string[]>(
        initialState.columnOrder
    );
    const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(
        initialState.columnVisibility
    );
    const [columnSizing, setColumnSizing] = useState(initialState.columnSizing);
    const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

    const [activeDragHeaderId, setActiveDragHeaderId] = useState<string | null>(
        null
    );
    const [isColumnModalOpen, setIsColumnModalOpen] = useState(false);
    const [contextMenu, setContextMenu] = useState<{
        virtualElement: ReturnType<typeof createVirtualElement>;
        torrent: Torrent;
    } | null>(null);
    const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(
        null
    );

    useEffect(() => {
        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({
                columnOrder,
                columnVisibility,
                columnSizing,
                sorting,
            })
        );
    }, [columnOrder, columnVisibility, columnSizing, sorting]);

    // --- DATA ---
    const data = useMemo(() => {
        if (filter === "all") return torrents;
        return torrents.filter((t) => t.state === filter);
    }, [torrents, filter]);

    const columns = useMemo<ColumnDef<Torrent>[]>(() => {
        return Object.keys(COLUMN_DEFINITIONS).map((colId) => {
            const id = colId as ColumnId;
            const def = COLUMN_DEFINITIONS[id];

            if (id === "selection") {
                return {
                    id: "selection",
                    size: 40,
                    enableResizing: false,
                    enableSorting: false,
                    header: ({ table }) => (
                        <div className="flex justify-center items-center h-full w-full">
                            <Checkbox
                                size="sm"
                                isSelected={table.getIsAllPageRowsSelected()}
                                isIndeterminate={table.getIsSomePageRowsSelected()}
                                onValueChange={(val) =>
                                    table.toggleAllPageRowsSelected(!!val)
                                }
                                classNames={{ wrapper: "m-0" }}
                            />
                        </div>
                    ),
                    cell: ({ row }) => (
                        <Checkbox
                            size="sm"
                            isSelected={row.getIsSelected()}
                            onValueChange={(val) => row.toggleSelected(!!val)}
                            classNames={{ wrapper: "m-0" }}
                        />
                    ),
                } as ColumnDef<Torrent>;
            }
            return {
                id,
                accessorKey: def.rpcField,
                header: () => (def.labelKey ? t(def.labelKey) : ""),
                size: def.width ?? 150,
                minSize: def.minSize ?? 80,
                meta: { align: def.align },
                cell: ({ row }) =>
                    def.render({
                        torrent: row.original,
                        t,
                        isSelected: row.getIsSelected(),
                        toggleSelection: row.getToggleSelectedHandler(),
                    }),
            } as ColumnDef<Torrent>;
        });
    }, [t]);

    const table = useReactTable({
        data,
        columns,
        state: {
            sorting,
            columnOrder,
            columnVisibility,
            rowSelection,
            columnSizing,
        },
        columnResizeMode: "onChange",
        enableSortingRemoval: true,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
        onSortingChange: setSorting,
        onColumnOrderChange: setColumnOrder,
        onColumnVisibilityChange: setColumnVisibility,
        onColumnSizingChange: setColumnSizing,
        onRowSelectionChange: setRowSelection,
        enableRowSelection: true,
    });

    const { rows } = table.getRowModel();
    const rowVirtualizer = useVirtualizer({
        count: rows.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => TABLE_LAYOUT.rowHeight,
        overscan: TABLE_LAYOUT.overscan,
    });

    const handleKeyDown = useCallback(
        (event: React.KeyboardEvent<HTMLDivElement>) => {
            const allRows = table.getRowModel().rows;
            if (!allRows.length) return;

            const clampIndex = (value: number) =>
                Math.max(0, Math.min(allRows.length - 1, value));

            const focusSingleRow = (index: number) => {
                const targetIndex = clampIndex(index);
                const targetRow = allRows[targetIndex];
                if (!targetRow) return;
                setRowSelection({ [targetRow.id]: true });
                setLastSelectedIndex(targetIndex);
                rowVirtualizer.scrollToIndex(targetIndex);
            };

            const selectRange = (startIndex: number, endIndex: number) => {
                const normalizedStart = clampIndex(startIndex);
                const normalizedEnd = clampIndex(endIndex);
                const [from, to] =
                    normalizedStart <= normalizedEnd
                        ? [normalizedStart, normalizedEnd]
                        : [normalizedEnd, normalizedStart];
                const nextSelection: RowSelectionState = {};
                for (let i = from; i <= to; i += 1) {
                    const row = allRows[i];
                    if (row) {
                        nextSelection[row.id] = true;
                    }
                }
                setRowSelection(nextSelection);
                setLastSelectedIndex(normalizedEnd);
                rowVirtualizer.scrollToIndex(normalizedEnd);
            };

            const selectAll = () => {
                const nextSelection: RowSelectionState = {};
                allRows.forEach((row) => {
                    nextSelection[row.id] = true;
                });
                setRowSelection(nextSelection);
                if (allRows.length) {
                    const bottomIndex = allRows.length - 1;
                    setLastSelectedIndex(bottomIndex);
                    rowVirtualizer.scrollToIndex(bottomIndex);
                }
            };

            const { key, shiftKey, ctrlKey, metaKey } = event;
            const controlKey = ctrlKey || metaKey;
            if (controlKey && key.toLowerCase() === "a") {
                event.preventDefault();
                selectAll();
                return;
            }

            if (key === "ArrowDown" || key === "ArrowUp") {
                event.preventDefault();
                const delta = key === "ArrowDown" ? 1 : -1;
                const baseIndex =
                    lastSelectedIndex ?? (delta === 1 ? -1 : allRows.length);
                const targetIndex = baseIndex + delta;
                if (shiftKey) {
                    const anchor = lastSelectedIndex ?? clampIndex(baseIndex);
                    selectRange(anchor, targetIndex);
                } else {
                    focusSingleRow(targetIndex);
                }
                return;
            }

            if (key === "Home") {
                event.preventDefault();
                const targetIndex = 0;
                if (shiftKey) {
                    const anchor = lastSelectedIndex ?? targetIndex;
                    selectRange(anchor, targetIndex);
                } else {
                    focusSingleRow(targetIndex);
                }
                return;
            }

            if (key === "End") {
                event.preventDefault();
                const targetIndex = allRows.length - 1;
                if (shiftKey) {
                    const anchor = lastSelectedIndex ?? targetIndex;
                    selectRange(anchor, targetIndex);
                } else {
                    focusSingleRow(targetIndex);
                }
                return;
            }

            if (key === "Enter") {
                event.preventDefault();
                const selectedRow = table.getSelectedRowModel().rows[0];
                if (selectedRow) {
                    onRequestDetails?.(selectedRow.original);
                }
                return;
            }

            if (key === "Delete") {
                event.preventDefault();
                if (!onAction) return;
                const selectedRows = table.getSelectedRowModel().rows;
                selectedRows.forEach((row) => onAction("remove", row.original));
            }
        },
        [lastSelectedIndex, onAction, onRequestDetails, rowVirtualizer, table]
    );

    // --- SENSORS ---
    const sensors = useSensors(
        useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
        useSensor(TouchSensor, {
            activationConstraint: { delay: 250, tolerance: 5 },
        }),
        useSensor(KeyboardSensor)
    );

    const handleDragStart = (event: DragStartEvent) => {
        setActiveDragHeaderId(event.active.id as string);
    };

    const handleDragEnd = (event: DragEndEvent) => {
        setActiveDragHeaderId(null);
        const { active, over } = event;
        if (active && over && active.id !== over.id) {
            setColumnOrder((order) => {
                const oldIndex = order.indexOf(active.id as string);
                const newIndex = order.indexOf(over.id as string);
                return arrayMove(order, oldIndex, newIndex);
            });
        }
    };

    // --- EVENTS ---
    const handleRowClick = useCallback(
        (e: React.MouseEvent, rowId: string, originalIndex: number) => {
            const target = e.target as HTMLElement;
            if (
                target.closest("button") ||
                target.closest("label") ||
                target.closest("[data-no-select]")
            )
                return;

            if (e.ctrlKey || e.metaKey) {
                table.getRow(rowId).toggleSelected();
            } else if (e.shiftKey && lastSelectedIndex !== null) {
                const allRows = table.getRowModel().rows;
                const actualLastIndex = Math.max(
                    0,
                    Math.min(allRows.length - 1, lastSelectedIndex)
                );
                const [start, end] =
                    actualLastIndex < originalIndex
                        ? [actualLastIndex, originalIndex]
                        : [originalIndex, actualLastIndex];
                const newSel: RowSelectionState = {};
                for (let i = start; i <= end; i++) {
                    const currentRow = allRows[i];
                    if (currentRow) newSel[currentRow.id] = true;
                }
                setRowSelection(newSel);
            } else {
                setRowSelection({ [rowId]: true });
            }
            setLastSelectedIndex(originalIndex);
        },
        [lastSelectedIndex, table]
    );

    const handleContextMenu = useCallback(
        (e: React.MouseEvent, torrent: Torrent) => {
            e.preventDefault();
            const virtualElement = createVirtualElement(e.clientX, e.clientY);
            setContextMenu({ virtualElement, torrent });

            const allRows = table.getRowModel().rows;
            const row = allRows.find((r) => r.original.id === torrent.id);
            if (row && !rowSelection[row.id]) {
                setRowSelection({ [row.id]: true });
            }
        },
        [rowSelection, table]
    );

    const activeHeader = useMemo(() => {
        return table.getFlatHeaders().find((h) => h.id === activeDragHeaderId);
    }, [activeDragHeaderId, table]);

    useEffect(() => {
        tableContainerRef.current?.focus();
    }, []);

    return (
        <>
            <div
                ref={tableContainerRef}
                tabIndex={0}
                onKeyDown={handleKeyDown}
                className="flex-1 flex flex-col h-full overflow-hidden bg-background/20 relative select-none"
                onClick={() => setContextMenu(null)}
            >
                <style>{`
          .custom-scrollbar::-webkit-scrollbar { width: 8px; height: 8px; }
          .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
          .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(120, 120, 120, 0.2); border-radius: 4px; backdrop-filter: blur(4px); }
          .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(120, 120, 120, 0.4); }
          .custom-scrollbar::-webkit-scrollbar-corner { background: transparent; }
        `}</style>

                <DndContext
                    collisionDetection={closestCenter}
                    sensors={sensors}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                >
                    <div className="flex w-full sticky top-0 z-30 border-b border-content1/20 shadow-sm bg-background/40 backdrop-blur-md">
                        <SortableContext
                            items={columnOrder}
                            strategy={horizontalListSortingStrategy}
                        >
                            {table.getHeaderGroups().map((headerGroup) => (
                                <div
                                    key={headerGroup.id}
                                    className="flex w-full min-w-max"
                                >
                                    {headerGroup.headers.map((header) => (
                                        <DraggableHeader
                                            key={header.id}
                                            header={header}
                                            onContextMenu={(e) => {
                                                e.preventDefault();
                                                setIsColumnModalOpen(true);
                                            }}
                                        />
                                    ))}
                                </div>
                            ))}
                        </SortableContext>
                    </div>

                    <DragOverlay adjustScale={false} dropAnimation={null}>
                        {activeHeader ? (
                            <DraggableHeader header={activeHeader} isOverlay />
                        ) : null}
                    </DragOverlay>

                    <div
                        ref={parentRef}
                        className="flex-1 overflow-y-auto w-full custom-scrollbar"
                    >
                        {isLoading && torrents.length === 0 ? (
                            <div className="w-full">
                                {Array.from({ length: 15 }).map((_, i) => (
                                    <div
                                        key={i}
                                        className="flex items-center w-full border-b border-content1/5 px-4"
                                        style={{
                                            height: TABLE_LAYOUT.rowHeight,
                                        }}
                                    >
                                        <Skeleton className="h-4 w-full rounded-md bg-content1/10" />
                                    </div>
                                ))}
                            </div>
                        ) : torrents.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-foreground/40 gap-6">
                                {/* Empty state content */}
                                <FileUp
                                    size={40}
                                    className="text-foreground/60"
                                />
                                <p className="text-sm text-foreground/50">
                                    {t("table.empty_desc")}
                                </p>
                            </div>
                        ) : (
                            <div
                                className="relative w-full min-w-max"
                                style={{
                                    height: `${rowVirtualizer.getTotalSize()}px`,
                                    width: table.getTotalSize(),
                                }}
                            >
                                {rowVirtualizer
                                    .getVirtualItems()
                                    .map((virtualRow) => {
                                        const row = rows[virtualRow.index];
                                        return (
                                            <VirtualRow
                                                key={row.id}
                                                row={row}
                                                virtualRow={virtualRow}
                                                isSelected={row.getIsSelected()}
                                                isContext={
                                                    contextMenu?.torrent.id ===
                                                    row.original.id
                                                }
                                                onClick={handleRowClick}
                                                onDoubleClick={(t) =>
                                                    onRequestDetails?.(t)
                                                }
                                                onContextMenu={
                                                    handleContextMenu
                                                }
                                            />
                                        );
                                    })}
                            </div>
                        )}
                    </div>
                </DndContext>

                <AnimatePresence>
                    {contextMenu && (
                        <Dropdown
                            isOpen
                            onClose={() => setContextMenu(null)}
                            placement="bottom-start"
                            shouldFlip
                        >
                            <DropdownTrigger>
                                <div
                                    style={{
                                        position: "fixed",
                                        top: contextMenu.virtualElement.getBoundingClientRect()
                                            .top,
                                        left: contextMenu.virtualElement.getBoundingClientRect()
                                            .left,
                                        width: 0,
                                        height: 0,
                                    }}
                                />
                            </DropdownTrigger>
                            <DropdownMenu
                                variant="flat"
                                onAction={(key) => {
                                    const menuKey = key as
                                        | ContextMenuKey
                                        | undefined;
                                    if (menuKey === "cols") {
                                        setIsColumnModalOpen(true);
                                    } else if (menuKey) {
                                        onAction?.(
                                            menuKey,
                                            contextMenu.torrent
                                        );
                                    }
                                    setContextMenu(null);
                                }}
                            >
                                <DropdownItem key="pause">
                                    {t("table.actions.pause")}
                                </DropdownItem>
                                <DropdownItem key="resume">
                                    {t("table.actions.resume")}
                                </DropdownItem>
                                <DropdownItem key="remove" color="danger">
                                    {t("table.actions.remove")}
                                </DropdownItem>
                                <div className="border-t border-content1/20 mt-2 pt-2">
                                    <QueueSubmenu
                                        torrent={contextMenu.torrent}
                                        actions={queueMenuActions}
                                        title={t("table.queue.title")}
                                        onAction={onAction}
                                        closeMenu={() => setContextMenu(null)}
                                    />
                                </div>
                                <DropdownItem key="cols" showDivider>
                                    {t("table.column_picker_title")}
                                </DropdownItem>
                            </DropdownMenu>
                        </Dropdown>
                    )}
                </AnimatePresence>
            </div>

            <Modal
                isOpen={isColumnModalOpen}
                onOpenChange={setIsColumnModalOpen}
                size="lg"
            >
                <ModalContent>
                    {() => (
                        <>
                            <ModalHeader>
                                {t("table.column_picker_title")}
                            </ModalHeader>
                            <ModalBody>
                                {table.getAllLeafColumns().map((column) => {
                                    const id = column.id as ColumnId;
                                    if (id === "selection") return null;
                                    return (
                                        <div
                                            key={column.id}
                                            className="flex justify-between p-2"
                                        >
                                            <span>
                                                {t(
                                                    COLUMN_DEFINITIONS[id]
                                                        ?.labelKey ?? id
                                                )}
                                            </span>
                                            <Checkbox
                                                isSelected={column.getIsVisible()}
                                                onValueChange={(val) =>
                                                    column.toggleVisibility(
                                                        !!val
                                                    )
                                                }
                                            />
                                        </div>
                                    );
                                })}
                            </ModalBody>
                        </>
                    )}
                </ModalContent>
            </Modal>
        </>
    );
}

// Module Augmentation for strict typing of 'align'
declare module "@tanstack/react-table" {
    interface ColumnMeta<TData, TValue> {
        align?: "start" | "center" | "end";
    }
}
