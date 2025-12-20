import {
    Button,
    Divider,
    Select,
    SelectItem,
    Slider,
    Switch,
    cn,
} from "@heroui/react";
import { useTranslation } from "react-i18next";
import { useMemo } from "react";
import type { ConfigKey, SettingsConfig } from "@/modules/settings/data/config";
import {
    ALT_SPEED_DAY_OPTIONS,
    type InputBlock,
    type SectionBlock,
    type ButtonActionKey,
} from "@/modules/settings/data/settings-tabs";
import { ICON_STROKE_WIDTH } from "@/config/logic";
import { LanguageMenu } from "@/shared/ui/controls/LanguageMenu";
import { BufferedInput } from "@/modules/settings/components/BufferedInput";
import { useSettingsForm } from "@/modules/settings/context/SettingsFormContext";

/* --- 1. Primitive Renderers --- */

export function SwitchSliderRenderer({
    block,
}: {
    block: Extract<SectionBlock, { type: "switch-slider" }>;
}) {
    const { t } = useTranslation();
    const { config, updateConfig } = useSettingsForm();

    const rawValue = config[block.sliderKey] as number;
    const isSwitchOn = config[block.switchKey] as boolean;
    const sliderDisabled =
        block.disabledWhenSwitchOff !== false ? !isSwitchOn : false;

    const sliderValue = Number.isFinite(rawValue) ? rawValue : block.slider.min;

    return (
        <div className="space-y-3">
            <div className="flex justify-between items-center">
                <Switch
                    size="sm"
                    isSelected={isSwitchOn}
                    color={block.color}
                    onValueChange={(val) => updateConfig(block.switchKey, val)}
                >
                    <span className="text-sm font-medium text-foreground/90">
                        {t(block.labelKey)}
                    </span>
                </Switch>
                <div className="text-[11px] font-mono font-medium text-foreground/80 bg-content2 px-2 py-1 rounded-md min-w-[60px] text-center">
                    {block.valueSuffixKey
                        ? t(block.valueSuffixKey, { value: sliderValue })
                        : sliderValue}
                </div>
            </div>
            <Slider
                size="sm"
                step={block.slider.step}
                maxValue={block.slider.max}
                minValue={block.slider.min}
                value={sliderValue}
                onChange={(val) => updateConfig(block.sliderKey, val as number)}
                isDisabled={sliderDisabled}
                color={block.color}
                classNames={{ thumb: "shadow-small" }}
                className="opacity-90"
            />
        </div>
    );
}

export function SwitchRenderer({
    block,
}: {
    block: Extract<SectionBlock, { type: "switch" }>;
}) {
    const { t } = useTranslation();
    const { config, updateConfig } = useSettingsForm();
    const dependsOn = block.dependsOn;
    const isDisabled = dependsOn ? !(config[dependsOn] as boolean) : false;

    return (
        <div className="flex justify-between items-center h-10">
            <span
                className={cn(
                    "text-sm font-medium text-foreground/80",
                    isDisabled && "opacity-40"
                )}
            >
                {t(block.labelKey)}
            </span>
            <Switch
                size="sm"
                color={block.color}
                isSelected={config[block.stateKey] as boolean}
                onValueChange={(val) => updateConfig(block.stateKey, val)}
                isDisabled={isDisabled}
            />
        </div>
    );
}

