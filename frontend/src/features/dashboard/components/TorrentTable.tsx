import { 
  Table, TableHeader, TableColumn, TableBody, TableRow, TableCell, 
  Chip, Progress, Button, Dropdown, DropdownTrigger, DropdownMenu, DropdownItem, Checkbox, cn 
} from "@heroui/react";
import type { SortDescriptor } from "@heroui/react";
import { ArrowDown, ArrowUp, MoreVertical, Pause, PlayCircle, PauseCircle, Trash2, CheckCircle2, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useState, useMemo, useCallback, type MouseEvent } from "react";
import { formatBytes, formatSpeed, formatTime } from "../../../shared/utils/format";
import type { Torrent } from "../types/torrent";
import { TorrentDetailModal } from "./TorrentDetailModal";

interface TorrentTableProps {
  torrents: Torrent[];
  filter: string;
}

export function TorrentTable({ torrents, filter }: TorrentTableProps) {
  const { t } = useTranslation();
  const [selectedTorrentIds, setSelectedTorrentIds] = useState<Set<number>>(new Set());
  const [activeTorrent, setActiveTorrent] = useState<Torrent | null>(null);
  const [sortDescriptor, setSortDescriptor] = useState<SortDescriptor>({ column: "id", direction: "ascending" });

  const toggleSelection = (torrentId: number, checked: boolean) => {
    setSelectedTorrentIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(torrentId);
      } else {
        next.delete(torrentId);
      }
      return next;
    });
  };

  const openDetails = useCallback((torrent: Torrent) => {
    setActiveTorrent(torrent);
  }, []);

  const handleRowContextMenu = (event: MouseEvent<HTMLTableRowElement>, torrent: Torrent) => {
    event.preventDefault();
    event.stopPropagation();
    openDetails(torrent);
  };

  // 1. Filter Logic
  const filteredTorrents = useMemo(() => {
    if (filter === "all") return torrents;
    return torrents.filter((t) => t.status === filter);
  }, [torrents, filter]);

  // 2. Sort Logic
  const sortedTorrents = useMemo(() => {
    return [...filteredTorrents].sort((a: any, b: any) => {
      const first = a[sortDescriptor.column as keyof Torrent];
      const second = b[sortDescriptor.column as keyof Torrent];
      const cmp = first < second ? -1 : first > second ? 1 : 0;
      return sortDescriptor.direction === "descending" ? -cmp : cmp;
    });
  }, [filteredTorrents, sortDescriptor]);

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedTorrentIds(new Set(sortedTorrents.map((torrent) => torrent.id)));
    } else {
      setSelectedTorrentIds(new Set());
    }
  };

  const allVisibleSelected =
    sortedTorrents.length > 0 && sortedTorrents.every((torrent) => selectedTorrentIds.has(torrent.id));
  const someVisibleSelected = sortedTorrents.some((torrent) => selectedTorrentIds.has(torrent.id));

  return (
    <>
      <Table
        aria-label="Torrent Dashboard"
        isHeaderSticky
        removeWrapper
        sortDescriptor={sortDescriptor}
        onSortChange={setSortDescriptor}
        classNames={{
          base: "flex-1 overflow-y-auto scrollbar-hide",
          table: "min-w-full",
          thead: "z-10",
          th: "bg-background/80 backdrop-blur-md text-default-400 font-bold uppercase text-[10px] tracking-widest h-10 border-b border-content1/20 first:pl-6 last:pr-6",
          tr: "group transition-colors hover:bg-content1/20 border-b border-content1/20 data-[selected=true]:bg-primary/10 cursor-pointer",
          td: "py-2 px-3 text-xs",
        }}
      >
        <TableHeader>
          <TableColumn key="selection" width={48} align="center">
            <Checkbox
              className="m-0"
              isSelected={allVisibleSelected}
              isIndeterminate={someVisibleSelected && !allVisibleSelected}
              onValueChange={(value) => handleSelectAll(Boolean(value))}
              aria-label={t("table.select_all")}
            />
          </TableColumn>
          <TableColumn key="name" allowsSorting>
            {t("table.header_name")}
          </TableColumn>
          <TableColumn key="percentDone" width={220} allowsSorting>
            {t("table.header_progress")}
          </TableColumn>
          <TableColumn key="status" width={110} allowsSorting>
            {t("table.header_status")}
          </TableColumn>
          <TableColumn key="rateDownload" width={120} align="end" allowsSorting>
            {t("table.header_speed")}
          </TableColumn>
          <TableColumn key="peersConnected" width={100} align="end">
            {t("table.header_peers")}
          </TableColumn>
          <TableColumn key="totalSize" width={100} align="end" allowsSorting>
            {t("table.header_size")}
          </TableColumn>
          <TableColumn key="actions" width={50} align="end">
            {" "}
          </TableColumn>
        </TableHeader>
        <TableBody items={sortedTorrents}>
          {(item) => {
            const isSelected = selectedTorrentIds.has(item.id);
            return (
              <TableRow
                key={item.id}
                data-selected={isSelected}
                tabIndex={0}
                role="button"
                onClick={() => openDetails(item)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openDetails(item);
                  }
                }}
                onContextMenu={(event) => handleRowContextMenu(event, item)}
              >
                <TableCell className="!px-3">
                  <Checkbox
                    className="m-0"
                    isSelected={isSelected}
                    onValueChange={(value) => toggleSelection(item.id, Boolean(value))}
                    onClick={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                    aria-label={t("table.select_item", { name: item.name })}
                  />
                </TableCell>

                <TableCell>
                  <div className="flex flex-col gap-1">
                    <span
                      className={cn(
                        "font-medium text-sm truncate max-w-md transition-colors",
                        item.status === "paused" ? "text-foreground/50" : "text-foreground"
                      )}
                    >
                      {item.name}
                    </span>
                    {item.status === "downloading" && (
                      <div className="flex items-center gap-2 text-[9px] font-mono text-foreground/50">
                        <span className="text-success">{formatSpeed(item.rateDownload)}</span>
                        <span className="w-0.5 h-0.5 rounded-full bg-foreground/30" />
                        <span>{t("table.eta", { time: formatTime(item.eta) })}</span>
                      </div>
                    )}
                  </div>
                </TableCell>

                <TableCell>
                  <div className="flex flex-col gap-1.5 w-full">
                    <div className="flex justify-between items-end text-[9px] font-mono font-medium opacity-80">
                      <span>{(item.percentDone * 100).toFixed(1)}%</span>
                      <span className="text-foreground/40">{formatBytes(item.totalSize * item.percentDone)}</span>
                    </div>
                    <Progress
                      size="sm"
                      radius="full"
                      aria-label="Progress"
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
                </TableCell>

                <TableCell>
                  {item.status === "downloading" ? (
                    <Chip
                      size="sm"
                      variant="flat"
                      color="success"
                      startContent={<ArrowDown size={10} />}
                      classNames={{ base: "h-5 px-1 bg-success/10", content: "font-bold text-[9px] uppercase tracking-wider text-success" }}
                    >
                      {t("table.status_dl")}
                    </Chip>
                  ) : item.status === "seeding" ? (
                    <Chip
                      size="sm"
                      variant="flat"
                      color="primary"
                      startContent={<ArrowUp size={10} />}
                      classNames={{ base: "h-5 px-1 bg-primary/10", content: "font-bold text-[9px] uppercase tracking-wider text-primary" }}
                    >
                      {t("table.status_seed")}
                    </Chip>
                  ) : (
                    <Chip
                      size="sm"
                      variant="flat"
                      color="warning"
                      startContent={<Pause size={10} />}
                      classNames={{ base: "h-5 px-1 bg-warning/10", content: "font-bold text-[9px] uppercase tracking-wider text-warning" }}
                    >
                      {t("table.status_pause")}
                    </Chip>
                  )}
                </TableCell>

                <TableCell>
                  <div className="font-mono text-xs">
                    {item.status === "downloading" ? (
                      <span className="text-success font-medium">{formatSpeed(item.rateDownload)}</span>
                    ) : item.status === "seeding" ? (
                      <span className="text-primary font-medium">{formatSpeed(item.rateUpload)}</span>
                    ) : (
                      <span className="text-foreground/20">-</span>
                    )}
                  </div>
                </TableCell>

                <TableCell>
                  <div className="flex items-center justify-end gap-1 font-mono text-xs text-foreground/60">
                    <Users size={12} className="opacity-50" />
                    <span>{item.peersConnected}</span>
                    <span className="opacity-30">/</span>
                    <span className="opacity-50">{item.seedsConnected}</span>
                  </div>
                </TableCell>

                <TableCell>
                  <span className="font-mono text-xs text-foreground/50">{formatBytes(item.totalSize)}</span>
                </TableCell>

                <TableCell>
                  <Dropdown placement="bottom-end">
                    <DropdownTrigger>
                      <Button
                        isIconOnly
                        size="sm"
                        variant="light"
                        radius="full"
                        className="text-foreground/30 hover:text-foreground"
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={(event) => event.stopPropagation()}
                      >
                        <MoreVertical size={16} />
                      </Button>
                    </DropdownTrigger>
                    <DropdownMenu aria-label="Actions" variant="faded" className="w-[160px]">
                      <DropdownItem key="pause" startContent={<PauseCircle size={14} />}>
                        Pause
                      </DropdownItem>
                      <DropdownItem key="resume" startContent={<PlayCircle size={14} />}>
                        Resume
                      </DropdownItem>
                      <DropdownItem key="recheck" startContent={<CheckCircle2 size={14} />}>
                        Force Recheck
                      </DropdownItem>
                      <DropdownItem key="delete" className="text-danger" color="danger" startContent={<Trash2 size={14} />}>
                        Remove
                      </DropdownItem>
                    </DropdownMenu>
                  </Dropdown>
                </TableCell>
              </TableRow>
            );
          }}
        </TableBody>
      </Table>
      <TorrentDetailModal
        torrent={activeTorrent}
        isOpen={Boolean(activeTorrent)}
        onClose={() => setActiveTorrent(null)}
      />
    </>
  );
}
