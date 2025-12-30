import { Button, Modal, ModalContent, cn } from "@heroui/react";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
    DEFAULT_SETTINGS_CONFIG,
    type ConfigKey,
    type SettingsConfig,
} from "@/modules/settings/data/config";
import { SETTINGS_TABS } from "@/modules/settings/data/settings-tabs";
import type {
    ButtonActionKey,
    SectionBlock,
    SettingsTab,
    SliderDefinition,
} from "@/modules/settings/data/settings-tabs";
import type { RpcStatus } from "@/shared/types/rpc";
import { ICON_STROKE_WIDTH } from "@/config/logic";
import { INTERACTION_CONFIG } from "@/config/logic";
import { APP_VERSION } from "@/shared/version";
import { ChevronLeft, RotateCcw, Save, X } from "lucide-react";
import { SettingsFormBuilder } from "@/modules/settings/components/SettingsFormBuilder";
import { ConnectionTabContent } from "@/modules/settings/components/tabs/connection/ConnectionTabContent";
import { SystemTabContent } from "@/modules/settings/components/tabs/system/SystemTabContent";
import { SettingsFormProvider } from "@/modules/settings/context/SettingsFormContext";
import { NativeShell } from "@/app/runtime";
import { GLASS_MODAL_SURFACE } from "@/shared/ui/layout/glass-surface";
import type { ServerClass } from "@/services/rpc/entities";

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialConfig: SettingsConfig;
    isSaving: boolean;
    onSave: (config: SettingsConfig) => Promise<void>;
    settingsLoadError?: boolean;
    onTestPort?: () => void;
    onRestoreInsights?: () => void;
    onReconnect: () => void;
    rpcStatus: RpcStatus;
    serverClass: ServerClass;
    isNativeMode: boolean;
}

