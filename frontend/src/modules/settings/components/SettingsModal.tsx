import {
    Button,
    Card,
    Divider,
    Input,
    Modal,
    ModalContent,
    Select,
    SelectItem,
    Slider,
    Switch,
    cn,
} from "@heroui/react";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
    DEFAULT_SETTINGS_CONFIG,
    type ConfigKey,
    type SettingsConfig,
} from "../data/config";
import { ALT_SPEED_DAY_OPTIONS, SETTINGS_TABS } from "../data/settings-tabs";
import type {
    BlockBase,
    ButtonActionKey,
    InputBlock,
    SectionBlock,
    SettingsTab,
} from "../data/settings-tabs";
import { ICON_STROKE_WIDTH } from "../../../config/iconography";
import { INTERACTION_CONFIG } from "../../../config/interaction";
import { DirectoryPicker } from "../../../shared/ui/workspace/DirectoryPicker";
import { LanguageMenu } from "../../../shared/ui/controls/LanguageMenu";
import { ChevronLeft, RotateCcw, Save, X } from "lucide-react";

interface SectionTitleProps {
    title: string;
}

const SectionCard = ({
    className,
    children,
}: {
    className?: string;
    children: React.ReactNode;
}) => (
    <Card
        className={cn(
            "p-5 rounded-2xl border border-content1/20 bg-content1/10",
            className
        )}
    >
        {children}
    </Card>
);

function SectionTitle({ title }: SectionTitleProps) {
    return (
        <h3 className="text-[10px] font-bold uppercase tracking-[0.3em] text-foreground/40 mb-3 mt-0 leading-tight">
            {title}
        </h3>
    );
}

function SectionDescription({ description }: { description: string }) {
    return (
        <p className="mb-4 text-[11px] uppercase tracking-[0.25em] text-foreground/50">
            {description}
        </p>
    );
}

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialConfig: SettingsConfig;
    isSaving: boolean;
    onSave: (config: SettingsConfig) => Promise<void>;
    onTestPort?: () => void;
    onRestoreInsights?: () => void;
}

