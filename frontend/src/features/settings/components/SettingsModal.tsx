import { Button, Card, Divider, Input, Modal, ModalContent, Select, SelectItem, Slider, Switch, cn } from "@heroui/react";
import type { LucideIcon } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FolderOpen, Globe, Network, Save, Shield, RotateCcw, Zap, X } from "lucide-react";
import { DEFAULT_SETTINGS_CONFIG, type ConfigKey, type SettingsConfig } from "../data/config";

type SettingsTab = "speed" | "network" | "peers" | "storage" | "privacy";

type VisibilityCheck = (config: SettingsConfig) => boolean;

type SliderDefinition = {
  min: number;
  max: number;
  step: number;
};

interface BlockBase {
  visible?: VisibilityCheck;
  className?: string;
  dependsOn?: ConfigKey;
}

type SwitchSliderBlock = {
  type: "switch-slider";
  labelKey: string;
  switchKey: ConfigKey;
  sliderKey: ConfigKey;
  slider: SliderDefinition;
  color?: "primary" | "success" | "warning" | "danger";
  valueSuffixKey?: string;
  disabledWhenSwitchOff?: boolean;
} & BlockBase;

type SwitchBlock = {
  type: "switch";
  labelKey: string;
  stateKey: ConfigKey;
  color?: "primary" | "success" | "warning" | "danger";
} & BlockBase;

type InputBlock = {
  type: "input";
  labelKey: string;
  stateKey: ConfigKey;
  inputType?: string;
  variant?: "bordered" | "flat";
  size?: "sm" | "md";
  endIcon?: LucideIcon;
} & BlockBase;

type InputPairBlock = {
  type: "input-pair";
  inputs: Array<{
    labelKey: string;
    stateKey: ConfigKey;
    inputType?: string;
    variant?: "bordered" | "flat";
  }>;
} & BlockBase;

type SelectBlock = {
  type: "select";
  labelKey: string;
  stateKey: ConfigKey;
  options: Array<{ key: string; labelKey: string }>;
  variant?: "bordered" | "flat";
} & BlockBase;

type DividerBlock = {
  type: "divider";
} & BlockBase;

type DaySelectorBlock = {
  type: "day-selector";
  labelKey: string;
} & BlockBase;

type ButtonActionKey = "testPort";

type ButtonRowBlock = {
  type: "button-row";
  buttons: Array<{
    labelKey: string;
    action: ButtonActionKey;
    variant?: "flat" | "light" | "shadow";
    color?: "primary" | "success" | "warning" | "danger";
    size?: "sm" | "md" | "lg";
    className?: string;
  }>;
} & BlockBase;

type SectionBlock =
  | SwitchSliderBlock
  | SwitchBlock
  | InputBlock
  | InputPairBlock
  | SelectBlock
  | DividerBlock
  | ButtonRowBlock
  | DaySelectorBlock;

interface SectionDefinition {
  titleKey: string;
  cardClass?: string;
  blocks: SectionBlock[];
}

interface TabDefinition {
  id: SettingsTab;
  labelKey: string;
  icon: LucideIcon;
  headerKey: string;
  sections: SectionDefinition[];
}

