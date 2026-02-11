import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { UiMode } from "@/app/utils/uiMode";
import { useSession } from "@/app/context/SessionContext";
import { shellAgent } from "@/app/agents/shell-agent";
import { STATUS } from "@/shared/status";
import {
    CLIPBOARD_BADGE_DURATION_MS,
} from "@/config/logic";
import type { SettingsModalViewModel } from "@/app/viewModels/useAppViewModel";
import {
    DEFAULT_SETTINGS_CONFIG,
    type ConfigKey,
    type SettingsConfig,
} from "@/modules/settings/data/config";
import {
    SETTINGS_TABS,
    type ButtonActionKey,
    type SectionBlock,
    type SettingsTab,
    type SliderDefinition,
    type TabDefinition,
} from "@/modules/settings/data/settings-tabs";
import {
    writeClipboardOutcome,
} from "@/shared/utils/clipboard";
import type {
    SettingsFormActionOutcome,
    SettingsFormActionsContextValue,
    SettingsFormStateContextValue,
} from "@/modules/settings/context/SettingsFormContext";

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
    config: SettingsConfig,
): SaveableSettingsConfig => {
    const rest = {
        ...config,
    } as Partial<SettingsConfig>;
    delete rest.refresh_interval_ms;
    delete rest.request_timeout_ms;
    delete rest.table_watermark_enabled;
    return rest as SaveableSettingsConfig;
};

const configsAreEqual = (a: SettingsConfig, b: SettingsConfig) =>
    JSON.stringify(stripLivePreferences(a)) ===
    JSON.stringify(stripLivePreferences(b));

type ModalFeedback = {
    type: "error" | "success";
    text: string;
};

export interface SettingsModalController {
    modal: {
        isOpen: boolean;
        uiMode: UiMode;
        isSaving: boolean;
        settingsLoadError?: boolean;
        modalFeedback: ModalFeedback | null;
        hasUnsavedChanges: boolean;
        closeConfirmPending: boolean;
        isMobileMenuOpen: boolean;
        tabsFallbackActive: boolean;
        safeVisibleTabs: TabDefinition[];
        activeTabDefinition: TabDefinition;
        settingsFormState: SettingsFormStateContextValue;
        settingsFormActions: SettingsFormActionsContextValue;
    };
    commands: {
        onOpenChange: (open: boolean) => void;
        onRequestClose: () => void;
        onOpenMobileMenu: () => void;
        onSelectTab: (tab: SettingsTab) => void;
        onKeepEditing: () => void;
        onDiscardAndClose: () => void;
        onReset: () => void;
        onSave: () => void;
    };
}

type BrowseTargetConfigKey = "download_dir" | "incomplete_dir";

const isBrowseTargetConfigKey = (
    key: ConfigKey,
): key is BrowseTargetConfigKey =>
    key === "download_dir" || key === "incomplete_dir";

const SETTINGS_ACTION_APPLIED: SettingsFormActionOutcome = {
    status: "applied",
};
const SETTINGS_ACTION_CANCELLED: SettingsFormActionOutcome = {
    status: "cancelled",
    reason: "dismissed",
};
const SETTINGS_ACTION_UNSUPPORTED: SettingsFormActionOutcome = {
    status: "unsupported",
    reason: "capability_unavailable",
};
const SETTINGS_ACTION_FAILED: SettingsFormActionOutcome = {
    status: "failed",
    reason: "execution_failed",
};

