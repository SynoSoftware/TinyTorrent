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
import {
    CLIPBOARD_BADGE_DURATION_MS,
    ICON_STROKE_WIDTH,
    INTERACTION_CONFIG,
} from "@/config/logic";
import { APP_VERSION } from "@/shared/version";
import { ChevronLeft, RotateCcw, Save, X } from "lucide-react";
import { SettingsFormBuilder } from "@/modules/settings/components/SettingsFormBuilder";
import { ConnectionTabContent } from "@/modules/settings/components/tabs/connection/ConnectionTabContent";
import { SystemTabContent } from "@/modules/settings/components/tabs/system/SystemTabContent";
import { SettingsFormProvider } from "@/modules/settings/context/SettingsFormContext";
import { useShellAgent } from "@/app/hooks/useShellAgent";
import { GLASS_MODAL_SURFACE } from "@/shared/ui/layout/glass-surface";
import { ToolbarIconButton } from "@/shared/ui/layout/toolbar-button";
import type { ServerClass } from "@/services/rpc/entities";
import { InterfaceTabContent } from "@/modules/settings/components/InterfaceTabContent";
import { useRecoveryContext } from "@/app/context/RecoveryContext";
// TODO: Settings must NOT decide capabilities by probing transport/daemon types. It must read a single capability/locality source of truth (from a provider) and render accordingly.
// TODO: With “RPC extensions: NONE”:
// TODO: - There is no “TinyTorrent server” mode, no websocket mode, no `tt-get-capabilities`, and no `X-TT-Auth` token flow.
// TODO: - The only engine is `transmission-daemon` (Transmission RPC).
// TODO: - “NativeShell present + connected to localhost” means *ShellAgent/ShellExtensions available*, not a different daemon/server class.
// TODO: Replace direct NativeShell calls (persist window state, browseDirectory) with the ShellAgent/ShellExtensions adapter; adapter enforces locality (localhost only).
// TODO: Remove `serverClass` from SettingsModal props once capability/locality context is introduced; Settings should not receive “tinytorrent/transmission” variants.

type LiveUserPreferencePatch = Partial<
    Pick<
        SettingsConfig,
        "refresh_interval_ms" | "request_timeout_ms" | "table_watermark_enabled"
    >
>;

type SaveableSettingsConfig = Omit<
    SettingsConfig,
    keyof LiveUserPreferencePatch
>;

const stripLivePreferences = (
    config: SettingsConfig
): SaveableSettingsConfig => {
    const {
        refresh_interval_ms: _refreshIntervalMs,
        request_timeout_ms: _requestTimeoutMs,
        table_watermark_enabled: _tableWatermarkEnabled,
        ...rest
    } = config;
    return rest;
};

const configsAreEqual = (a: SettingsConfig, b: SettingsConfig) =>
    JSON.stringify(stripLivePreferences(a)) ===
    JSON.stringify(stripLivePreferences(b));

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialConfig: SettingsConfig;
    isSaving: boolean;
    onSave: (config: SettingsConfig) => Promise<void>;
    settingsLoadError?: boolean;
    onTestPort?: () => void;
    onRestoreInsights?: () => void;
    onToggleWorkspaceStyle?: () => void;
    onReconnect: () => void;
    serverClass: ServerClass;
    isNativeMode: boolean;
    isImmersive?: boolean;
    hasDismissedInsights: boolean;
    onApplyUserPreferencesPatch?: (patch: LiveUserPreferencePatch) => void;
}

type ModalFeedback = {
    type: "error" | "success";
    text: string;
};

