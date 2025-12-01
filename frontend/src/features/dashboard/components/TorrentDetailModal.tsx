import { Button, Chip, Divider, Modal, ModalBody, ModalContent, Progress, Tab, Tabs, cn, Tooltip, Select, SelectItem } from "@heroui/react";
import { Activity, Copy, FileText, Grid, HardDrive, Info, Lock, Network, Server, X, Zap } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { GlassPanel } from "../../../shared/ui/layout/GlassPanel";
import { formatBytes, formatSpeed, formatTime } from "../../../shared/utils/format";
import type { Torrent } from "../types/torrent";

// --- TYPES ---
type DetailTab = "general" | "content" | "pieces" | "trackers" | "peers" | "speed";

interface TorrentDetailModalProps {
  torrent: Torrent | null;
  isOpen: boolean;
  onClose: () => void;
}

// --- SUB-COMPONENT: PIECES MAP (The "Defrag" Visualizer) ---
// Renders a grid representing download availability without 10,000 DOM nodes.
const PiecesMap = ({ percent }: { percent: number }) => {
  // Generate 240 blocks for a 20x12 grid look
  const blocks = useMemo(() => {
    const total = 240;
    const downloaded = Math.floor(total * percent);
    return Array.from({ length: total }, (_, i) => ({
      status: i < downloaded ? "done" : i === downloaded ? "active" : "missing",
      // Add random "scattering" for realism to show non-sequential downloads
      isScattered: i > downloaded && Math.random() > 0.95 && percent > 0 && percent < 1,
    }));
  }, [percent]);

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(12px,1fr))] gap-[2px] p-4 bg-content1/20 rounded-xl border border-content1/20">
      {blocks.map((b, i) => (
        <Tooltip key={i} content={`Piece #${i + 1400}: ${b.status === "done" ? "Verified" : "Pending"}`} closeDelay={0}>
          <div
            className={cn(
              "aspect-square rounded-[1px] transition-colors duration-500",
              b.status === "done"
                ? "bg-primary/80 shadow-[0_0_4px_rgba(0,255,128,0.3)]"
                : b.status === "active"
                ? "bg-warning animate-pulse"
              : b.isScattered
                ? "bg-primary/40" // Simulate random pieces downloaded ahead
                : "bg-content1/30"
            )}
          />
        </Tooltip>
      ))}
    </div>
  );
};

