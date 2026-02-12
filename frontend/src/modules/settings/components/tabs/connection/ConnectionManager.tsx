import { Button, Chip, Input } from "@heroui/react";
import { RefreshCw, CheckCircle, XCircle } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ICON_STROKE_WIDTH } from "@/config/logic";
import { TEXT_ROLE, withColor } from "@/config/textRoles";
import { STATUS } from "@/shared/status";
import { useConnectionConfig, buildRpcEndpoint, buildRpcServerUrl, DEFAULT_PROFILE_ID } from "@/app/context/ConnectionConfigContext";
import type { ConnectionProfile } from "@/app/types/connection-profile";
import { useSession } from "@/app/context/SessionContext";
import { useSettingsFormActions } from "@/modules/settings/context/SettingsFormContext";
// TODO: Remove `token` and ServerType/serverClass UI. With “RPC extensions: NONE”, connection manager should manage only:
// TODO: - Transmission endpoint (host/port/scheme/path)
// TODO: - Transmission Basic Auth (username/password)
// TODO: Host-backed UI features are NOT a different server type; they are a locality-derived capability (localhost + ShellAgent/ShellExtensions available).
// TODO: The “TinyTorrent server” label must be removed from this UX to avoid implying a different daemon protocol.

interface ConnectionManagerState {
    activeProfile: ConnectionProfile;
    handleUpdate: (patch: Partial<ConnectionProfile>) => void;
    endpointPreview: string;
    isOffline: boolean;
}

function useConnectionManagerState(): ConnectionManagerState {
    const { activeProfile, updateProfile } = useConnectionConfig();
    const handleUpdate = useCallback(
        (
            patch: Partial<
                Pick<
                    ConnectionProfile,
                    "host" | "port" | "username" | "password"
                >
            >
        ) => {
            updateProfile(activeProfile.id, patch);
        },
        [activeProfile.id, updateProfile]
    );
    const endpointPreview = useMemo(
        () => buildRpcEndpoint(activeProfile),
        [activeProfile]
    );
    const { rpcStatus } = useSession();
    return {
        activeProfile,
        handleUpdate,
        endpointPreview,
        isOffline: rpcStatus === STATUS.connection.ERROR,
    };
}
// TODO: Remove `token` from ConnectionProfile update shape once TT tokens are removed.

