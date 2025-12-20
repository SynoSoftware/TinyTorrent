import type { LucideIcon } from "lucide-react";
import {
    DownloadCloud,
    FolderOpen,
    Globe,
    Monitor,
    Network,
    Shield,
    Zap,
    Plug,
    Settings as SettingsIcon,
} from "lucide-react";
import { type SettingsConfig, type ConfigKey } from "./config";

export type SettingsTab =
    | "speed"
    | "network"
    | "connection"
    | "peers"
    | "storage"
    | "privacy"
    | "gui"
    | "system";

export type VisibilityCheck = (config: SettingsConfig) => boolean;

export type SliderDefinition = {
    min: number;
    max: number;
    step: number;
};

export interface BlockBase {
    visible?: VisibilityCheck;
    className?: string;
    dependsOn?: ConfigKey;
}

export type ButtonActionKey = "testPort" | "restoreHud";

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

export type InputBlock = {
    type: "input";
    labelKey: string;
    stateKey: ConfigKey;
    inputType?: string;
    variant?: "bordered" | "flat";
    size?: "sm" | "md";
    endIcon?: LucideIcon;

    sideAction?: {
        type: "browse" | "button";
        labelKey: string;
        actionKey?: ButtonActionKey;
        targetConfigKey?: ConfigKey;
    };

    browseAction?: ConfigKey;
} & BlockBase;

