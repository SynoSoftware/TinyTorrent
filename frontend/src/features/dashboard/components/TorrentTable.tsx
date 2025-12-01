import {
  Button,
  Checkbox,
  Chip,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
  Progress,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
  cn,
  type SortDescriptor,
} from "@heroui/react";
import { ArrowDown, ArrowUp, CheckCircle2, FileUp, MoreVertical, Pause, PauseCircle, PlayCircle, Trash2, Users } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatBytes, formatSpeed, formatTime } from "../../../shared/utils/format";
import type { Torrent } from "../types/torrent";
import { TorrentDetailModal } from "./TorrentDetailModal";

interface TorrentTableProps {
  torrents: Torrent[];
  filter: string;
  isLoading?: boolean;
}

type ColumnId = "selection" | "name" | "progress" | "status" | "speed" | "peers" | "size" | "actions";

const COLUMNS: { id: ColumnId; label?: string; width?: number; align?: "start" | "center" | "end"; sortable?: boolean }[] = [
  { id: "selection", width: 40, align: "center" },
  { id: "name", label: "table.header_name", sortable: true },
  { id: "progress", label: "table.header_progress", width: 220, sortable: true },
  { id: "status", label: "table.header_status", width: 110, sortable: true },
  { id: "speed", label: "table.header_speed", width: 120, align: "end", sortable: true },
  { id: "peers", label: "table.header_peers", width: 100, align: "end" },
  { id: "size", label: "table.header_size", width: 100, align: "end", sortable: true },
  { id: "actions", width: 50, align: "end" },
];

