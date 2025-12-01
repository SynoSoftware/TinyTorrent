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
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
  type SortDescriptor,
} from "@heroui/react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Copy, FileUp, Gauge, Link, PauseCircle, PlayCircle, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState, type DragEvent } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { useTranslation } from "react-i18next";

import type { Torrent } from "../types/torrent";
import {
  ALL_COLUMN_IDS,
  COLUMN_DEFINITIONS,
  DEFAULT_COLUMN_ORDER,
  DEFAULT_VISIBLE_COLUMN_IDS,
  REQUIRED_COLUMN_IDS,
} from "./column-definitions";
import type { ColumnDefinition, ColumnId } from "./column-definitions";
import constants from "../../../config/constants.json";

const STORAGE_KEY = "tiny-torrent.column-config";

const createSkeletonTorrent = (id: number): Torrent => ({
  id,
  hashString: "",
  name: "",
  totalSize: 0,
  percentDone: 0,
  status: "paused",
  rateDownload: 0,
  rateUpload: 0,
  peersConnected: 0,
  seedsConnected: 0,
  eta: 0,
  dateAdded: 0,
  queuePosition: 0,
  uploadRatio: 0,
  uploadedEver: 0,
  downloadedEver: 0,
  downloadDir: "",
});

const hydrateColumnOrder = (order: ColumnId[]) => {
  const seen = new Set<ColumnId>();
  const normalized: ColumnId[] = [];
  order.forEach((id) => {
    if (!seen.has(id) && COLUMN_DEFINITIONS[id]) {
      seen.add(id);
      normalized.push(id);
    }
  });
  ALL_COLUMN_IDS.forEach((id) => {
    if (!seen.has(id)) {
      normalized.push(id);
    }
  });
  return normalized;
};

const createVisibleColumnSet = (ids: ColumnId[]) => {
  const next = new Set<ColumnId>();
  ids.forEach((id) => {
    if (COLUMN_DEFINITIONS[id]) {
      next.add(id);
    }
  });
  REQUIRED_COLUMN_IDS.forEach((required) => next.add(required));
  if (!next.size && ALL_COLUMN_IDS[0]) {
    next.add(ALL_COLUMN_IDS[0]);
  }
  return next;
};

export type TorrentTableAction = "pause" | "resume" | "recheck" | "remove" | "remove-with-data";

const MAGNET_PREFIX = constants.defaults.magnet_protocol_prefix ?? "magnet:?";

const compareValues = (first?: string | number, second?: string | number) => {
  if (first === undefined || first === null) return second === undefined || second === null ? 0 : -1;
  if (second === undefined || second === null) return 1;
  if (typeof first === "string" || typeof second === "string") return String(first).localeCompare(String(second));
  return Number(first) - Number(second);
};

interface TorrentTableProps {
  torrents: Torrent[];
  filter: string;
  isLoading?: boolean;
  onAction?: (action: TorrentTableAction, torrent: Torrent) => void;
  onRequestDetails?: (torrent: Torrent) => void;
}

