import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { addToast } from "@heroui/toast";
import type { UiMode } from "@/app/utils/uiMode";
import { useSession } from "@/app/context/SessionContext";
import { usePreferences } from "@/app/context/PreferencesContext";
import { shellAgent } from "@/app/agents/shell-agent";
import { scheduler } from "@/app/services/scheduler";
import { status } from "@/shared/status";
import { registry } from "@/config/logic";
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
    SettingsFieldError,
    SettingsFieldState,
    SettingsFormActionOutcome,
    SettingsFormActionsContextValue,
    SettingsFormStateContextValue,
} from "@/modules/settings/context/SettingsFormContext";
const { timing } = registry;

type LiveUserPreferencePatch = Partial<
    Pick<
        SettingsConfig,
        | "refresh_interval_ms"
        | "request_timeout_ms"
        | "table_watermark_enabled"
        | "workspace_style"
        | "show_add_torrent_dialog"
        | "show_torrent_server_setup"
    >
>;
const LIVE_PREFERENCE_KEYS = [
    "refresh_interval_ms",
    "request_timeout_ms",
    "table_watermark_enabled",
    "workspace_style",
    "show_add_torrent_dialog",
    "show_torrent_server_setup",
] as const satisfies readonly ConfigKey[];

export interface SettingsModalController {
    modal: {
        isOpen: boolean;
        uiMode: UiMode;
        settingsLoadError: boolean;
        modalError: string | null;
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
        onReset: () => void;
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

const isFieldStateEmpty = (state: SettingsFieldState | undefined) =>
    state == null ||
    (state.draft === undefined && !state.pending && state.error === undefined);

export function useSettingsModalController(
    viewModel: SettingsModalViewModel,
): SettingsModalController {
    const {
        isOpen,
        onClose,
        config: settingsConfig,
        settingsLoadError,
        onTestPort,
        capabilities,
        onRestoreInsights,
        hasDismissedInsights,
        onApplyUserPreferencesPatch,
        onApplySettingsPatch,
    } = viewModel;

    const { t } = useTranslation();
    const {
        preferences: { settingsTab },
        setSettingsTab,
    } = usePreferences();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(true);
    const [fieldStates, setFieldStates] = useState<
        Partial<Record<ConfigKey, SettingsFieldState>>
    >({});
    const [config, setConfig] = useState<SettingsConfig>(() => ({
        ...settingsConfig,
    }));
    const configRef = useRef(config);
    const wasOpenRef = useRef(false);
    const [modalError, setModalError] = useState<string | null>(null);
    const [jsonCopyStatus, setJsonCopyStatus] = useState<
        "idle" | "copied" | "failed"
    >("idle");
    const jsonCopyTimerRef = useRef<(() => void) | null>(null);
    const resetModalEphemeralState = useCallback(() => {
        setModalError(null);
        setJsonCopyStatus("idle");
        setFieldStates({});
    }, []);

    const {
        rpcStatus,
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
                jsonCopyTimerRef.current();
                jsonCopyTimerRef.current = null;
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

    const updateFieldState = useCallback(
        (
            key: ConfigKey,
            updater: (
                current: SettingsFieldState | undefined,
            ) => SettingsFieldState | undefined,
        ) => {
            setFieldStates((previous) => {
                const nextState = updater(previous[key]);
                if (
                    isFieldStateEmpty(previous[key]) &&
                    isFieldStateEmpty(nextState)
                ) {
                    return previous;
                }
                const next = { ...previous };
                if (isFieldStateEmpty(nextState)) {
                    delete next[key];
                } else {
                    next[key] = nextState;
                }
                return next;
            });
        },
        [],
    );

    const setFieldDraft = useCallback(
        (key: ConfigKey, draft: string | null) => {
            updateFieldState(key, (current) => ({
                ...current,
                draft: draft ?? undefined,
                error: undefined,
            }));
        },
        [updateFieldState],
    );

    const setFieldError = useCallback(
        (key: ConfigKey, error: SettingsFieldError | null) => {
            updateFieldState(key, (current) => ({
                ...current,
                error: error ?? undefined,
            }));
        },
        [updateFieldState],
    );

    const revertFieldDraft = useCallback(
        (key: ConfigKey) => {
            updateFieldState(key, (current) => ({
                ...current,
                draft: undefined,
                error: undefined,
            }));
        },
        [updateFieldState],
    );

    const hasDrafts = useMemo(
        () =>
            Object.values(fieldStates).some(
                (fieldState) => fieldState?.draft !== undefined,
            ),
        [fieldStates],
    );

    const effectiveConfig = useMemo(() => {
        if (!hasDrafts) return config;
        const patched = {
            ...config,
        } as Record<ConfigKey, SettingsConfig[ConfigKey]>;
        for (const [rawKey, fieldState] of Object.entries(fieldStates)) {
            const draft = fieldState?.draft;
            if (draft === undefined) {
                continue;
            }
            const key = rawKey as ConfigKey;
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
    }, [config, configKeyInputTypes, fieldStates, hasDrafts]);

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
            jsonCopyTimerRef.current();
        }
        jsonCopyTimerRef.current = scheduler.scheduleTimeout(() => {
            setJsonCopyStatus("idle");
        }, timing.ui.clipboardBadgeMs);
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

    useEffect(() => {
        configRef.current = config;
    }, [config]);

    useEffect(() => {
        if (!isOpen) return;
        if (wasOpenRef.current) {
            return;
        }

        wasOpenRef.current = true;
        const cancelInit = scheduler.scheduleTimeout(() => {
            setConfig({ ...settingsConfig });
            setIsMobileMenuOpen(true);
            resetModalEphemeralState();
        }, 0);
        return cancelInit;
    }, [isOpen, resetModalEphemeralState, settingsConfig]);

    useEffect(() => {
        if (!isOpen || hasDrafts) {
            return;
        }
        const cancelSync = scheduler.scheduleTimeout(() => {
            setConfig({ ...settingsConfig });
        }, 0);
        return cancelSync;
    }, [hasDrafts, isOpen, settingsConfig]);

    useEffect(() => {
        if (isOpen) return;
        wasOpenRef.current = false;
        const cancelClose = scheduler.scheduleTimeout(() => {
            resetModalEphemeralState();
        }, 0);
        return cancelClose;
    }, [isOpen, resetModalEphemeralState]);

    const requestClose = useCallback(() => {
        onClose();
    }, [onClose]);

    const handleRestoreHudAction = useCallback(() => {
        void (async () => {
            try {
                await onRestoreInsights();
                setModalError(null);
            } catch {
                setModalError(t("settings.modal.error_restore"));
            }
        })();
    }, [onRestoreInsights, t]);

    const handleTestPortAction = useCallback(() => {
        const showTestPortToast = (
            type: "error" | "success",
            text: string,
        ) => {
            addToast({
                title: text,
                color: type === "error" ? "danger" : "success",
                severity: type === "error" ? "danger" : "success",
                timeout: timing.ui.toastMs,
                hideCloseButton: true,
            });
        };

        void (async () => {
            const outcome = await onTestPort();
            switch (outcome.status) {
                case "open":
                    showTestPortToast("success", t("settings.modal.test_port_open"));
                    return;
                case "closed":
                    showTestPortToast("success", t("settings.modal.test_port_closed"));
                    return;
                case "unsupported":
                    showTestPortToast("error", t("settings.modal.test_port_unsupported"));
                    return;
                case status.connection.offline:
                    showTestPortToast("error", t("settings.modal.test_port_offline"));
                    return;
                case "failed":
                    showTestPortToast("error", t("settings.modal.error_test_port"));
                    return;
                default:
                    showTestPortToast("error", t("settings.modal.error_test_port"));
                    return;
            }
        })();
    }, [onTestPort, t]);

    const buttonActions: Record<ButtonActionKey, () => void> = useMemo(
        () => ({
            testPort: handleTestPortAction,
            restoreHud: handleRestoreHudAction,
        }),
        [handleRestoreHudAction, handleTestPortAction],
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

    const normalizePatch = useCallback(
        (patch: Partial<SettingsConfig>): Partial<SettingsConfig> => {
            const normalized = {
                ...patch,
            } as Record<ConfigKey, SettingsConfig[ConfigKey] | undefined>;
            for (const [rawKey, rawValue] of Object.entries(patch)) {
                const key = rawKey as ConfigKey;
                const constraint = sliderConstraints[key];
                if (
                    constraint &&
                    typeof rawValue === "number" &&
                    Number.isFinite(rawValue)
                ) {
                    normalized[key] = Math.min(
                        Math.max(rawValue, constraint.min),
                        constraint.max,
                    ) as SettingsConfig[typeof key];
                }
            }
            return normalized as Partial<SettingsConfig>;
        },
        [sliderConstraints],
    );

    const applyLocalPatch = useCallback(
        (patch: Partial<SettingsConfig>) => {
            const normalizedPatch = normalizePatch(patch);
            setConfig((previous) => {
                const next = {
                    ...previous,
                    ...normalizedPatch,
                };
                configRef.current = next;
                return next;
            });
            return normalizedPatch;
        },
        [normalizePatch],
    );

    const updateConfig = useCallback(
        <K extends ConfigKey>(key: K, value: SettingsConfig[K]) => {
            applyLocalPatch({
                [key]: value,
            } as Partial<SettingsConfig>);
        },
        [applyLocalPatch],
    );

    const applyLivePreferencePatch = useCallback(
        (patch: Partial<SettingsConfig>) => {
            const preferencePatch: LiveUserPreferencePatch = {};
            if (patch.refresh_interval_ms !== undefined) {
                preferencePatch.refresh_interval_ms = patch.refresh_interval_ms;
            }
            if (patch.request_timeout_ms !== undefined) {
                preferencePatch.request_timeout_ms = patch.request_timeout_ms;
            }
            if (patch.table_watermark_enabled !== undefined) {
                preferencePatch.table_watermark_enabled =
                    patch.table_watermark_enabled;
            }
            if (patch.workspace_style !== undefined) {
                preferencePatch.workspace_style = patch.workspace_style;
            }
            if (patch.show_add_torrent_dialog !== undefined) {
                preferencePatch.show_add_torrent_dialog =
                    patch.show_add_torrent_dialog;
            }
            if (patch.show_torrent_server_setup !== undefined) {
                preferencePatch.show_torrent_server_setup =
                    patch.show_torrent_server_setup;
            }
            if (Object.keys(preferencePatch).length > 0) {
                onApplyUserPreferencesPatch(preferencePatch);
            }
        },
        [onApplyUserPreferencesPatch],
    );

    const persistConfigPatch = useCallback(
        async (patch: Partial<SettingsConfig>) => {
            const previousConfig = { ...configRef.current };
            const normalizedPatch = applyLocalPatch(patch);
            const sessionPatch: Partial<SettingsConfig> = {
                ...normalizedPatch,
            };
            for (const liveKey of LIVE_PREFERENCE_KEYS) {
                delete sessionPatch[liveKey];
            }

            applyLivePreferencePatch(normalizedPatch);

            if (
                Object.keys(sessionPatch).length === 0
            ) {
                return SETTINGS_ACTION_APPLIED;
            }

            if (rpcStatus !== status.connection.connected) {
                const rollbackPatch = {} as Record<
                    ConfigKey,
                    SettingsConfig[ConfigKey] | undefined
                >;
                for (const key of Object.keys(sessionPatch) as ConfigKey[]) {
                    if (Object.is(configRef.current[key], sessionPatch[key])) {
                        rollbackPatch[key] = previousConfig[key];
                    }
                }
                const normalizedRollbackPatch =
                    rollbackPatch as Partial<SettingsConfig>;
                if (Object.keys(normalizedRollbackPatch).length > 0) {
                    setConfig((current) => {
                        const next = {
                            ...current,
                            ...normalizedRollbackPatch,
                        };
                        configRef.current = next;
                        return next;
                    });
                }
                return SETTINGS_ACTION_FAILED;
            }

            try {
                await onApplySettingsPatch(sessionPatch);
                return SETTINGS_ACTION_APPLIED;
            } catch {
                const rollbackPatch = {} as Record<
                    ConfigKey,
                    SettingsConfig[ConfigKey] | undefined
                >;
                for (const key of Object.keys(sessionPatch) as ConfigKey[]) {
                    if (Object.is(configRef.current[key], sessionPatch[key])) {
                        rollbackPatch[key] = previousConfig[key];
                    }
                }
                const normalizedRollbackPatch =
                    rollbackPatch as Partial<SettingsConfig>;
                if (Object.keys(normalizedRollbackPatch).length > 0) {
                    setConfig((current) => {
                        const next = {
                            ...current,
                            ...normalizedRollbackPatch,
                        };
                        configRef.current = next;
                        return next;
                    });
                }
                return SETTINGS_ACTION_FAILED;
            }
        },
        [
            applyLivePreferencePatch,
            applyLocalPatch,
            onApplySettingsPatch,
            rpcStatus,
        ],
    );

    const handleApplySetting = useCallback(
        async <K extends ConfigKey>(
            key: K,
            value: SettingsConfig[K],
        ): Promise<SettingsFormActionOutcome> => {
            updateFieldState(key, (current) => ({
                ...current,
                pending: true,
                error: undefined,
            }));

            const outcome = await persistConfigPatch({
                [key]: value,
            } as Partial<SettingsConfig>);

            if (outcome.status === "applied") {
                updateFieldState(key, (current) => ({
                    ...current,
                    draft: undefined,
                    pending: false,
                    error: undefined,
                }));
                return outcome;
            }

            if (outcome.status === "failed") {
                updateFieldState(key, (current) => ({
                    ...current,
                    pending: false,
                    error: {
                        kind: "apply",
                        text: t("settings.fields.error_apply"),
                    },
                }));
                return outcome;
            }

            updateFieldState(key, (current) => ({
                ...current,
                pending: false,
            }));
            return outcome;
        },
        [persistConfigPatch, t, updateFieldState],
    );

    const handleReset = useCallback(() => {
        void (async () => {
            const outcome = await persistConfigPatch({
                ...DEFAULT_SETTINGS_CONFIG,
            });
            if (outcome.status === "applied") {
                setModalError(null);
                setFieldStates({});
                return;
            }
            setModalError(t("settings.modal.error_apply"));
        })();
    }, [persistConfigPatch, t]);

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
                return handleApplySetting(key, selected);
            } catch {
                updateFieldState(key, (current) => ({
                    ...current,
                    error: {
                        kind: "apply",
                        text: t("settings.fields.error_browse"),
                    },
                }));
                return SETTINGS_ACTION_FAILED;
            }
        },
        [
            canBrowseDirectories,
            canUseShell,
            config,
            handleApplySetting,
            t,
            updateFieldState,
        ],
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
            safeVisibleTabs.find((tab) => tab.id === settingsTab) ??
            safeVisibleTabs[0],
        [safeVisibleTabs, settingsTab],
    );

    useEffect(() => {
        if (safeVisibleTabs.find((tab) => tab.id === settingsTab)) {
            return;
        }
        const cancelFallback = scheduler.scheduleTimeout(() => {
            setSettingsTab(safeVisibleTabs[0]?.id ?? "speed");
        }, 0);
        return cancelFallback;
    }, [safeVisibleTabs, setSettingsTab, settingsTab]);

    const settingsFormState = useMemo<SettingsFormStateContextValue>(
        () => ({
            config,
            fieldStates,
            updateConfig,
            setFieldDraft,
            setFieldError,
            revertFieldDraft,
            jsonCopyStatus,
            configJson,
        }),
        [
            config,
            fieldStates,
            updateConfig,
            setFieldDraft,
            setFieldError,
            revertFieldDraft,
            jsonCopyStatus,
            configJson,
        ],
    );

    const settingsFormActions = useMemo<SettingsFormActionsContextValue>(
        () => ({
            capabilities,
            interfaceTab: {
                hasDismissedInsights,
            },
            buttonActions,
            canBrowseDirectories,
            onApplySetting: handleApplySetting,
            onBrowse: handleBrowse,
            onCopyConfigJson: handleCopyConfigJson,
        }),
        [
            capabilities,
            hasDismissedInsights,
            buttonActions,
            canBrowseDirectories,
            handleApplySetting,
            handleBrowse,
            handleCopyConfigJson,
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
        setSettingsTab(tab);
        setIsMobileMenuOpen(false);
    }, [setSettingsTab]);

    return useMemo(
        () => ({
            modal: {
                isOpen,
                uiMode,
                settingsLoadError,
                modalError,
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
                onReset: handleReset,
            },
        }),
        [
            activeTabDefinition,
            handleReset,
            isMobileMenuOpen,
            isOpen,
            modalError,
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

