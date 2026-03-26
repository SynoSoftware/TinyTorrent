import { Button, Chip, Input } from "@heroui/react";
import { Monitor, RefreshCw, CheckCircle, XCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { registry } from "@/config/logic";
import { TEXT_ROLE } from "@/config/textRoles";
import { status } from "@/shared/status";
import { useConnectionConfig, buildRpcServerUrl } from "@/app/context/ConnectionConfigContext";
import type { ConnectionProfile } from "@/app/types/connection-profile";
import { useSession } from "@/app/context/SessionContext";
import { useSettingsFormActions, useSettingsFormState } from "@/modules/settings/context/SettingsFormContext";
import { AlertPanel } from "@/shared/ui/layout/AlertPanel";
import { FORM } from "@/shared/ui/layout/glass-surface";
const { visuals } = registry;
const AUTO_PROFILE_LABEL_PATTERN = /^Connection \d+$/;
// TODO: Remove `token` and ServerType/serverClass UI. With “RPC extensions: NONE”, connection manager should manage only:
// TODO: - Transmission endpoint (host/port/scheme/path)
// TODO: - Transmission Basic Auth (username/password)
// TODO: Host-backed UI features are NOT a different server type; they are a locality-derived capability (localhost + ShellAgent/ShellExtensions available).
// TODO: The “TinyTorrent server” label must be removed from this UX to avoid implying a different daemon protocol.

interface ConnectionManagerState {
    activeProfile: ConnectionProfile;
    handleUpdate: (patch: Partial<ConnectionProfile>) => void;
    isOffline: boolean;
}

function useConnectionManagerState(): ConnectionManagerState {
    const { activeProfile, updateProfile } = useConnectionConfig();
    const handleUpdate = useCallback(
        (patch: Partial<ConnectionProfile>) => {
            updateProfile(activeProfile.id, patch);
        },
        [activeProfile.id, updateProfile],
    );
    const { rpcStatus } = useSession();
    return {
        activeProfile,
        handleUpdate,
        isOffline: rpcStatus === status.connection.error,
    };
}
// TODO: Remove `token` from ConnectionProfile update shape once TT tokens are removed.

export function ConnectionCredentialsCard() {
    const { t } = useTranslation();
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [pendingLocalReconnect, setPendingLocalReconnect] = useState(false);
    const { activeProfile, handleUpdate, isOffline } = useConnectionManagerState();
    const { onReconnect } = useSettingsFormActions();
    const { connectionFeedback } = useSettingsFormState();
    const handleReconnect = useCallback(async () => {
        const outcome = await onReconnect();
        switch (outcome.status) {
            case "applied":
            case "cancelled":
            case "unsupported":
            case "failed":
                return;
            default:
                return;
        }
    }, [onReconnect]);
    const handleConnectLocal = useCallback(() => {
        handleUpdate({
            host: "localhost",
            port: "9091",
            scheme: "http",
        });
        setPendingLocalReconnect(true);
    }, [handleUpdate]);
    const { rpcStatus, uiCapabilities } = useSession();
    const connectionStatusLabel = useMemo(() => {
        const map: Record<string, string> = {
            [status.connection.connected]: t("status_bar.rpc_connected"),
            [status.connection.error]: t("status_bar.rpc_error"),
            [status.connection.idle]: t("status_bar.rpc_idle"),
        };
        return map[rpcStatus];
    }, [rpcStatus, t]);
    const statusColor = useMemo<"success" | "warning" | "danger">(() => {
        if (rpcStatus === status.connection.connected) return "success";
        if (rpcStatus === status.connection.error) return "danger";
        return "warning";
    }, [rpcStatus]);

    const { uiMode } = uiCapabilities;
    const isFullMode = uiMode === "Full";
    const isNativeMode = isFullMode;
    const modeLabelKey = useMemo(
        () => (isFullMode ? "settings.connection.ui_mode_full_label" : "settings.connection.ui_mode_rpc_label"),
        [isFullMode],
    );
    const modeSummaryKey = useMemo(
        () => (isFullMode ? "settings.connection.ui_mode_full_summary" : "settings.connection.ui_mode_rpc_summary"),
        [isFullMode],
    );

    const remoteInputsEnabled = !isNativeMode || showAdvanced;

    const serverUrl = useMemo(() => buildRpcServerUrl(activeProfile), [activeProfile]);
    useEffect(() => {
        if (!pendingLocalReconnect) {
            return;
        }
        const normalizedHost = activeProfile.host.trim().toLowerCase();
        if (normalizedHost !== "localhost" || activeProfile.port.trim() !== "9091") {
            return;
        }
        setPendingLocalReconnect(false);
        void handleReconnect();
    }, [activeProfile.host, activeProfile.port, handleReconnect, pendingLocalReconnect]);
    const profileLabel = useMemo(() => {
        const explicitLabel = activeProfile.label.trim();
        if (explicitLabel && !AUTO_PROFILE_LABEL_PATTERN.test(explicitLabel)) {
            return explicitLabel;
        }
        if (uiCapabilities.isLoopback) {
            return t("settings.connection.default_profile_label");
        }
        const hostLabel = activeProfile.host.trim();
        return hostLabel || t("settings.connection.profile_placeholder");
    }, [activeProfile.host, activeProfile.id, activeProfile.label, t, uiCapabilities.isLoopback]);
    const shouldShowAuthControls = true;
    const isInsecureBasicAuth = (() => {
        const scheme = activeProfile.scheme;
        if (scheme !== "http") return false;
        const host = activeProfile.host
            .trim()
            .replace(/^\[|\]$/g, "")
            .toLowerCase();
        const isLocal = host === "localhost" || host === "127.0.0.1" || host === "::1";
        if (isLocal) return false;
        return Boolean(activeProfile.username || activeProfile.password);
    })();
    const showModeStatus = rpcStatus === status.connection.connected;
    // In native/local host mode, collapse remote controls behind an Advanced toggle.
    if (isNativeMode && !showAdvanced) {
        return (
            <div className={FORM.connection.localRoot}>
                <div className={FORM.connection.localHeader}>
                    <div className={FORM.connection.localHeaderInfo}>
                        <h3 className={FORM.connection.profileTitle}>{profileLabel}</h3>
                        <p className={FORM.connection.profileEndpoint}>{serverUrl}</p>
                    </div>
                    <div className={FORM.connection.localHeaderActions}>
                        <Button size="md" variant="ghost" onPress={() => setShowAdvanced(true)}>
                            {t("settings.connection.show_advanced")}
                        </Button>
                    </div>
                </div>
                <p className={TEXT_ROLE.caption}>{t("settings.connection.local_mode_info")}</p>
            </div>
        );
    }

    return (
        <div className={FORM.connection.root}>
            <div className={FORM.connection.topRow}>
                <div className={FORM.connection.topRowInfo}>
                    <h3 className={FORM.connection.profileTitle}>{profileLabel}</h3>
                    <p className={FORM.connection.profileEndpoint}>{serverUrl}</p>
                </div>
                <div className={FORM.stackTools}>
                    <div className={FORM.connection.localHeaderActions}>
                        <Chip
                            size="lg"
                            variant="flat"
                            color={statusColor}
                            className={FORM.systemStatusChip}
                            startContent={
                                statusColor === "success" ? (
                                    <CheckCircle
                                        strokeWidth={visuals.icon.strokeWidth}
                                        className={FORM.connection.iconSmall}
                                    />
                                ) : (
                                    <XCircle
                                        strokeWidth={visuals.icon.strokeWidth}
                                        className={FORM.connection.iconSmall}
                                    />
                                )
                            }
                        >
                            {connectionStatusLabel}
                        </Chip>
                    </div>
                </div>
            </div>
            <div className={FORM.connection.fieldsStack}>
                {isOffline && (
                    <p className={FORM.connection.insecureAuthWarning}>{t("settings.connection.offline_warning")}</p>
                )}
                {isInsecureBasicAuth && (
                    <p className={FORM.connection.insecureAuthWarning}>
                        {t("settings.connection.insecure_basic_auth_warning")}
                    </p>
                )}
                <div className={FORM.connection.fieldsPairGrid}>
                    <Input
                        label={t("settings.connection.host")}
                        labelPlacement="outside"
                        variant="bordered"
                        size="md"
                        value={activeProfile.host}
                        onChange={(event) => handleUpdate({ host: event.target.value })}
                        className={FORM.connection.inputHeight}
                        disabled={!remoteInputsEnabled}
                    />
                    <Input
                        label={t("settings.connection.port")}
                        variant="bordered"
                        labelPlacement="outside"
                        size="md"
                        type="text"
                        value={activeProfile.port}
                        onChange={(event) => handleUpdate({ port: event.target.value })}
                        className={FORM.connection.inputHeight}
                        disabled={!remoteInputsEnabled}
                    />
                </div>
                {shouldShowAuthControls && (
                    <div className={FORM.connection.fieldsPairGrid}>
                        <Input
                            label={t("settings.connection.username")}
                            labelPlacement="outside"
                            variant="bordered"
                            size="md"
                            value={activeProfile.username}
                            onChange={(event) =>
                                handleUpdate({
                                    username: event.target.value,
                                })
                            }
                            disabled={!remoteInputsEnabled}
                        />
                        <Input
                            label={t("settings.connection.password")}
                            labelPlacement="outside"
                            variant="bordered"
                            size="md"
                            type="password"
                            value={activeProfile.password}
                            onChange={(event) =>
                                handleUpdate({
                                    password: event.target.value,
                                })
                            }
                            disabled={!remoteInputsEnabled}
                        />
                    </div>
                )}
                {isNativeMode && !showAdvanced && (
                    <p className={FORM.connection.localModeHint}>{t("settings.connection.local_mode_info")}</p>
                )}
                <div className={FORM.inputActionRow}>
                    <div className={FORM.interfaceRowActions}>
                        <Button
                            variant="bordered"
                            onPress={() => {
                                void handleConnectLocal();
                            }}
                            type="button"
                        >
                            {t("settings.connection.connect_to_this_pc")}
                        </Button>
                        <Button
                            variant="bordered"
                            color="primary"
                            onPress={() => {
                                void handleReconnect();
                            }}
                            type="button"
                            startContent={
                                <RefreshCw
                                    strokeWidth={visuals.icon.strokeWidth}
                                    className={FORM.connection.iconSmall}
                                />
                            }
                        >
                            {t("settings.connection.reconnect")}
                        </Button>
                    </div>
                </div>
                {showModeStatus && (
                    <div className={FORM.connection.statusFooter}>
                        <div className={FORM.connection.statusFooterRow}>
                            <Monitor strokeWidth={visuals.icon.strokeWidth} className={FORM.workflow.statusInfoIcon} />
                            <div className={FORM.stackTools}>
                                <p className={TEXT_ROLE.bodyStrong}>{t(modeLabelKey)}</p>
                                <p className={TEXT_ROLE.bodySmall}>{t(modeSummaryKey)}</p>
                            </div>
                        </div>
                    </div>
                )}
                {connectionFeedback && (
                    <AlertPanel severity={connectionFeedback.type === "error" ? "danger" : "success"}>
                        {connectionFeedback.text}
                    </AlertPanel>
                )}
            </div>
        </div>
    );
}
