import { Button, Chip, Divider, Modal, ModalBody, ModalContent, Progress, Tab, Tabs, cn, Tooltip } from "@heroui/react";
import { Activity, Copy, Grid, HardDrive, Info, Lock, Network, Server, X, Zap } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { GlassPanel } from "../../../shared/ui/layout/GlassPanel";
import { formatBytes, formatSpeed, formatTime } from "../../../shared/utils/format";
import { FileExplorerTree, type FileExplorerEntry } from "../../../shared/ui/workspace/FileExplorerTree";
import constants from "../../../config/constants.json";
import type { TorrentDetail } from "../types/torrent";

// --- TYPES ---
type DetailTab = "general" | "content" | "pieces" | "trackers" | "peers" | "speed";

interface TorrentDetailModalProps {
  torrent: TorrentDetail | null;
  isOpen: boolean;
  onClose: () => void;
  onFilesToggle?: (indexes: number[], wanted: boolean) => Promise<void> | void;
}

type PieceStatus = "done" | "downloading" | "missing";

interface PiecesMapProps {
  percent: number;
  pieceCount?: number;
  pieceStates?: number[];
  pieceSize?: number;
}

const PIECE_COLUMNS = 42;

const PiecesMap = ({ percent, pieceStates, pieceCount, pieceSize }: PiecesMapProps) => {
  const displayPieces = Math.max(64, pieceCount ?? Math.round(256 * Math.max(percent, 0.1)));
  const gridRows = Math.ceil(displayPieces / PIECE_COLUMNS);
  const totalCells = gridRows * PIECE_COLUMNS;

  const cells = useMemo(() => {
    return Array.from({ length: totalCells }, (_, index) => {
      const state = pieceStates?.[index];
      let status: PieceStatus = "missing";
      if (typeof state === "number") {
        if (state & 0x1) {
          status = "done";
        } else if (state & 0x2) {
          status = "downloading";
        }
      } else {
        const doneThreshold = Math.floor(displayPieces * percent);
        if (index < doneThreshold) {
          status = "done";
        } else if (index === doneThreshold && percent < 1) {
          status = "downloading";
        }
      }
      return { index, status };
    });
  }, [displayPieces, percent, pieceStates, totalCells]);

  const doneCount = cells.filter((cell) => cell.status === "done").length;
  const downloadingCount = cells.filter((cell) => cell.status === "downloading").length;

  const pieceSizeLabel = pieceSize ? formatBytes(pieceSize) : "Unknown";

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="flex flex-wrap justify-between text-[10px] uppercase tracking-[0.2em] text-foreground/50">
        <span>
          Pieces: <span className="text-foreground font-mono">{pieceCount ?? displayPieces}</span>
        </span>
        <span>
          Piece Size: <span className="text-foreground font-mono">{pieceSizeLabel}</span>
        </span>
        <span>
          Verified: <span className="text-foreground font-mono">{doneCount}</span>
        </span>
        <span>
          Downloading: <span className="text-warning font-mono">{downloadingCount}</span>
        </span>
      </div>
      <div className="grid gap-[3px] rounded-2xl border border-content1/20 bg-content1/10 p-4" style={{ gridTemplateColumns: `repeat(${PIECE_COLUMNS}, minmax(0, 1fr))` }}>
        {cells.map((cell) => (
          <Tooltip key={cell.index} content={`Piece #${cell.index + 1}`} closeDelay={0}>
            <div
              className={cn(
                "aspect-square rounded-[1px] transition-colors duration-500",
                cell.status === "done"
                  ? "bg-primary/90 shadow-[0_0_6px_rgba(6,182,212,0.5)]"
                  : cell.status === "downloading"
                  ? "bg-warning animate-pulse shadow-[0_0_4px_rgba(245,158,11,0.3)]"
                  : "bg-content1/20"
              )}
            />
          </Tooltip>
        ))}
      </div>
    </div>
  );
};

// --- SUB-COMPONENT: SPEED CHART (Custom SVG, Zero Bloat) ---
const CHART_WIDTH = 180;
const CHART_HEIGHT = 72;

