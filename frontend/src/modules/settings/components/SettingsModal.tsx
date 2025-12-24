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
import type { EngineAdapter } from "@/services/rpc/engine-adapter";
import type {
    SystemInstallOptions,
    SystemInstallResult,
} from "@/services/rpc/types";
import type { RpcStatus } from "@/shared/types/rpc";
import type {
    AutorunStatus,
    SystemHandlerStatus,
} from "@/services/rpc/entities";
import { ICON_STROKE_WIDTH } from "@/config/logic";
import Runtime from "@/app/runtime";
import { INTERACTION_CONFIG } from "@/config/logic";
import { DirectoryPicker } from "@/shared/ui/workspace/DirectoryPicker";
import { APP_VERSION } from "@/shared/version";
import { ChevronLeft, RotateCcw, Save, X } from "lucide-react";
import { SettingsFormBuilder } from "@/modules/settings/components/SettingsFormBuilder";
import { ConnectionTabContent } from "@/modules/settings/components/tabs/connection/ConnectionTabContent";
import { SystemTabContent } from "@/modules/settings/components/tabs/system/SystemTabContent";
import { useAsyncToggle } from "@/modules/settings/hooks/useAsyncToggle";
import { SettingsFormProvider } from "@/modules/settings/context/SettingsFormContext";
import { useRpcExtension } from "@/app/context/RpcExtensionContext";
import { GLASS_MODAL_SURFACE } from "@/shared/ui/layout/glass-surface";

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialConfig: SettingsConfig;
    isSaving: boolean;
    onSave: (config: SettingsConfig) => Promise<void>;
    settingsLoadError?: boolean;
    onTestPort?: () => void;
    onRestoreInsights?: () => void;
    onSystemInstall?: (
        options: SystemInstallOptions
    ) => Promise<SystemInstallResult>;
    onReconnect: () => void;
    rpcStatus: RpcStatus;
    torrentClient: EngineAdapter;
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
    onSystemInstall,
    onReconnect,
    rpcStatus,
    torrentClient,
}: SettingsModalProps) {
    const { t } = useTranslation();
    const [activeTab, setActiveTab] = useState<SettingsTab>("speed");
    const [autorunInfo, setAutorunInfo] = useState<AutorunStatus | null>(null);
    const [isAutorunLoading, setIsAutorunLoading] = useState(true);
    const [mockAutorunEnabled, setMockAutorunEnabled] = useState(false);
    const [autorunDisplayEnabled, setAutorunDisplayEnabled] = useState(false);
    const [handlerInfo, setHandlerInfo] = useState<SystemHandlerStatus | null>(
        null
    );
    const [isHandlerLoading, setIsHandlerLoading] = useState(true);
    const [mockHandlerEnabled, setMockHandlerEnabled] = useState(false);
    const [handlerDisplayEnabled, setHandlerDisplayEnabled] = useState(false);

    // Responsive State
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(true);

    const [config, setConfig] = useState<SettingsConfig>(() => ({
        ...initialConfig,
    }));

    const [jsonCopyStatus, setJsonCopyStatus] = useState<"idle" | "copied">(
        "idle"
    );
    const jsonCopyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const mockAutorunTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
        null
    );
    const mockHandlerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
        null
    );

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
            if (mockAutorunTimerRef.current) {
                clearTimeout(mockAutorunTimerRef.current);
            }
            if (mockHandlerTimerRef.current) {
                clearTimeout(mockHandlerTimerRef.current);
            }
        };
    }, []);

    const [activeBrowseKey, setActiveBrowseKey] = useState<ConfigKey | null>(
        null
    );

    const {
        capabilities: extensionCapabilities,
        shouldUseExtension,
        isMocked,
        enabled: extensionModeEnabled,
    } = useRpcExtension();
    const canUseExtensionHelpers = shouldUseExtension || isMocked;

    const systemInstallFeatureAvailable =
        shouldUseExtension &&
        Boolean(extensionCapabilities?.features?.includes("system-install"));
    const systemHandlerFeatureAvailable =
        shouldUseExtension &&
        Boolean(
            extensionCapabilities?.features?.includes(
                "system-handler-status"
            ) ||
                (extensionCapabilities?.features?.includes(
                    "system-handler-enable"
                ) &&
                    extensionCapabilities?.features?.includes(
                        "system-handler-disable"
                    )) ||
                extensionCapabilities?.features?.includes(
                    "system-register-handler"
                )
        );
    const systemIntegrationFeatureAvailable =
        systemInstallFeatureAvailable ||
        systemHandlerFeatureAvailable ||
        Boolean(extensionCapabilities?.features?.includes("system-autorun"));
    const supportsFsBrowse = canUseExtensionHelpers;
    const canBrowseDirectories = supportsFsBrowse;

    useEffect(() => {
        if (!canUseExtensionHelpers && activeBrowseKey) {
            setActiveBrowseKey(null);
        }
    }, [activeBrowseKey, canUseExtensionHelpers]);

    useEffect(() => {
        if (!extensionModeEnabled) {
            setMockAutorunEnabled(false);
            setMockHandlerEnabled(false);
        }
    }, [extensionModeEnabled]);

    useEffect(() => {
        if (isOpen) {
            setConfig(initialConfig);
            setIsMobileMenuOpen(true);
        }
    }, [initialConfig, isOpen]);

    useEffect(() => {
        if (!isOpen) {
            setActiveBrowseKey(null);
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

    const openDirectoryPicker = useCallback((key: ConfigKey) => {
        setActiveBrowseKey(key);
    }, []);
    const closeDirectoryPicker = useCallback(() => {
        setActiveBrowseKey(null);
    }, []);
    const pickDirectory = useCallback(
        (path: string) => {
            if (!activeBrowseKey) return;
            updateConfig(activeBrowseKey, path as SettingsConfig[ConfigKey]);
            closeDirectoryPicker();
        },
        [activeBrowseKey, closeDirectoryPicker, updateConfig]
    );

    const pickerInitialPath =
        activeBrowseKey && (config[activeBrowseKey] as string)
            ? (config[activeBrowseKey] as string)
            : "";

    const hasUnsavedChanges = useMemo(() => {
        const configKeys = Object.keys(DEFAULT_SETTINGS_CONFIG) as ConfigKey[];
        return configKeys.some((key) => config[key] !== initialConfig[key]);
    }, [config, initialConfig]);

    const fetchAutorunStatus = useCallback(async () => {
        if (!extensionModeEnabled) {
            setAutorunInfo(null);
            setIsAutorunLoading(false);
            return;
        }
        if (rpcStatus !== "connected") {
            setAutorunInfo(null);
            setIsAutorunLoading(false);
            return;
        }
        if (!shouldUseExtension || !torrentClient.getSystemAutorunStatus) {
            setAutorunInfo({
                enabled: false,
                supported: false,
                requiresElevation: false,
            });
            setIsAutorunLoading(false);
            return;
        }
        setIsAutorunLoading(true);
        try {
            const info = await torrentClient.getSystemAutorunStatus();
            setAutorunInfo(info);
        } catch {
            setAutorunInfo(null);
        } finally {
            setIsAutorunLoading(false);
        }
    }, [extensionModeEnabled, rpcStatus, shouldUseExtension, torrentClient]);

    const fetchHandlerStatus = useCallback(async () => {
        if (!extensionModeEnabled) {
            setHandlerInfo(null);
            setIsHandlerLoading(false);
            return;
        }
        if (rpcStatus !== "connected") {
            setHandlerInfo(null);
            setIsHandlerLoading(false);
            return;
        }
        if (
            !shouldUseExtension ||
            !systemHandlerFeatureAvailable ||
            !torrentClient.getSystemHandlerStatus
        ) {
            setHandlerInfo({
                registered: false,
                supported: false,
                requiresElevation: false,
            });
            setIsHandlerLoading(false);
            return;
        }
        setIsHandlerLoading(true);
        try {
            const info = await torrentClient.getSystemHandlerStatus();
            setHandlerInfo(info);
        } catch {
            setHandlerInfo(null);
        } finally {
            setIsHandlerLoading(false);
        }
    }, [
        extensionModeEnabled,
        rpcStatus,
        shouldUseExtension,
        systemHandlerFeatureAvailable,
        torrentClient,
    ]);

    useEffect(() => {
        if (!isOpen) {
            return;
        }
        void fetchAutorunStatus();
        void fetchHandlerStatus();
    }, [fetchAutorunStatus, fetchHandlerStatus, isOpen]);

    const remoteAutorunEnabled = Boolean(autorunInfo?.enabled);
    const autorunSupported = Boolean(
        autorunInfo?.supported &&
            torrentClient.systemAutorunEnable &&
            torrentClient.systemAutorunDisable
    );
    const remoteHandlerEnabled = Boolean(handlerInfo?.registered);
    const handlerSupported = Boolean(
        handlerInfo?.supported &&
            torrentClient.systemHandlerEnable &&
            torrentClient.systemHandlerDisable
    );

    useEffect(() => {
        setAutorunDisplayEnabled(
            autorunSupported ? remoteAutorunEnabled : mockAutorunEnabled
        );
    }, [autorunSupported, mockAutorunEnabled, remoteAutorunEnabled]);

    useEffect(() => {
        setHandlerDisplayEnabled(
            handlerSupported ? remoteHandlerEnabled : mockHandlerEnabled
        );
    }, [handlerSupported, mockHandlerEnabled, remoteHandlerEnabled]);

    const hasVisibleBlocks = useCallback(
        (blocks: SectionBlock[]) =>
            blocks.some((block) => !block.visible || block.visible(config)),
        [config]
    );

    const systemTabVisible =
        extensionModeEnabled && (isMocked || systemIntegrationFeatureAvailable);

    const visibleTabs = useMemo(
        () =>
            SETTINGS_TABS.filter((tab) => {
                if (!Runtime.allowEditingProfiles() && tab.id === "connection")
                    return false;
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
        [hasVisibleBlocks, systemTabVisible]
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

    const handleAutorunToggle = useCallback(
        async (next: boolean) => {
            if (
                !extensionModeEnabled ||
                rpcStatus !== "connected" ||
                isAutorunLoading
            ) {
                throw new Error("Autorun unavailable");
            }
            if (autorunSupported) {
                if (next) {
                    await torrentClient.systemAutorunEnable?.();
                } else {
                    await torrentClient.systemAutorunDisable?.();
                }
                await fetchAutorunStatus();
                return;
            }
            if (mockAutorunTimerRef.current) {
                clearTimeout(mockAutorunTimerRef.current);
            }
            await new Promise<void>((resolve) => {
                mockAutorunTimerRef.current = window.setTimeout(resolve, 280);
            });
            setMockAutorunEnabled(next);
            mockAutorunTimerRef.current = null;
        },
        [
            autorunSupported,
            extensionModeEnabled,
            fetchAutorunStatus,
            isAutorunLoading,
            rpcStatus,
            torrentClient,
        ]
    );

    const handleHandlerToggle = useCallback(
        async (next: boolean) => {
            if (
                !extensionModeEnabled ||
                rpcStatus !== "connected" ||
                isHandlerLoading
            ) {
                throw new Error("System handlers unavailable");
            }
            if (handlerSupported) {
                if (next) {
                    await torrentClient.systemHandlerEnable?.();
                } else {
                    await torrentClient.systemHandlerDisable?.();
                }
                await fetchHandlerStatus();
                return;
            }
            if (mockHandlerTimerRef.current) {
                clearTimeout(mockHandlerTimerRef.current);
            }
            await new Promise<void>((resolve) => {
                mockHandlerTimerRef.current = window.setTimeout(resolve, 280);
            });
            setMockHandlerEnabled(next);
            mockHandlerTimerRef.current = null;
        },
        [
            extensionModeEnabled,
            fetchHandlerStatus,
            handlerSupported,
            isHandlerLoading,
            rpcStatus,
            torrentClient,
        ]
    );

    const autorunToggle = useAsyncToggle(
        autorunDisplayEnabled,
        setAutorunDisplayEnabled,
        handleAutorunToggle
    );
    const handlerToggle = useAsyncToggle(
        handlerDisplayEnabled,
        setHandlerDisplayEnabled,
        handleHandlerToggle
    );
    const autorunDisabled =
        !extensionModeEnabled ||
        rpcStatus !== "connected" ||
        isAutorunLoading ||
        autorunToggle.pending;
    const handlerDisabled =
        !extensionModeEnabled ||
        rpcStatus !== "connected" ||
        isHandlerLoading ||
        handlerToggle.pending;

    const settingsFormContext = useMemo(
        () => ({
            config,
            updateConfig,
            buttonActions,
            canBrowseDirectories,
            onBrowse: openDirectoryPicker,
            autorunSwitch: {
                isSelected: autorunDisplayEnabled,
                isDisabled: autorunDisabled,
                onChange: autorunToggle.onChange,
            },
            handlerSwitch: {
                isSelected: handlerDisplayEnabled,
                isDisabled: handlerDisabled,
                onChange: handlerToggle.onChange,
            },
            handlerRequiresElevation: Boolean(handlerInfo?.requiresElevation),
            extensionModeEnabled,
            isMocked,
            onSystemInstall,
            systemInstallFeatureAvailable,
            jsonCopyStatus,
            onCopyConfigJson: handleCopyConfigJson,
            configJson,
            rpcStatus,
            onReconnect,
        }),
        [
            autorunDisabled,
            autorunDisplayEnabled,
            autorunToggle.onChange,
            handlerDisabled,
            handlerDisplayEnabled,
            handlerToggle.onChange,
            handlerInfo?.requiresElevation,
            buttonActions,
            canBrowseDirectories,
            config,
            configJson,
            extensionModeEnabled,
            handleCopyConfigJson,
            isMocked,
            jsonCopyStatus,
            onReconnect,
            onSystemInstall,
            openDirectoryPicker,
            rpcStatus,
            systemInstallFeatureAvailable,
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
                    "flex flex-row h-[length:calc(200*var(--u)*var(--z))] max-h-[length:calc(200*var(--u)*var(--z))] min-h-[length:calc(125*var(--u)*var(--z))] overflow-hidden"
                ),
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
                            {visibleTabs.map((tab) => (
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
                            <div className="text-[length:var(--fz-scaled)] text-foreground/30 font-mono tracking-widest">
                                {t("brand.version", { version: APP_VERSION })}
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
                                        <span className="text-[length:var(--fz-scaled)] uppercase tracking-[0.2em] font-bold text-warning animate-pulse">
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
                                    {settingsLoadError && (
                                        <div className="rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
                                            {t("settings.load_error")}
                                        </div>
                                    )}
                                    <SettingsFormProvider
                                        value={settingsFormContext}
                                    >
                                        {activeTabDefinition.id ===
                                        "connection" ? (
                                            <ConnectionTabContent />
                                        ) : activeTabDefinition.id ===
                                          "system" ? (
                                            <SystemTabContent />
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

            {canUseExtensionHelpers && (
                <DirectoryPicker
                    isOpen={Boolean(activeBrowseKey)}
                    initialPath={pickerInitialPath}
                    onClose={closeDirectoryPicker}
                    onSelect={pickDirectory}
                />
            )}
        </Modal>
    );
}