export function SettingsModal({
    isOpen,
    onClose,
    initialConfig,
    isSaving,
    onSave,
    onTestPort,
    onRestoreInsights,
}: SettingsModalProps) {
    const { t } = useTranslation();
    const [activeTab, setActiveTab] = useState<SettingsTab>("speed");

    // Responsive State
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(true);

    const [config, setConfig] = useState<SettingsConfig>(() => ({
        ...initialConfig,
    }));

    const [jsonCopyStatus, setJsonCopyStatus] = useState<"idle" | "copied">(
        "idle"
    );
    const jsonCopyTimerRef =
        useRef<ReturnType<typeof setTimeout> | null>(null);

    const configJson = useMemo(
        () => JSON.stringify(config, null, 2),
        [config]
    );

    const handleCopyConfigJson = useCallback(async () => {
        if (typeof navigator === "undefined" || !navigator.clipboard) return;
        try {
            await navigator.clipboard.writeText(configJson);
            setJsonCopyStatus("copied");
            if (jsonCopyTimerRef.current) {
                clearTimeout(jsonCopyTimerRef.current);
            }
            jsonCopyTimerRef.current = window.setTimeout(() => {
                setJsonCopyStatus("idle");
            }, 1500);
        } catch {
            // Swallow clipboard errors silently
        }
    }, [configJson]);

    // Local input state for fixing decimal/typing issues
    const [localInputs, setLocalInputs] = useState<Record<string, string>>({});

    useEffect(() => {
        return () => {
            if (jsonCopyTimerRef.current) {
                clearTimeout(jsonCopyTimerRef.current);
            }
        };
    }, []);

    const [activeBrowseKey, setActiveBrowseKey] = useState<ConfigKey | null>(
        null
    );

    useEffect(() => {
        if (isOpen) {
            setConfig(initialConfig);
            setLocalInputs({});
            setIsMobileMenuOpen(true);
        }
    }, [initialConfig, isOpen]);

    useEffect(() => {
        if (!isOpen) {
            setActiveBrowseKey(null);
            setLocalInputs({});
        }
    }, [isOpen]);

    const handleSave = async () => {
        try {
            await onSave(config);
            onClose();
        } finally {
        }
    };

    const handleReset = () => {
        setConfig({ ...DEFAULT_SETTINGS_CONFIG });
        setLocalInputs({});
    };

    const updateConfig = <K extends ConfigKey>(
        key: K,
        value: SettingsConfig[K]
    ) => {
        setConfig((prev) => ({ ...prev, [key]: value }));
    };

    const buttonActions: Record<ButtonActionKey, () => void> = {
        testPort: () => void onTestPort?.(),
        restoreHud: () => onRestoreInsights?.(),
    };

    const openDirectoryPicker = (key: ConfigKey) => {
        setActiveBrowseKey(key);
    };
    const closeDirectoryPicker = () => {
        setActiveBrowseKey(null);
    };
    const pickDirectory = (path: string) => {
        if (!activeBrowseKey) return;
        updateConfig(activeBrowseKey, path as SettingsConfig[ConfigKey]);
        closeDirectoryPicker();
    };

    const pickerInitialPath =
        activeBrowseKey && (config[activeBrowseKey] as string)
            ? (config[activeBrowseKey] as string)
            : "";

    const hasUnsavedChanges = useMemo(() => {
        const configKeys = Object.keys(DEFAULT_SETTINGS_CONFIG) as ConfigKey[];
        return configKeys.some((key) => config[key] !== initialConfig[key]);
    }, [config, initialConfig]);

    const activeTabDefinition =
        SETTINGS_TABS.find((tab) => tab.id === activeTab) ?? SETTINGS_TABS[0];

    // --- Renderers ---

    const renderInput = (block: InputBlock, index: number) => {
        const dependsOn = block.dependsOn;
        const isDisabled = dependsOn && !(config[dependsOn] as boolean);

        // Value Logic: Prefer local input while typing to allow "10."
        const configValue = config[block.stateKey];
        const localValue = localInputs[block.stateKey];
        const displayValue =
            localValue !== undefined ? localValue : String(configValue ?? "");

        const isMono =
            block.inputType === "number" ||
            (typeof displayValue === "string" &&
                (displayValue.includes("/") || displayValue.includes("\\")));

        // Determine Action
        const sideAction = block.sideAction
            ? block.sideAction
            : block.browseAction
            ? {
                  type: "browse" as const,
                  labelKey: "settings.button.browse",
                  targetConfigKey: block.browseAction,
              }
            : undefined;

        const handleSideAction = () => {
            if (!sideAction) return;
            if (sideAction.type === "browse" && sideAction.targetConfigKey) {
                openDirectoryPicker(sideAction.targetConfigKey);
            } else if (sideAction.type === "button" && sideAction.actionKey) {
                buttonActions[sideAction.actionKey]();
            }
        };

        const inputNode = (
            <Input
                key={`input-${block.stateKey}`}
                label={t(block.labelKey)}
                labelPlacement="outside" // <--- MOVES LABEL TO TOP
                placeholder=" " // <--- KEEPS LAYOUT STABLE
                size={block.size ?? "sm"}
                variant={block.variant ?? "bordered"}
                value={displayValue}
                type={block.inputType}
                isDisabled={!!isDisabled}
                onBlur={() => {
                    setLocalInputs((prev) => {
                        const { [block.stateKey]: _, ...rest } = prev;
                        return rest;
                    });
                }}
                onChange={(event) => {
                    const rawValue = event.target.value;
                    setLocalInputs((prev) => ({
                        ...prev,
                        [block.stateKey]: rawValue,
                    }));

                    if (block.inputType === "number") {
                        if (rawValue !== "") {
                            const num = Number(rawValue);
                            if (!isNaN(num)) {
                                updateConfig(
                                    block.stateKey,
                                    num as SettingsConfig[ConfigKey]
                                );
                            }
                        }
                    } else {
                        updateConfig(
                            block.stateKey,
                            rawValue as SettingsConfig[ConfigKey]
                        );
                    }
                }}
                classNames={{
                    // inputWrapper styles the BOX itself
                    inputWrapper: cn(
                        "h-[42px] transition-colors",
                        isDisabled
                            ? "opacity-50"
                            : "group-hover:border-primary/50"
                    ),
                    // input styles the TEXT inside the box
                    input: cn(
                        "text-foreground/90",
                        isMono
                            ? "font-mono text-[13px] tracking-tight"
                            : "font-medium text-sm"
                    ),
                    // label styles the TEXT ABOVE the box
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

        if (!sideAction) {
            return (
                <div key={`${block.stateKey}-${index}`} className="group">
                    {inputNode}
                </div>
            );
        }

        return (
            <div
                key={`${block.stateKey}-${index}`}
                className="flex w-full items-end gap-3 group"
            >
                <div className="flex-1 min-w-0">{inputNode}</div>
                <Button
                    size="sm"
                    variant="flat"
                    color="primary"
                    onPress={handleSideAction}
                    className={cn(
                        "h-[42px] px-5 shrink-0",
                        "font-semibold text-xs tracking-wider uppercase",
                        "bg-primary/10 hover:bg-primary/20 text-primary transition-colors",
                        "data-[pressed=true]:scale-95"
                    )}
                >
                    {t(sideAction.labelKey)}
                </Button>
            </div>
        );
    };

    const renderBlock = (
        block: SectionBlock,
        sectionIndex: number,
        blockIndex: number
    ) => {
        if (block.visible && !block.visible(config)) {
            return null;
        }

        const dependsOn = (block as BlockBase).dependsOn;
        const dependsDisabled = dependsOn && !(config[dependsOn] as boolean);

        switch (block.type) {
            case "switch-slider": {
                const value = config[block.sliderKey] as number;
                const sliderDisabled =
                    block.disabledWhenSwitchOff !== false
                        ? !(config[block.switchKey] as boolean)
                        : false;
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
                                onValueChange={(value) =>
                                    updateConfig(
                                        block.switchKey,
                                        value as SettingsConfig[ConfigKey]
                                    )
                                }
                            >
                                <span className="text-sm font-medium text-foreground/90">
                                    {t(block.labelKey)}
                                </span>
                            </Switch>
                            <div className="text-[11px] font-mono font-medium text-foreground/80 bg-content2 px-2 py-1 rounded-md min-w-[60px] text-center">
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
                            onChange={(value) =>
                                updateConfig(
                                    block.sliderKey,
                                    value as SettingsConfig[ConfigKey]
                                )
                            }
                            isDisabled={sliderDisabled}
                            color={block.color}
                            classNames={{
                                thumb: "shadow-small",
                            }}
                            className="opacity-90"
                        />
                    </div>
                );
            }

            case "switch": {
                return (
                    <div
                        key={`section-${sectionIndex}-block-${blockIndex}`}
                        className="flex justify-between items-center h-10"
                    >
                        <span
                            className={cn(
                                "text-sm font-medium text-foreground/80",
                                dependsDisabled && "opacity-40"
                            )}
                        >
                            {t(block.labelKey)}
                        </span>
                        <Switch
                            size="sm"
                            color={block.color}
                            isSelected={config[block.stateKey] as boolean}
                            onValueChange={(value) =>
                                updateConfig(
                                    block.stateKey,
                                    value as SettingsConfig[ConfigKey]
                                )
                            }
                        />
                    </div>
                );
            }

            case "input": {
                return renderInput(block, blockIndex);
            }

            case "input-pair": {
                const gridCols =
                    block.inputs.length === 1 ? "grid-cols-1" : "grid-cols-2";
                return (
                    <div
                        key={`section-${sectionIndex}-block-${blockIndex}`}
                        className={cn("grid gap-4", gridCols)}
                    >
                        {block.inputs.map((inputBlock, inputIndex) =>
                            renderInput(
                                inputBlock, // Already an InputBlock
                                inputIndex
                            )
                        )}
                    </div>
                );
            }

            case "day-selector": {
                const selectedMask = config.alt_speed_time_day;
                const toggleDay = (mask: number) => {
                    const nextValue =
                        selectedMask & mask
                            ? selectedMask & ~mask
                            : selectedMask | mask;
                    updateConfig("alt_speed_time_day", nextValue);
                };
                return (
                    <div
                        key={`section-${sectionIndex}-block-${blockIndex}`}
                        className="space-y-3"
                    >
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-foreground/70">
                                {t(block.labelKey)}
                            </span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {ALT_SPEED_DAY_OPTIONS.map((day) => {
                                const isSelected = Boolean(
                                    selectedMask & day.mask
                                );
                                return (
                                    <Button
                                        key={day.id}
                                        size="sm"
                                        variant={
                                            isSelected ? "shadow" : "light"
                                        }
                                        color={
                                            isSelected ? "primary" : undefined
                                        }
                                        onPress={() => toggleDay(day.mask)}
                                        className={cn(
                                            "uppercase tracking-[0.2em] text-[10px] h-8 px-3 min-w-0",
                                            isSelected
                                                ? "font-bold"
                                                : "text-foreground/60"
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

            case "select": {
                return (
                    <Select
                        key={`section-${sectionIndex}-block-${blockIndex}`}
                        label={t(block.labelKey)}
                        size="sm"
                        variant={block.variant ?? "bordered"}
                        selectedKeys={
                            config[block.stateKey] !== undefined
                                ? [String(config[block.stateKey])]
                                : []
                        }
                        classNames={{
                            trigger: "h-[42px]",
                            value: "text-sm font-medium",
                        }}
                        onSelectionChange={(keys) => {
                            const [next] = [...keys];
                            if (next) {
                                updateConfig(
                                    block.stateKey,
                                    next as SettingsConfig[ConfigKey]
                                );
                            }
                        }}
                    >
                        {block.options.map((option) => (
                            <SelectItem key={option.key}>
                                {t(option.labelKey)}
                            </SelectItem>
                        ))}
                    </Select>
                );
            }

            case "button-row": {
                return (
                    <div
                        key={`section-${sectionIndex}-block-${blockIndex}`}
                        className="flex"
                    >
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

            case "language": {
                return (
                    <div
                        key={`section-${sectionIndex}-block-${blockIndex}`}
                        className="flex items-center justify-between gap-4"
                    >
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

            case "raw-config": {
                return (
                    <div
                        key={`section-${sectionIndex}-block-${blockIndex}`}
                        className="space-y-3"
                    >
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
                                onPress={handleCopyConfigJson}
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

            case "divider": {
                return (
                    <Divider
                        key={`section-${sectionIndex}-block-${blockIndex}`}
                        className="my-3 opacity-50"
                    />
                );
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
                base: "glass-panel bg-content1/80 backdrop-blur-2xl border border-white/5 shadow-2xl flex flex-row h-[85vh] max-h-[800px] min-h-[500px] overflow-hidden rounded-2xl",
                wrapper: "overflow-hidden",
            }}
            motionProps={INTERACTION_CONFIG.modalBloom}
        >
            <ModalContent className="h-full flex flex-col p-0">
                <div className="flex flex-row flex-1 min-h-0 overflow-hidden relative">
                    {/* SIDEBAR - Responsive: Collapsible on mobile */}
                    <div
                        className={cn(
                            "flex flex-col border-r border-content1/20 bg-content1/50 backdrop-blur-xl transition-transform duration-300 absolute inset-y-0 left-0 z-20 w-full sm:w-64 sm:relative sm:translate-x-0",
                            !isMobileMenuOpen
                                ? "-translate-x-full"
                                : "translate-x-0"
                        )}
                    >
                        <div className="p-6 border-b border-content1/10 flex justify-between items-center h-16 shrink-0">
                            <h2 className="text-lg font-bold tracking-tight text-foreground">
                                {t("settings.modal.title")}
                            </h2>
                            <Button
                                isIconOnly
                                variant="light"
                                size="sm"
                                className="sm:hidden text-foreground/50"
                                onPress={onClose}
                            >
                                <X size={20} />
                            </Button>
                        </div>

                        <div className="flex-1 px-3 py-4 space-y-1 overflow-y-auto scrollbar-hide">
                            {SETTINGS_TABS.map((tab) => (
                                <button
                                    key={tab.id}
                                    onClick={() => {
                                        setActiveTab(tab.id);
                                        setIsMobileMenuOpen(false);
                                    }}
                                    className={cn(
                                        "w-full flex items-center gap-4 px-4 py-3 rounded-xl text-sm transition-all duration-200 group relative",
                                        activeTab === tab.id
                                            ? "bg-primary/10 text-primary font-semibold"
                                            : "text-foreground/60 hover:text-foreground hover:bg-content2/50 font-medium"
                                    )}
                                >
                                    <tab.icon
                                        size={20}
                                        strokeWidth={ICON_STROKE_WIDTH}
                                        className={cn(
                                            "shrink-0",
                                            activeTab === tab.id
                                                ? "text-primary"
                                                : "text-foreground/50"
                                        )}
                                    />
                                    <span>{t(tab.labelKey)}</span>
                                    {activeTab === tab.id && (
                                        <motion.div
                                            layoutId="activeTabIndicator"
                                            className="absolute left-0 top-3 bottom-3 w-1 bg-primary rounded-r-full"
                                        />
                                    )}
                                </button>
                            ))}
                        </div>
                        <div className="p-6 border-t border-content1/10 shrink-0">
                            <div className="text-[10px] text-foreground/30 font-mono tracking-widest">
                                {t("brand.version")}
                            </div>
                        </div>
                    </div>

                    {/* CONTENT AREA */}
                    <div className="flex-1 min-h-0 flex flex-col bg-content1/10 backdrop-blur-lg relative w-full">
                        {/* Header */}
                        <div className="sticky top-0 z-10 shrink-0 h-16 border-b border-content1/10 flex items-center justify-between px-6 bg-content1/30 backdrop-blur-xl">
                            <div className="flex items-center gap-3">
                                <Button
                                    isIconOnly
                                    variant="light"
                                    size="sm"
                                    className="sm:hidden -ml-2 text-foreground/50"
                                    onPress={() => setIsMobileMenuOpen(true)}
                                >
                                    <ChevronLeft size={22} />
                                </Button>
                                <div className="flex flex-col">
                                    <h1 className="text-base font-bold text-foreground">
                                        {t(activeTabDefinition.headerKey)}
                                    </h1>
                                    {hasUnsavedChanges && (
                                        <span className="text-[9px] uppercase tracking-[0.2em] font-bold text-warning animate-pulse">
                                            {t("settings.unsaved_changes")}
                                        </span>
                                    )}
                                </div>
                            </div>
                            <Button
                                isIconOnly
                                radius="full"
                                size="sm"
                                variant="light"
                                onPress={onClose}
                                className="text-foreground/40 hover:text-foreground hidden sm:flex"
                            >
                                <X size={20} />
                            </Button>
                        </div>

                        {/* Scrollable Content */}
                        <div className="flex-1 min-h-0 overflow-y-auto w-full p-4 sm:p-8 scrollbar-hide">
                            <AnimatePresence mode="wait">
                                <motion.div
                                    key={activeTabDefinition.id}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    transition={{ duration: 0.2 }}
                                    className="flex flex-col space-y-6 sm:space-y-8 pb-20"
                                >
                                    {activeTabDefinition.sections.map(
                                        (section, idx) => (
                                            <SectionCard key={idx}>
                                                <SectionTitle
                                                    title={t(section.titleKey)}
                                                />
                                                {section.descriptionKey && (
                                                    <SectionDescription
                                                        description={t(
                                                            section.descriptionKey
                                                        )}
                                                    />
                                                )}
                                                <div className="space-y-6 mt-4">
                                                    {section.blocks.map(
                                                        (block, bIdx) =>
                                                            renderBlock(
                                                                block,
                                                                idx,
                                                                bIdx
                                                            )
                                                    )}
                                                </div>
                                            </SectionCard>
                                        )
                                    )}
                                </motion.div>
                            </AnimatePresence>
                        </div>

                        {/* Footer Actions */}
                        <div className="sticky bottom-0 z-10 shrink-0 border-t border-content1/10 bg-content1/40 backdrop-blur-xl px-6 py-4 flex items-center justify-between">
                            <Button
                                size="sm"
                                variant="light"
                                color="danger"
                                className="opacity-70 hover:opacity-100 hidden sm:flex"
                                onPress={handleReset}
                                startContent={<RotateCcw size={16} />}
                            >
                                {t("settings.modal.footer.reset_defaults")}
                            </Button>
                            <div className="flex gap-3 ml-auto">
                                <Button
                                    size="md"
                                    variant="light"
                                    onPress={onClose}
                                >
                                    {t("settings.modal.footer.cancel")}
                                </Button>
                                <Button
                                    size="md"
                                    color="primary"
                                    variant="shadow"
                                    onPress={handleSave}
                                    isLoading={isSaving}
                                    startContent={
                                        !isSaving && <Save size={18} />
                                    }
                                    className="font-semibold shadow-lg shadow-primary/20"
                                >
                                    {t("settings.modal.footer.save")}
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            </ModalContent>

            <DirectoryPicker
                isOpen={Boolean(activeBrowseKey)}
                initialPath={pickerInitialPath}
                onClose={closeDirectoryPicker}
                onSelect={pickDirectory}
            />
        </Modal>
    );
}
