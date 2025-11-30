import { 
  Table, TableHeader, TableColumn, TableBody, TableRow, TableCell, 
  Chip, Progress, Button, Dropdown, DropdownTrigger, DropdownMenu, DropdownItem, 
  cn 
} from "@heroui/react";
import type { Selection, SortDescriptor } from "@heroui/react";
import { ArrowDown, ArrowUp, MoreVertical, Pause, PlayCircle, PauseCircle, Trash2, CheckCircle2, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useState, useMemo } from "react";
import { formatBytes, formatSpeed, formatTime } from "../../../shared/utils/format";

// Define the interface locally or import from a shared types file
export interface Torrent {
  id: number;
  hashString: string;
  name: string;
  totalSize: number;
  percentDone: number;
  status: "downloading" | "seeding" | "paused" | "checking" | "error";
  rateDownload: number;
  rateUpload: number;
  peersConnected: number;
  seedsConnected: number;
  eta: number;
}

interface TorrentTableProps {
  torrents: Torrent[];
  filter: string;
}

export function TorrentTable({ torrents, filter }: TorrentTableProps) {
  const { t } = useTranslation();
  const [selectedKeys, setSelectedKeys] = useState<Selection>(new Set([]));
  const [sortDescriptor, setSortDescriptor] = useState<SortDescriptor>({ column: "id", direction: "ascending" });

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

  return (
    <Table 
      aria-label="Torrent Dashboard"
      isHeaderSticky
      removeWrapper
      selectionMode="multiple"
      selectedKeys={selectedKeys}
      onSelectionChange={setSelectedKeys}
      sortDescriptor={sortDescriptor}
      onSortChange={setSortDescriptor}
      classNames={{
        base: "flex-1 overflow-y-auto scrollbar-hide",
        table: "min-w-full",
        thead: "z-10",
        th: "bg-background/80 backdrop-blur-md text-default-400 font-bold uppercase text-[10px] tracking-widest h-10 border-b border-content1/20 first:pl-6 last:pr-6",
        tr: "group transition-colors hover:bg-content1/20 border-b border-content1/20 data-[selected=true]:bg-primary/10 cursor-default",
        td: "py-2 first:pl-6 last:pr-6 text-xs", // Compact row height
      }}
    >
      <TableHeader>
        <TableColumn key="name" allowsSorting>{t("table.header_name")}</TableColumn>
        <TableColumn key="percentDone" width={220} allowsSorting>{t("table.header_progress")}</TableColumn>
        <TableColumn key="status" width={110} allowsSorting>{t("table.header_status")}</TableColumn>
        <TableColumn key="rateDownload" width={120} align="end" allowsSorting>{t("table.header_speed")}</TableColumn>
        <TableColumn key="peersConnected" width={100} align="end">{t("table.header_peers")}</TableColumn>
        <TableColumn key="totalSize" width={100} align="end" allowsSorting>{t("table.header_size")}</TableColumn>
        <TableColumn key="actions" width={50} align="end"> </TableColumn>
      </TableHeader>
      <TableBody items={sortedTorrents}>
        {(item) => (
          <TableRow key={item.id}>
            {/* NAME + ETA Subtext */}
            <TableCell>
              <div className="flex flex-col gap-1">
                <span className={cn(
                  "font-medium text-sm truncate max-w-md transition-colors", 
                  item.status === 'paused' ? "text-foreground/50" : "text-foreground"
                )}>
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

            {/* PROGRESS BAR */}
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
                        item.status === 'paused' ? "from-warning/50 to-warning" : 
                        item.status === 'seeding' ? "from-primary/50 to-primary" :
                        "from-success/50 to-success"
                      )
                    }}
                 />
              </div>
            </TableCell>

            {/* STATUS CHIP */}
            <TableCell>
              {item.status === 'downloading' ? (
                <Chip size="sm" variant="flat" color="success" startContent={<ArrowDown size={10} />} classNames={{ base: "h-5 px-1 bg-success/10", content: "font-bold text-[9px] uppercase tracking-wider text-success" }}>
                  {t("table.status_dl")}
                </Chip>
              ) : item.status === 'seeding' ? (
                <Chip size="sm" variant="flat" color="primary" startContent={<ArrowUp size={10} />} classNames={{ base: "h-5 px-1 bg-primary/10", content: "font-bold text-[9px] uppercase tracking-wider text-primary" }}>
                  {t("table.status_seed")}
                </Chip>
              ) : (
                <Chip size="sm" variant="flat" color="warning" startContent={<Pause size={10} />} classNames={{ base: "h-5 px-1 bg-warning/10", content: "font-bold text-[9px] uppercase tracking-wider text-warning" }}>
                  {t("table.status_pause")}
                </Chip>
              )}
            </TableCell>

            {/* SPEED */}
            <TableCell>
              <div className="font-mono text-xs">
                {item.status === 'downloading' ? (
                  <span className="text-success font-medium">{formatSpeed(item.rateDownload)}</span>
                ) : item.status === 'seeding' ? (
                  <span className="text-primary font-medium">{formatSpeed(item.rateUpload)}</span>
                ) : (
                  <span className="text-foreground/20">-</span>
                )}
              </div>
            </TableCell>

            {/* PEERS */}
            <TableCell>
              <div className="flex items-center justify-end gap-1 font-mono text-xs text-foreground/60">
                <Users size={12} className="opacity-50" />
                <span>{item.peersConnected}</span>
                <span className="opacity-30">/</span>
                <span className="opacity-50">{item.seedsConnected}</span>
              </div>
            </TableCell>

            {/* SIZE */}
            <TableCell>
              <span className="font-mono text-xs text-foreground/50">{formatBytes(item.totalSize)}</span>
            </TableCell>

            {/* ACTIONS */}
            <TableCell>
              <Dropdown placement="bottom-end">
                <DropdownTrigger>
                  <Button isIconOnly size="sm" variant="light" radius="full" className="text-foreground/30 hover:text-foreground">
                    <MoreVertical size={16} />
                  </Button>
                </DropdownTrigger>
                <DropdownMenu aria-label="Actions" variant="faded" className="w-[160px]">
                  <DropdownItem key="pause" startContent={<PauseCircle size={14}/>}>Pause</DropdownItem>
                  <DropdownItem key="resume" startContent={<PlayCircle size={14}/>}>Resume</DropdownItem>
                  <DropdownItem key="recheck" startContent={<CheckCircle2 size={14}/>}>Force Recheck</DropdownItem>
                  <DropdownItem key="delete" className="text-danger" color="danger" startContent={<Trash2 size={14}/>}>Remove</DropdownItem>
                </DropdownMenu>
              </Dropdown>
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