// Extracted to be reusable by InputPair
export function SingleInputRenderer({ block }: { block: InputBlock }) {
    const { t } = useTranslation();
    const {
        config,
        updateConfig,
        buttonActions,
        canBrowseDirectories,
        onBrowse,
    } = useSettingsForm();

    const dependsOn = block.dependsOn;
    const isDisabled = dependsOn ? !(config[dependsOn] as boolean) : false;
    const configValue = config[block.stateKey];

    const displayValue =
        configValue !== undefined && configValue !== null
            ? String(configValue)
            : "";
    const isMono =
        block.inputType === "number" ||
        (typeof displayValue === "string" &&
            (displayValue.includes("/") || displayValue.includes("\\")));

    // Resolve Side Action
    const sideAction = useMemo(() => {
        if (block.sideAction) return block.sideAction;
        if (block.browseAction)
            return {
                type: "browse" as const,
                labelKey: "settings.button.browse",
                targetConfigKey: block.browseAction,
            };
        return undefined;
    }, [block.sideAction, block.browseAction]);

    const isBrowseAction = sideAction?.type === "browse";
    const hideBrowseAction = isBrowseAction && !canBrowseDirectories;
    const sideActionDisabled = isDisabled || hideBrowseAction;

    const handleSideAction = () => {
        if (!sideAction) return;
        if (
            sideAction.type === "browse" &&
            sideAction.targetConfigKey &&
            !sideActionDisabled
        ) {
            onBrowse(sideAction.targetConfigKey);
        } else if (sideAction.type === "button" && sideAction.actionKey) {
            buttonActions[sideAction.actionKey]();
        }
    };

    const handleCommit = (val: string) => {
        if (block.inputType === "number") {
            if (val === "") return false;
            const num = Number(val);
            if (Number.isNaN(num)) return false;
            updateConfig(block.stateKey, num);
            return true;
        }
        updateConfig(block.stateKey, val);
        return true;
    };

    const inputNode = (
        <BufferedInput
            label={t(block.labelKey)}
            labelPlacement="outside"
            placeholder=" "
            size={block.size ?? "sm"}
            variant={block.variant ?? "bordered"}
            value={displayValue}
            type={block.inputType}
            isDisabled={isDisabled}
            onCommit={handleCommit}
            classNames={{
                inputWrapper: cn(
                    "h-[42px] transition-colors",
                    isDisabled ? "opacity-50" : "group-hover:border-primary/50"
                ),
                input: cn(
                    "text-foreground/90",
                    isMono
                        ? "font-mono text-[13px] tracking-tight"
                        : "font-medium text-sm"
                ),
                label: "text-foreground/60 font-medium text-xs uppercase tracking-wider mb-1",
            }}
            endContent={
                block.endIcon ? (
                    <block.endIcon
                        size={18}
                        strokeWidth={ICON_STROKE_WIDTH}
                        className="text-foreground/40"
                    />
                ) : undefined
            }
            className={block.className}
        />
    );

    if (!sideAction || hideBrowseAction) {
        return <div className="group">{inputNode}</div>;
    }

    return (
        <div className="flex w-full items-end gap-3 group">
            <div className="flex-1 min-w-0">{inputNode}</div>
            <Button
                size="sm"
                variant="flat"
                color="primary"
                onPress={handleSideAction}
                className="h-[42px] px-5 shrink-0 font-semibold text-xs tracking-wider uppercase bg-primary/10 hover:bg-primary/20 text-primary transition-colors data-[pressed=true]:scale-95"
                isDisabled={sideActionDisabled}
            >
                {t(sideAction.labelKey)}
            </Button>
        </div>
    );
}

export function InputPairRenderer({
    block,
}: {
    block: Extract<SectionBlock, { type: "input-pair" }>;
}) {
    const gridCols = block.inputs.length === 1 ? "grid-cols-1" : "grid-cols-2";
    return (
        <div className={cn("grid gap-4", gridCols)}>
            {block.inputs.map((inputBlock, idx) => (
                <SingleInputRenderer
                    key={inputBlock.stateKey || idx}
                    block={inputBlock}
                />
            ))}
        </div>
    );
}

