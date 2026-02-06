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
import { tryWriteClipboard } from "@/shared/utils/clipboard";
import { GLASS_MODAL_SURFACE } from "@/shared/ui/layout/glass-surface";
import { ToolbarIconButton } from "@/shared/ui/layout/toolbar-button";
import { InterfaceTabContent } from "@/modules/settings/components/InterfaceTabContent";
import { useSession } from "@/app/context/SessionContext";
import type { SettingsModalViewModel } from "@/app/viewModels/useAppViewModel";
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
    viewModel: SettingsModalViewModel;
}

type ModalFeedback = {
    type: "error" | "success";
    text: string;
};

export function SettingsModal({ viewModel }: SettingsModalProps) {
    const {
        isOpen,
        onClose,
        initialConfig,
        isSaving,
        onSave,
        settingsLoadError,
        onTestPort,
        capabilities,
        onRestoreInsights,
        onToggleWorkspaceStyle,
        onReconnect,
        isImmersive,
        hasDismissedInsights,
        onApplyUserPreferencesPatch,
    } = viewModel;
    const { t } = useTranslation();
    const [activeTab, setActiveTab] = useState<SettingsTab>("speed");

    // Responsive State
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(true);
    const [closeConfirmPending, setCloseConfirmPending] = useState(false);
    const inputDraftsRef = useRef(new Map<ConfigKey, string>());
    const [draftsVersion, setDraftsVersion] = useState(0);

    const safeInitialConfig = useMemo(
        () => initialConfig ?? DEFAULT_SETTINGS_CONFIG,
        [initialConfig]
    );

    const [config, setConfig] = useState<SettingsConfig>(() => ({
        ...safeInitialConfig,
    }));

    const configKeyInputTypes = useMemo(() => {
        const map = new Map<ConfigKey, string | undefined>();
        for (const tab of SETTINGS_TABS) {
            for (const section of tab.sections) {
                for (const block of section.blocks) {
                    if (block.type === "input") {
                        map.set(block.stateKey, block.inputType);
                    }
                    if (block.type === "input-pair") {
                        for (const input of block.inputs) {
                            map.set(input.stateKey, input.inputType);
                        }
                    }
                }
            }
        }
        return map;
    }, []);

    const openedConfigRef = useRef<SettingsConfig>({ ...safeInitialConfig });
    const wasOpenRef = useRef(false);

    const { shellAgent } = useShellAgent();
    const {
        uiCapabilities: { uiMode, canBrowse, shellAgentAvailable },
    } = useSession();
    const [modalFeedback, setModalFeedback] = useState<ModalFeedback | null>(
        null
    );

    const hasNativeShellBridge =
        uiMode === "Full" && shellAgentAvailable;
    // TODO: Replace `connectionMode` checks with `uiMode = Full | Rpc`.
    // TODO: Settings should not know about tinytorrent-local-shell naming; it should read `uiMode` from the Session+UiMode provider and derive:
    // TODO: - `canBrowseDirectories = uiMode === "Full"`
    const [jsonCopyStatus, setJsonCopyStatus] = useState<
        "idle" | "copied" | "failed"
    >("idle");
    const jsonCopyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        return () => {
            if (jsonCopyTimerRef.current) {
                clearTimeout(jsonCopyTimerRef.current);
            }
        };
    }, []);

    const canBrowseDirectories = canBrowse;

    const setFieldDraft = useCallback(
        (key: ConfigKey, draft: string | null) => {
            if (draft === null) {
                inputDraftsRef.current.delete(key);
            } else {
                inputDraftsRef.current.set(key, draft);
            }
            setDraftsVersion((v) => v + 1);
            if (closeConfirmPending) {
                setCloseConfirmPending(false);
            }
        },
        [closeConfirmPending]
    );

    const effectiveConfig = useMemo(() => {
        if (inputDraftsRef.current.size === 0) return config;
        const patched: SettingsConfig = { ...config };
        for (const [key, draft] of inputDraftsRef.current.entries()) {
            const inputType = configKeyInputTypes.get(key);
            if (inputType === "number") {
                if (draft.trim() === "") continue;
                const num = Number(draft);
                if (Number.isNaN(num)) continue;
                (patched as any)[key] = num;
                continue;
            }
            (patched as any)[key] = draft;
        }
        return patched;
    }, [config, configKeyInputTypes, draftsVersion]);

    const configJson = useMemo(
        () => JSON.stringify(effectiveConfig, null, 2),
        [effectiveConfig]
    );

    const handleCopyConfigJson = useCallback(async () => {
        const ok = await tryWriteClipboard(configJson);
        setJsonCopyStatus(ok ? "copied" : "failed");
        if (jsonCopyTimerRef.current) {
            clearTimeout(jsonCopyTimerRef.current);
        }
        jsonCopyTimerRef.current = window.setTimeout(() => {
            setJsonCopyStatus("idle");
        }, CLIPBOARD_BADGE_DURATION_MS);
    }, [configJson]);

    const hasSaveableEdits = useMemo(
        () => !configsAreEqual(effectiveConfig, openedConfigRef.current),
        [effectiveConfig]
    );
    const hasPendingDraftEdits = useMemo(
        () => inputDraftsRef.current.size > 0,
        [draftsVersion]
    );
    const hasUnsavedChanges = hasSaveableEdits || hasPendingDraftEdits;

    useEffect(() => {
        if (!isOpen) {
            wasOpenRef.current = false;
            inputDraftsRef.current.clear();
            setDraftsVersion((v) => v + 1);
            return;
        }

        if (!wasOpenRef.current) {
            wasOpenRef.current = true;
            openedConfigRef.current = { ...safeInitialConfig };
            setConfig({ ...safeInitialConfig });
            setModalFeedback(null);
            setJsonCopyStatus("idle");
            setIsMobileMenuOpen(true);
            inputDraftsRef.current.clear();
            setDraftsVersion((v) => v + 1);
            setCloseConfirmPending(false);
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
            setCloseConfirmPending(false);
            inputDraftsRef.current.clear();
            setDraftsVersion((v) => v + 1);
        }
    }, [isOpen]);

    const requestClose = useCallback(() => {
        if (isSaving) {
            setModalFeedback({
                type: "error",
                text: t("settings.modal.close_blocked_saving"),
            });
            return;
        }
        if (hasUnsavedChanges) {
            setCloseConfirmPending(true);
            return;
        }
        onClose();
    }, [hasUnsavedChanges, isSaving, onClose, t]);

    const persistWindowState = useCallback(async () => {
        if (!shellAgent.isAvailable) return;
        try {
            await shellAgent.persistWindowState();
        } catch {
            setModalFeedback({
                type: "error",
                text: t("settings.modal.error_window_state"),
            });
        }
    }, [shellAgent, t]);

    const handleSave = useCallback(async () => {
        const needsSave = !configsAreEqual(
            effectiveConfig,
            openedConfigRef.current
        );

        if (onApplyUserPreferencesPatch) {
            const patch: LiveUserPreferencePatch = {};
            if (
                effectiveConfig.table_watermark_enabled !==
                config.table_watermark_enabled
            ) {
                patch.table_watermark_enabled =
                    effectiveConfig.table_watermark_enabled;
            }
            if (
                effectiveConfig.refresh_interval_ms !== config.refresh_interval_ms
            ) {
                patch.refresh_interval_ms = effectiveConfig.refresh_interval_ms;
            }
            if (
                effectiveConfig.request_timeout_ms !== config.request_timeout_ms
            ) {
                patch.request_timeout_ms = effectiveConfig.request_timeout_ms;
            }
            if (Object.keys(patch).length) {
                onApplyUserPreferencesPatch(patch);
            }
        }

        if (needsSave) {
            await persistWindowState();
        }
        try {
            if (needsSave) {
                await onSave(effectiveConfig);
            }
            setModalFeedback(null);
            inputDraftsRef.current.clear();
            setDraftsVersion((v) => v + 1);
            onClose();
        } catch {
            setModalFeedback({
                type: "error",
                text: t("settings.modal.error_save"),
            });
        }
    }, [
        config,
        effectiveConfig,
        onApplyUserPreferencesPatch,
        onClose,
        onSave,
        persistWindowState,
        t,
    ]);

    const handleReset = () => {
        const next: SettingsConfig = { ...DEFAULT_SETTINGS_CONFIG };
        setConfig(next);
        inputDraftsRef.current.clear();
        setDraftsVersion((v) => v + 1);
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

    const handleTestPortAction = useCallback(() => {
        if (!onTestPort) return;
        void (async () => {
            try {
                const isOpen = await onTestPort();
                setModalFeedback({
                    type: "success",
                    text: t(
                        isOpen
                            ? "settings.modal.test_port_open"
                            : "settings.modal.test_port_closed"
                    ),
                });
            } catch {
                setModalFeedback({
                    type: "error",
                    text: t("settings.modal.error_test_port"),
                });
            }
        })();
    }, [onTestPort, t]);

    const buttonActions: Record<ButtonActionKey, () => void> = useMemo(
        () => ({
            testPort: handleTestPortAction,
            restoreHud: runAction(
                () => onRestoreInsights?.(),
                "settings.modal.error_restore"
            ),
        }),
        [handleTestPortAction, onRestoreInsights, runAction]
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
            if (closeConfirmPending) {
                setCloseConfirmPending(false);
            }
            if (inputDraftsRef.current.has(key)) {
                inputDraftsRef.current.delete(key);
                setDraftsVersion((v) => v + 1);
            }
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
        [closeConfirmPending, onApplyUserPreferencesPatch, sliderConstraints]
    );

    const handleBrowse = useCallback(
        async (key: ConfigKey) => {
            if (!canBrowseDirectories || !shellAgent.isAvailable) return;
            try {
                const targetPath = String(config[key] ?? "");
                const selected = await shellAgent.browseDirectory(targetPath);
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
        [canBrowseDirectories, config, shellAgent, t, updateConfig]
    );

    const hasVisibleBlocks = useCallback(
        (blocks: SectionBlock[]) =>
            blocks.some((block) => !block.visible || block.visible(config)),
        [config]
    );

    const systemTabVisible = hasNativeShellBridge;

    const visibleTabs = useMemo(
        () =>
            SETTINGS_TABS.filter((tab) => {
                if (uiMode === "Full" && tab.id === "connection") return false;
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
        [hasVisibleBlocks, systemTabVisible, uiMode]
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

    const settingsFormState = useMemo(
        () => ({
            config,
            updateConfig,
            setFieldDraft,
            jsonCopyStatus,
            configJson,
        }),
        [config, updateConfig, setFieldDraft, jsonCopyStatus, configJson]
    );
    const settingsFormActions = useMemo(
        () => ({
            capabilities,
            buttonActions,
            canBrowseDirectories,
            onBrowse: handleBrowse,
            onCopyConfigJson: handleCopyConfigJson,
            onReconnect: safeReconnect,
            isImmersive: Boolean(isImmersive),
        }),
        [
            capabilities,
            buttonActions,
            canBrowseDirectories,
            handleBrowse,
            handleCopyConfigJson,
            safeReconnect,
            isImmersive,
        ]
    );
    return (
        <Modal
            isOpen={isOpen}
            onOpenChange={(open) => !open && requestClose()}
            backdrop="blur"
            placement="center"
            size="5xl"
            hideCloseButton
            classNames={{
                base: cn(
                    GLASS_MODAL_SURFACE,
                    uiMode === "Full"
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
                                onPress={requestClose}
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
                                        setCloseConfirmPending(false);
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
                                onPress={requestClose}
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
                                            stateValue={settingsFormState}
                                            actionsValue={settingsFormActions}
                                        >
                                        {activeTabDefinition.id ===
                                        "connection" ? (
                                        <ConnectionTabContent />
                                        ) : activeTabDefinition.id ===
                                          "system" ? (
                                            <SystemTabContent />
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
                            {closeConfirmPending ? (
                                <div className="w-full flex items-center gap-panel">
                                    <div className="flex flex-col min-w-0">
                                        <span className="text-scaled font-semibold text-warning">
                                            {t("settings.modal.discard_title")}
                                        </span>
                                        <span className="text-label text-foreground/60">
                                            {t("settings.modal.discard_body")}
                                        </span>
                                    </div>
                                    <div className="flex gap-tools ml-auto shrink-0">
                                        <Button
                                            size="md"
                                            variant="light"
                                            onPress={() =>
                                                setCloseConfirmPending(false)
                                            }
                                        >
                                            {t("settings.modal.discard_keep")}
                                        </Button>
                                        <Button
                                            size="md"
                                            variant="shadow"
                                            color="danger"
                                            onPress={() => {
                                                setCloseConfirmPending(false);
                                                inputDraftsRef.current.clear();
                                                setDraftsVersion((v) => v + 1);
                                                onClose();
                                            }}
                                        >
                                            {t("settings.modal.discard_close")}
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                <>
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
                                            onPress={requestClose}
                                        >
                                            {t("settings.modal.footer.cancel")}
                                        </Button>
                                        <Button
                                            size="md"
                                            color="primary"
                                            variant="shadow"
                                            onPress={handleSave}
                                            isLoading={isSaving}
                                            isDisabled={
                                                !hasUnsavedChanges || isSaving
                                            }
                                            startContent={
                                                !isSaving && (
                                                    <Save
                                                        strokeWidth={
                                                            ICON_STROKE_WIDTH
                                                        }
                                                        className="toolbar-icon-size-sm shrink-0"
                                                    />
                                                )
                                            }
                                            className="font-semibold shadow-lg shadow-primary/20"
                                        >
                                            {t("settings.modal.footer.save")}
                                        </Button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </ModalContent>
        </Modal>
    );
}