const SETTINGS_TABS: TabDefinition[] = [
  {
    id: "speed",
    labelKey: "settings.tabs.speed",
    icon: Zap,
    headerKey: "settings.headers.speed",
    sections: [
      {
        titleKey: "settings.sections.bandwidth",
        blocks: [
          {
            type: "switch-slider",
            labelKey: "settings.labels.downloadLimit",
            switchKey: "speed_limit_down_enabled",
            sliderKey: "speed_limit_down",
            slider: { min: 0, max: 50000, step: 100 },
            color: "success",
            valueSuffixKey: "settings.units.kbps",
          },
          {
            type: "switch-slider",
            labelKey: "settings.labels.uploadLimit",
            switchKey: "speed_limit_up_enabled",
            sliderKey: "speed_limit_up",
            slider: { min: 0, max: 5000, step: 10 },
            color: "primary",
            valueSuffixKey: "settings.units.kbps",
          },
        ],
      },
      {
        titleKey: "settings.sections.turtle",
        cardClass: "border-warning/30 bg-warning/5",
        blocks: [
          {
            type: "switch",
            labelKey: "settings.labels.turtleMode",
            stateKey: "alt_speed_time_enabled",
            color: "warning",
          },
          {
            type: "input-pair",
            inputs: [
              { labelKey: "settings.labels.altSpeedDown", stateKey: "alt_speed_down", inputType: "number", variant: "bordered" },
              { labelKey: "settings.labels.altSpeedUp", stateKey: "alt_speed_up", inputType: "number", variant: "bordered" },
            ],
          },
          {
            type: "input-pair",
            visible: (config) => config.alt_speed_time_enabled,
            inputs: [
              { labelKey: "settings.labels.altSpeedStart", stateKey: "alt_speed_begin", inputType: "time", variant: "flat" },
              { labelKey: "settings.labels.altSpeedEnd", stateKey: "alt_speed_end", inputType: "time", variant: "flat" },
            ],
          },
          {
            type: "day-selector",
            labelKey: "settings.labels.altSpeedDays",
            visible: (config) => config.alt_speed_time_enabled,
          },
        ],
      },
      {
        titleKey: "settings.sections.seeding",
        blocks: [
          {
            type: "switch",
            labelKey: "settings.labels.seedRatioToggle",
            stateKey: "seedRatioLimited",
            color: "success",
          },
          {
            type: "input",
            labelKey: "settings.labels.seedRatioLimit",
            stateKey: "seedRatioLimit",
            inputType: "number",
            variant: "bordered",
            dependsOn: "seedRatioLimited",
          },
          {
            type: "switch",
            labelKey: "settings.labels.idleSeedingToggle",
            stateKey: "idleSeedingLimited",
            color: "warning",
          },
          {
            type: "input",
            labelKey: "settings.labels.idleSeedingLimit",
            stateKey: "idleSeedingLimit",
            inputType: "number",
            variant: "bordered",
            dependsOn: "idleSeedingLimited",
          },
        ],
      },
      {
        titleKey: "settings.sections.polling",
        blocks: [
          {
            type: "input",
            labelKey: "settings.labels.refreshInterval",
            stateKey: "refresh_interval_ms",
            inputType: "number",
            variant: "bordered",
          },
          {
            type: "input",
            labelKey: "settings.labels.requestTimeout",
            stateKey: "request_timeout_ms",
            inputType: "number",
            variant: "bordered",
          },
        ],
      },
    ],
  },
  {
    id: "network",
    labelKey: "settings.tabs.network",
    icon: Network,
    headerKey: "settings.headers.network",
    sections: [
      {
        titleKey: "settings.sections.listeningPort",
        blocks: [
          { type: "input", labelKey: "settings.labels.incomingPort", stateKey: "peer_port", inputType: "number", variant: "bordered" },
          {
            type: "button-row",
            buttons: [
              {
                labelKey: "settings.buttons.testPort",
                action: "testPort",
                variant: "flat",
                color: "primary",
                size: "lg",
                className: "h-12",
              },
            ],
          },
          { type: "switch", labelKey: "settings.labels.randomizePort", stateKey: "peer_port_random_on_start" },
          { type: "switch", labelKey: "settings.labels.upnp", stateKey: "port_forwarding_enabled" },
        ],
      },
      {
        titleKey: "settings.sections.protocol",
        blocks: [
          { type: "switch", labelKey: "settings.labels.dht", stateKey: "dht_enabled" },
          { type: "switch", labelKey: "settings.labels.lpd", stateKey: "lpd_enabled" },
          { type: "switch", labelKey: "settings.labels.pex", stateKey: "pex_enabled" },
        ],
      },
    ],
  },
  {
    id: "peers",
    labelKey: "settings.tabs.peers",
    icon: Globe,
    headerKey: "settings.headers.peers",
    sections: [
      {
        titleKey: "settings.sections.connectionLimits",
        blocks: [
          {
            type: "input-pair",
            inputs: [
              { labelKey: "settings.labels.globalPeers", stateKey: "peer_limit_global", inputType: "number", variant: "bordered" },
              { labelKey: "settings.labels.perTorrentPeers", stateKey: "peer_limit_per_torrent", inputType: "number", variant: "bordered" },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "storage",
    labelKey: "settings.tabs.storage",
    icon: FolderOpen,
    headerKey: "settings.headers.storage",
    sections: [
      {
        titleKey: "settings.sections.locations",
        blocks: [
          { labelKey: "settings.labels.downloadFolder", stateKey: "download_dir", type: "input", endIcon: FolderOpen, variant: "bordered" },
          { type: "switch", labelKey: "settings.labels.useIncompleteFolder", stateKey: "incomplete_dir_enabled" },
          { type: "input", labelKey: "settings.labels.incompleteFolder", stateKey: "incomplete_dir", variant: "flat", dependsOn: "incomplete_dir_enabled" },
        ],
      },
      {
        titleKey: "settings.sections.behavior",
        blocks: [
          { type: "switch", labelKey: "settings.labels.renamePartial", stateKey: "rename_partial_files" },
          { type: "switch", labelKey: "settings.labels.startAdded", stateKey: "start_added_torrents" },
        ],
      },
    ],
  },
  {
    id: "privacy",
    labelKey: "settings.tabs.privacy",
    icon: Shield,
    headerKey: "settings.headers.privacy",
    sections: [
      {
        titleKey: "settings.sections.encryption",
        blocks: [
          {
            type: "select",
            labelKey: "settings.labels.encryption",
            stateKey: "encryption",
            options: [
              { key: "required", labelKey: "settings.options.encryption.required" },
              { key: "preferred", labelKey: "settings.options.encryption.preferred" },
              { key: "tolerated", labelKey: "settings.options.encryption.tolerated" },
            ],
          },
        ],
      },
      {
        titleKey: "settings.sections.blocklist",
        blocks: [
          { type: "switch", labelKey: "settings.labels.blocklistToggle", stateKey: "blocklist_enabled", color: "danger" },
          { type: "input", labelKey: "settings.labels.blocklistUrl", stateKey: "blocklist_url", variant: "bordered", dependsOn: "blocklist_enabled" },
        ],
      },
    ],
  },
];

const ALT_SPEED_DAY_OPTIONS: ReadonlyArray<{ id: string; mask: number; labelKey: string }> = [
  { id: "sunday", mask: 1, labelKey: "settings.labels.day_sunday" },
  { id: "monday", mask: 2, labelKey: "settings.labels.day_monday" },
  { id: "tuesday", mask: 4, labelKey: "settings.labels.day_tuesday" },
  { id: "wednesday", mask: 8, labelKey: "settings.labels.day_wednesday" },
  { id: "thursday", mask: 16, labelKey: "settings.labels.day_thursday" },
  { id: "friday", mask: 32, labelKey: "settings.labels.day_friday" },
  { id: "saturday", mask: 64, labelKey: "settings.labels.day_saturday" },
];

interface SectionTitleProps {
  title: string;
}

const SectionCard = ({ className, children }: { className?: string; children: React.ReactNode }) => (
  <Card className={cn("p-5 rounded-xl border border-divider bg-content1/50", className)}>
    {children}
  </Card>
);

function SectionTitle({ title }: SectionTitleProps) {
  return <h3 className="text-[10px] font-bold uppercase tracking-widest text-foreground/40 mb-3 mt-1">{title}</h3>;
}

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialConfig: SettingsConfig;
  isSaving: boolean;
  onSave: (config: SettingsConfig) => Promise<void>;
  onTestPort?: () => void;
}

export function SettingsModal({ isOpen, onClose, initialConfig, isSaving, onSave, onTestPort }: SettingsModalProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<SettingsTab>("speed");
  const [config, setConfig] = useState<SettingsConfig>(() => ({ ...initialConfig }));

  useEffect(() => {
    if (isOpen) {
      setConfig(initialConfig);
    }
  }, [initialConfig, isOpen]);

  const handleSave = async () => {
    try {
      await onSave(config);
      onClose();
    } finally {
    }
  };

  const handleReset = () => {
    setConfig({ ...DEFAULT_SETTINGS_CONFIG });
  };

  const updateConfig = <K extends ConfigKey>(key: K, value: SettingsConfig[K]) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  const buttonActions: Record<ButtonActionKey, () => void> = {
    testPort: () => {
      void onTestPort?.();
    },
  };

  const activeTabDefinition = SETTINGS_TABS.find((tab) => tab.id === activeTab) ?? SETTINGS_TABS[0];

  const renderInput = (block: InputBlock, index: number) => {
    const dependsOn = block.dependsOn;
    const isDisabled = dependsOn && !(config[dependsOn] as boolean);
    const value = String(config[block.stateKey] ?? "");

    return (
      <Input
        key={`${block.stateKey}-${index}`}
        label={t(block.labelKey)}
        size={block.size ?? "sm"}
        variant={block.variant ?? "bordered"}
        value={value}
        type={block.inputType}
        isDisabled={!!isDisabled}
        endContent={block.endIcon ? <block.endIcon size={14} className="text-default-400" /> : undefined}
        onChange={(event) => {
          const rawValue = event.target.value;
          const parsedValue = block.inputType === "number" ? Number(rawValue) : rawValue;
          updateConfig(block.stateKey, parsedValue as SettingsConfig[ConfigKey]);
        }}
        className={block.className}
      />
    );
  };

  const renderBlock = (block: SectionBlock, sectionIndex: number, blockIndex: number) => {
    if (block.visible && !block.visible(config)) {
      return null;
    }

    const dependsOn = (block as BlockBase).dependsOn;
    const dependsDisabled = dependsOn && !(config[dependsOn] as boolean);

    switch (block.type) {
      case "switch-slider": {
        const value = config[block.sliderKey] as number;
        const sliderDisabled = block.disabledWhenSwitchOff !== false ? !(config[block.switchKey] as boolean) : false;
        return (
          <div
            key={`section-${sectionIndex}-block-${blockIndex}`}
            className="space-y-3"
          >
            <div className="flex justify-between items-center">
              <Switch
                size="sm"
                isSelected={config[block.switchKey] as boolean}
                color={block.color}
                onValueChange={(value) => updateConfig(block.switchKey, value as SettingsConfig[ConfigKey])}
              >
                <span className="text-sm font-medium">{t(block.labelKey)}</span>
              </Switch>
              <div className="text-xs font-mono font-bold text-foreground/70 bg-foreground/5 px-2 py-1 rounded-full">
                {block.valueSuffixKey
                  ? t(block.valueSuffixKey, { value })
                  : value}
              </div>
            </div>
            <Slider
              size="sm"
              step={block.slider.step}
              maxValue={block.slider.max}
              minValue={block.slider.min}
              value={value}
              onChange={(value) => updateConfig(block.sliderKey, value as SettingsConfig[ConfigKey])}
              isDisabled={sliderDisabled}
              color={block.color}
              className="opacity-90"
            />
          </div>
        );
      }

      case "switch": {
        return (
          <div key={`section-${sectionIndex}-block-${blockIndex}`} className="flex justify-between items-center">
            <span className={cn("text-sm font-medium text-foreground/80", dependsDisabled && "opacity-40")}>{t(block.labelKey)}</span>
            <Switch
              size="sm"
              color={block.color}
              isSelected={config[block.stateKey] as boolean}
              onValueChange={(value) => updateConfig(block.stateKey, value as SettingsConfig[ConfigKey])}
            />
          </div>
        );
      }

      case "input": {
        return renderInput(block, blockIndex);
      }

      case "input-pair": {
        const gridCols = block.inputs.length === 1 ? "grid-cols-1" : "grid-cols-2";
        return (
          <div key={`section-${sectionIndex}-block-${blockIndex}`} className={cn("grid gap-4", gridCols)}>
            {block.inputs.map((inputBlock, inputIndex) =>
              renderInput({ ...inputBlock, type: "input" } as InputBlock, inputIndex)
            )}
          </div>
        );
      }

      case "day-selector": {
        const selectedMask = config.alt_speed_time_day;
        const toggleDay = (mask: number) => {
          const nextValue = selectedMask & mask ? selectedMask & ~mask : selectedMask | mask;
          updateConfig("alt_speed_time_day", nextValue);
        };
        return (
          <div key={`section-${sectionIndex}-block-${blockIndex}`} className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-foreground/70">
                {t(block.labelKey)}
              </span>
              <span className="text-[9px] uppercase tracking-[0.4em] text-foreground/40">
                {t("settings.labels.altSpeedDaysHelp")}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {ALT_SPEED_DAY_OPTIONS.map((day) => {
                const isSelected = Boolean(selectedMask & day.mask);
                return (
                  <Button
                    key={day.id}
                    size="sm"
                    variant={isSelected ? "shadow" : "light"}
                    color={isSelected ? "primary" : undefined}
                    onPress={() => toggleDay(day.mask)}
                    className="uppercase tracking-[0.3em] px-3 py-1"
                  >
                    {t(day.labelKey)}
                  </Button>
                );
              })}
            </div>
          </div>
        );
      }

      case "select": {
        return (
          <Select
            key={`section-${sectionIndex}-block-${blockIndex}`}
            label={t(block.labelKey)}
            size="sm"
            variant={block.variant ?? "bordered"}
            selectedKeys={
              config[block.stateKey] !== undefined ? [String(config[block.stateKey])] : []
            }
            onSelectionChange={(keys) => {
              const [next] = [...keys];
              if (next) {
                updateConfig(block.stateKey, next as SettingsConfig[ConfigKey]);
              }
            }}
          >
            {block.options.map((option) => (
              <SelectItem key={option.key}>{t(option.labelKey)}</SelectItem>
            ))}
          </Select>
        );
      }

      case "button-row": {
        return (
          <div key={`section-${sectionIndex}-block-${blockIndex}`} className="flex">
            {block.buttons.map((button) => (
              <Button
                key={button.labelKey}
                size={button.size ?? "sm"}
                variant={button.variant ?? "light"}
                color={button.color}
                onPress={buttonActions[button.action]}
                className={button.className}
              >
                {t(button.labelKey)}
              </Button>
            ))}
          </div>
        );
      }

      case "divider": {
        return <Divider key={`section-${sectionIndex}-block-${blockIndex}`} className="my-3" />;
      }

      default:
        return null;
    }
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
        base: "bg-background/95 backdrop-blur-2xl border border-divider shadow-2xl h-[650px] max-h-[90vh] flex flex-row overflow-hidden rounded-2xl",
      }}
      motionProps={{
        variants: {
          enter: { scale: 1, opacity: 1, transition: { duration: 0.2 } },
          exit: { scale: 0.98, opacity: 0, transition: { duration: 0.1 } },
        },
      }}
    >
      <ModalContent>
        <div className="w-56 shrink-0 bg-default-50/50 border-r border-divider flex flex-col">
          <div className="p-5 border-b border-divider/50">
            <h2 className="text-lg font-bold tracking-tight text-foreground">{t("settings.modal.title")}</h2>
          </div>
          <div className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
            {SETTINGS_TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 group relative",
                  activeTab === tab.id
                    ? "bg-primary/10 text-primary"
                    : "text-foreground/60 hover:text-foreground hover:bg-default-100"
                )}
              >
                <tab.icon size={16} />
                <span>{t(tab.labelKey)}</span>
                {activeTab === tab.id && <div className="absolute left-0 top-2 bottom-2 w-0.5 bg-primary rounded-r-full" />}
              </button>
            ))}
          </div>
          <div className="p-4 border-t border-divider/50">
            <div className="text-[10px] text-foreground/30 font-mono">{t("brand.version")}</div>
          </div>
        </div>
        <div className="flex-1 flex flex-col min-w-0 bg-background relative">
          <div className="shrink-0 h-14 border-b border-divider/50 flex items-center justify-between px-6 bg-background/50 backdrop-blur-md z-10">
            <h1 className="text-sm font-bold text-foreground/80">{t(activeTabDefinition.headerKey)}</h1>
            <Button
              isIconOnly
              radius="full"
              size="sm"
              variant="light"
              onPress={onClose}
              className="text-foreground/40 hover:text-foreground"
              aria-label={t("settings.modal.footer.cancel")}
            >
              <X size={18} />
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-6 scrollbar-hide">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTabDefinition.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="space-y-6 pb-20"
              >
                {activeTabDefinition.sections.map((section, sectionIndex) => (
                  <SectionCard key={`${section.titleKey}-${sectionIndex}`} className={section.cardClass}>
                    <SectionTitle title={t(section.titleKey)} />
                    <div className="space-y-5">
                      {section.blocks.map((block, blockIndex) => renderBlock(block, sectionIndex, blockIndex))}
                    </div>
                  </SectionCard>
                ))}
              </motion.div>
            </AnimatePresence>
          </div>
          <div className="shrink-0 h-16 border-t border-divider bg-background/80 backdrop-blur-md px-6 flex items-center justify-between z-20 absolute bottom-0 left-0 right-0">
            <Button size="sm" variant="light" color="danger" startContent={<RotateCcw size={14} />} onPress={handleReset}>
              {t("settings.modal.footer.reset_defaults")}
            </Button>
            <div className="flex gap-2">
              <Button size="sm" variant="flat" onPress={onClose}>{t("settings.modal.footer.cancel")}</Button>
              <Button size="sm" color="primary" variant="shadow" onPress={handleSave} isLoading={isSaving} startContent={!isSaving && <Save size={16} />}>
                {t("settings.modal.footer.save")}
              </Button>
            </div>
          </div>
        </div>
      </ModalContent>
    </Modal>
  );
}