type InputPairBlock = {
    type: "input-pair";
    inputs: Array<InputBlock>;
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

type LanguageBlock = {
    type: "language";
    labelKey: string;
    descriptionKey?: string;
} & BlockBase;

type RawConfigBlock = {
    type: "raw-config";
    labelKey: string;
    descriptionKey?: string;
} & BlockBase;

export type SectionBlock =
    | SwitchSliderBlock
    | SwitchBlock
    | InputBlock
    | InputPairBlock
    | SelectBlock
    | DividerBlock
    | ButtonRowBlock
    | LanguageBlock
    | RawConfigBlock
    | DaySelectorBlock;

interface SectionDefinition {
    titleKey?: string;
    cardClass?: string;
    descriptionKey?: string;
    blocks: SectionBlock[];
}

export interface TabDefinition {
    id: SettingsTab;
    labelKey: string;
    icon: LucideIcon;
    headerKey: string;
    isCustom?: boolean;
    sections: SectionDefinition[];
}

export const SETTINGS_TABS: TabDefinition[] = [
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
                            {
                                type: "input",
                                labelKey: "settings.labels.altSpeedDown",
                                stateKey: "alt_speed_down",
                                inputType: "number",
                                variant: "bordered",
                            },
                            {
                                type: "input",
                                labelKey: "settings.labels.altSpeedUp",
                                stateKey: "alt_speed_up",
                                inputType: "number",
                                variant: "bordered",
                            },
                        ],
                    },
                    {
                        type: "input-pair",
                        visible: (config) => config.alt_speed_time_enabled,
                        inputs: [
                            {
                                type: "input",
                                labelKey: "settings.labels.altSpeedStart",
                                stateKey: "alt_speed_begin",
                                inputType: "time",
                                variant: "flat",
                            },
                            {
                                type: "input",
                                labelKey: "settings.labels.altSpeedEnd",
                                stateKey: "alt_speed_end",
                                inputType: "time",
                                variant: "flat",
                            },
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
                    {
                        type: "input",
                        labelKey: "settings.labels.incomingPort",
                        stateKey: "peer_port",
                        inputType: "number",
                        variant: "bordered",
                        sideAction: {
                            type: "button",
                            labelKey: "settings.buttons.testPort",
                            actionKey: "testPort",
                        },
                    },
                    {
                        type: "switch",
                        labelKey: "settings.labels.randomizePort",
                        stateKey: "peer_port_random_on_start",
                    },
                    {
                        type: "switch",
                        labelKey: "settings.labels.upnp",
                        stateKey: "port_forwarding_enabled",
                    },
                ],
            },
            {
                titleKey: "settings.sections.protocol",
                blocks: [
                    {
                        type: "switch",
                        labelKey: "settings.labels.dht",
                        stateKey: "dht_enabled",
                    },
                    {
                        type: "switch",
                        labelKey: "settings.labels.lpd",
                        stateKey: "lpd_enabled",
                    },
                    {
                        type: "switch",
                        labelKey: "settings.labels.pex",
                        stateKey: "pex_enabled",
                    },
                ],
            },
        ],
    },
    {
        id: "connection",
        labelKey: "settings.tabs.connection",
        icon: Plug,
        headerKey: "settings.headers.connection",
        isCustom: true,
        sections: [],
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
                            {
                                type: "input",
                                labelKey: "settings.labels.globalPeers",
                                stateKey: "peer_limit_global",
                                inputType: "number",
                                variant: "bordered",
                            },
                            {
                                type: "input",
                                labelKey: "settings.labels.perTorrentPeers",
                                stateKey: "peer_limit_per_torrent",
                                inputType: "number",
                                variant: "bordered",
                            },
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
                    {
                        labelKey: "settings.labels.downloadFolder",
                        stateKey: "download_dir",
                        type: "input",
                        variant: "bordered",
                        sideAction: {
                            type: "browse",
                            labelKey: "settings.button.browse",
                            targetConfigKey: "download_dir",
                        },
                    },
                    {
                        type: "switch",
                        labelKey: "settings.labels.useIncompleteFolder",
                        stateKey: "incomplete_dir_enabled",
                    },
                    {
                        type: "input",
                        labelKey: "settings.labels.incompleteFolder",
                        stateKey: "incomplete_dir",
                        variant: "flat",
                        dependsOn: "incomplete_dir_enabled",
                        sideAction: {
                            type: "browse",
                            labelKey: "settings.button.browse",
                            targetConfigKey: "incomplete_dir",
                        },
                    },
                ],
            },
            {
                titleKey: "settings.sections.behavior",
                blocks: [
                    {
                        type: "switch",
                        labelKey: "settings.labels.renamePartial",
                        stateKey: "rename_partial_files",
                    },
                    {
                        type: "switch",
                        labelKey: "settings.labels.startAdded",
                        stateKey: "start_added_torrents",
                    },
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
                            {
                                key: "required",
                                labelKey:
                                    "settings.options.encryption.required",
                            },
                            {
                                key: "preferred",
                                labelKey:
                                    "settings.options.encryption.preferred",
                            },
                            {
                                key: "tolerated",
                                labelKey:
                                    "settings.options.encryption.tolerated",
                            },
                        ],
                    },
                ],
            },
            {
                titleKey: "settings.sections.blocklist",
                blocks: [
                    {
                        type: "switch",
                        labelKey: "settings.labels.blocklistToggle",
                        stateKey: "blocklist_enabled",
                        color: "danger",
                    },
                    {
                        type: "input",
                        labelKey: "settings.labels.blocklistUrl",
                        stateKey: "blocklist_url",
                        variant: "bordered",
                        dependsOn: "blocklist_enabled",
                    },
                ],
            },
        ],
    },
    {
        id: "gui",
        labelKey: "settings.tabs.gui",
        icon: Monitor,
        headerKey: "settings.headers.gui",
        sections: [
            {
                titleKey: "settings.sections.dashboard",
                descriptionKey: "settings.descriptions.restore_hud",
                blocks: [
                    {
                        type: "button-row",
                        buttons: [
                            {
                                labelKey: "settings.buttons.restore_hud",
                                action: "restoreHud",
                                variant: "flat",
                                color: "primary",
                                size: "md",
                            },
                        ],
                    },
                ],
            },
            {
                titleKey: "settings.sections.visuals",
                descriptionKey: "settings.descriptions.table_watermark",
                blocks: [
                    {
                        type: "switch",
                        labelKey: "settings.labels.tableWatermark",
                        stateKey: "table_watermark_enabled",
                    },
                ],
            },
            {
                titleKey: "settings.sections.localization",
                descriptionKey: "settings.descriptions.language",
                blocks: [
                    {
                        type: "language",
                        labelKey: "settings.labels.language",
                        descriptionKey: "settings.descriptions.language_helper",
                    },
                ],
            },
            {
                titleKey: "settings.sections.advanced",
                descriptionKey: "settings.descriptions.config_export",
                blocks: [
                    {
                        type: "raw-config",
                        labelKey: "settings.labels.raw_config",
                        descriptionKey: "settings.descriptions.config_details",
                    },
                ],
            },
        ],
    },
    {
        id: "system",
        labelKey: "settings.tabs.system",
        icon: SettingsIcon,
        headerKey: "settings.headers.system",
        isCustom: true,
        sections: [],
    },
];

export const ALT_SPEED_DAY_OPTIONS: ReadonlyArray<{
    id: string;
    mask: number;
    labelKey: string;
}> = [
    { id: "sunday", mask: 1, labelKey: "settings.labels.day_sunday" },
    { id: "monday", mask: 2, labelKey: "settings.labels.day_monday" },
    { id: "tuesday", mask: 4, labelKey: "settings.labels.day_tuesday" },
    { id: "wednesday", mask: 8, labelKey: "settings.labels.day_wednesday" },
    { id: "thursday", mask: 16, labelKey: "settings.labels.day_thursday" },
    { id: "friday", mask: 32, labelKey: "settings.labels.day_friday" },
    { id: "saturday", mask: 64, labelKey: "settings.labels.day_saturday" },
];