export function TorrentTable({ torrents, filter, isLoading = false, onAction, onRequestDetails }: TorrentTableProps) {
  const { t } = useTranslation();
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set<number>());
  const [lastSelectedId, setLastSelectedId] = useState<number | null>(null);
  const [sortDescriptor, setSortDescriptor] = useState<SortDescriptor>({
    column: "name",
    direction: "ascending",
  });
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; torrent: Torrent } | null>(null);

  const [columnOrder, setColumnOrder] = useState<ColumnId[]>(() => hydrateColumnOrder(DEFAULT_COLUMN_ORDER));
  const [visibleColumns, setVisibleColumns] = useState<Set<ColumnId>>(() => createVisibleColumnSet(DEFAULT_VISIBLE_COLUMN_IDS));
  const [isColumnModalOpen, setIsColumnModalOpen] = useState(false);
  const [modalVisibility, setModalVisibility] = useState<Set<ColumnId>>(() => createVisibleColumnSet(DEFAULT_VISIBLE_COLUMN_IDS));
  const [columnWidths, setColumnWidths] = useState<Partial<Record<ColumnId, number>>>(() => {
    const widths: Partial<Record<ColumnId, number>> = {};
    DEFAULT_COLUMN_ORDER.forEach((id) => {
      const definition = COLUMN_DEFINITIONS[id];
      if (definition?.width) {
        widths[id] = definition.width;
      }
    });
    return widths;
  });
  const [resizingColumn, setResizingColumn] = useState<{ column: ColumnId; startX: number; startWidth: number } | null>(null);
  const [draggingColumn, setDraggingColumn] = useState<ColumnId | null>(null);
  const [dropTargetColumn, setDropTargetColumn] = useState<ColumnId | null>(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (!saved) return;
      const payload = JSON.parse(saved) as { order?: ColumnId[]; visible?: ColumnId[] };
      if (Array.isArray(payload.order)) {
        setColumnOrder(hydrateColumnOrder(payload.order));
      }
      if (Array.isArray(payload.visible)) {
        setVisibleColumns(createVisibleColumnSet(payload.visible));
      }
    } catch {
      /* ignore invalid payload */
    }
  }, []);

  useEffect(() => {
    const payload = {
      order: columnOrder,
      visible: Array.from(visibleColumns),
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [columnOrder, visibleColumns]);

  const displayColumns = columnOrder
    .map((id) => COLUMN_DEFINITIONS[id])
    .filter((column): column is ColumnDefinition => Boolean(column) && visibleColumns.has(column.id));

  useEffect(() => {
    const safeColumn = displayColumns.find((column) => column.id === sortDescriptor.column && column.sortable);
    if (safeColumn) return;
    const fallback = displayColumns.find((column) => column.sortable);
    if (fallback) {
      setSortDescriptor((prev) => ({
        ...prev,
        column: fallback.id,
      }));
    }
  }, [displayColumns, sortDescriptor.column]);

  const filteredItems = useMemo(() => {
    let items = [...torrents];
    if (filter !== "all") {
      items = items.filter((torrent) => torrent.status === filter);
    }
    const column = COLUMN_DEFINITIONS[sortDescriptor.column as ColumnId];
    const accessor =
      column?.sortAccessor ??
      ((item: Torrent) => {
        const value = item[sortDescriptor.column as keyof Torrent];
        return value;
      });

    return items.sort((first, second) => {
      const firstValue = accessor(first) as string | number | undefined;
      const secondValue = accessor(second) as string | number | undefined;
      const cmp = compareValues(firstValue, secondValue);
      return sortDescriptor.direction === "descending" ? -cmp : cmp;
    });
  }, [torrents, filter, sortDescriptor]);

  const skeletonRows = useMemo(() => Array.from({ length: 5 }, (_, idx) => createSkeletonTorrent(-(idx + 1))), []);

  const handleSelection = (id: number, multiSelect: boolean, shiftKey: boolean) => {
    const newSet = new Set<number>(multiSelect ? selectedIds : []);
    if (shiftKey && lastSelectedId !== null) {
      const start = filteredItems.findIndex((torrent) => torrent.id === lastSelectedId);
      const end = filteredItems.findIndex((torrent) => torrent.id === id);
      const range = filteredItems.slice(Math.min(start, end), Math.max(start, end) + 1);
      range.forEach((torrent) => newSet.add(torrent.id));
    } else {
      if (newSet.has(id) && multiSelect) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
    }
    setSelectedIds(newSet);
    setLastSelectedId(id);
  };

  const handleSelectAll = (value: boolean) => {
    const flattened = value ? new Set(filteredItems.map((torrent) => torrent.id)) : new Set<number>();
    setSelectedIds(flattened);
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!selectedIds.size) return;
      if (event.key === "Escape") {
        setSelectedIds(new Set<number>());
        setContextMenu(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedIds]);

  const allSelected = filteredItems.length > 0 && selectedIds.size === filteredItems.length;
  const isIndeterminate = selectedIds.size > 0 && !allSelected;
  const openColumnModal = () => {
    setModalVisibility(new Set(visibleColumns));
    setIsColumnModalOpen(true);
  };

  const handleContextAction = (key: string | number) => {
    if (!contextMenu) return;
    const action = String(key);
    const { torrent } = contextMenu;

    const copyToClipboard = (value: string) => {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        void navigator.clipboard.writeText(value);
      }
    };

    if (action === "copy-hash") {
      copyToClipboard(torrent.hashString);
      setContextMenu(null);
      return;
    }

    if (action === "copy-magnet") {
      copyToClipboard(`${MAGNET_PREFIX}xt=urn:btih:${torrent.hashString}`);
      setContextMenu(null);
      return;
    }

    const rpcAction = action as TorrentTableAction;
    onAction?.(rpcAction, torrent);
    setContextMenu(null);
  };

  const handleModalReset = () => {
    setColumnOrder(hydrateColumnOrder(DEFAULT_COLUMN_ORDER));
    setModalVisibility(createVisibleColumnSet(DEFAULT_VISIBLE_COLUMN_IDS));
    setVisibleColumns(createVisibleColumnSet(DEFAULT_VISIBLE_COLUMN_IDS));
  };

  const handleColumnVisibilityToggle = (id: ColumnId) => {
    if (REQUIRED_COLUMN_IDS.includes(id)) return;
    setModalVisibility((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const applyColumnConfiguration = () => {
    setVisibleColumns(createVisibleColumnSet(Array.from(modalVisibility)));
    setIsColumnModalOpen(false);
  };

  const moveColumn = (source: ColumnId, target: ColumnId) =>
    setColumnOrder((prev) => {
      const next = [...prev];
      const fromIndex = next.indexOf(source);
      const toIndex = next.indexOf(target);
      if (fromIndex === -1 || toIndex === -1) return prev;
      next.splice(fromIndex, 1);
      next.splice(toIndex, 0, source);
      return next;
    });

  const handleColumnDragStart = (event: DragEvent<HTMLDivElement>, id: ColumnId) => {
    event.dataTransfer?.setData("column", id);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
    }
    setDraggingColumn(id);
  };

  const handleColumnDragOver = (event: DragEvent<HTMLDivElement>, id: ColumnId) => {
    event.preventDefault();
    setDropTargetColumn(id);
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "move";
    }
  };

  const handleColumnDragEnd = () => {
    setDraggingColumn(null);
    setDropTargetColumn(null);
  };
  const handleColumnDrop = (event: DragEvent<HTMLDivElement>, target: ColumnId) => {
    event.preventDefault();
    const source = event.dataTransfer?.getData("column");
    if (source && source !== target) {
      moveColumn(source as ColumnId, target);
    }
    setDraggingColumn(null);
    setDropTargetColumn(null);
  };

  const handleResizeStart = (event: ReactMouseEvent<HTMLSpanElement>, columnId: ColumnId) => {
    event.preventDefault();
    event.stopPropagation();
    const definition = COLUMN_DEFINITIONS[columnId];
    const currentWidth = columnWidths[columnId] ?? definition?.width ?? 140;
    setResizingColumn({ column: columnId, startX: event.clientX, startWidth: currentWidth });
  };

  useEffect(() => {
    if (!resizingColumn) return;
    const handleMouseMove = (event: MouseEvent) => {
      const deltaX = event.clientX - resizingColumn.startX;
      const nextWidth = Math.max(80, resizingColumn.startWidth + deltaX);
      setColumnWidths((prev) => {
        if (prev[resizingColumn.column] === nextWidth) return prev;
        return { ...prev, [resizingColumn.column]: nextWidth };
      });
    };
    const handleMouseUp = () => setResizingColumn(null);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [resizingColumn]);

  if (!isLoading && torrents.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="flex-1 flex flex-col items-center justify-center text-foreground/40 gap-6"
      >
        <div className="relative">
          <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full" />
          <div className="relative w-24 h-24 rounded-3xl bg-content1/20 border border-content1/20 flex items-center justify-center shadow-2xl">
            <FileUp size={40} className="text-foreground/60" />
          </div>
        </div>
        <div className="text-center space-y-1">
          <h3 className="text-lg font-bold text-foreground tracking-tight">{t("table.empty_title", "No Torrents")}</h3>
          <p className="text-sm text-foreground/50">{t("table.empty_desc", "Drop a file to start downloading")}</p>
        </div>
      </motion.div>
    );
  }

  return (
    <>
      <div
        className="flex-1 flex flex-col min-h-0 relative group/container"
        onContextMenu={(event) => event.target === event.currentTarget && setContextMenu(null)}
        onClick={() => setContextMenu(null)}
      >
        <Table
          aria-label="Torrent Dashboard"
          isHeaderSticky
          removeWrapper
          selectionMode="none"
          sortDescriptor={sortDescriptor}
          onSortChange={setSortDescriptor}
          classNames={{
            base: "flex-1 overflow-y-auto scrollbar-hide",
            table: "min-w-full",
            thead: "z-10",
            th: "bg-background/90 backdrop-blur-xl text-default-400 font-bold uppercase text-[10px] tracking-[0.2em] h-10 border-b border-content1/20 first:pl-6 last:pr-6",
            tr: "group transition-all duration-150 border-b border-content1/20 data-[selected=true]:bg-gradient-to-r data-[selected=true]:from-primary/10 data-[selected=true]:to-transparent data-[context=true]:bg-content1/20 cursor-default outline-none",
            td: "py-2 px-3 text-xs first:pl-6 last:pr-6",
            emptyWrapper: "h-full",
          }}
        >
          <TableHeader columns={displayColumns}>
            {(column) => {
              const width = columnWidths[column.id] ?? column.width;
              const isDropTarget = dropTargetColumn === column.id && draggingColumn !== column.id;
              const isDraggable = !column.isRequired;
              return (
                <TableColumn
                  key={column.id}
                  width={width}
                  align={column.align}
                  allowsSorting={column.sortable}
                  style={width ? { width } : undefined}
                >
                  <div
                    className={`relative flex h-full items-center gap-2 ${
                      column.id === "selection" ? "justify-center" : "justify-between"
                    } ${isDropTarget ? "bg-content1/20 border border-primary/30" : ""} ${
                      isDraggable ? "cursor-grab" : "cursor-default"
                    }`}
                    draggable={isDraggable}
                    onDragStart={isDraggable ? (event) => handleColumnDragStart(event, column.id) : undefined}
                    onDragOver={isDraggable ? (event) => handleColumnDragOver(event, column.id) : undefined}
                    onDrop={isDraggable ? (event) => handleColumnDrop(event, column.id) : undefined}
                    onDragEnd={isDraggable ? handleColumnDragEnd : undefined}
                    onDragLeave={() => setDropTargetColumn((prev) => (prev === column.id ? null : prev))}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      openColumnModal();
                    }}
                  >
                    {column.id === "selection" ? (
                      <div onClick={(event) => event.stopPropagation()} className="flex justify-center w-full">
                        <Checkbox
                          isSelected={allSelected}
                          isIndeterminate={isIndeterminate}
                          onValueChange={handleSelectAll}
                          classNames={{ wrapper: "m-0" }}
                          aria-label={t("table.select_all")}
                        />
                      </div>
                    ) : column.labelKey ? (
                      <span className="flex-1 text-center">{t(column.labelKey)}</span>
                    ) : (
                      ""
                    )}
                    {!column.isRequired && (
                      <span
                        role="presentation"
                        className="absolute inset-y-0 right-0 w-2 cursor-col-resize"
                        onMouseDown={(event) => handleResizeStart(event, column.id)}
                      />
                    )}
                  </div>
                </TableColumn>
              );
            }}
          </TableHeader>
          <TableBody items={isLoading ? skeletonRows : filteredItems} isLoading={isLoading}>
            {(item) => (
              <TableRow
                key={`row-${item.id}`}
                data-selected={selectedIds.has(item.id)}
                data-context={contextMenu?.torrent.id === item.id}
                className={selectedIds.has(item.id) ? "border-l-2 border-primary" : "border-l-2 border-transparent"}
                onClick={(event) => {
                  if (!event.defaultPrevented) {
                    handleSelection(item.id, event.ctrlKey || event.metaKey, event.shiftKey);
                  }
                }}
                onDoubleClick={() => onRequestDetails?.(item)}
                onContextMenu={(event) => {
                  event.preventDefault();
                  setContextMenu({ x: event.clientX, y: event.clientY, torrent: item });
                  if (!selectedIds.has(item.id)) handleSelection(item.id, false, false);
                }}
              >
                {(columnId) => (
                  <TableCell>
                    {isLoading ? (
                      <Skeleton className="rounded-lg h-5 w-full bg-content1/20 before:animate-[shimmer_2s_infinite]" />
                    ) : (
                      <TorrentCell
                        item={item}
                        columnKey={columnId as ColumnId}
                        isSelected={selectedIds.has(item.id)}
                        toggleSelection={() => handleSelection(item.id, true, false)}
                        t={t}
                      />
                    )}
                  </TableCell>
                )}
              </TableRow>
            )}
          </TableBody>
        </Table>

        <AnimatePresence>
          {contextMenu && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 5 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.1 } }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              className="fixed z-50 origin-top-left"
              style={{ top: contextMenu.y, left: contextMenu.x }}
            >
              <Dropdown
                isOpen
                onClose={() => setContextMenu(null)}
                placement="bottom-start"
                classNames={{
                  content: "bg-background/80 backdrop-blur-xl border border-content1/20 shadow-[0_20px_40px_rgba(0,0,0,0.5)] rounded-xl",
                }}
              >
                <DropdownTrigger>
                  <div className="w-0 h-0 opacity-0" />
                </DropdownTrigger>
              <DropdownMenu aria-label="Context Actions" variant="flat" onAction={handleContextAction}>
                  <DropdownItem key="info" className="h-8 gap-2 font-bold opacity-50" isReadOnly>
                    {contextMenu.torrent.name}
                  </DropdownItem>
                  <DropdownItem key="copy-hash" startContent={<Copy size={14} className="text-foreground/60" />}>
                    {t("table.actions.copy_hash")}
                  </DropdownItem>
                  <DropdownItem key="copy-magnet" startContent={<Link size={14} className="text-foreground/60" />}>
                    {t("table.actions.copy_magnet")}
                  </DropdownItem>
                  <DropdownItem key="pause" startContent={<PauseCircle size={14} className="text-warning" />}>
                    {t("table.actions.pause")}
                  </DropdownItem>
                  <DropdownItem key="resume" startContent={<PlayCircle size={14} className="text-success" />}>
                    {t("table.actions.resume")}
                  </DropdownItem>
                  <DropdownItem key="recheck" showDivider startContent={<CheckCircle2 size={14} />}>
                    {t("table.actions.recheck")}
                  </DropdownItem>
                  <DropdownItem
                    key="remove"
                    className="text-danger data-[hover=true]:bg-danger/20"
                    color="danger"
                    startContent={<Trash2 size={14} />}
                  >
                    {t("table.actions.remove")}
                  </DropdownItem>
                  <DropdownItem
                    key="remove-with-data"
                    className="text-danger data-[hover=true]:bg-danger/25"
                    color="danger"
                    showDivider
                    startContent={<Trash2 size={14} />}
                  >
                    {t("table.actions.remove_with_data")}
                  </DropdownItem>
                </DropdownMenu>
              </Dropdown>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <Modal
        isOpen={isColumnModalOpen}
        onOpenChange={setIsColumnModalOpen}
        placement="center"
        backdrop="blur"
        size="xl"
        classNames={{
          base: "bg-content1/80 backdrop-blur-xl border border-content1/20 shadow-2xl",
          header: "border-b border-content1/30 py-4",
          footer: "border-t border-content1/30 py-4 justify-between",
        }}
        motionProps={{
          variants: {
            enter: { y: 0, opacity: 1, scale: 1, transition: { duration: 0.3, ease: [0.32, 0.72, 0, 1] } },
            exit: { y: 10, opacity: 0, scale: 0.95, transition: { duration: 0.2 } },
          },
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
                <p className="text-xs uppercase tracking-[0.4em] text-foreground/50">{t("table.column_picker_description")}</p>
              </ModalHeader>
              <ModalBody className="space-y-3 py-6">
                <div className="space-y-3">
                  {columnOrder.map((columnId) => {
                    const column = COLUMN_DEFINITIONS[columnId];
                    if (!column) return null;
                    const isRequired = REQUIRED_COLUMN_IDS.includes(columnId);
                    const isVisible = modalVisibility.has(columnId);
                    return (
                      <div
                        key={columnId}
                        className="rounded-2xl border border-content1/20 bg-content1/10 px-4 py-3 shadow-[0_10px_30px_rgba(0,0,0,0.25)]"
                      >
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex flex-col">
                            <p className="text-sm font-semibold text-foreground">{t(column.labelKey ?? column.id)}</p>
                            {column.descriptionKey && (
                              <p className="text-[11px] text-foreground/50">{t(column.descriptionKey)}</p>
                            )}
                          </div>
                          <Checkbox
                            isSelected={isVisible}
                            onValueChange={() => handleColumnVisibilityToggle(columnId)}
                            disabled={isRequired}
                            classNames={{ wrapper: "m-0" }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ModalBody>
              <ModalFooter>
                <div className="flex items-center gap-3">
                  <Button variant="ghost" size="sm" onPress={handleModalReset} className="text-foreground/60">
                    {t("table.column_picker_reset")}
                  </Button>
                  <Button variant="light" size="sm" onPress={() => setIsColumnModalOpen(false)}>
                    {t("table.column_picker_cancel")}
                  </Button>
                </div>
                <Button color="primary" variant="shadow" size="sm" onPress={applyColumnConfiguration}>
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

interface TorrentCellProps {
  item: Torrent;
  columnKey: ColumnId;
  isSelected: boolean;
  toggleSelection: () => void;
  t: ReturnType<typeof useTranslation>["t"];
}

const TorrentCell = ({ item, columnKey, isSelected, toggleSelection, t }: TorrentCellProps) => {
  const definition = COLUMN_DEFINITIONS[columnKey];
  if (!definition) return null;
  return definition.render({ torrent: item, t, isSelected, toggleSelection });
};
