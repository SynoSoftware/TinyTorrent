// TorrentTable.tsx v2.4
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
import { SortableContext, arrayMove, horizontalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
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
import { ArrowDown, ArrowUp, CheckCircle2, Copy, FileUp, Gauge, GripVertical, Link, PauseCircle, PlayCircle, RotateCcw, Trash2 } from "lucide-react";
import React, { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";

import type { Torrent } from "../types/torrent";
import { COLUMN_DEFINITIONS, DEFAULT_COLUMN_ORDER, REQUIRED_COLUMN_IDS, type ColumnId } from "./column-definitions";

// --- CONSTANTS ---
const STORAGE_KEY = "tiny-torrent.table-state.v2.4";
const ROW_HEIGHT = 36;

// --- TYPES ---
export type TorrentTableAction = "pause" | "resume" | "recheck" | "remove" | "remove-with-data";

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
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
      id: header.column.id,
    });

    const style: CSSProperties = {
      transform: CSS.Translate.toString(transform),
      transition,
      width: header.getSize(),
      zIndex: isDragging || isOverlay ? 50 : 0,
    };

    const isResizing = header.column.getIsResizing();
    const sortState = header.column.getIsSorted() as "asc" | "desc" | false;
    const canSort = header.column.getCanSort();
    const sortIcon =
      sortState === "asc" ? (
        <ArrowUp size={12} className="text-primary shrink-0" />
      ) : sortState === "desc" ? (
        <ArrowDown size={12} className="text-primary shrink-0" />
      ) : canSort ? (
        <ArrowDown size={12} className="text-foreground/40 shrink-0 transition-opacity group-hover:text-foreground/80" />
      ) : null;

    return (
      <div
        ref={setNodeRef}
        style={style}
        onContextMenu={onContextMenu}
        className={cn(
          "relative flex items-center h-10 px-2 border-r border-content1/10 transition-colors group select-none overflow-hidden",
          isOverlay
            ? "bg-content1/90 backdrop-blur-md border border-primary/30 rounded shadow-2xl cursor-grabbing"
            : "bg-background/60 backdrop-blur-xl hover:bg-content1/20",
          isDragging && !isOverlay ? "opacity-30" : "opacity-100"
        )}
      >
        {/* Drag Handle */}
        {!isOverlay && (
          <div
            {...attributes}
            {...listeners}
            className="absolute left-0 top-0 bottom-0 w-5 opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing flex items-center justify-center transition-opacity z-10 hover:bg-content1/10"
          >
            <GripVertical size={12} className="text-foreground/40" />
          </div>
        )}

        {/* Header Content */}
        <div
          className={cn(
            "flex-1 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.15em] text-foreground/60 pl-3 truncate cursor-pointer transition-colors hover:text-foreground",
            header.column.columnDef.meta?.align === "center" && "justify-center",
            header.column.columnDef.meta?.align === "end" && "justify-end",
            isOverlay && "text-foreground"
          )}
          onClick={header.column.getToggleSortingHandler()}
        >
          {flexRender(header.column.columnDef.header, header.getContext())}
          {sortIcon}
        </div>

        {/* Resizer Handle */}
        {!isOverlay && (
          <div
            onMouseDown={header.getResizeHandler()}
            onTouchStart={header.getResizeHandler()}
            className={cn(
              "absolute right-0 top-1/2 -translate-y-1/2 h-full w-4 cursor-col-resize touch-none select-none flex justify-center items-center group/resizer z-20"
            )}
          >
            <div
              className={cn(
                "w-[1px] h-4 bg-foreground/10 group-hover/resizer:bg-primary/50 transition-colors",
                isResizing && "bg-primary w-[2px] h-full"
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
    return (
      <div
        data-index={virtualRow.index}
        className={cn(
          "absolute top-0 left-0 flex items-center w-full border-b border-content1/5 transition-colors cursor-default",
          isSelected ? "bg-primary/10 border-l-2 border-l-primary" : "hover:bg-content1/10",
          isContext && !isSelected && "bg-content1/20"
        )}
        style={{
          transform: `translateY(${virtualRow.start}px)`,
          height: `${ROW_HEIGHT}px`, // Fixed height to prevent undefinedpx
        }}
        onClick={(e) => onClick(e, row.id, virtualRow.index)}
        onDoubleClick={() => onDoubleClick(row.original)}
        onContextMenu={(e) => onContextMenu(e, row.original)}
      >
        {row.getVisibleCells().map((cell) => (
          <div
            key={cell.id}
            style={{ width: cell.column.getSize() }}
            className={cn(
              "px-3 flex items-center overflow-hidden h-full",
              cell.column.columnDef.meta?.align === "center" && "justify-center",
              cell.column.columnDef.meta?.align === "end" && "justify-end"
            )}
          >
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
          </div>
        ))}
      </div>
    );
  }
);

// --- MAIN COMPONENT ---
export function TorrentTable({ torrents, filter, isLoading = false, onAction, onRequestDetails }: TorrentTableProps) {
  const { t } = useTranslation();
  const parentRef = useRef<HTMLDivElement>(null);

  // --- 1. STATE INITIALIZATION & NORMALIZATION ---
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

      // 1. Keep only valid saved columns
      const validOrder = (parsed.columnOrder || DEFAULT_COLUMN_ORDER).filter((id: string) => id === "selection" || allDefKeys.includes(id));

      // 2. Append ANY new columns from definitions that aren't in the saved order
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
  const [columnOrder, setColumnOrder] = useState<string[]>(initialState.columnOrder);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(initialState.columnVisibility);
  const [columnSizing, setColumnSizing] = useState(initialState.columnSizing);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const [activeDragHeaderId, setActiveDragHeaderId] = useState<string | null>(null);
  const [isColumnModalOpen, setIsColumnModalOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    virtualElement: ReturnType<typeof createVirtualElement>;
    torrent: Torrent;
  } | null>(null);
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ columnOrder, columnVisibility, columnSizing, sorting }));
  }, [columnOrder, columnVisibility, columnSizing, sorting]);

  // --- 2. DATA & COLUMNS ---
  const data = useMemo(() => {
    if (filter === "all") return torrents;
    return torrents.filter((t) => t.status === filter);
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
                onValueChange={(val) => table.toggleAllPageRowsSelected(!!val)}
                classNames={{ wrapper: "m-0" }}
              />
            </div>
          ),
          cell: ({ row }) => (
            <div className="flex justify-center items-center h-full w-full">
              <Checkbox
                size="sm"
                isSelected={row.getIsSelected()}
                onValueChange={(val) => row.toggleSelected(!!val)}
                classNames={{ wrapper: "m-0" }}
              />
            </div>
          ),
        } as ColumnDef<Torrent>;
      }

      return {
        id,
        accessorKey: def.rpcField,
        header: () => (def.labelKey ? t(def.labelKey) : ""),
        size: def.width ?? 150,
        minSize: 80,
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
  }, [t]); // Removed columnOrder dependency

  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnOrder, columnVisibility, rowSelection, columnSizing },
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

  // --- 3. VIRTUALIZATION ---
  const { rows } = table.getRowModel();
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 20,
  });

  // --- 4. SENSORS ---
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
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

  // --- 5. INTERACTION HANDLERS ---
  useEffect(() => {
    if (!contextMenu) return;
    const scrollElement = parentRef.current;
    if (!scrollElement) return;
    const handleScroll = () => setContextMenu(null);
    scrollElement.addEventListener("scroll", handleScroll);
    return () => scrollElement.removeEventListener("scroll", handleScroll);
  }, [contextMenu]);

  const handleRowClick = useCallback(
    (e: React.MouseEvent, rowId: string, originalIndex: number) => {
      const target = e.target as HTMLElement;
      if (target.closest("button") || target.closest("label") || target.closest("[data-no-select]")) return;

      if (e.ctrlKey || e.metaKey) {
        table.getRow(rowId).toggleSelected();
      } else if (e.shiftKey && lastSelectedIndex !== null) {
        const allRows = table.getRowModel().rows;
        const actualLastIndex = Math.max(0, Math.min(allRows.length - 1, lastSelectedIndex));
        const [start, end] = actualLastIndex < originalIndex ? [actualLastIndex, originalIndex] : [originalIndex, actualLastIndex];
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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        const selected = table.getSelectedRowModel().rows;
        if (selected.length > 0) onAction?.("remove", selected[0].original);
      }
      if (e.key === "a" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        table.toggleAllPageRowsSelected(true);
      }
      if (e.key === "Escape") {
        table.toggleAllRowsSelected(false);
        setContextMenu(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [table, onAction]);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, torrent: Torrent) => {
      e.preventDefault();
      const virtualElement = createVirtualElement(e.clientX, e.clientY);
      setContextMenu({ virtualElement, torrent });

      // Logic: If already selected, do nothing (keep selection). If not, select it.
      const allRows = table.getRowModel().rows;
      const row = allRows.find((r) => r.original.id === torrent.id);
      const isSelected = row ? !!rowSelection[row.id] : false;
      if (!isSelected && row) {
        setRowSelection({ [row.id]: true });
        setLastSelectedIndex(row.index);
      }
    },
    [rowSelection, table]
  );

  const resetColumns = () => {
    setColumnOrder(DEFAULT_COLUMN_ORDER);
    setColumnVisibility({});
    setColumnSizing({});
    setSorting([]);
  };

  const activeHeader = useMemo(() => {
    // Robust header lookup
    return table.getFlatHeaders().find((h) => h.id === activeDragHeaderId);
  }, [activeDragHeaderId, table]);

  // --- RENDER ---
  return (
    <>
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-background/20 relative select-none" onClick={() => setContextMenu(null)}>
        <style>{`
          .custom-scrollbar::-webkit-scrollbar { width: 8px; height: 8px; }
          .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
          .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(120, 120, 120, 0.2); border-radius: 4px; backdrop-filter: blur(4px); }
          .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(120, 120, 120, 0.4); }
          .custom-scrollbar::-webkit-scrollbar-corner { background: transparent; }
        `}</style>

        <DndContext collisionDetection={closestCenter} sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          {/* HEADER */}
          <div className="flex w-full sticky top-0 z-30 border-b border-content1/20 shadow-sm bg-background/40 backdrop-blur-md">
            <SortableContext items={columnOrder} strategy={horizontalListSortingStrategy}>
              {table.getHeaderGroups().map((headerGroup) => (
                <div key={headerGroup.id} className="flex w-full min-w-max">
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
            {activeHeader ? <DraggableHeader header={activeHeader} isOverlay /> : null}
          </DragOverlay>

          {/* BODY */}
          <div ref={parentRef} className="flex-1 overflow-y-auto w-full custom-scrollbar">
            {isLoading && torrents.length === 0 ? (
              <div className="w-full">
                {Array.from({ length: 15 }).map((_, i) => (
                  <div key={i} className="flex items-center w-full border-b border-content1/5 px-4" style={{ height: ROW_HEIGHT }}>
                    <Skeleton className="h-4 w-full rounded-md bg-content1/10" />
                  </div>
                ))}
              </div>
            ) : torrents.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-foreground/40 gap-6">
                <div className="relative">
                  <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full" />
                  <div className="relative w-24 h-24 rounded-3xl bg-content1/20 border border-content1/20 flex items-center justify-center shadow-2xl">
                    <FileUp size={40} className="text-foreground/60" />
                  </div>
                </div>
                <div className="text-center space-y-1">
                  <h3 className="text-lg font-bold text-foreground tracking-tight">{t("table.empty_title")}</h3>
                  <p className="text-sm text-foreground/50">{t("table.empty_desc")}</p>
                </div>
              </div>
            ) : (
              <div className="relative w-full min-w-max" style={{ height: `${rowVirtualizer.getTotalSize()}px`, width: table.getTotalSize() }}>
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const row = rows[virtualRow.index];
                  return (
                    <VirtualRow
                      key={row.id}
                      row={row}
                      virtualRow={virtualRow}
                      isSelected={row.getIsSelected()}
                      isContext={contextMenu?.torrent.id === row.original.id}
                      onClick={handleRowClick}
                      onDoubleClick={(t) => onRequestDetails?.(t)}
                      onContextMenu={handleContextMenu}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </DndContext>

        {/* CONTEXT MENU */}
        <AnimatePresence>
          {contextMenu && (
            <Dropdown
              isOpen
              onClose={() => setContextMenu(null)}
              placement="bottom-start"
              shouldFlip
              classNames={{
                content: "bg-background/80 backdrop-blur-xl border border-content1/20 shadow-[0_20px_40px_rgba(0,0,0,0.5)] rounded-xl min-w-[200px]",
              }}
            >
              <DropdownTrigger>
                <div
                  style={{
                    position: "fixed",
                    top: contextMenu.virtualElement.getBoundingClientRect().top,
                    left: contextMenu.virtualElement.getBoundingClientRect().left,
                    width: 0,
                    height: 0,
                  }}
                />
              </DropdownTrigger>
              <DropdownMenu
                aria-label="Actions"
                variant="flat"
                onAction={(key) => {
                  if (String(key).startsWith("action-")) onAction?.(String(key).replace("action-", "") as TorrentTableAction, contextMenu.torrent);
                  else if (key === "copy-hash") navigator.clipboard.writeText(contextMenu.torrent.hashString);
                  else if (key === "copy-magnet") navigator.clipboard.writeText(`magnet:?xt=urn:btih:${contextMenu.torrent.hashString}`);
                  else if (key === "cols") setIsColumnModalOpen(true);
                  setContextMenu(null);
                }}
              >
                <DropdownItem key="info" className="h-8 gap-2 font-bold opacity-50" isReadOnly>
                  {contextMenu.torrent.name}
                </DropdownItem>
                <DropdownItem key="copy-hash" startContent={<Copy size={14} className="text-foreground/60" />}>
                  {t("table.actions.copy_hash")}
                </DropdownItem>
                <DropdownItem key="copy-magnet" startContent={<Link size={14} className="text-foreground/60" />}>
                  {t("table.actions.copy_magnet")}
                </DropdownItem>
                <DropdownItem key="action-pause" startContent={<PauseCircle size={14} className="text-warning" />}>
                  {t("table.actions.pause")}
                </DropdownItem>
                <DropdownItem key="action-resume" startContent={<PlayCircle size={14} className="text-success" />}>
                  {t("table.actions.resume")}
                </DropdownItem>
                <DropdownItem key="action-recheck" showDivider startContent={<CheckCircle2 size={14} />}>
                  {t("table.actions.recheck")}
                </DropdownItem>
                <DropdownItem key="action-remove" className="text-danger" color="danger" startContent={<Trash2 size={14} />}>
                  {t("table.actions.remove")}
                </DropdownItem>
                <DropdownItem key="action-remove-with-data" className="text-danger" color="danger" startContent={<Trash2 size={14} />}>
                  {t("table.actions.remove_with_data")}
                </DropdownItem>
                <DropdownItem key="cols" showDivider className="text-xs opacity-50">
                  {t("table.column_picker_title")}
                </DropdownItem>
              </DropdownMenu>
            </Dropdown>
          )}
        </AnimatePresence>
      </div>

      {/* COLUMN PICKER MODAL */}
      <Modal
        isOpen={isColumnModalOpen}
        onOpenChange={setIsColumnModalOpen}
        placement="center"
        backdrop="blur"
        size="lg"
        classNames={{
          base: "bg-content1/80 backdrop-blur-xl border border-content1/20 shadow-2xl",
          header: "border-b border-content1/30 py-4",
          footer: "border-t border-content1/30 py-4 justify-between",
        }}
      >
        <ModalContent>
          {() => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <Gauge size={20} className="text-primary" />
                  {t("table.column_picker_title")}
                </h3>
              </ModalHeader>
              <ModalBody className="py-6 overflow-y-auto max-h-[60vh] scrollbar-hide">
                <div className="space-y-2">
                  {table.getAllLeafColumns().map((column) => {
                    const id = column.id as ColumnId;
                    if (id === "selection") return null;
                    const def = COLUMN_DEFINITIONS[id];
                    if (!def) return null;
                    const isRequired = REQUIRED_COLUMN_IDS.includes(id);

                    return (
                      <div
                        key={column.id}
                        className="flex items-center justify-between p-3 rounded-lg bg-content1/10 border border-content1/10 hover:bg-content1/20 transition-colors"
                      >
                        <div className="flex flex-col">
                          <span className="text-sm font-semibold">{t(def.labelKey ?? id)}</span>
                          <span className="text-[10px] text-foreground/50">{def.descriptionKey ? t(def.descriptionKey) : ""}</span>
                        </div>
                        <Checkbox
                          isSelected={column.getIsVisible()}
                          isDisabled={isRequired}
                          onValueChange={(val) => column.toggleVisibility(!!val)}
                        />
                      </div>
                    );
                  })}
                </div>
              </ModalBody>
              <ModalFooter>
                <Button variant="ghost" color="danger" size="sm" startContent={<RotateCcw size={14} />} onPress={resetColumns}>
                  {t("table.column_picker_reset")}
                </Button>
                <Button variant="flat" size="sm" onPress={() => setIsColumnModalOpen(false)}>
                  {t("table.column_picker_apply")}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </>
  );
}

// Extend module for meta types
declare module "@tanstack/react-table" {
  interface ColumnMeta<TData, TValue> {
    align?: "start" | "center" | "end";
  }
}