// --- SUB-COMPONENT: SPEED CHART (Custom SVG, Zero Bloat) ---
const SpeedChart = ({ downSpeed, upSpeed }: { downSpeed: number; upSpeed: number }) => {
  const [history, setHistory] = useState<{ down: number[]; up: number[] }>({ down: new Array(60).fill(0), up: new Array(60).fill(0) });
  const [timeRange, setTimeRange] = useState("1m");

  // Simulation Tick
  useEffect(() => {
    const interval = setInterval(() => {
      setHistory((prev) => {
        // Add jitter for realism
        const newDown = downSpeed * (0.9 + Math.random() * 0.2);
        const newUp = upSpeed * (0.9 + Math.random() * 0.2);
        return {
          down: [...prev.down.slice(1), newDown],
          up: [...prev.up.slice(1), newUp],
        };
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [downSpeed, upSpeed]);

  // Draw Path
  const getPath = (data: number[], color: string, maxY: number) => {
    const width = 100; // viewBox units
    const height = 50;
    const points = data.map((val, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - (val / (maxY || 1)) * height; // Invert Y
      return `${x},${y}`;
    });

    return (
      <>
        {/* Fill Gradient */}
        <path d={`M0,${height} ${points.map((p) => `L${p}`).join(" ")} L${width},${height} Z`} fill={`url(#grad-${color})`} className="opacity-20" />
        {/* Line */}
        <path
          d={`M${points[0]} ${points.map((p) => `L${p}`).join(" ")}`}
          fill="none"
          stroke={`var(--color-${color})`}
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
        />
      </>
    );
  };

  const maxVal = Math.max(...history.down, ...history.up, 1024 * 1024); // Min 1MB scale

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="flex justify-between items-center z-10">
        <div className="flex gap-4">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-success"></span>
            <span className="text-xs font-mono text-foreground/70">DL: {formatSpeed(downSpeed)}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-primary"></span>
            <span className="text-xs font-mono text-foreground/70">UL: {formatSpeed(upSpeed)}</span>
          </div>
        </div>
        <select
          className="bg-content1/30 border border-content1/20 rounded px-2 py-1 text-[10px] text-foreground/70 outline-none"
          value={timeRange}
          onChange={(e) => setTimeRange(e.target.value)}
        >
          <option value="1m">1 Minute</option>
          <option value="5m">5 Minutes</option>
          <option value="30m">30 Minutes</option>
        </select>
      </div>

      <div className="flex-1 w-full relative bg-content1/20 rounded-xl border border-content1/20 overflow-hidden">
        {/* CSS Grids for Background */}
        <div className="absolute inset-0 grid grid-cols-6 grid-rows-4 opacity-10 pointer-events-none">
          {[...Array(24)].map((_, i) => (
            <div key={i} className="border-r border-b border-content1/30" />
          ))}
        </div>

        <svg viewBox="0 0 100 50" preserveAspectRatio="none" className="w-full h-full absolute inset-0">
          <defs>
            <linearGradient id="grad-success" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#22c55e" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#22c55e" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="grad-primary" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#06b6d4" stopOpacity="0" />
            </linearGradient>
            <style>{`
              :root { --color-success: #22c55e; --color-primary: #06b6d4; }
            `}</style>
          </defs>
          {getPath(history.down, "success", maxVal)}
          {getPath(history.up, "primary", maxVal)}
        </svg>

        {/* Max Label */}
        <div className="absolute top-2 left-2 text-[9px] font-mono text-foreground/40 bg-content1/40 px-1 rounded">
          Peak: {formatSpeed(maxVal)}
        </div>
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

export function TorrentDetailModal({ torrent, isOpen, onClose }: TorrentDetailModalProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<DetailTab>("general");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen) setActiveTab("general");
  }, [isOpen]);

  const handleCopyHash = () => {
    if (torrent) {
      navigator.clipboard.writeText(torrent.hashString);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Mock Data Generators
  const trackers = useMemo(
    () =>
      torrent
        ? [
            { name: "udp://tracker.opentrackr.org:1337", tier: 0, status: "active", peers: 45 },
            { name: "udp://tracker.openbittorrent.com:80", tier: 1, status: "active", peers: 12 },
            { name: "udp://tracker.cybercore.net:69", tier: 2, status: "error", peers: 0 },
          ]
        : [],
    [torrent]
  );

  const peers = useMemo(
    () =>
      torrent
        ? [
            {
              ip: "192.168.1.105",
              client: "qBittorrent 4.6.0",
              country: "NL",
              progress: 0.92,
              down: torrent.rateUpload * 1.2,
              up: torrent.rateDownload * 0.4,
              flags: "D E",
            },
            {
              ip: "185.24.3.12",
              client: "Transmission 4.0.0",
              country: "US",
              progress: 0.74,
              down: torrent.rateDownload * 0.6,
              up: torrent.rateUpload * 0.3,
              flags: "D",
            },
            {
              ip: "104.248.105.2",
              client: "uTorrent 3.5.5",
              country: "CA",
              progress: 0.33,
              down: torrent.rateDownload * 0.3,
              up: torrent.rateUpload * 0.2,
              flags: "uTP",
            },
          ]
        : [],
    [torrent]
  );

  const files = useMemo(
    () =>
      torrent
        ? Array.from({ length: 8 }, (_, i) => ({
            name: `${torrent.name.split(".")[0]}_part_${i + 1}.dat`,
            size: torrent.totalSize / 8,
            priority: i === 2 ? "High" : "Normal",
            progress: Math.min(1, Math.max(0, torrent.percentDone + (Math.random() * 0.2 - 0.1))),
          }))
        : [],
    [torrent]
  );

  if (!torrent) return null;

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
            <Button isIconOnly size="sm" variant="light" onPress={onClose} className="text-foreground/40 hover:text-foreground">
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
                        <div className="font-mono text-xl">{torrent.eta > 0 ? formatTime(torrent.eta) : "∞"}</div>
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
                        <span className="text-primary">14.23x</span>
                      </div>
                      <div className="h-1.5 w-full bg-content1/20 rounded-full overflow-hidden flex">
                        <div className="h-full bg-primary w-full opacity-80" /> {/* Full bar implies 100% available */}
                      </div>
                    </div>
                  </GlassPanel>

                  <div className="grid grid-cols-2 gap-4">
                    <GlassPanel className="p-4 flex flex-col gap-1">
                      <span className="text-[10px] uppercase tracking-widest text-foreground/40">Downloaded</span>
                      <span className="font-mono text-sm">{formatBytes(torrent.totalSize * torrent.percentDone)}</span>
                    </GlassPanel>
                    <GlassPanel className="p-4 flex flex-col gap-1">
                      <span className="text-[10px] uppercase tracking-widest text-foreground/40">Uploaded</span>
                      <span className="font-mono text-sm text-primary">{formatBytes(torrent.totalSize * 0.4)} (Ratio: 0.4)</span>
                    </GlassPanel>
                    <GlassPanel className="col-span-2 p-4 flex flex-col gap-2">
                      <span className="text-[10px] uppercase tracking-widest text-foreground/40">Save Path</span>
                      <code className="font-mono text-xs text-foreground/70 bg-content1/20 px-2 py-1 rounded">C:/Downloads/Linux_ISOs/</code>
                    </GlassPanel>
                    <GlassPanel className="col-span-2 p-4 flex flex-col gap-2">
                      <span className="text-[10px] uppercase tracking-widest text-foreground/40">Info Hash</span>
                      <div className="flex gap-2">
                        <code className="font-mono text-xs text-foreground/70 bg-content1/20 px-2 py-1 rounded flex-1">{torrent.hashString}</code>
                        <Button isIconOnly size="sm" variant="flat" onPress={handleCopyHash}>
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
                  <div className="flex justify-between items-center px-1">
                    <div className="text-xs text-foreground/50">
                      Pieces: <span className="text-foreground font-mono">1,492</span> • Size:{" "}
                      <span className="text-foreground font-mono">2.0 MiB</span>
                    </div>
                    <div className="flex gap-3 text-[10px] uppercase font-bold tracking-wider">
                      <span className="flex items-center gap-1">
                        <div className="w-2 h-2 bg-primary/80" /> Downloaded
                      </span>
                      <span className="flex items-center gap-1">
                        <div className="w-2 h-2 bg-warning" /> Downloading
                      </span>
                      <span className="flex items-center gap-1">
                        <div className="w-2 h-2 bg-content1/20" /> Missing
                      </span>
                    </div>
                  </div>
                  <GlassPanel className="flex-1 overflow-y-auto">
                    <PiecesMap percent={torrent.percentDone} />
                  </GlassPanel>
                </div>
              )}

              {/* --- TAB: SPEED (New) --- */}
              {activeTab === "speed" && (
                <div className="h-full flex flex-col">
                  <GlassPanel className="flex-1 p-6">
                    <SpeedChart downSpeed={torrent.rateDownload} upSpeed={torrent.rateUpload} />
                  </GlassPanel>
                </div>
              )}

              {/* --- TAB: CONTENT --- */}
              {activeTab === "content" && (
                <div className="flex flex-col gap-2">
                  {files.map((file, i) => (
                    <GlassPanel key={i} className="p-3 flex items-center gap-4 hover:bg-content1/50 transition-colors group">
                      <div className="w-8 h-8 rounded-lg bg-content1 flex items-center justify-center text-foreground/50 group-hover:text-foreground">
                        <FileText size={16} />
                      </div>
                      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-medium truncate pr-4">{file.name}</span>
                          <span className="text-[10px] font-mono text-foreground/50">{formatBytes(file.size)}</span>
                        </div>
                        <Progress size="sm" value={file.progress * 100} classNames={{ track: "h-0.5 bg-content1/10", indicator: "bg-foreground/50" }} />
                      </div>
                      <Chip size="sm" variant="flat" classNames={{ base: "h-5 bg-content1/20", content: "text-[9px]" }}>
                        {file.priority}
                      </Chip>
                    </GlassPanel>
                  ))}
                </div>
              )}

              {/* --- TAB: PEERS --- */}
              {activeTab === "peers" && (
                <div className="flex flex-col gap-2">
                  {peers.map((peer, i) => (
                    <GlassPanel key={i} className="p-3 grid grid-cols-12 items-center gap-4 hover:bg-content1/50 transition-colors">
                      <div className="col-span-4 flex flex-col">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono">{peer.ip}</span>
                          <Chip size="sm" variant="flat" classNames={{ base: "h-4 px-1", content: "text-[9px] font-bold" }}>
                            {peer.country}
                          </Chip>
                        </div>
                        <span className="text-[10px] text-foreground/40 truncate">{peer.client}</span>
                      </div>
                      <div className="col-span-2 text-[10px] font-mono opacity-50">{peer.flags}</div>
                      <div className="col-span-3 flex flex-col gap-1">
                        <Progress size="sm" value={peer.progress * 100} classNames={{ track: "h-1 bg-content1/10", indicator: "bg-primary" }} />
                      </div>
                      <div className="col-span-3 flex flex-col items-end font-mono text-[10px]">
                        <span className="text-success">▼ {formatSpeed(peer.down)}</span>
                        <span className="text-primary">▲ {formatSpeed(peer.up)}</span>
                      </div>
                    </GlassPanel>
                  ))}
                </div>
              )}

              {/* --- TAB: TRACKERS --- */}
              {activeTab === "trackers" && (
                <div className="flex flex-col gap-2">
                  {trackers.map((tr, i) => (
                    <GlassPanel key={i} className="p-3 flex items-center justify-between hover:bg-content1/50 transition-colors">
                      <div className="flex items-center gap-3">
                        <div
                          className={cn(
                            "w-1.5 h-1.5 rounded-full",
                            tr.status === "active" ? "bg-success shadow-[0_0_8px_rgba(34,197,94,0.4)]" : "bg-danger"
                          )}
                        />
                        <div className="flex flex-col">
                          <span className="text-xs font-mono text-foreground/80">{tr.name}</span>
                          <span className="text-[10px] text-foreground/40">
                            Tier {tr.tier} • {tr.status}
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-foreground/30">Peers</span>
                        <div className="font-mono text-xs">{tr.peers}</div>
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