export function DaySelectorRenderer({
    block,
}: {
    block: Extract<SectionBlock, { type: "day-selector" }>;
}) {
    const { t } = useTranslation();
    const { config, updateConfig } = useSettingsForm();
    const selectedMask = config["alt_speed_time_day"] as number;

    const toggleDay = (mask: number) => {
        const nextValue =
            selectedMask & mask ? selectedMask & ~mask : selectedMask | mask;
        updateConfig("alt_speed_time_day", nextValue);
    };

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-[0.2em] text-foreground/70">
                    {t(block.labelKey)}
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
                            className={cn(
                                "uppercase tracking-[0.2em] text-[10px] h-8 px-3 min-w-0",
                                isSelected ? "font-bold" : "text-foreground/60"
                            )}
                        >
                            {t(day.labelKey).substring(0, 3)}
                        </Button>
                    );
                })}
            </div>
        </div>
    );
}

export function SelectRenderer({
    block,
}: {
    block: Extract<SectionBlock, { type: "select" }>;
}) {
    const { t } = useTranslation();
    const { config, updateConfig } = useSettingsForm();

    return (
        <Select
            label={t(block.labelKey)}
            labelPlacement="outside"
            size="sm"
            variant={block.variant ?? "bordered"}
            selectedKeys={
                config[block.stateKey] !== undefined
                    ? [String(config[block.stateKey])]
                    : []
            }
            classNames={{ trigger: "h-[42px]", value: "text-sm font-medium" }}
            onSelectionChange={(keys) => {
                const [next] = [...keys];
                if (next) updateConfig(block.stateKey, next);
            }}
        >
            {block.options.map((opt) => (
                <SelectItem key={opt.key}>{t(opt.labelKey)}</SelectItem>
            ))}
        </Select>
    );
}

export function ButtonRowRenderer({
    block,
}: {
    block: Extract<SectionBlock, { type: "button-row" }>;
}) {
    const { t } = useTranslation();
    const { buttonActions } = useSettingsForm();

    return (
        <div className="flex">
            {block.buttons.map((btn) => (
                <Button
                    key={btn.labelKey}
                    size={btn.size ?? "sm"}
                    variant={btn.variant ?? "light"}
                    color={btn.color}
                    onPress={buttonActions[btn.action]}
                    className={btn.className}
                >
                    {t(btn.labelKey)}
                </Button>
            ))}
        </div>
    );
}

export function LanguageRenderer({
    block,
}: {
    block: Extract<SectionBlock, { type: "language" }>;
}) {
    const { t } = useTranslation();
    return (
        <div className="flex items-center justify-between gap-4">
            <div>
                <span className="text-sm font-semibold text-foreground/80">
                    {t(block.labelKey)}
                </span>
                {block.descriptionKey && (
                    <p className="text-xs text-foreground/60">
                        {t(block.descriptionKey)}
                    </p>
                )}
            </div>
            <LanguageMenu />
        </div>
    );
}

export function RawConfigRenderer({
    block,
}: {
    block: Extract<SectionBlock, { type: "raw-config" }>;
}) {
    const { t } = useTranslation();
    const { onCopyConfigJson, jsonCopyStatus, configJson } = useSettingsForm();

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between gap-4">
                <div>
                    <span className="text-sm font-semibold text-foreground/80">
                        {t(block.labelKey)}
                    </span>
                    {block.descriptionKey && (
                        <p className="text-xs text-foreground/50">
                            {t(block.descriptionKey)}
                        </p>
                    )}
                </div>
                <Button
                    size="sm"
                    variant="light"
                    color="primary"
                    onPress={onCopyConfigJson}
                >
                    {jsonCopyStatus === "copied"
                        ? t("settings.buttons.copy_config_copied")
                        : t("settings.buttons.copy_config")}
                </Button>
            </div>
            <div className="rounded-2xl border border-content1/20 bg-content1/30">
                <textarea
                    className="w-full resize-none border-none bg-transparent px-4 py-3 text-[11px] font-mono leading-relaxed text-foreground/80 selection:bg-primary/40 focus:outline-none"
                    rows={10}
                    value={configJson}
                    readOnly
                    aria-label={t(block.labelKey)}
                />
            </div>
        </div>
    );
}

export function DividerRenderer() {
    return <Divider className="my-3 opacity-50" />;
}