const SpeedChart = ({ downHistory, upHistory }: { downHistory: number[]; upHistory: number[] }) => {
  const maxValue = Math.max(...downHistory, ...upHistory, 1);
  const latestDown = downHistory.at(-1) ?? 0;
  const latestUp = upHistory.at(-1) ?? 0;
  const buildPath = (values: number[]) => {
    if (!values.length) return "";
    return values
      .map((value, index) => {
        const x = ((index / (values.length - 1 || 1)) * CHART_WIDTH).toFixed(2);
        const y = (CHART_HEIGHT - (value / maxValue) * CHART_HEIGHT).toFixed(2);
        return `${index === 0 ? "M" : "L"}${x},${y}`;
      })
      .join(" ");
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-between items-center text-[11px] font-mono text-foreground/60">
        <span className="text-success">↓ {formatSpeed(latestDown)}</span>
        <span className="text-primary">↑ {formatSpeed(latestUp)}</span>
      </div>
      <div className="rounded-2xl border border-content1/20 bg-content1/20 p-3">
        <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} preserveAspectRatio="none" className="w-full h-20">
          <defs>
            <linearGradient id="down-gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#22c55e" stopOpacity="0.6" />
              <stop offset="100%" stopColor="#22c55e" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="up-gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6366f1" stopOpacity="0.6" />
              <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d={buildPath(downHistory)}
            fill="none"
            stroke="url(#down-gradient)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d={buildPath(upHistory)}
            fill="none"
            stroke="url(#up-gradient)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </div>
  );
};

// --- MAIN COMPONENT ---

const STATUS_CONFIG = {
  downloading: { color: "success", label: "Downloading" },
  seeding: { color: "primary", label: "Seeding" },
  paused: { color: "warning", label: "Paused" },
  checking: { color: "warning", label: "Checking" },
  error: { color: "danger", label: "Error" },
} as const;