export function ConnectionCredentialsCard() {
    const { t } = useTranslation();
    const [showAdvanced, setShowAdvanced] = useState(false);
    const { activeProfile, handleUpdate, isOffline } =
        useConnectionManagerState();
    const { onReconnect } = useSettingsFormActions();
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
    const { rpcStatus, uiCapabilities } = useSession();
    const connectionStatusLabel = useMemo(() => {
        const map: Record<string, string> = {
            [STATUS.connection.CONNECTED]: t("status_bar.rpc_connected"),
            [STATUS.connection.ERROR]: t("status_bar.rpc_error"),
            [STATUS.connection.IDLE]: t("status_bar.rpc_idle"),
        };
        return map[rpcStatus];
    }, [rpcStatus, t]);
    const statusColor = useMemo<"success" | "warning" | "danger">(() => {
        if (rpcStatus === STATUS.connection.CONNECTED) return "success";
        if (rpcStatus === STATUS.connection.ERROR) return "danger";
        return "warning";
    }, [rpcStatus]);

    const { uiMode } = uiCapabilities;
    const isFullMode = uiMode === "Full";
    const isNativeMode = isFullMode;
    const modeLabelKey = useMemo(() => {
        if (rpcStatus !== STATUS.connection.CONNECTED) {
            return "settings.connection.detecting_mode_label";
        }
        return isFullMode
            ? "settings.connection.ui_mode_full_label"
            : "settings.connection.ui_mode_rpc_label";
    }, [rpcStatus, isFullMode]);
    const modeSummaryKey = useMemo(() => {
        if (rpcStatus !== STATUS.connection.CONNECTED) {
            return "settings.connection.detecting_mode_summary";
        }
        return isFullMode
            ? "settings.connection.ui_mode_full_summary"
            : "settings.connection.ui_mode_rpc_summary";
    }, [rpcStatus, isFullMode]);

    const remoteInputsEnabled = !isNativeMode || showAdvanced;

    const serverUrl = useMemo(
        () => buildRpcServerUrl(activeProfile),
        [activeProfile]
    );
    const profileLabel = useMemo(() => {
        const explicitLabel = activeProfile.label.trim();
        if (explicitLabel) {
            return explicitLabel;
        }
        if (activeProfile.id === DEFAULT_PROFILE_ID) {
            return t("settings.connection.default_profile_label");
        }
        return t("settings.connection.profile_placeholder");
    }, [activeProfile.id, activeProfile.label, t]);
    const shouldShowAuthControls = true;
    const isAuthModeResolved = rpcStatus === STATUS.connection.CONNECTED;
    const isInsecureBasicAuth = (() => {
        const scheme = activeProfile.scheme;
        if (scheme !== "http") return false;
        const host = activeProfile.host
            .trim()
            .replace(/^\[|\]$/g, "")
            .toLowerCase();
        const isLocal =
            host === "localhost" || host === "127.0.0.1" || host === "::1";
        if (isLocal) return false;
        return Boolean(activeProfile.username || activeProfile.password);
    })();
    // In native/local host mode, collapse remote controls behind an Advanced toggle.
    if (isNativeMode && !showAdvanced) {
        return (
            <div className="space-y-tight">
                <div className="flex items-center justify-between">
                    <div className="min-w-0 space-y-tight">
                        <h3 className={`${TEXT_ROLE.headingSection} truncate`}>
                            {profileLabel}
                        </h3>
                        <p className={`${TEXT_ROLE.caption} font-mono break-all`}>
                            {serverUrl}
                        </p>
                    </div>
                    <div className="flex items-center gap-tools">
                        <Button
                            size="md"
                            variant="ghost"
                            onPress={() => setShowAdvanced(true)}
                        >
                            {t("settings.connection.show_advanced")}
                        </Button>
                    </div>
                </div>
                <p className={TEXT_ROLE.caption}>
                    {t("settings.connection.local_mode_info")}
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-stage">
            <div className="flex flex-col gap-tools sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-tight">
                    <h3 className={`${TEXT_ROLE.headingSection} truncate`}>
                        {profileLabel}
                    </h3>
                    <p className={`${TEXT_ROLE.caption} font-mono break-all`}>
                        {serverUrl}
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-stage">
                    <div className="flex items-center gap-tools">
                        <Chip
                            size="md"
                            variant="shadow"
                            color={statusColor}
                            startContent={
                                statusColor === "success" ? (
                                    <CheckCircle
                                        strokeWidth={ICON_STROKE_WIDTH}
                                        className="toolbar-icon-size-sm shrink-0"
                                    />
                                ) : (
                                    <XCircle
                                        strokeWidth={ICON_STROKE_WIDTH}
                                        className="toolbar-icon-size-sm shrink-0"
                                    />
                                )
                            }
                        >
                            {connectionStatusLabel}
                        </Chip>
                        <div className="space-y-tight">
                            <p className={TEXT_ROLE.label}>
                                {t("settings.connection.ui_mode_label")}
                            </p>
                            <p className={TEXT_ROLE.headingSection}>
                                {t(modeLabelKey)}
                            </p>
                            <p className={TEXT_ROLE.caption}>
                                {t(modeSummaryKey)}
                            </p>
                        </div>
                    </div>
                    <Button
                        size="md"
                        variant="shadow"
                        color="primary"
                        onPress={() => {
                            void handleReconnect();
                        }}
                        type="button"
                        startContent={
                            <RefreshCw
                                strokeWidth={ICON_STROKE_WIDTH}
                                className="toolbar-icon-size-sm shrink-0"
                            />
                        }
                    >
                        {t("settings.connection.reconnect")}
                    </Button>
                </div>
            </div>
            <div className="grid gap-tools">
                {isOffline && (
                    <p
                        className={withColor(TEXT_ROLE.label, "warning")}
                        style={{ letterSpacing: "var(--tt-tracking-wide)" }}
                    >
                        {t("settings.connection.offline_warning")}
                    </p>
                )}
                {isInsecureBasicAuth && (
                    <p className={withColor(TEXT_ROLE.caption, "warning")}>
                        {t("settings.connection.insecure_basic_auth_warning")}
                    </p>
                )}
                <div className="grid gap-tools sm:grid-cols-2">
                    <Input
                        label={t("settings.connection.host")}
                        labelPlacement="outside"
                        variant="bordered"
                        size="md"
                        value={activeProfile.host}
                        onChange={(event) =>
                            handleUpdate({ host: event.target.value })
                        }
                        className="h-button"
                        disabled={!remoteInputsEnabled}
                    />
                    <Input
                        label={t("settings.connection.port")}
                        variant="bordered"
                        labelPlacement="outside"
                        size="md"
                        type="text"
                        value={activeProfile.port}
                        onChange={(event) =>
                            handleUpdate({ port: event.target.value })
                        }
                        className="h-button"
                        disabled={!remoteInputsEnabled}
                    />
                </div>
                {shouldShowAuthControls && (
                    <>
                        {!isAuthModeResolved && (
                            <p className={TEXT_ROLE.caption}>
                                {t("settings.connection.detecting_signin")}
                            </p>
                        )}
                        <div className="grid gap-tools sm:grid-cols-2">
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
                    </>
                )}
                {isNativeMode && !showAdvanced && (
                    <p className={`${TEXT_ROLE.caption} mt-tight`}>
                        {t("settings.connection.local_mode_info")}
                    </p>
                )}
            </div>
        </div>
    );
}
