import { Button, Chip, Modal, ModalBody, ModalContent, Progress, Switch, Tab, Tabs, cn, Tooltip } from "@heroui/react";
import {
  Activity,
  Copy,
  Grid,
  HardDrive,
  Info,
  Lock,
  Network,
  Server,
  X,
  Zap,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { GlassPanel } from "../../../shared/ui/layout/GlassPanel";
import { formatBytes, formatSpeed, formatTime } from "../../../shared/utils/format";
import { FileExplorerTree, type FileExplorerEntry } from "../../../shared/ui/workspace/FileExplorerTree";
import constants from "../../../config/constants.json";
import type { TorrentDetail } from "../types/torrent";
import type { TorrentPeerEntity } from "../../../core/domain/entities";

// --- TYPES ---
type DetailTab = "general" | "content" | "pieces" | "trackers" | "peers" | "speed";

interface TorrentDetailModalProps {
  torrent: TorrentDetail | null;
  isOpen: boolean;
  onClose: () => void;
  onFilesToggle?: (indexes: number[], wanted: boolean) => Promise<void> | void;
  onSequentialToggle?: (enabled: boolean) => Promise<void> | void;
  onSuperSeedingToggle?: (enabled: boolean) => Promise<void> | void;
  onForceTrackerReannounce?: () => Promise<void> | void;
  sequentialSupported?: boolean;
  superSeedingSupported?: boolean;
}

type PieceStatus = "done" | "downloading" | "missing";

interface PiecesMapProps {
  percent: number;
  pieceCount?: number;
  pieceStates?: number[];
  pieceSize?: number;
}

const PIECE_COLUMNS = 42;
const HEATMAP_SAMPLE_LIMIT = PIECE_COLUMNS * 6;
const HEATMAP_ZOOM_LEVELS = [1, 1.5, 2, 2.5];
const HISTORY_POINTS = constants.performance.history_data_points;

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

interface AvailabilityHeatmapProps {
  pieceAvailability?: number[];
  label: string;
  legendRare: string;
  legendCommon: string;
  emptyLabel: string;
  formatTooltip: (piece: number, peers: number) => string;
}

const AvailabilityHeatmap = ({
  pieceAvailability,
  label,
  legendRare,
  legendCommon,
  emptyLabel,
  formatTooltip,
}: AvailabilityHeatmapProps) => {
  const [zoomIndex, setZoomIndex] = useState(0);
  const zoomLevel = HEATMAP_ZOOM_LEVELS[zoomIndex] ?? 1;

  if (!pieceAvailability?.length) {
    return (
      <div className="rounded-2xl border border-content1/20 bg-content1/10 p-4 text-[11px] text-foreground/50 text-center">
        {emptyLabel}
      </div>
    );
  }

  const sampleLimit = Math.round(HEATMAP_SAMPLE_LIMIT * zoomLevel);
  const sampleCount = Math.min(pieceAvailability.length, sampleLimit);
  const step = sampleCount > 1 ? (pieceAvailability.length - 1) / (sampleCount - 1) : 1;
  const sampledCells = Array.from({ length: sampleCount }, (_, index) => {
    const pieceIndex = Math.min(pieceAvailability.length - 1, Math.round(index * step));
    return {
      pieceIndex,
      value: pieceAvailability[pieceIndex] ?? 0,
    };
  });

  const maxPeers = pieceAvailability.reduce((max, count) => Math.max(max, count ?? 0), 0) || 1;
  const gridRows = Math.ceil(sampledCells.length / PIECE_COLUMNS);
  const totalCells = gridRows * PIECE_COLUMNS;
  const filledCells = Array.from({ length: totalCells }, (_, index) => sampledCells[index] ?? null);

  const getBackgroundColor = (value: number) => {
    const ratio = Math.min(Math.max(value / maxPeers, 0), 1);
    const hue = ratio * 220;
    const lightness = value === 0 ? 58 : 48;
    return `hsl(${hue}, 75%, ${lightness}%)`;
  };

  return (
    <motion.div layout className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-[0.3em] text-foreground/50">{label}</span>
        <div className="flex items-center gap-3 text-[10px] text-foreground/50">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[hsl(0,80%,54%)]" />
            {legendRare}
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[hsl(220,80%,54%)]" />
            {legendCommon}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="flat"
            color="default"
            className="h-7 w-7 rounded-full"
            onPress={() => setZoomIndex((prev) => Math.max(0, prev - 1))}
            isDisabled={zoomIndex === 0}
          >
            <ZoomOut size={12} />
          </Button>
          <span className="text-[10px] font-mono text-foreground/60">x{zoomLevel.toFixed(1)}</span>
          <Button
            size="sm"
            variant="flat"
            color="default"
            className="h-7 w-7 rounded-full"
            onPress={() => setZoomIndex((prev) => Math.min(HEATMAP_ZOOM_LEVELS.length - 1, prev + 1))}
            isDisabled={zoomIndex === HEATMAP_ZOOM_LEVELS.length - 1}
          >
            <ZoomIn size={12} />
          </Button>
        </div>
      </div>
      <div
        className="grid gap-[3px] rounded-2xl border border-content1/20 bg-content1/10 p-2"
        style={{ gridTemplateColumns: `repeat(${PIECE_COLUMNS}, minmax(0, 1fr))` }}
      >
        {filledCells.map((cell, index) => {
          const isPlaceholder = cell === null;
          const tooltip = isPlaceholder ? emptyLabel : formatTooltip(cell.pieceIndex + 1, cell.value);
          return (
            <div
              key={`availability-${index}`}
              className={cn(
                "aspect-square rounded-[1px] border transition-colors duration-200",
                isPlaceholder ? "border-dashed border-content1/20 bg-content1/5" : "border-transparent"
              )}
              style={{ backgroundColor: isPlaceholder ? "transparent" : getBackgroundColor(cell.value) }}
              title={tooltip}
            />
          );
        })}
      </div>
    </motion.div>
  );
};

interface PeerMapProps {
  peers: TorrentPeerEntity[];
}

const PeerMap = ({ peers }: PeerMapProps) => {
  const { t } = useTranslation();
  const [scale, setScale] = useState(1);
  const maxRate = useMemo(
    () => Math.max(...peers.map((peer) => peer.rateToClient + peer.rateToPeer), 1),
    [peers]
  );
  const nodes = useMemo(() => {
    if (!peers.length) return [];
    const radius = 70;
    const center = 90;
    return peers.map((peer, index) => {
      const angle = (index / peers.length) * Math.PI * 2;
      const speed = peer.rateToClient + peer.rateToPeer;
      const distance = 30 + (speed / maxRate) * 40;
      const x = center + Math.cos(angle) * distance;
      const y = center + Math.sin(angle) * distance;
      const size = 6 + (peer.progress ?? 0) * 12;
      const isChoking = peer.peerIsChoking;
      const fill = isChoking ? "hsl(0,80%,60%)" : "hsl(150,80%,60%)";
      return { peer, x, y, size, fill };
    });
  }, [maxRate, peers]);

  const handleZoom = (direction: "in" | "out") => {
    setScale((prev) => {
      const next = direction === "in" ? Math.min(1.5, prev + 0.2) : Math.max(0.8, prev - 0.2);
      return next;
    });
  };

  return (
    <motion.div layout className="rounded-2xl border border-content1/20 bg-content1/15 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <span className="text-[11px] uppercase tracking-[0.3em] text-foreground/50">
            {t("torrent_modal.peer_map.title")}
          </span>
          <span className="text-[10px] font-mono text-foreground/50">{t("torrent_modal.peer_map.total", { count: peers.length })}</span>
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="flat" color="default" className="h-7 w-7" onPress={() => handleZoom("out")}>
            <ZoomOut size={12} />
          </Button>
          <Button size="sm" variant="flat" color="default" className="h-7 w-7" onPress={() => handleZoom("in")}>
            <ZoomIn size={12} />
          </Button>
        </div>
      </div>
      <div className="flex justify-center">
        <motion.svg
          width={180}
          height={180}
          viewBox="0 0 180 180"
          className="rounded-2xl bg-content1/10 border border-content1/20"
          style={{ transform: `scale(${scale})`, transformOrigin: "center" }}
        >
          <motion.circle
            cx={90}
            cy={90}
            r={80}
            stroke="var(--heroui-content1)"
            strokeWidth={1}
            fill="transparent"
            className="opacity-25"
          />
          {nodes.map(({ peer, x, y, size, fill }) => (
            <Tooltip
              key={`${peer.address}-${x}-${y}`}
              content={`${peer.address} · ${formatSpeed(peer.rateToClient)} DL / ${formatSpeed(peer.rateToPeer)} UL`}
              closeDelay={0}
            >
              <motion.circle
                cx={x}
                cy={y}
                r={size}
                fill={fill}
                stroke="var(--heroui-foreground)"
                strokeWidth={peer.peerIsChoking ? 0.5 : 1}
                whileHover={{ scale: 1.2 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
              />
            </Tooltip>
          ))}
        </motion.svg>
      </div>
    </motion.div>
  );
};

const useTorrentDetailSpeedHistory = (torrent: TorrentDetail | null) => {
  const cacheRef = useRef(new Map<string, { down: number[]; up: number[] }>());
  const [downHistory, setDownHistory] = useState<number[]>(() => new Array(HISTORY_POINTS).fill(0));
  const [upHistory, setUpHistory] = useState<number[]>(() => new Array(HISTORY_POINTS).fill(0));

  useEffect(() => {
    if (!torrent) {
      setDownHistory(new Array(HISTORY_POINTS).fill(0));
      setUpHistory(new Array(HISTORY_POINTS).fill(0));
      return;
    }
    const cached = cacheRef.current.get(torrent.id);
    if (cached) {
      setDownHistory(cached.down);
      setUpHistory(cached.up);
    } else {
      const empty = new Array(HISTORY_POINTS).fill(0);
      setDownHistory(empty);
      setUpHistory(empty);
    }
  }, [torrent]);

  useEffect(() => {
    if (!torrent) return;
    setDownHistory((prev) => [...prev.slice(1), torrent.speed.down]);
    setUpHistory((prev) => [...prev.slice(1), torrent.speed.up]);
  }, [torrent?.id, torrent?.speed.down, torrent?.speed.up]);

  useEffect(() => {
    if (!torrent) return;
    cacheRef.current.set(torrent.id, { down: [...downHistory], up: [...upHistory] });
  }, [downHistory, upHistory, torrent]);

  return { downHistory, upHistory };
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
  queued: { color: "warning", label: "Queued" },
  error: { color: "danger", label: "Error" },
} as const;

export function TorrentDetailModal({
  torrent,
  isOpen,
  onClose,
  onFilesToggle,
  onSequentialToggle,
  onSuperSeedingToggle,
  onForceTrackerReannounce,
  sequentialSupported: sequentialSupportedProp,
  superSeedingSupported: superSeedingSupportedProp,
}: TorrentDetailModalProps) {
  const { t } = useTranslation();
  const { downHistory, upHistory } = useTorrentDetailSpeedHistory(torrent);
  const [activeTab, setActiveTab] = useState<DetailTab>("general");
  const [copied, setCopied] = useState(false);
  const sequentialSupported = sequentialSupportedProp ?? Boolean(onSequentialToggle);
  const superSeedingSupported = superSeedingSupportedProp ?? Boolean(onSuperSeedingToggle);

  useEffect(() => {
    if (isOpen) setActiveTab("general");
  }, [isOpen]);

  const handleCopyHash = () => {
    if (torrent) {
      navigator.clipboard.writeText(torrent.hash);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!torrent) return null;

  const trackers = torrent.trackers ?? [];
  const peerEntries = torrent.peers ?? [];
  const files = torrent.files ?? [];
  const downloadDir = torrent.savePath ?? "Unknown";
  const fileEntries = useMemo<FileExplorerEntry[]>(() => {
    return files.map((file, index) => ({
      name: file.name,
      index,
      length: file.length,
      progress: file.progress,
      wanted: file.wanted,
      priority: file.priority,
    }));
  }, [files]);

  const reannounceSupported = Boolean(onForceTrackerReannounce);

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
                  color={STATUS_CONFIG[torrent.state].color}
                  classNames={{ base: "h-5 px-1", content: "text-[9px] font-bold uppercase tracking-wider" }}
                >
                  {STATUS_CONFIG[torrent.state].label}
                </Chip>
              </div>
                <span className="text-[10px] uppercase tracking-widest text-foreground/40 font-bold">
                  Hash: {torrent.hash.substring(0, 8)}...
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
                        <div className="text-4xl font-mono font-medium tracking-tight">{(torrent.progress * 100).toFixed(1)}%</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] uppercase tracking-widest text-foreground/40 font-bold">Time Remaining</div>
                        <div className="font-mono text-xl">{torrent.eta > 0 ? formatTime(torrent.eta) : t("torrent_modal.eta_unknown")}</div>
                      </div>
                    </div>

                    <Progress
                      value={torrent.progress * 100}
                      size="lg"
                      classNames={{ track: "h-3 bg-content1/20", indicator: "bg-gradient-to-r from-success/50 to-success" }}
                    />

                    {/* Availability Bar (qBittorrent style) */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-[9px] uppercase tracking-wider font-bold text-foreground/40">
                        <span>Availability (Swarm)</span>
                        <span className="text-primary">
                          {torrent.peerSummary.connected + (torrent.peerSummary.seeds ?? 0)} Active
                        </span>
                      </div>
                      <div className="h-1.5 w-full bg-content1/20 rounded-full overflow-hidden flex">
                        <div className="h-full bg-primary w-full opacity-80" /> {/* Full bar implies 100% available */}
                      </div>
                    </div>
                  </GlassPanel>

                  <GlassPanel className="p-4 space-y-4 bg-content1/30 border border-content1/20">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] uppercase tracking-[0.3em] text-foreground/40">{t("torrent_modal.controls.title")}</span>
                        <p className="text-[11px] text-foreground/50">{t("torrent_modal.controls.description")}</p>
                      </div>
                      <Button
                        size="sm"
                        variant="flat"
                        color="primary"
                        className="h-8"
                        onPress={onForceTrackerReannounce}
                        isDisabled={!reannounceSupported}
                      >
                        {t("torrent_modal.controls.force_reannounce")}
                      </Button>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Switch
                        size="sm"
                        color="success"
                        isDisabled={!sequentialSupported}
                        isSelected={Boolean(torrent.sequentialDownload)}
                        onValueChange={(value) => onSequentialToggle?.(Boolean(value))}
                      >
                        <div className="flex flex-col items-start gap-1">
                          <span className="text-sm font-medium">{t("torrent_modal.controls.sequential")}</span>
                          <span className="text-[11px] text-foreground/50">{t("torrent_modal.controls.sequential_helper")}</span>
                          {!sequentialSupported && <span className="text-[10px] text-warning">{t("torrent_modal.controls.not_supported")}</span>}
                        </div>
                      </Switch>
                      <Switch
                        size="sm"
                        color="primary"
                        isDisabled={!superSeedingSupported}
                        isSelected={Boolean(torrent.superSeeding)}
                        onValueChange={(value) => onSuperSeedingToggle?.(Boolean(value))}
                      >
                        <div className="flex flex-col items-start gap-1">
                          <span className="text-sm font-medium">{t("torrent_modal.controls.super_seeding")}</span>
                          <span className="text-[11px] text-foreground/50">{t("torrent_modal.controls.super_seeding_helper")}</span>
                          {!superSeedingSupported && <span className="text-[10px] text-warning">{t("torrent_modal.controls.not_supported")}</span>}
                        </div>
                      </Switch>
                    </div>
                  </GlassPanel>

                  <div className="grid grid-cols-2 gap-4">
                    <GlassPanel className="p-4 flex flex-col gap-1">
                      <span className="text-[10px] uppercase tracking-widest text-foreground/40">Downloaded</span>
                      <span className="font-mono text-sm">{formatBytes(torrent.downloaded)}</span>
                    </GlassPanel>
                    <GlassPanel className="p-4 flex flex-col gap-1">
                      <span className="text-[10px] uppercase tracking-widest text-foreground/40">Uploaded</span>
                      <span className="font-mono text-sm text-primary">
                        {formatBytes(torrent.uploaded)} (Ratio: {torrent.ratio.toFixed(2)})
                      </span>
                    </GlassPanel>
                    <GlassPanel className="col-span-2 p-4 flex flex-col gap-2">
                      <span className="text-[10px] uppercase tracking-widest text-foreground/40">Save Path</span>
                      <code className="font-mono text-xs text-foreground/70 bg-content1/20 px-2 py-1 rounded">{downloadDir}</code>
                    </GlassPanel>
                    <GlassPanel className="col-span-2 p-4 flex flex-col gap-2">
                      <span className="text-[10px] uppercase tracking-widest text-foreground/40">Info Hash</span>
                      <div className="flex gap-2">
                        <code className="font-mono text-xs text-foreground/70 bg-content1/20 px-2 py-1 rounded flex-1">{torrent.hash}</code>
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
                <div className="h-full flex flex-col gap-4">
                  <GlassPanel className="flex-1 overflow-hidden p-4">
                    <PiecesMap
                      percent={torrent.progress}
                      pieceCount={torrent.pieceCount}
                      pieceSize={torrent.pieceSize}
                      pieceStates={torrent.pieceStates}
                    />
                  </GlassPanel>
                  <GlassPanel className="flex-1 overflow-hidden p-4">
                    <AvailabilityHeatmap
                      pieceAvailability={torrent.pieceAvailability}
                      label={t("torrent_modal.availability.label")}
                      legendRare={t("torrent_modal.availability.legend_rare")}
                      legendCommon={t("torrent_modal.availability.legend_common")}
                      emptyLabel={t("torrent_modal.availability.empty")}
                      formatTooltip={(piece, peers) =>
                        t("torrent_modal.availability.tooltip", { piece, peers })
                      }
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
                <div className="flex flex-col gap-4">
                  <PeerMap peers={peerEntries} />
                  <div className="flex flex-col gap-2">
                    {peerEntries.map((peer, i) => (
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