export function TorrentDetailModal({ torrent, isOpen, onClose, onFilesToggle }: TorrentDetailModalProps) {
  const { t } = useTranslation();
  const historyPoints = constants.performance.history_data_points;
  const [downHistory, setDownHistory] = useState(() => new Array(historyPoints).fill(0));
  const [upHistory, setUpHistory] = useState(() => new Array(historyPoints).fill(0));
  const [activeTab, setActiveTab] = useState<DetailTab>("general");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen) setActiveTab("general");
  }, [isOpen]);

  useEffect(() => {
    setDownHistory(new Array(historyPoints).fill(0));
    setUpHistory(new Array(historyPoints).fill(0));
  }, [torrent?.id, historyPoints]);

  useEffect(() => {
    if (!torrent) return;
    setDownHistory((prev) => [...prev.slice(1), torrent.rateDownload]);
    setUpHistory((prev) => [...prev.slice(1), torrent.rateUpload]);
  }, [torrent?.rateDownload, torrent?.rateUpload]);

  const handleCopyHash = () => {
    if (torrent) {
      navigator.clipboard.writeText(torrent.hashString);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!torrent) return null;

  const trackers = torrent.trackers ?? [];
  const peers = torrent.peers ?? [];
  const files = torrent.files ?? [];
  const downloadDir = torrent.downloadDir ?? "Unknown";
  const fileEntries = useMemo<FileExplorerEntry[]>(() => {
    return files.map((file, index) => ({
      name: file.name,
      index,
      length: file.length,
      percentDone: file.percentDone,
      wanted: file.wanted,
    }));
  }, [files]);

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(open) => !open && onClose()}
      backdrop="blur"
      placement="center"
      size="4xl" // Wider for graph/map
      hideCloseButton
      classNames={{
        base: "bg-background/90 backdrop-blur-2xl border border-content1/20 shadow-2xl h-[650px] flex flex-col overflow-hidden",
        body: "p-0 flex-1 overflow-hidden flex flex-col",
      }}
      motionProps={{
        variants: {
          enter: { scale: 1, opacity: 1, transition: { duration: 0.2, ease: "easeOut" } },
          exit: { scale: 0.95, opacity: 0, transition: { duration: 0.15 } },
        },
      }}
    >
      <ModalContent>
        {/* --- HEADER --- */}
        <div className="shrink-0 px-6 pt-6 pb-2 border-b border-content1/20 bg-background/40 z-10">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div className="flex flex-col gap-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-bold text-foreground truncate">{torrent.name}</h3>
                <Chip
                  size="sm"
                  variant="flat"
                  color={STATUS_CONFIG[torrent.status].color}
                  classNames={{ base: "h-5 px-1", content: "text-[9px] font-bold uppercase tracking-wider" }}
                >
                  {STATUS_CONFIG[torrent.status].label}
                </Chip>
              </div>
              <span className="text-[10px] uppercase tracking-widest text-foreground/40 font-bold">
                Hash: {torrent.hashString.substring(0, 8)}...
              </span>
            </div>
            <Button
              isIconOnly
              size="sm"
              variant="light"
              onPress={onClose}
              className="text-foreground/40 hover:text-foreground"
              aria-label={t("torrent_modal.actions.close")}
            >
              <X size={20} />
            </Button>
          </div>

          <Tabs
            variant="underlined"
            selectedKey={activeTab}
            onSelectionChange={(k) => setActiveTab(k as DetailTab)}
            classNames={{
              tabList: "gap-6 p-0",
              cursor: "w-full bg-primary h-[2px]",
              tab: "px-0 h-9 text-xs font-medium text-foreground/50 data-[selected=true]:text-foreground data-[selected=true]:font-bold",
            }}
          >
            <Tab
              key="general"
              title={
                <div className="flex items-center gap-2">
                  <Info size={14} /> General
                </div>
              }
            />
            <Tab
              key="content"
              title={
                <div className="flex items-center gap-2">
                  <HardDrive size={14} /> Files
                </div>
              }
            />
            <Tab
              key="pieces"
              title={
                <div className="flex items-center gap-2">
                  <Grid size={14} /> Pieces
                </div>
              }
            />
            <Tab
              key="trackers"
              title={
                <div className="flex items-center gap-2">
                  <Server size={14} /> Trackers
                </div>
              }
            />
            <Tab
              key="peers"
              title={
                <div className="flex items-center gap-2">
                  <Network size={14} /> Peers
                </div>
              }
            />
            <Tab
              key="speed"
              title={
                <div className="flex items-center gap-2">
                  <Activity size={14} /> Speed
                </div>
              }
            />
          </Tabs>
        </div>

        {/* --- BODY --- */}
        <ModalBody className="flex-1 bg-content1/20 p-6 overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.15 }}
              className="h-full overflow-y-auto pr-2 scrollbar-hide"
            >
              {/* --- TAB: GENERAL --- */}
              {activeTab === "general" && (
                <div className="space-y-6">
                    <GlassPanel className="p-6 space-y-5 bg-content1/40">
                    {/* Main Progress */}
                    <div className="flex justify-between items-end">
                      <div>
                        <div className="text-[10px] uppercase tracking-widest text-foreground/40 font-bold mb-1">Total Progress</div>
                        <div className="text-4xl font-mono font-medium tracking-tight">{(torrent.percentDone * 100).toFixed(1)}%</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] uppercase tracking-widest text-foreground/40 font-bold">Time Remaining</div>
                        <div className="font-mono text-xl">{torrent.eta > 0 ? formatTime(torrent.eta) : t("torrent_modal.eta_unknown")}</div>
                      </div>
                    </div>

                    <Progress
                      value={torrent.percentDone * 100}
                      size="lg"
                      classNames={{ track: "h-3 bg-content1/20", indicator: "bg-gradient-to-r from-success/50 to-success" }}
                    />

                    {/* Availability Bar (qBittorrent style) */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-[9px] uppercase tracking-wider font-bold text-foreground/40">
                        <span>Availability (Swarm)</span>
                        <span className="text-primary">
                          {torrent.peersConnected + torrent.seedsConnected} Active
                        </span>
                      </div>
                      <div className="h-1.5 w-full bg-content1/20 rounded-full overflow-hidden flex">
                        <div className="h-full bg-primary w-full opacity-80" /> {/* Full bar implies 100% available */}
                      </div>
                    </div>
                  </GlassPanel>

                  <div className="grid grid-cols-2 gap-4">
                    <GlassPanel className="p-4 flex flex-col gap-1">
                      <span className="text-[10px] uppercase tracking-widest text-foreground/40">Downloaded</span>
                      <span className="font-mono text-sm">{formatBytes(torrent.downloadedEver)}</span>
                    </GlassPanel>
                    <GlassPanel className="p-4 flex flex-col gap-1">
                      <span className="text-[10px] uppercase tracking-widest text-foreground/40">Uploaded</span>
                      <span className="font-mono text-sm text-primary">
                        {formatBytes(torrent.uploadedEver)} (Ratio: {torrent.uploadRatio.toFixed(2)})
                      </span>
                    </GlassPanel>
                    <GlassPanel className="col-span-2 p-4 flex flex-col gap-2">
                      <span className="text-[10px] uppercase tracking-widest text-foreground/40">Save Path</span>
                      <code className="font-mono text-xs text-foreground/70 bg-content1/20 px-2 py-1 rounded">{downloadDir}</code>
                    </GlassPanel>
                    <GlassPanel className="col-span-2 p-4 flex flex-col gap-2">
                      <span className="text-[10px] uppercase tracking-widest text-foreground/40">Info Hash</span>
                      <div className="flex gap-2">
                        <code className="font-mono text-xs text-foreground/70 bg-content1/20 px-2 py-1 rounded flex-1">{torrent.hashString}</code>
                        <Button
                          isIconOnly
                          size="sm"
                          variant="flat"
                          onPress={handleCopyHash}
                          aria-label={t("table.actions.copy_hash")}
                        >
                          <Copy size={12} />
                        </Button>
                      </div>
                    </GlassPanel>
                  </div>
                </div>
              )}

              {/* --- TAB: PIECES (New) --- */}
              {activeTab === "pieces" && (
                <div className="h-full flex flex-col">
                  <GlassPanel className="flex-1 overflow-y-auto">
                    <PiecesMap
                      percent={torrent.percentDone}
                      pieceCount={torrent.pieceCount}
                      pieceSize={torrent.pieceSize}
                      pieceStates={torrent.pieceStates}
                    />
                  </GlassPanel>
                </div>
              )}
              {/* --- TAB: SPEED (New) --- */}
              {activeTab === "speed" && (
                <div className="h-full flex flex-col">
                  <GlassPanel className="flex-1 p-6">
                    <SpeedChart downHistory={downHistory} upHistory={upHistory} />
                  </GlassPanel>
                </div>
              )}

              {/* --- TAB: CONTENT --- */}
              {activeTab === "content" && (
                <div className="flex flex-col gap-3">
                  <GlassPanel className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-semibold uppercase tracking-[0.3em] text-foreground/60">
                        {t("torrent_modal.files_title")}
                      </div>
                      <span className="text-[11px] text-foreground/50">{files.length} file{files.length === 1 ? "" : "s"}</span>
                    </div>
                    <div className="text-[11px] text-foreground/50">{t("torrent_modal.files_description")}</div>
                    <div className="max-h-[320px] overflow-y-auto">
                      <FileExplorerTree
                        files={fileEntries}
                        emptyMessage={t("torrent_modal.files_empty")}
                        onFilesToggle={(indexes: number[], wanted: boolean) => onFilesToggle?.(indexes, wanted)}
                      />
                    </div>
                  </GlassPanel>
                </div>
              )}

              {/* --- TAB: PEERS --- */}
              {activeTab === "peers" && (
                <div className="flex flex-col gap-2">
                  {peers.map((peer, i) => (
                    <GlassPanel key={i} className="p-3 grid grid-cols-12 items-center gap-4 hover:bg-content1/50 transition-colors">
                      <div className="col-span-4 flex flex-col">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono">{peer.address}</span>
                          {peer.country && (
                            <Chip size="sm" variant="flat" classNames={{ base: "h-4 px-1", content: "text-[9px] font-bold" }}>
                              {peer.country}
                            </Chip>
                          )}
                        </div>
                        <span className="text-[10px] text-foreground/40 truncate">{peer.clientName}</span>
                      </div>
                      <div className="col-span-2 text-[10px] font-mono opacity-50">{peer.flagStr}</div>
                      <div className="col-span-3 flex flex-col gap-1">
                        <Progress size="sm" value={peer.progress * 100} classNames={{ track: "h-1 bg-content1/10", indicator: "bg-primary" }} />
                      </div>
                      <div className="col-span-3 flex flex-col items-end font-mono text-[10px]">
                        <span className="text-success">{formatSpeed(peer.rateToClient)}</span>
                        <span className="text-primary">{formatSpeed(peer.rateToPeer)}</span>
                      </div>
                    </GlassPanel>
                  ))}
                </div>
              )}
              {/* --- TAB: TRACKERS --- */}
              {activeTab === "trackers" && (
                <div className="flex flex-col gap-2">
                  {trackers.length === 0 && (
                    <div className="px-4 py-3 text-xs text-foreground/50">No tracker history available.</div>
                  )}
                  {trackers.map((tracker) => (
                    <GlassPanel
                      key={`${tracker.announce}-${tracker.tier}`}
                      className="p-3 flex items-center justify-between hover:bg-content1/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={cn(
                            "w-1.5 h-1.5 rounded-full",
                            tracker.lastAnnounceSucceeded ? "bg-success shadow-[0_0_8px_rgba(34,197,94,0.4)]" : "bg-warning"
                          )}
                        />
                        <div className="flex flex-col">
                          <span className="text-xs font-mono text-foreground/80 truncate max-w-xs">{tracker.announce}</span>
                          <span className="text-[10px] text-foreground/40">
                            Tier {tracker.tier} - {tracker.lastAnnounceResult || "—"} -
                            {tracker.lastAnnounceSucceeded
                              ? t("torrent_modal.trackers.status_online")
                              : t("torrent_modal.trackers.status_partial")}
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-foreground/30">Peers</span>
                        <div className="font-mono text-xs">
                          {tracker.seederCount} seeded / {tracker.leecherCount} leeching
                        </div>
                      </div>
                    </GlassPanel>
                  ))}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
