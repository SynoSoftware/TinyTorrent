import { Button, Chip, Divider, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, Progress, cn } from "@heroui/react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { GlassPanel } from "../../../shared/ui/layout/GlassPanel";
import { formatBytes, formatSpeed, formatTime } from "../../../shared/utils/format";
import type { Torrent } from "../types/torrent";

type DetailTab = "general" | "trackers" | "peers" | "https" | "content" | "speed";

const TAB_ORDER: DetailTab[] = ["general", "trackers", "peers", "https", "content", "speed"];

type TrackerRow = {
  name: string;
  tier: number;
  statusKey: "status_online" | "status_partial";
  lastAnnounce: string;
};

type PeerRow = {
  ip: string;
  country: string;
  progress: number;
  download: number;
  upload: number;
};

type FileRow = {
  name: string;
  size: number;
  progress: number;
};

interface TorrentDetailModalProps {
  torrent: Torrent | null;
  isOpen: boolean;
  onClose: () => void;
}

const STATUS_CHIP_VARIANTS = {
  downloading: { color: "success", labelKey: "status_downloading" },
  seeding: { color: "primary", labelKey: "status_seeding" },
  paused: { color: "warning", labelKey: "status_paused" },
  checking: { color: "warning", labelKey: "status_checking" },
  error: { color: "danger", labelKey: "status_error" },
} satisfies Record<Torrent["status"], { color: "success" | "primary" | "warning" | "danger"; labelKey: string }>;