export function useSettingsModalController(
    viewModel: SettingsModalViewModel,
): SettingsModalController {
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
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(true);
    const [closeConfirmPending, setCloseConfirmPending] = useState(false);
    const [inputDrafts, setInputDrafts] = useState<Map<ConfigKey, string>>(
        () => new Map()
    );
    const safeInitialConfig = useMemo(
        () => initialConfig ?? DEFAULT_SETTINGS_CONFIG,
        [initialConfig],
    );
    const [config, setConfig] = useState<SettingsConfig>(() => ({
        ...safeInitialConfig,
    }));
    const [openedConfigSnapshot, setOpenedConfigSnapshot] =
        useState<SettingsConfig>({ ...safeInitialConfig });
    const wasOpenRef = useRef(false);
    const [modalFeedback, setModalFeedback] = useState<ModalFeedback | null>(
        null,
    );
    const [jsonCopyStatus, setJsonCopyStatus] = useState<
        "idle" | "copied" | "failed"
    >("idle");
    const jsonCopyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const {
        uiCapabilities: {
            uiMode,
            canBrowse,
            shellAgentAvailable,
            clipboardWriteSupported,
        },
    } = useSession();
    const canUseShell = uiMode === "Full" && shellAgentAvailable;

    useEffect(() => {
        return () => {
            if (jsonCopyTimerRef.current) {
                clearTimeout(jsonCopyTimerRef.current);
            }
        };
    }, []);

    const canBrowseDirectories = canBrowse;

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

    const setFieldDraft = useCallback(
        (key: ConfigKey, draft: string | null) => {
            setInputDrafts((previous) => {
                const next = new Map(previous);
                if (draft === null) {
                    next.delete(key);
                } else {
                    next.set(key, draft);
                }
                return next;
            });
            if (closeConfirmPending) {
                setCloseConfirmPending(false);
            }
        },
        [closeConfirmPending],
    );

    const effectiveConfig = useMemo(() => {
        if (inputDrafts.size === 0) return config;
        const patched = {
            ...config,
        } as Record<ConfigKey, SettingsConfig[ConfigKey]>;
        for (const [key, draft] of inputDrafts.entries()) {
            const inputType = configKeyInputTypes.get(key);
            if (inputType === "number") {
                if (draft.trim() === "") continue;
                const numericDraft = Number(draft);
                if (Number.isNaN(numericDraft)) continue;
                patched[key] = numericDraft;
                continue;
            }
            patched[key] = draft;
        }
        return patched as SettingsConfig;
    }, [config, configKeyInputTypes, inputDrafts]);

    const configJson = useMemo(
        () => JSON.stringify(effectiveConfig, null, 2),
        [effectiveConfig],
    );

    const handleCopyConfigJson = useCallback(async (): Promise<SettingsFormActionOutcome> => {
        const canUseClipboard = clipboardWriteSupported;
        if (!canUseClipboard) {
            setJsonCopyStatus("failed");
            return SETTINGS_ACTION_UNSUPPORTED;
        }

        const outcome = await writeClipboardOutcome(configJson);
        const copied = outcome.status === "copied";
        setJsonCopyStatus(copied ? "copied" : "failed");
        if (jsonCopyTimerRef.current) {
            clearTimeout(jsonCopyTimerRef.current);
        }
        jsonCopyTimerRef.current = window.setTimeout(() => {
            setJsonCopyStatus("idle");
        }, CLIPBOARD_BADGE_DURATION_MS);
        switch (outcome.status) {
            case "copied":
                return SETTINGS_ACTION_APPLIED;
            case "unsupported":
                return SETTINGS_ACTION_UNSUPPORTED;
            case "empty":
            case "failed":
            default:
                return SETTINGS_ACTION_FAILED;
        }
    }, [clipboardWriteSupported, configJson]);

    const hasSaveableEdits = useMemo(
        () => !configsAreEqual(effectiveConfig, openedConfigSnapshot),
        [effectiveConfig, openedConfigSnapshot],
    );
    const hasPendingDraftEdits = inputDrafts.size > 0;
    const hasUnsavedChanges = hasSaveableEdits || hasPendingDraftEdits;

    useEffect(() => {
        if (!isOpen) {
            wasOpenRef.current = false;
            const resetHandle = window.setTimeout(() => {
                setInputDrafts(new Map());
            }, 0);
            return () => {
                window.clearTimeout(resetHandle);
            };
        }
        if (wasOpenRef.current) {
            return;
        }

        wasOpenRef.current = true;
        const initHandle = window.setTimeout(() => {
            setOpenedConfigSnapshot({ ...safeInitialConfig });
            setConfig({ ...safeInitialConfig });
            setModalFeedback(null);
            setJsonCopyStatus("idle");
            setIsMobileMenuOpen(true);
            setInputDrafts(new Map());
            setCloseConfirmPending(false);
        }, 0);
        return () => {
            window.clearTimeout(initHandle);
        };
    }, [isOpen, safeInitialConfig]);

    useEffect(() => {
        if (!isOpen || hasSaveableEdits) {
            return;
        }
        const syncHandle = window.setTimeout(() => {
            setOpenedConfigSnapshot({ ...safeInitialConfig });
            setConfig({ ...safeInitialConfig });
        }, 0);
        return () => {
            window.clearTimeout(syncHandle);
        };
    }, [hasSaveableEdits, isOpen, safeInitialConfig]);

    useEffect(() => {
        if (isOpen) {
            return;
        }
        const closeHandle = window.setTimeout(() => {
            setModalFeedback(null);
            setJsonCopyStatus("idle");
            setCloseConfirmPending(false);
            setInputDrafts(new Map());
        }, 0);
        return () => {
            window.clearTimeout(closeHandle);
        };
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
        if (!canUseShell) return;
        try {
            await shellAgent.persistWindowState();
        } catch {
            setModalFeedback({
                type: "error",
                text: t("settings.modal.error_window_state"),
            });
        }
    }, [canUseShell, t]);

    const handleSave = useCallback(async () => {
        const needsSave = !configsAreEqual(
            effectiveConfig,
            openedConfigSnapshot,
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
                effectiveConfig.refresh_interval_ms !==
                config.refresh_interval_ms
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
            setInputDrafts(new Map());
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
        openedConfigSnapshot,
        onApplyUserPreferencesPatch,
        onClose,
        onSave,
        persistWindowState,
        t,
    ]);

    const handleReset = useCallback(() => {
        const nextConfig: SettingsConfig = { ...DEFAULT_SETTINGS_CONFIG };
        setConfig(nextConfig);
        setInputDrafts(new Map());
        onApplyUserPreferencesPatch?.({
            refresh_interval_ms: nextConfig.refresh_interval_ms,
            request_timeout_ms: nextConfig.request_timeout_ms,
            table_watermark_enabled: nextConfig.table_watermark_enabled,
        });
        setModalFeedback(null);
    }, [onApplyUserPreferencesPatch]);

    const runAction = useCallback(
        (
            action: (() => void | Promise<void>) | undefined,
            messageKey: string,
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
        [t],
    );

    const handleTestPortAction = useCallback(() => {
        if (!onTestPort) {
            setModalFeedback({
                type: "error",
                text: t("settings.modal.test_port_unsupported"),
            });
            return;
        }
        void (async () => {
            const outcome = await onTestPort();
            switch (outcome.status) {
                case "open":
                    setModalFeedback({
                        type: "success",
                        text: t("settings.modal.test_port_open"),
                    });
                    return;
                case "closed":
                    setModalFeedback({
                        type: "success",
                        text: t("settings.modal.test_port_closed"),
                    });
                    return;
                case "unsupported":
                    setModalFeedback({
                        type: "error",
                        text: t("settings.modal.test_port_unsupported"),
                    });
                    return;
                case STATUS.connection.OFFLINE:
                    setModalFeedback({
                        type: "error",
                        text: t("settings.modal.test_port_offline"),
                    });
                    return;
                case "failed":
                    setModalFeedback({
                        type: "error",
                        text: t("settings.modal.error_test_port"),
                    });
                    return;
                default:
                    setModalFeedback({
                        type: "error",
                        text: t("settings.modal.error_test_port"),
                    });
                    return;
            }
        })();
    }, [onTestPort, t]);

    const buttonActions: Record<ButtonActionKey, () => void> = useMemo(
        () => ({
            testPort: handleTestPortAction,
            restoreHud: runAction(
                () => onRestoreInsights?.(),
                "settings.modal.error_restore",
            ),
        }),
        [handleTestPortAction, onRestoreInsights, runAction],
    );

    const safeReconnect = useCallback(
        async (): Promise<SettingsFormActionOutcome> => {
            if (!onReconnect) {
                return SETTINGS_ACTION_UNSUPPORTED;
            }
            const outcome = await onReconnect();
            if (outcome.status !== STATUS.connection.CONNECTED) {
                setModalFeedback({
                    type: "error",
                    text: t("settings.modal.error_reconnect"),
                });
                return SETTINGS_ACTION_FAILED;
            }
            setModalFeedback(null);
            return SETTINGS_ACTION_APPLIED;
        },
        [onReconnect, t],
    );

    const sliderConstraints = useMemo<
        Partial<Record<ConfigKey, SliderDefinition>>
    >(() => {
        const constraints: Partial<Record<ConfigKey, SliderDefinition>> = {};
        for (const tab of SETTINGS_TABS) {
            for (const section of tab.sections) {
                for (const block of section.blocks) {
                    if (block.type === "switch-slider") {
                        constraints[block.sliderKey] = block.slider;
                    }
                }
            }
        }
        return constraints;
    }, []);

    const updateConfig = useCallback(
        <K extends ConfigKey>(key: K, value: SettingsConfig[K]) => {
            if (closeConfirmPending) {
                setCloseConfirmPending(false);
            }
            setInputDrafts((previous) => {
                if (!previous.has(key)) return previous;
                const next = new Map(previous);
                next.delete(key);
                return next;
            });
            const constraint = sliderConstraints[key];
            let nextValue = value;
            if (
                constraint &&
                typeof value === "number" &&
                Number.isFinite(value)
            ) {
                nextValue = Math.min(
                    Math.max(value, constraint.min),
                    constraint.max,
                ) as SettingsConfig[K];
            }
            setConfig((previous) => ({ ...previous, [key]: nextValue }));
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
        [closeConfirmPending, onApplyUserPreferencesPatch, sliderConstraints],
    );

    const handleBrowse = useCallback(
        async (key: ConfigKey) => {
            if (!canBrowseDirectories || !canUseShell) {
                return SETTINGS_ACTION_UNSUPPORTED;
            }
            if (!isBrowseTargetConfigKey(key)) {
                return SETTINGS_ACTION_UNSUPPORTED;
            }
            try {
                const targetPath = config[key];
                const selected = await shellAgent.browseDirectory(targetPath);
                if (!selected) {
                    return SETTINGS_ACTION_CANCELLED;
                }
                if (selected === targetPath) {
                    return {
                        status: "cancelled",
                        reason: "no_change",
                    } as const;
                }
                updateConfig(key, selected);
                return SETTINGS_ACTION_APPLIED;
            } catch {
                setModalFeedback({
                    type: "error",
                    text: t("settings.modal.error_browse"),
                });
                return SETTINGS_ACTION_FAILED;
            }
        },
        [canBrowseDirectories, canUseShell, config, t, updateConfig],
    );

    const hasVisibleBlocks = useCallback(
        (blocks: SectionBlock[]) =>
            blocks.some((block) => !block.visible || block.visible(config)),
        [config],
    );

    const systemTabVisible = canUseShell;

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
                    hasVisibleBlocks(section.blocks),
                );
            }),
        [hasVisibleBlocks, systemTabVisible, uiMode],
    );

    const safeVisibleTabs = useMemo(
        () => (visibleTabs.length ? visibleTabs : [SETTINGS_TABS[0]]),
        [visibleTabs],
    );
    const tabsFallbackActive = visibleTabs.length === 0;
    const activeTabDefinition = useMemo(
        () =>
            safeVisibleTabs.find((tab) => tab.id === activeTab) ??
            safeVisibleTabs[0],
        [activeTab, safeVisibleTabs],
    );

    useEffect(() => {
        if (safeVisibleTabs.find((tab) => tab.id === activeTab)) {
            return;
        }
        const fallbackHandle = window.setTimeout(() => {
            setActiveTab(safeVisibleTabs[0]?.id ?? "speed");
        }, 0);
        return () => {
            window.clearTimeout(fallbackHandle);
        };
    }, [activeTab, safeVisibleTabs]);

    const settingsFormState = useMemo<SettingsFormStateContextValue>(
        () => ({
            config,
            updateConfig,
            setFieldDraft,
            jsonCopyStatus,
            configJson,
        }),
        [config, updateConfig, setFieldDraft, jsonCopyStatus, configJson],
    );

    const settingsFormActions = useMemo<SettingsFormActionsContextValue>(
        () => ({
            capabilities,
            interfaceTab: {
                isImmersive: Boolean(isImmersive),
                hasDismissedInsights,
                onToggleWorkspaceStyle,
            },
            buttonActions,
            canBrowseDirectories,
            onBrowse: handleBrowse,
            onCopyConfigJson: handleCopyConfigJson,
            onReconnect: safeReconnect,
        }),
        [
            capabilities,
            hasDismissedInsights,
            isImmersive,
            onToggleWorkspaceStyle,
            buttonActions,
            canBrowseDirectories,
            handleBrowse,
            handleCopyConfigJson,
            safeReconnect,
        ],
    );

    const onOpenChange = useCallback(
        (open: boolean) => {
            if (!open) {
                requestClose();
            }
        },
        [requestClose],
    );

    const onSelectTab = useCallback((tab: SettingsTab) => {
        setActiveTab(tab);
        setCloseConfirmPending(false);
        setIsMobileMenuOpen(false);
    }, []);

    const onDiscardAndClose = useCallback(() => {
        setCloseConfirmPending(false);
        setInputDrafts(new Map());
        onClose();
    }, [onClose]);

    return useMemo(
        () => ({
            modal: {
                isOpen,
                uiMode,
                isSaving,
                settingsLoadError,
                modalFeedback,
                hasUnsavedChanges,
                closeConfirmPending,
                isMobileMenuOpen,
                tabsFallbackActive,
                safeVisibleTabs,
                activeTabDefinition,
                settingsFormState,
                settingsFormActions,
            },
            commands: {
                onOpenChange,
                onRequestClose: requestClose,
                onOpenMobileMenu: () => setIsMobileMenuOpen(true),
                onSelectTab,
                onKeepEditing: () => setCloseConfirmPending(false),
                onDiscardAndClose,
                onReset: handleReset,
                onSave: () => {
                    void handleSave();
                },
            },
        }),
        [
            activeTabDefinition,
            closeConfirmPending,
            handleReset,
            handleSave,
            hasUnsavedChanges,
            isMobileMenuOpen,
            isOpen,
            isSaving,
            modalFeedback,
            onDiscardAndClose,
            onOpenChange,
            onSelectTab,
            requestClose,
            safeVisibleTabs,
            settingsFormActions,
            settingsFormState,
            settingsLoadError,
            tabsFallbackActive,
            uiMode,
        ],
    );
}