export function SettingsModal({
    isOpen,
    onClose,
    initialConfig,
    isSaving,
    onSave,
    settingsLoadError,
    onTestPort,
    onRestoreInsights,
    onReconnect,
    rpcStatus,
    serverClass,
    isNativeMode,
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
    const jsonCopyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const configJson = useMemo(() => JSON.stringify(config, null, 2), [config]);

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

    useEffect(() => {
        return () => {
            if (jsonCopyTimerRef.current) {
                clearTimeout(jsonCopyTimerRef.current);
            }
        };
    }, []);

    const canBrowseDirectories = NativeShell.isAvailable;

    useEffect(() => {
        if (isOpen) {
            setConfig(initialConfig);
            setIsMobileMenuOpen(true);
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

    const sliderConstraints = useMemo<
        Partial<Record<ConfigKey, SliderDefinition>>
    >(() => {
        const entries: Partial<Record<ConfigKey, SliderDefinition>> = {};
        for (const tab of SETTINGS_TABS) {
            for (const section of tab.sections) {
                for (const block of section.blocks) {
                    if (block.type === "switch-slider") {
                        entries[block.sliderKey] = block.slider;
                    }
                }
            }
        }
        return entries;
    }, []);

    const updateConfig = useCallback(
        <K extends ConfigKey>(key: K, value: SettingsConfig[K]) => {
            const constraint = sliderConstraints[key];
            let nextValue = value;
            if (
                constraint &&
                typeof value === "number" &&
                Number.isFinite(value)
            ) {
                nextValue = Math.min(
                    Math.max(value, constraint.min),
                    constraint.max
                ) as SettingsConfig[K];
            }
            setConfig((prev) => ({ ...prev, [key]: nextValue }));
        },
        [sliderConstraints]
    );

    const buttonActions: Record<ButtonActionKey, () => void> = useMemo(
        () => ({
            testPort: () => void onTestPort?.(),
            restoreHud: () => onRestoreInsights?.(),
        }),
        [onRestoreInsights, onTestPort]
    );

    const handleBrowse = useCallback(
        async (key: ConfigKey) => {
            if (!canBrowseDirectories) return;
            try {
                const targetPath = String(config[key] ?? "");
                const selected = await NativeShell.browseDirectory(targetPath);
                if (selected) {
                    updateConfig(key, selected as SettingsConfig[ConfigKey]);
                }
            } catch {
                // Swallow native errors for now
            }
        },
        [canBrowseDirectories, config, updateConfig]
    );

    const hasUnsavedChanges = useMemo(() => {
        const configKeys = Object.keys(DEFAULT_SETTINGS_CONFIG) as ConfigKey[];
        return configKeys.some((key) => config[key] !== initialConfig[key]);
    }, [config, initialConfig]);

    const hasVisibleBlocks = useCallback(
        (blocks: SectionBlock[]) =>
            blocks.some((block) => !block.visible || block.visible(config)),
        [config]
    );

    const systemTabVisible = isNativeMode;

    const visibleTabs = useMemo(
        () =>
            SETTINGS_TABS.filter((tab) => {
                if (isNativeMode && tab.id === "connection") return false;
                if (tab.isCustom) {
                    if (tab.id === "system") {
                        return systemTabVisible;
                    }
                    return true;
                }
                return tab.sections.some((section) =>
                    hasVisibleBlocks(section.blocks)
                );
            }),
        [hasVisibleBlocks, systemTabVisible, isNativeMode]
    );

    const activeTabDefinition =
        visibleTabs.find((tab) => tab.id === activeTab) ??
        visibleTabs[0] ??
        SETTINGS_TABS[0];

    useEffect(() => {
        if (!visibleTabs.find((tab) => tab.id === activeTab)) {
            setActiveTab(visibleTabs[0]?.id ?? "speed");
        }
    }, [activeTab, visibleTabs]);

    const settingsFormContext = useMemo(
        () => ({
            config,
            updateConfig,
            buttonActions,
            canBrowseDirectories,
            onBrowse: handleBrowse,
            jsonCopyStatus,
            onCopyConfigJson: handleCopyConfigJson,
            configJson,
            rpcStatus,
            onReconnect,
        }),
        [
            buttonActions,
            canBrowseDirectories,
            config,
            configJson,
            handleBrowse,
            handleCopyConfigJson,
            jsonCopyStatus,
            onReconnect,
            rpcStatus,
            updateConfig,
        ]
    );
    return (
        <Modal
            isOpen={isOpen}
            onOpenChange={(open) => !open && onClose()}
            backdrop="blur"
            placement="center"
            size="5xl"
            hideCloseButton
            classNames={{
                base: cn(
                    GLASS_MODAL_SURFACE,
                    isNativeMode
                        ? "flex flex-row max-h-full max-w-full overflow-hidden"
                        : "flex flex-row h-settings max-h-settings min-h-settings overflow-hidden"
                ),
                wrapper: "overflow-hidden",
            }}
            motionProps={INTERACTION_CONFIG.modalBloom}
        >
            <ModalContent className="h-full flex flex-col ">
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
                        <div className="p-stage border-b border-content1/10 flex justify-between items-center h-modal-header shrink-0">
                            <h2 className="text-lg font-bold tracking-tight text-foreground">
                                {t("settings.modal.title")}
                            </h2>
                            <Button
                                isIconOnly
                                variant="shadow"
                                size="md"
                                className="sm:hidden text-foreground/50"
                                onPress={onClose}
                            >
                                <X
                                    style={{
                                        width: "var(--tt-icon-size)",
                                        height: "var(--tt-icon-size)",
                                    }}
                                />
                            </Button>
                        </div>

                        <div className="flex-1 px-panel py-panel space-y-tight overflow-y-auto scrollbar-hide">
                            {visibleTabs.map((tab) => (
                                <button
                                    key={tab.id}
                                    onClick={() => {
                                        setActiveTab(tab.id);
                                        setIsMobileMenuOpen(false);
                                    }}
                                    className={cn(
                                        "w-full flex items-center gap-panel px-panel py-panel rounded-xl text-scaled transition-all duration-200 group relative",
                                        activeTab === tab.id
                                            ? "bg-primary/10 text-primary font-semibold"
                                            : "text-foreground/60 hover:text-foreground hover:bg-content2/50 font-medium"
                                    )}
                                >
                                    <tab.icon
                                        strokeWidth={ICON_STROKE_WIDTH}
                                        className={cn(
                                            "shrink-0",
                                            activeTab === tab.id
                                                ? "text-primary"
                                                : "text-foreground/50"
                                        )}
                                        style={{
                                            width: "var(--tt-icon-size)",
                                            height: "var(--tt-icon-size)",
                                        }}
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
                        <div className="p-panel border-t border-content1/10 shrink-0">
                            <div className="text-scaled text-foreground/30 font-mono tracking-widest">
                                {t("brand.version", { version: APP_VERSION })}
                            </div>
                        </div>
                    </div>

                    {/* CONTENT AREA */}
                    <div className="flex-1 min-h-0 flex flex-col bg-content1/10 backdrop-blur-lg relative w-full">
                        {/* Header */}
                        <div className="sticky top-0 z-10 shrink-0 h-modal-header border-b border-content1/10 flex items-center justify-between px-stage bg-content1/30 backdrop-blur-xl">
                            <div className="flex items-center gap-tools">
                                <Button
                                    isIconOnly
                                    variant="shadow"
                                    size="md"
                                    className="sm:hidden -ml-tight text-foreground/50"
                                    onPress={() => setIsMobileMenuOpen(true)}
                                >
                                    <ChevronLeft
                                        style={{
                                            width: "var(--tt-icon-size)",
                                            height: "var(--tt-icon-size)",
                                        }}
                                    />
                                </Button>
                                <div className="flex flex-col">
                                    <h1 className="text-base font-bold text-foreground">
                                        {t(activeTabDefinition.headerKey)}
                                    </h1>
                                    {hasUnsavedChanges && (
                                        <span
                                            className="text-scaled uppercase font-bold text-warning animate-pulse"
                                            style={{
                                                letterSpacing:
                                                    "var(--tt-tracking-wide)",
                                            }}
                                        >
                                            {t("settings.unsaved_changes")}
                                        </span>
                                    )}
                                </div>
                            </div>
                            <Button
                                isIconOnly
                                radius="full"
                                size="md"
                                variant="shadow"
                                onPress={onClose}
                                className="text-foreground/40 hover:text-foreground hidden sm:flex"
                            >
                                <X
                                    style={{
                                        width: "var(--tt-icon-size)",
                                        height: "var(--tt-icon-size)",
                                    }}
                                />
                            </Button>
                        </div>

                        {/* Scrollable Content */}
                        <div className="flex-1 min-h-0 overflow-y-auto w-full p-panel sm:p-8 scrollbar-hide">
                            <AnimatePresence mode="wait">
                                <motion.div
                                    key={activeTabDefinition.id}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    transition={{ duration: 0.2 }}
                                    className="flex flex-col space-y-stage sm:space-y-stage pb-stage"
                                >
                                    {settingsLoadError && (
                                        <div className="rounded-xl border border-warning/30 bg-warning/10 px-panel py-tight text-label text-warning">
                                            {t("settings.load_error")}
                                        </div>
                                    )}
                                    <SettingsFormProvider
                                        value={settingsFormContext}
                                    >
                                        {activeTabDefinition.id ===
                                        "connection" ? (
                                            <ConnectionTabContent
                                                serverClass={serverClass}
                                                isNativeMode={isNativeMode}
                                            />
                                        ) : activeTabDefinition.id ===
                                          "system" ? (
                                            <SystemTabContent
                                                isNativeMode={isNativeMode}
                                            />
                                        ) : (
                                            <SettingsFormBuilder
                                                tab={activeTabDefinition}
                                            />
                                        )}
                                    </SettingsFormProvider>
                                </motion.div>
                            </AnimatePresence>
                        </div>

                        {/* Footer Actions */}
                        <div className="sticky bottom-0 z-10 shrink-0 border-t border-content1/10 bg-content1/40 backdrop-blur-xl px-stage py-stage flex items-center justify-between">
                            <Button
                                size="md"
                                variant="shadow"
                                color="danger"
                                className="opacity-70 hover:opacity-100 hidden sm:flex"
                                onPress={handleReset}
                                startContent={
                                    <RotateCcw
                                        style={{
                                            width: "var(--tt-icon-size)",
                                            height: "var(--tt-icon-size)",
                                        }}
                                    />
                                }
                            >
                                {t("settings.modal.footer.reset_defaults")}
                            </Button>
                            <div className="flex gap-tools ml-auto">
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
                                        !isSaving && (
                                            <Save
                                                style={{
                                                    width: "var(--tt-icon-size)",
                                                    height: "var(--tt-icon-size)",
                                                }}
                                            />
                                        )
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

        </Modal>
    );
}