export function SettingsModal({
    isOpen,
    onClose,
    initialConfig,
    isSaving,
    onSave,
    settingsLoadError,
    onTestPort,
    onRestoreInsights,
    onToggleWorkspaceStyle,
    onReconnect,
    serverClass,
    isNativeMode,
    isImmersive,
    hasDismissedInsights,
    onApplyUserPreferencesPatch,
}: SettingsModalProps) {
    const { t } = useTranslation();
    const [activeTab, setActiveTab] = useState<SettingsTab>("speed");

    // Responsive State
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(true);

    const safeInitialConfig = useMemo(
        () => initialConfig ?? DEFAULT_SETTINGS_CONFIG,
        [initialConfig]
    );

    const [config, setConfig] = useState<SettingsConfig>(() => ({
        ...safeInitialConfig,
    }));

    const openedConfigRef = useRef<SettingsConfig>({ ...safeInitialConfig });
    const wasOpenRef = useRef(false);

    const { connectionMode } = useRecoveryContext();
    const [modalFeedback, setModalFeedback] = useState<ModalFeedback | null>(
        null
    );

    const hasNativeShellBridge =
        connectionMode === "tinytorrent-local-shell";
    // TODO: Replace `connectionMode` checks with `uiMode = Full | Rpc`.
    // TODO: Settings should not know about tinytorrent-local-shell naming; it should read `uiMode` from the Session+UiMode provider and derive:
    // TODO: - `effectiveNativeMode = isNativeMode && uiMode === "Full"`
    // TODO: - `canBrowseDirectories = uiMode === "Full"`
    const [jsonCopyStatus, setJsonCopyStatus] = useState<
        "idle" | "copied" | "failed"
    >("idle");
    const jsonCopyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const configJson = useMemo(() => JSON.stringify(config, null, 2), [config]);

    const handleCopyConfigJson = useCallback(async () => {
        if (typeof navigator === "undefined" || !navigator.clipboard) return;
        let nextStatus: "copied" | "failed" = "copied";
        try {
            await navigator.clipboard.writeText(configJson);
        } catch {
            nextStatus = "failed";
        }
        setJsonCopyStatus(nextStatus);
        if (jsonCopyTimerRef.current) {
            clearTimeout(jsonCopyTimerRef.current);
        }
        jsonCopyTimerRef.current = window.setTimeout(() => {
            setJsonCopyStatus("idle");
        }, CLIPBOARD_BADGE_DURATION_MS);
    }, [configJson]);

    useEffect(() => {
        return () => {
            if (jsonCopyTimerRef.current) {
                clearTimeout(jsonCopyTimerRef.current);
            }
        };
    }, []);

    const effectiveNativeMode = isNativeMode && hasNativeShellBridge;
    const canBrowseDirectories = hasNativeShellBridge;

    const hasSaveableEdits = useMemo(
        () => !configsAreEqual(config, openedConfigRef.current),
        [config]
    );

    useEffect(() => {
        if (!isOpen) {
            wasOpenRef.current = false;
            return;
        }

        if (!wasOpenRef.current) {
            wasOpenRef.current = true;
            openedConfigRef.current = { ...safeInitialConfig };
            setConfig({ ...safeInitialConfig });
            setModalFeedback(null);
            setJsonCopyStatus("idle");
            setIsMobileMenuOpen(true);
        }
    }, [isOpen, safeInitialConfig]);

    useEffect(() => {
        if (!isOpen) {
            return;
        }
        // If the backing config updates while the modal is open (e.g. initial load),
        // sync only when the user hasn't started editing saveable settings.
        if (!hasSaveableEdits) {
            openedConfigRef.current = { ...safeInitialConfig };
            setConfig({ ...safeInitialConfig });
        }
    }, [hasSaveableEdits, isOpen, safeInitialConfig]);

    useEffect(() => {
        if (!isOpen) {
            setModalFeedback(null);
            setJsonCopyStatus("idle");
        }
    }, [isOpen]);

    const persistWindowState = useCallback(async () => {
        if (!hasNativeShellBridge) return;
        try {
            await NativeShell.request("persist-window-state");
        } catch {
            setModalFeedback({
                type: "error",
                text: t("settings.modal.error_window_state"),
            });
        }
    }, [t]);

    const handleSave = useCallback(async () => {
        await persistWindowState();
        try {
            await onSave(config);
            setModalFeedback(null);
            onClose();
        } catch (error) {
            const message =
                typeof error === "object" &&
                error !== null &&
                "message" in error &&
                typeof (error as { message?: unknown }).message === "string"
                    ? (error as { message: string }).message
                    : t("settings.modal.error_save");
            setModalFeedback({ type: "error", text: message });
        }
    }, [config, onSave, onClose, persistWindowState, t]);

    const handleReset = () => {
        const next: SettingsConfig = { ...DEFAULT_SETTINGS_CONFIG };
        setConfig(next);
        onApplyUserPreferencesPatch?.({
            refresh_interval_ms: next.refresh_interval_ms,
            request_timeout_ms: next.request_timeout_ms,
            table_watermark_enabled: next.table_watermark_enabled,
        });
        setModalFeedback(null);
    };

    const runAction = useCallback(
        (
            action: (() => void | Promise<void>) | undefined,
            messageKey: string
        ) => {
            return () => {
                if (!action) return;
                void (async () => {
                    try {
                        await action();
                        setModalFeedback(null);
                    } catch {
                        setModalFeedback({
                            type: "error",
                            text: t(messageKey),
                        });
                    }
                })();
            };
        },
        [t]
    );

    const buttonActions: Record<ButtonActionKey, () => void> = useMemo(
        () => ({
            testPort: runAction(
                () => onTestPort?.(),
                "settings.modal.error_test_port"
            ),
            restoreHud: runAction(
                () => onRestoreInsights?.(),
                "settings.modal.error_restore"
            ),
        }),
        [onRestoreInsights, onTestPort, runAction]
    );

    const safeReconnect = useMemo(
        () => runAction(() => onReconnect(), "settings.modal.error_reconnect"),
        [onReconnect, runAction]
    );

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

            if (
                key === "table_watermark_enabled" &&
                typeof nextValue === "boolean"
            ) {
                onApplyUserPreferencesPatch?.({
                    table_watermark_enabled: nextValue,
                });
            }
            if (
                key === "refresh_interval_ms" &&
                typeof nextValue === "number"
            ) {
                onApplyUserPreferencesPatch?.({
                    refresh_interval_ms: nextValue,
                });
            }
            if (key === "request_timeout_ms" && typeof nextValue === "number") {
                onApplyUserPreferencesPatch?.({
                    request_timeout_ms: nextValue,
                });
            }
        },
        [onApplyUserPreferencesPatch, sliderConstraints]
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
                setModalFeedback({
                    type: "error",
                    text: t("settings.modal.error_browse"),
                });
            }
        },
        [canBrowseDirectories, config, updateConfig, t]
    );

    const hasUnsavedChanges = hasSaveableEdits;

    const hasVisibleBlocks = useCallback(
        (blocks: SectionBlock[]) =>
            blocks.some((block) => !block.visible || block.visible(config)),
        [config]
    );

    const systemTabVisible = hasNativeShellBridge;

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

    const safeVisibleTabs = visibleTabs.length
        ? visibleTabs
        : [SETTINGS_TABS[0]];
    const tabsFallbackActive = visibleTabs.length === 0;

    const activeTabDefinition =
        safeVisibleTabs.find((tab) => tab.id === activeTab) ??
        safeVisibleTabs[0];

    useEffect(() => {
        if (!safeVisibleTabs.find((tab) => tab.id === activeTab)) {
            setActiveTab(safeVisibleTabs[0]?.id ?? "speed");
        }
    }, [activeTab, safeVisibleTabs]);

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
            onReconnect: safeReconnect,
            isImmersive: Boolean(isImmersive),
        }),
        [
            buttonActions,
            canBrowseDirectories,
            config,
            configJson,
            handleBrowse,
            handleCopyConfigJson,
            jsonCopyStatus,
            safeReconnect,
            updateConfig,
            isImmersive,
        ]
    );
    return (
        <Modal
            isOpen={isOpen}
            onOpenChange={(open) => !open && !isSaving && onClose()}
            backdrop="blur"
            placement="center"
            size="5xl"
            hideCloseButton
            classNames={{
                base: cn(
                    GLASS_MODAL_SURFACE,
                    isNativeMode
                        ? "flex flex-row max-h-full max-w-full overflow-hidden"
                        : "flex flex-row h-[var(--tt-modal-settings-h)] max-h-[var(--tt-modal-settings-h)] min-h-[var(--tt-modal-settings-min-h)] overflow-hidden"
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
                            <h2 className="font-bold tracking-tight text-foreground tt-navbar-tab-font">
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
                                    strokeWidth={ICON_STROKE_WIDTH}
                                    className="toolbar-icon-size-md"
                                />
                            </Button>
                        </div>

                        <div className="flex-1 px-panel py-panel space-y-tight overflow-y-auto scrollbar-hide">
                            {safeVisibleTabs.map((tab) => (
                                <button
                                    key={tab.id}
                                    onClick={() => {
                                        setActiveTab(tab.id);
                                        setIsMobileMenuOpen(false);
                                    }}
                                    className={cn(
                                        "w-full flex items-center gap-panel px-panel py-panel rounded-xl transition-all duration-200 group relative",
                                        activeTab === tab.id
                                            ? "bg-primary/10 text-primary font-semibold"
                                            : "text-foreground/60 hover:text-foreground hover:bg-content2/50 font-medium"
                                    )}
                                    style={{
                                        fontSize: "var(--icon)",
                                    }}
                                >
                                    <tab.icon
                                        strokeWidth={ICON_STROKE_WIDTH}
                                        className={cn(
                                            "shrink-0 toolbar-icon-size-md",
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
                                    <ChevronLeft className="toolbar-icon-size-md" />
                                </Button>
                                <div className="flex flex-col">
                                    <h1 className="font-bold text-foreground tt-navbar-tab-font">
                                        {t(activeTabDefinition.headerKey)}
                                    </h1>
                                    {hasUnsavedChanges && (
                                        <span className="text-scaled uppercase font-bold text-warning animate-pulse tracking-0-2">
                                            {t("settings.unsaved_changes")}
                                        </span>
                                    )}
                                </div>
                            </div>
                            <ToolbarIconButton
                                Icon={X}
                                ariaLabel={t("torrent_modal.actions.close")}
                                onPress={onClose}
                                iconSize="lg"
                                className="text-foreground/40 hover:text-foreground hidden sm:flex"
                            />
                        </div>

                        {/* Scrollable Content */}
                        <div className="flex-1 min-h-0 overflow-y-auto w-full p-panel sm:p-stage scrollbar-hide">
                            {tabsFallbackActive && (
                                <div className="rounded-xl border border-warning/30 bg-warning/10 px-panel py-tight text-label text-warning mb-panel">
                                    {t("settings.modal.error_no_tabs")}
                                </div>
                            )}
                            {modalFeedback && (
                                <div
                                    className={cn(
                                        "rounded-xl border px-panel py-tight text-label mb-panel",
                                        modalFeedback.type === "error"
                                            ? "border-danger/40 bg-danger/5 text-danger"
                                            : "border-success/40 bg-success/10 text-success"
                                    )}
                                >
                                    {modalFeedback.text}
                                </div>
                            )}
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
                                            isNativeMode={effectiveNativeMode}
                                        />
                                        ) : activeTabDefinition.id === "gui" ? (
                                            <InterfaceTabContent
                                                isImmersive={Boolean(
                                                    isImmersive
                                                )}
                                                onToggleWorkspaceStyle={
                                                    onToggleWorkspaceStyle
                                                }
                                                hasDismissedInsights={
                                                    hasDismissedInsights
                                                }
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
                                className="opacity-70 hover:opacity-100"
                                onPress={handleReset}
                                startContent={
                                    <RotateCcw
                                        strokeWidth={ICON_STROKE_WIDTH}
                                        className="toolbar-icon-size-sm shrink-0"
                                    />
                                }
                            >
                                {t("settings.modal.footer.reset_defaults")}
                            </Button>
                            <div className="flex gap-tools ml-auto">
                                <Button
                                    size="md"
                                    variant="light"
                                    onPress={() => !isSaving && onClose()}
                                    isDisabled={isSaving}
                                >
                                    {t("settings.modal.footer.cancel")}
                                </Button>
                                <Button
                                    size="md"
                                    color="primary"
                                    variant="shadow"
                                    onPress={handleSave}
                                    isLoading={isSaving}
                                    isDisabled={!hasUnsavedChanges || isSaving}
                                    startContent={
                                        !isSaving && (
                                            <Save
                                                strokeWidth={ICON_STROKE_WIDTH}
                                                className="toolbar-icon-size-sm shrink-0"
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