export function TorrentDetailModal({ torrent, isOpen, onClose }: TorrentDetailModalProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<DetailTab>("general");

  useEffect(() => {
    if (torrent) {
      setActiveTab("general");
    }
  }, [torrent]);

  const tabItems = useMemo(
    () =>
      TAB_ORDER.map((tab) => ({
        key: tab,
        label: t(`torrent_modal.tabs.${tab}`),
      })),
    [t]
  );

  const trackers = useMemo<TrackerRow[]>(
    () =>
      torrent
        ? ["udp://tracker.openbittorrent.com:80", "https://tracker.fasttrack.info", "udp://tracker.cybercore.net:69"].map(
            (name, index) => ({
              name,
              tier: index,
              statusKey: index === 1 ? "status_partial" : "status_online",
              lastAnnounce: `${(index + 1) * 3}m ago`,
            })
          )
        : [],
    [torrent]
  );

  const peers = useMemo<PeerRow[]>(
    () =>
      torrent
        ? [
            {
              ip: `192.168.1.${torrent.id * 3}`,
              country: "NL",
              progress: 0.92,
              download: torrent.rateUpload * 1.2,
              upload: torrent.rateDownload * 0.4,
            },
            {
              ip: `185.24.3.${torrent.id}`,
              country: "US",
              progress: 0.74,
              download: torrent.rateDownload * 0.6,
              upload: torrent.rateUpload * 0.3,
            },
            {
              ip: `104.248.105.${torrent.id + 5}`,
              country: "CA",
              progress: 0.33,
              download: torrent.rateDownload * 0.3,
              upload: torrent.rateUpload * 0.2,
            },
          ]
        : [],
    [torrent]
  );

  const fileList = useMemo<FileRow[]>(
    () =>
      torrent
        ? Array.from({ length: 3 }, (_, index) => ({
            name: `${torrent.name.replace(/\.[^/.]+$/, "")} - Part ${index + 1}.dat`,
            size: Math.round(torrent.totalSize / 3),
            progress: Math.max(0.1, Math.min(0.95, torrent.percentDone - 0.1 + index * 0.05)),
          }))
        : [],
    [torrent]
  );

  const httpsSource = useMemo(() => {
    if (!torrent) return null;
    return {
      url: `https://mirror.tinytorrent.dev/content/${torrent.hashString}`,
      lastChecked: "Just now",
      certificate: "TLS 1.3 · VALID",
    };
  }, [torrent]);

  const renderTabContent = () => {
    if (!torrent) {
      return null;
    }

    switch (activeTab) {
      case "general":
        return (
          <GlassPanel className="p-4 space-y-4">
            <div className="grid grid-cols-2 gap-3 text-[11px] uppercase tracking-[0.4em] text-foreground/50">
              <div>
                <p className="text-foreground/40">{t("torrent_modal.general.hash")}</p>
                <p className="font-mono text-[12px] text-foreground">{torrent.hashString}</p>
              </div>
              <div>
                <p className="text-foreground/40">{t("torrent_modal.general.size")}</p>
                <p className="font-mono text-[12px] text-foreground">{formatBytes(torrent.totalSize)}</p>
              </div>
              <div>
                <p className="text-foreground/40">{t("torrent_modal.general.progress")}</p>
                <p className="font-mono text-[12px] text-foreground">{(torrent.percentDone * 100).toFixed(1)}%</p>
              </div>
              <div>
                <p className="text-foreground/40">{t("torrent_modal.general.peers")}</p>
                <p className="font-mono text-[12px] text-foreground">
                  {torrent.peersConnected} / {torrent.seedsConnected}
                </p>
              </div>
              <div>
                <p className="text-foreground/40">{t("torrent_modal.general.eta")}</p>
                <p className="font-mono text-[12px] text-foreground">
                  {torrent.eta > 0 ? formatTime(torrent.eta) : t("torrent_modal.general.eta_unknown")}
                </p>
              </div>
              <div>
                <p className="text-foreground/40">{t("torrent_modal.general.status")}</p>
                <Chip
                  size="sm"
                  variant="flat"
                  color={STATUS_CHIP_VARIANTS[torrent.status].color}
                  classNames={{ base: "border border-current/0", content: "text-[11px] font-semibold" }}
                >
                  {t(`torrent_modal.statuses.${STATUS_CHIP_VARIANTS[torrent.status].labelKey}`)}
                </Chip>
              </div>
            </div>
            <Progress
              value={torrent.percentDone * 100}
              classNames={{
                track: "h-1 rounded-full bg-content1/20",
                indicator: cn(
                  "rounded-full",
                  torrent.status === "seeding"
                    ? "bg-gradient-to-r from-primary/50 to-primary"
                    : torrent.status === "downloading"
                    ? "bg-gradient-to-r from-success/60 to-success"
                    : "bg-gradient-to-r from-warning/50 to-warning"
                ),
              }}
            />
            <div className="text-[11px] text-foreground/60 font-mono flex items-center justify-between">
              <span>{t("torrent_modal.general.download")}</span>
              <span className="text-foreground">{formatSpeed(torrent.rateDownload)}</span>
            </div>
            <div className="text-[11px] text-foreground/60 font-mono flex items-center justify-between">
              <span>{t("torrent_modal.general.upload")}</span>
              <span className="text-foreground">{formatSpeed(torrent.rateUpload)}</span>
            </div>
          </GlassPanel>
        );
      case "trackers":
        return (
          <GlassPanel className="p-3 divide-y divide-content1/15">
            {trackers.map((tracker) => (
              <div key={tracker.name} className="py-3 flex flex-col gap-2">
                <div className="flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.35em] text-foreground/50">
                  <span>{t("torrent_modal.trackers.tier")}: {tracker.tier + 1}</span>
                  <Chip
                    variant="flat"
                    size="sm"
                    color={tracker.statusKey === "status_partial" ? "warning" : "success"}
                    classNames={{ content: "text-[10px] uppercase tracking-[0.3em]" }}
                  >
                    {t(`torrent_modal.trackers.${tracker.statusKey}`)}
                  </Chip>
                </div>
                <p className="text-sm text-foreground">{tracker.name}</p>
                <p className="text-[11px] text-foreground/50">{t("torrent_modal.trackers.last_announce")}: {tracker.lastAnnounce}</p>
              </div>
            ))}
          </GlassPanel>
        );
      case "peers":
        return (
          <GlassPanel className="p-3 divide-y divide-content1/15">
            {peers.map((peer) => (
              <div key={peer.ip} className="py-3 flex flex-col gap-2">
                <div className="flex justify-between items-center text-[11px] text-foreground/50">
                  <span>{t("torrent_modal.peers.ip")}: {peer.ip}</span>
                  <span className="font-mono text-[12px] text-foreground">{peer.country}</span>
                </div>
                <div className="flex items-center justify-between text-[12px] font-mono text-foreground">
                  <span>{t("torrent_modal.peers.progress")}: {(peer.progress * 100).toFixed(0)}%</span>
                  <span>
                    {t("torrent_modal.peers.download")}: {formatSpeed(peer.download)}
                  </span>
                  <span>
                    {t("torrent_modal.peers.upload")}: {formatSpeed(peer.upload)}
                  </span>
                </div>
              </div>
            ))}
          </GlassPanel>
        );
      case "https":
        return (
          httpsSource && (
            <GlassPanel className="p-4 space-y-3">
              <div className="text-[11px] uppercase tracking-[0.4em] text-foreground/50">{t("torrent_modal.https.label")}</div>
              <p className="font-mono text-sm text-primary break-all">{httpsSource.url}</p>
              <Divider className="border-content1/20" />
              <div className="flex justify-between text-[11px] text-foreground/50">
                <span>{t("torrent_modal.https.certificate")}</span>
                <span className="text-foreground">{httpsSource.certificate}</span>
              </div>
              <div className="flex justify-between text-[11px] text-foreground/50">
                <span>{t("torrent_modal.https.last_checked")}</span>
                <span className="text-foreground">{httpsSource.lastChecked}</span>
              </div>
            </GlassPanel>
          )
        );
      case "content":
        return (
          <GlassPanel className="p-3 space-y-3">
            {fileList.map((file) => (
              <div key={file.name} className="space-y-2">
                <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.35em] text-foreground/50">
                  <span>{file.name}</span>
                  <span className="font-mono text-[12px] text-foreground">{formatBytes(file.size)}</span>
                </div>
                <Progress
                  value={file.progress * 100}
                  classNames={{
                    track: "h-1 rounded-full bg-content1/20",
                    indicator: "h-1 rounded-full bg-gradient-to-r from-primary/40 to-primary/80",
                  }}
                />
              </div>
            ))}
          </GlassPanel>
        );
      case "speed":
        return (
          <GlassPanel className="p-4 grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <p className="text-[11px] uppercase tracking-[0.35em] text-foreground/50">{t("torrent_modal.speed.download")}</p>
              <p className="text-2xl font-semibold text-success font-mono">{formatSpeed(torrent.rateDownload)}</p>
              <div className="h-1 rounded-full bg-content1/20">
                <div className="h-1 rounded-full bg-gradient-to-r from-success to-success/30" style={{ width: `${Math.min(100, (torrent.rateDownload / (torrent.rateDownload + 1)) * 100)}%` }} />
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-[11px] uppercase tracking-[0.35em] text-foreground/50">{t("torrent_modal.speed.upload")}</p>
              <p className="text-2xl font-semibold text-primary font-mono">{formatSpeed(torrent.rateUpload)}</p>
              <div className="h-1 rounded-full bg-content1/20">
                <div className="h-1 rounded-full bg-gradient-to-r from-primary to-primary/30" style={{ width: `${Math.min(100, (torrent.rateUpload / (torrent.rateUpload + 1)) * 100)}%` }} />
              </div>
            </div>
            <div className="md:col-span-2 space-y-1">
              <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.35em] text-foreground/50">
                <span>{t("torrent_modal.speed.average")}</span>
                <span className="text-foreground font-mono">{formatSpeed((torrent.rateDownload + torrent.rateUpload) / 2)}</span>
              </div>
              <Chip variant="flat" size="sm" classNames={{ content: "text-[11px] uppercase tracking-[0.3em]" }}>
                {t("torrent_modal.speed.stable")}
              </Chip>
            </div>
          </GlassPanel>
        );
      default:
        return null;
    }
  };

  if (!torrent) {
    return null;
  }

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      backdrop="transparent"
      placement="center"
      className="z-50"
    >
      <ModalContent className="max-w-[960px] w-[min(95vw,960px)] bg-background/70 backdrop-blur-[32px] border border-content1/30 rounded-[32px] shadow-[0_40px_120px_rgba(0,0,0,0.65)] overflow-hidden">
        <ModalHeader className="px-6 pt-4 pb-2 bg-background/40 border-b border-content1/15 backdrop-blur-xl">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] uppercase tracking-[0.5em] text-foreground/50">{t("torrent_modal.title")}</p>
              <h3 className="text-2xl font-semibold text-foreground truncate">{torrent.name}</h3>
              <p className="text-xs font-mono text-foreground/40">{t("torrent_modal.general.hash")}: {torrent.hashString}</p>
            </div>
            <Chip
              size="sm"
              variant="flat"
              color={STATUS_CHIP_VARIANTS[torrent.status].color}
              classNames={{ base: "bg-content1/10 border border-content1/20", content: "text-[11px] font-semibold" }}
            >
              {t(`torrent_modal.statuses.${STATUS_CHIP_VARIANTS[torrent.status].labelKey}`)}
            </Chip>
          </div>
        </ModalHeader>
        <ModalBody className="px-6 py-4 space-y-4">
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Torrent tabs">
            {tabItems.map((tab) => {
              const isActive = tab.key === activeTab;
              return (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  className={cn(
                    "px-3 py-1 rounded-full text-[11px] font-semibold tracking-[0.3em] transition",
                    isActive
                      ? "bg-primary/80 text-background shadow-[0_6px_20px_rgba(15,23,42,0.5)]"
                      : "bg-content1/10 text-foreground/60 hover:text-foreground hover:bg-content1/20"
                  )}
                  onClick={() => setActiveTab(tab.key)}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
          {renderTabContent()}
        </ModalBody>
        <ModalFooter className="px-6 pb-4 pt-0">
          <div className="w-full flex justify-end gap-3">
            <Button size="sm" variant="light" color="primary" onPress={onClose}>
              {t("torrent_modal.actions.close")}
            </Button>
          </div>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