export function TorrentTable({ torrents, filter, isLoading = false }: TorrentTableProps) {
  const { t } = useTranslation();
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [lastSelectedId, setLastSelectedId] = useState<number | null>(null);
  const [activeTorrent, setActiveTorrent] = useState<Torrent | null>(null);
  const [sortDescriptor, setSortDescriptor] = useState<SortDescriptor>({ column: "name", direction: "ascending" });
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; torrent: Torrent } | null>(null);

  // --- FILTER & SORT ---
  const filteredItems = useMemo(() => {
    let items = [...torrents];
    if (filter !== "all") items = items.filter((t) => t.status === filter);
    return items.sort((a: any, b: any) => {
      const first = a[sortDescriptor.column as keyof Torrent];
      const second = b[sortDescriptor.column as keyof Torrent];
      const cmp = first < second ? -1 : first > second ? 1 : 0;
      return sortDescriptor.direction === "descending" ? -cmp : cmp;
    });
  }, [torrents, filter, sortDescriptor]);

  // --- SELECTION ---
  const handleSelection = (id: number, multiSelect: boolean, shiftKey: boolean) => {
    const newSet = new Set(multiSelect ? selectedIds : []);
    if (shiftKey && lastSelectedId !== null) {
      const start = filteredItems.findIndex((t) => t.id === lastSelectedId);
      const end = filteredItems.findIndex((t) => t.id === id);
      const range = filteredItems.slice(Math.min(start, end), Math.max(start, end) + 1);
      range.forEach((t) => newSet.add(t.id));
    } else {
      if (newSet.has(id) && multiSelect) newSet.delete(id);
      else newSet.add(id);
    }
    setSelectedIds(newSet);
    setLastSelectedId(id);
  };

  const handleSelectAll = (val: boolean) => setSelectedIds(new Set(val ? filteredItems.map((t) => t.id) : []));

  // --- KEYBOARD ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selectedIds.size) return;
      if (e.key === "Escape") {
        setSelectedIds(new Set());
        setContextMenu(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedIds]);

  const allSelected = filteredItems.length > 0 && selectedIds.size === filteredItems.length;
  const isIndeterminate = selectedIds.size > 0 && !allSelected;

  // --- EMPTY STATE ---
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
        onContextMenu={(e) => e.target === e.currentTarget && setContextMenu(null)}
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
            // THE NEON ROW:
            tr: "group transition-all duration-150 border-b border-content1/20 data-[selected=true]:bg-gradient-to-r data-[selected=true]:from-primary/10 data-[selected=true]:to-transparent data-[context=true]:bg-content1/20 cursor-default outline-none",
            td: "py-2 px-3 text-xs first:pl-6 last:pr-6",
            emptyWrapper: "h-full",
          }}
        >
          <TableHeader columns={COLUMNS}>
            {(column) => (
              <TableColumn key={column.id} width={column.width} align={column.align} allowsSorting={column.sortable}>
                {column.id === "selection" ? (
                  <div onClick={(e) => e.stopPropagation()} className="flex justify-center">
                    <Checkbox
                      isSelected={allSelected}
                      isIndeterminate={isIndeterminate}
                      onValueChange={handleSelectAll}
                      classNames={{ wrapper: "m-0" }}
                    />
                  </div>
                ) : column.label ? (
                  t(column.label)
                ) : (
                  ""
                )}
              </TableColumn>
            )}
          </TableHeader>
          <TableBody items={isLoading ? Array(5).fill({ id: -1 }) : filteredItems} isLoading={isLoading}>
            {(item) => (
              <TableRow
                key={item.id === -1 ? `skeleton-${Math.random()}` : item.id}
                data-selected={selectedIds.has(item.id)}
                data-context={contextMenu?.torrent.id === item.id}
                className={selectedIds.has(item.id) ? "border-l-2 border-primary" : "border-l-2 border-transparent"}
                onClick={(e) => {
                  if (!e.defaultPrevented) handleSelection(item.id, e.ctrlKey || e.metaKey, e.shiftKey);
                }}
                onDoubleClick={() => setActiveTorrent(item)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setContextMenu({ x: e.clientX, y: e.clientY, torrent: item });
                  if (!selectedIds.has(item.id)) handleSelection(item.id, false, false);
                }}
              >
                {(columnKey) => (
                  <TableCell>
                    {isLoading ? (
                      <Skeleton className="rounded-lg h-5 w-full bg-content1/20 before:animate-[shimmer_2s_infinite]" />
                    ) : (
                      <TorrentCell
                        item={item}
                        columnKey={columnKey as ColumnId}
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

        {/* --- KINETIC CONTEXT MENU --- */}
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
                    isOpen={true}
                    onClose={() => setContextMenu(null)}
                    placement="bottom-start"
                    classNames={{
                      content: "bg-background/80 backdrop-blur-xl border border-content1/20 shadow-[0_20px_40px_rgba(0,0,0,0.5)] rounded-xl",
                    }}
                  >
                <DropdownTrigger>
                  <div className="w-0 h-0 opacity-0" />
                </DropdownTrigger>
                <DropdownMenu aria-label="Context Actions" variant="flat" onAction={() => setContextMenu(null)}>
                  <DropdownItem key="info" className="h-8 gap-2 font-bold opacity-50" isReadOnly>
                    {contextMenu.torrent.name}
                  </DropdownItem>
                  <DropdownItem key="pause" startContent={<PauseCircle size={14} className="text-warning" />}>
                    Pause
                  </DropdownItem>
                  <DropdownItem key="resume" startContent={<PlayCircle size={14} className="text-success" />}>
                    Resume
                  </DropdownItem>
                  <DropdownItem key="recheck" showDivider startContent={<CheckCircle2 size={14} />}>
                    Force Recheck
                  </DropdownItem>
                  <DropdownItem
                    key="delete"
                    className="text-danger data-[hover=true]:bg-danger/20"
                    color="danger"
                    startContent={<Trash2 size={14} />}
                  >
                    Remove
                  </DropdownItem>
                </DropdownMenu>
              </Dropdown>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <TorrentDetailModal torrent={activeTorrent} isOpen={Boolean(activeTorrent)} onClose={() => setActiveTorrent(null)} />
    </>
  );
}

// --- CELL RENDERER (Optimized) ---
const TorrentCell = ({ item, columnKey, isSelected, toggleSelection, t }: any) => {
  switch (columnKey) {
    case "selection":
      return (
        <div onClick={(e) => e.stopPropagation()} className="flex justify-center">
          <Checkbox isSelected={isSelected} onValueChange={toggleSelection} classNames={{ wrapper: "m-0" }} />
        </div>
      );
    case "name":
      return (
        <div className="flex flex-col gap-0.5">
          <span className={cn("font-medium text-sm truncate max-w-md transition-colors", item.status === "paused" && "text-foreground/50")}>
            {item.name}
          </span>
          {item.status === "downloading" && (
            <div className="flex items-center gap-2 text-[10px] font-mono text-foreground/50 tracking-tight">
              <span className="text-success">{formatSpeed(item.rateDownload)}</span>
              <span className="w-0.5 h-0.5 rounded-full bg-foreground/30" />
              <span>{t("table.eta", { time: formatTime(item.eta) })}</span>
            </div>
          )}
        </div>
      );
    case "progress":
      return (
        <div className="flex flex-col gap-1.5 w-full">
          <div className="flex justify-between items-end text-[10px] font-mono font-medium opacity-80 tabular-nums">
            <span>{(item.percentDone * 100).toFixed(1)}%</span>
            <span className="text-foreground/40">{formatBytes(item.totalSize * item.percentDone)}</span>
          </div>
          <Progress
            size="sm"
            radius="full"
            value={item.percentDone * 100}
            classNames={{
              track: "h-1 bg-content1/20",
              indicator: cn(
                "h-1 bg-gradient-to-r",
                item.status === "paused"
                  ? "from-warning/50 to-warning"
                  : item.status === "seeding"
                  ? "from-primary/50 to-primary"
                  : "from-success/50 to-success"
              ),
            }}
          />
        </div>
      );
    case "status":
      const statusMap: any = {
        downloading: { color: "success", icon: ArrowDown, label: "table.status_dl" },
        seeding: { color: "primary", icon: ArrowUp, label: "table.status_seed" },
        paused: { color: "warning", icon: Pause, label: "table.status_pause" },
      };
      const conf = statusMap[item.status] || { color: "default", icon: Pause, label: "Unknown" };
      return (
        <Chip
          size="sm"
          variant="flat"
          color={conf.color}
          startContent={<conf.icon size={10} />}
          classNames={{
            base: `h-5 px-1 bg-${conf.color}/10 border border-${conf.color}/20`,
            content: `font-bold text-[9px] uppercase tracking-wider text-${conf.color}`,
          }}
        >
          {t(conf.label)}
        </Chip>
      );
    case "speed":
      return (
        <div className="font-mono text-xs tabular-nums">
          {item.status === "downloading" ? (
            <span className="text-success font-medium">{formatSpeed(item.rateDownload)}</span>
          ) : item.status === "seeding" ? (
            <span className="text-primary font-medium">{formatSpeed(item.rateUpload)}</span>
          ) : (
            <span className="text-foreground/20">-</span>
          )}
        </div>
      );
    case "peers":
      return (
        <div className="flex items-center justify-end gap-1 font-mono text-xs text-foreground/60 tabular-nums">
          <Users size={12} className="opacity-50" />
          <span>{item.peersConnected}</span>
          <span className="opacity-30">/</span>
          <span className="opacity-50">{item.seedsConnected}</span>
        </div>
      );
    case "size":
      return <span className="font-mono text-xs text-foreground/50 tabular-nums">{formatBytes(item.totalSize)}</span>;
    case "actions":
      return (
        <div onClick={(e) => e.stopPropagation()}>
          <Dropdown placement="bottom-end">
            <DropdownTrigger>
              <Button isIconOnly size="sm" variant="light" radius="full" className="text-foreground/30 hover:text-foreground">
                <MoreVertical size={16} />
              </Button>
            </DropdownTrigger>
            <DropdownMenu aria-label="Actions" variant="faded">
              <DropdownItem key="pause" startContent={<PauseCircle size={14} />}>
                Pause
              </DropdownItem>
              <DropdownItem key="delete" className="text-danger" color="danger" startContent={<Trash2 size={14} />}>
                Remove
              </DropdownItem>
            </DropdownMenu>
          </Dropdown>
        </div>
      );
  }
  return null;
};
