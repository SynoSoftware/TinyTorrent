import {
  Button,
  Chip,
  Divider,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  Select,
  SelectItem,
  Slider,
  Switch,
  Tab,
  Tabs,
  TimeInput,
  Tooltip,
  cn,
} from "@heroui/react";
import { Clock, Download, FolderOpen, Globe, HardDrive, Lock, Network, Save, Shield, Upload, Wifi, X, Zap } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { GlassPanel } from "../../../shared/ui/layout/GlassPanel";

// --- TYPES (Mirroring Transmission RPC) ---
type SettingsTab = "network" | "speed" | "peers" | "storage" | "privacy";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<SettingsTab>("speed");
  const [isSaving, setIsSaving] = useState(false);

  // --- MOCK STATE (Replace with useTransmissionSettings hook later) ---
  const [config, setConfig] = useState({
    // Network
    peer_port: 51413,
    peer_port_random_on_start: false,
    port_forwarding_enabled: true,
    encryption: "preferred", // required, preferred, tolerated

    // Speed
    speed_limit_down: 15000, // KB/s
    speed_limit_down_enabled: true,
    speed_limit_up: 500,
    speed_limit_up_enabled: false,

    // Turtle Mode (Alt Limits)
    alt_speed_down: 1000,
    alt_speed_up: 50,
    alt_speed_time_enabled: false,
    alt_speed_time_begin: 540, // Minutes from midnight
    alt_speed_time_end: 1020,

    // Peers
    peer_limit_global: 200,
    peer_limit_per_torrent: 50,
    lpd_enabled: true, // Local Peer Discovery
    dht_enabled: true,
    pex_enabled: true,

    // Storage
    download_dir: "/Downloads/Torrents",
    incomplete_dir_enabled: true,
    incomplete_dir: "/Downloads/Incomplete",
    rename_partial_files: true,
    start_added_torrents: true,

    // Seeding
    seedRatioLimit: 2.0,
    seedRatioLimited: true,
    idleSeedingLimit: 30,
    idleSeedingLimited: false,

    // Blocklist
    blocklist_url: "http://list.iblocklist.com/?list=bt_level1&fileformat=p2p&archiveformat=gz",
    blocklist_enabled: true,
  });

  const handleSave = () => {
    setIsSaving(true);
    // Simulate RPC call
    setTimeout(() => {
      setIsSaving(false);
      onClose();
    }, 800);
  };

  // --- RENDERERS ---

  const renderContent = () => {
    return (
      <motion.div
        key={activeTab}
        initial={{ opacity: 0, x: 10 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -10 }}
        transition={{ duration: 0.15 }}
        className="h-full overflow-y-auto pr-2 scrollbar-hide space-y-6 p-1"
      >
        {activeTab === "speed" && (
          <>
            <GlassPanel className="p-6 space-y-6">
              <div className="flex items-center gap-2 mb-2">
                <Zap size={18} className="text-primary" />
                <h3 className="text-sm font-bold uppercase tracking-wider text-foreground/70">Standard Limits</h3>
              </div>

              {/* Download Slider */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <Switch
                    size="sm"
                    isSelected={config.speed_limit_down_enabled}
                    onValueChange={(v) => setConfig({ ...config, speed_limit_down_enabled: v })}
                  >
                    <span className="text-xs font-medium text-foreground/80">Download Limit</span>
                  </Switch>
                  <div className="flex items-center gap-2 bg-content1/20 px-2 py-1 rounded text-xs font-mono text-success">
                    <Download size={12} />
                    {config.speed_limit_down} KB/s
                  </div>
                </div>
                <Slider
                  size="sm"
                  step={100}
                  maxValue={50000}
                  minValue={0}
                  value={config.speed_limit_down}
                  onChange={(v) => setConfig({ ...config, speed_limit_down: v as number })}
                  isDisabled={!config.speed_limit_down_enabled}
                  color="success"
                  className="opacity-90"
                />
              </div>

              <Divider className="bg-content1/20" />

              {/* Upload Slider */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <Switch
                    size="sm"
                    isSelected={config.speed_limit_up_enabled}
                    onValueChange={(v) => setConfig({ ...config, speed_limit_up_enabled: v })}
                  >
                    <span className="text-xs font-medium text-foreground/80">Upload Limit</span>
                  </Switch>
                  <div className="flex items-center gap-2 bg-content1/20 px-2 py-1 rounded text-xs font-mono text-primary">
                    <Upload size={12} />
                    {config.speed_limit_up} KB/s
                  </div>
                </div>
                <Slider
                  size="sm"
                  step={10}
                  maxValue={5000}
                  minValue={0}
                  value={config.speed_limit_up}
                  onChange={(v) => setConfig({ ...config, speed_limit_up: v as number })}
                  isDisabled={!config.speed_limit_up_enabled}
                  color="primary"
                  className="opacity-90"
                />
              </div>
            </GlassPanel>

            <GlassPanel className="p-6 space-y-5 border-warning/20 bg-warning/5">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Clock size={18} className="text-warning" />
                  <h3 className="text-sm font-bold uppercase tracking-wider text-foreground/70">Turtle Mode (Alt Limits)</h3>
                </div>
                <Switch
                  size="sm"
                  color="warning"
                  isSelected={config.alt_speed_time_enabled}
                  onValueChange={(v) => setConfig({ ...config, alt_speed_time_enabled: v })}
                >
                  <span className="text-[10px] uppercase font-bold text-warning">Scheduled</span>
                </Switch>
              </div>

            <div className="grid grid-cols-2 gap-4">
              <Input
                type="number"
                label="Download (KB/s)"
                labelPlacement="outside"
                placeholder="1000"
                value={config.alt_speed_down.toString()}
                onChange={(e) => setConfig({ ...config, alt_speed_down: Number(e.target.value) })}
                variant="bordered"
                startContent={<Download size={14} className="text-default-400" />}
              />
              <Input
                type="number"
                label="Upload (KB/s)"
                labelPlacement="outside"
                placeholder="50"
                value={config.alt_speed_up.toString()}
                onChange={(e) => setConfig({ ...config, alt_speed_up: Number(e.target.value) })}
                variant="bordered"
                startContent={<Upload size={14} className="text-default-400" />}
              />
            </div>

              {config.alt_speed_time_enabled && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} className="flex gap-4 items-end pt-2">
                  <div className="flex-1">
                    <label className="text-xs text-foreground/50 mb-1 block">From</label>
                    <div className="h-10 bg-content1/20 rounded border border-content1/20 flex items-center px-3 text-sm">08:00</div>
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-foreground/50 mb-1 block">To</label>
                    <div className="h-10 bg-content1/20 rounded border border-content1/20 flex items-center px-3 text-sm">17:00</div>
                  </div>
                  <div className="pb-3 text-xs text-foreground/40">Daily</div>
                </motion.div>
              )}
            </GlassPanel>
          </>
        )}

        {activeTab === "network" && (
          <div className="space-y-4">
            <GlassPanel className="p-6 space-y-6">
              <div className="flex items-center gap-2 mb-2">
                <Network size={18} className="text-primary" />
                <h3 className="text-sm font-bold uppercase tracking-wider text-foreground/70">Connectivity</h3>
              </div>

              <div className="flex gap-4 items-end">
                <Input
                  label="Incoming Port"
                  labelPlacement="outside"
                  placeholder="51413"
                  value={config.peer_port.toString()}
                  variant="bordered"
                  className="flex-1"
                />
                <Button variant="flat" color="primary">
                  Test Port
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex justify-between items-center p-3 rounded-lg bg-content1/20 border border-content1/20">
                  <span className="text-sm">Randomize on Start</span>
                  <Switch
                    size="sm"
                    isSelected={config.peer_port_random_on_start}
                    onValueChange={(v) => setConfig({ ...config, peer_port_random_on_start: v })}
                  />
                </div>
                <div className="flex justify-between items-center p-3 rounded-lg bg-content1/20 border border-content1/20">
                  <span className="text-sm">Port Forwarding (UPnP)</span>
                  <Switch
                    size="sm"
                    isSelected={config.port_forwarding_enabled}
                    onValueChange={(v) => setConfig({ ...config, port_forwarding_enabled: v })}
                  />
                </div>
              </div>
            </GlassPanel>

            <GlassPanel className="p-6 space-y-6">
              <div className="flex items-center gap-2 mb-2">
                <Lock size={18} className="text-primary" />
                <h3 className="text-sm font-bold uppercase tracking-wider text-foreground/70">Encryption & Privacy</h3>
              </div>

              <Select label="Encryption Mode" labelPlacement="outside" selectedKeys={[config.encryption]} variant="bordered">
                <SelectItem key="required">Require Encryption (Stealth)</SelectItem>
                <SelectItem key="preferred">Prefer Encryption (Standard)</SelectItem>
                <SelectItem key="tolerated">Allow Unencrypted (Legacy)</SelectItem>
              </Select>

              <div className="flex flex-col gap-2">
                <div className="flex justify-between items-center py-2">
                  <span className="text-sm text-foreground/80">DHT (Distributed Hash Table)</span>
                  <Switch size="sm" isSelected={config.dht_enabled} onValueChange={(v) => setConfig({ ...config, dht_enabled: v })} />
                </div>
                <Divider className="bg-content1/20" />
                <div className="flex justify-between items-center py-2">
                  <span className="text-sm text-foreground/80">LPD (Local Peer Discovery)</span>
                  <Switch size="sm" isSelected={config.lpd_enabled} onValueChange={(v) => setConfig({ ...config, lpd_enabled: v })} />
                </div>
                <Divider className="bg-content1/20" />
                <div className="flex justify-between items-center py-2">
                  <span className="text-sm text-foreground/80">PEX (Peer Exchange)</span>
                  <Switch size="sm" isSelected={config.pex_enabled} onValueChange={(v) => setConfig({ ...config, pex_enabled: v })} />
                </div>
              </div>
            </GlassPanel>
          </div>
        )}

        {activeTab === "peers" && (
          <GlassPanel className="p-6 space-y-6">
            <div className="flex items-center gap-2 mb-2">
              <Globe size={18} className="text-primary" />
              <h3 className="text-sm font-bold uppercase tracking-wider text-foreground/70">Connections</h3>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <Input
                type="number"
                label="Global Peer Limit"
                labelPlacement="outside"
                value={config.peer_limit_global.toString()}
                variant="bordered"
                description="Total connections across all torrents"
              />
              <Input
                type="number"
                label="Peers Per Torrent"
                labelPlacement="outside"
                value={config.peer_limit_per_torrent.toString()}
                variant="bordered"
              />
            </div>

              <Divider className="bg-content1/20 my-4" />

            <h3 className="text-sm font-bold uppercase tracking-wider text-foreground/70 mb-4">Blocklist</h3>
            <div className="space-y-4">
              <Switch isSelected={config.blocklist_enabled} onValueChange={(v) => setConfig({ ...config, blocklist_enabled: v })}>
                Enable Blocklist
              </Switch>
              <div className="flex gap-2">
                <Input
                  label="Blocklist URL"
                  labelPlacement="outside"
                  value={config.blocklist_url}
                  variant="bordered"
                  className="flex-1"
                  isDisabled={!config.blocklist_enabled}
                />
                <Button className="mt-6" variant="flat">
                  Update
                </Button>
              </div>
              <p className="text-xs text-foreground/40">Contains 142,059 ranges.</p>
            </div>
          </GlassPanel>
        )}

        {activeTab === "storage" && (
          <GlassPanel className="p-6 space-y-6">
            <div className="flex items-center gap-2 mb-2">
              <HardDrive size={18} className="text-primary" />
              <h3 className="text-sm font-bold uppercase tracking-wider text-foreground/70">File System</h3>
            </div>

            <Input
              label="Default Download Folder"
              labelPlacement="outside"
              value={config.download_dir}
              variant="bordered"
              endContent={<FolderOpen size={16} className="text-foreground/50" />}
            />

            <div className="space-y-3 pt-2">
              <Switch size="sm" isSelected={config.incomplete_dir_enabled} onValueChange={(v) => setConfig({ ...config, incomplete_dir_enabled: v })}>
                Use Incomplete Folder
              </Switch>
              <Input value={config.incomplete_dir} variant="bordered" isDisabled={!config.incomplete_dir_enabled} className="opacity-80" />
            </div>

            <div className="grid grid-cols-2 gap-4 pt-2">
              <div className="p-3 rounded-lg border border-content1/20 bg-content1/20 flex items-center justify-between">
                <span className="text-sm">Rename partial files (.part)</span>
                <Switch size="sm" isSelected={config.rename_partial_files} onValueChange={(v) => setConfig({ ...config, rename_partial_files: v })} />
              </div>
              <div className="p-3 rounded-lg border border-content1/20 bg-content1/20 flex items-center justify-between">
                <span className="text-sm">Auto-start added torrents</span>
                <Switch size="sm" isSelected={config.start_added_torrents} onValueChange={(v) => setConfig({ ...config, start_added_torrents: v })} />
              </div>
            </div>

            <Divider className="bg-content1/20" />

            <div className="flex items-center gap-2 mb-2">
              <Zap size={18} className="text-success" />
              <h3 className="text-sm font-bold uppercase tracking-wider text-foreground/70">Seeding Limits</h3>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <Switch size="sm" isSelected={config.seedRatioLimited} onValueChange={(v) => setConfig({ ...config, seedRatioLimited: v })}>
                  Stop at Ratio
                </Switch>
                <Input
                  type="number"
                  value={config.seedRatioLimit.toString()}
                  variant="bordered"
                  isDisabled={!config.seedRatioLimited}
                  endContent={<span className="text-xs text-foreground/50">Ratio</span>}
                />
              </div>
              <div className="space-y-2">
                <Switch size="sm" isSelected={config.idleSeedingLimited} onValueChange={(v) => setConfig({ ...config, idleSeedingLimited: v })}>
                  Stop if Idle
                </Switch>
                <Input
                  type="number"
                  value={config.idleSeedingLimit.toString()}
                  variant="bordered"
                  isDisabled={!config.idleSeedingLimited}
                  endContent={<span className="text-xs text-foreground/50">Min</span>}
                />
              </div>
            </div>
          </GlassPanel>
        )}
      </motion.div>
    );
  };

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(open) => !open && onClose()}
      backdrop="blur"
      placement="center"
      size="5xl"
      hideCloseButton
      classNames={{
        base: "bg-background/90 backdrop-blur-2xl border border-content1/20 shadow-2xl h-[700px] flex flex-col overflow-hidden",
        body: "p-0 flex-1 overflow-hidden flex flex-row",
      }}
      motionProps={{
        variants: {
          enter: { scale: 1, opacity: 1, transition: { duration: 0.2, ease: "easeOut" } },
          exit: { scale: 0.95, opacity: 0, transition: { duration: 0.15 } },
        },
      }}
    >
      <ModalContent>
        {/* --- SIDEBAR --- */}
        <div className="w-64 shrink-0 bg-content1/15 border-r border-content1/20 flex flex-col pt-6 pb-4">
          <div className="px-6 mb-8">
            <h2 className="text-xl font-bold tracking-tight">Settings</h2>
            <p className="text-xs text-foreground/40 mt-1">Configure Daemon</p>
          </div>

          <div className="flex-1 px-3 space-y-1">
            {[
              { id: "speed", label: "Speed & Limits", icon: Zap },
              { id: "network", label: "Network", icon: Wifi },
              { id: "peers", label: "Peers", icon: Globe },
              { id: "storage", label: "Files", icon: FolderOpen },
              { id: "privacy", label: "Privacy", icon: Shield },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id as SettingsTab)}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
                  activeTab === item.id
                    ? "bg-primary/10 text-primary shadow-sm"
                    : "text-foreground/60 hover:text-foreground hover:bg-content1/20"
                )}
              >
                <item.icon size={18} />
                {item.label}
              </button>
            ))}
          </div>

          <div className="px-6 mt-auto">
            <div className="p-3 rounded-lg bg-content1/20 border border-content1/20 text-xs text-foreground/40">
              Transmission 4.0.5
              <br />
              RPC v17
            </div>
          </div>
        </div>

        {/* --- CONTENT AREA --- */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 overflow-hidden bg-background/30 p-6 relative">
            <AnimatePresence mode="wait">{renderContent()}</AnimatePresence>
          </div>

          {/* Footer Action Bar */}
          <div className="shrink-0 h-20 border-t border-content1/20 bg-content1/20 px-8 flex items-center justify-between">
            <Button variant="light" color="danger" onPress={() => setConfig({} as any)}>
              Reset Defaults
            </Button>
            <div className="flex gap-3">
              <Button variant="flat" onPress={onClose}>
                Cancel
              </Button>
              <Button
                color="primary"
                variant="shadow"
                onPress={handleSave}
                isLoading={isSaving}
                startContent={!isSaving && <Save size={18} />}
                className="px-8 font-bold"
              >
                Apply Changes
              </Button>
            </div>
          </div>
        </div>
      </ModalContent>
    </Modal>
  );
}
