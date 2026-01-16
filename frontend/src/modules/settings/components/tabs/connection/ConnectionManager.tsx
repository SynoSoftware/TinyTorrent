import { Button, Chip, Input, Switch } from "@heroui/react";
import { RefreshCw, CheckCircle, XCircle, Download } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ICON_STROKE_WIDTH } from "@/config/logic";
import { STATUS } from "@/shared/status";
import type { ConnectionStatus } from "@/shared/types/rpc";
import type { ServerClass } from "@/services/rpc/entities";
import {
    useConnectionConfig,
    buildRpcEndpoint,
    buildRpcServerUrl,
    type ConnectionProfile,
    DEFAULT_PROFILE_ID,
} from "@/app/context/ConnectionConfigContext";
import { useLifecycle } from "@/app/context/LifecycleContext";
<<<<<<< Updated upstream
=======
// TODO: ServerType/serverClass UI still needs consolidation. With “RPC extensions: NONE”, connection manager should manage only:
// TODO: - Transmission endpoint (host/port/scheme/path)
// TODO: - Transmission Basic Auth (username/password)
// TODO: Host-backed UI features are NOT a different server type; they are a locality-derived capability (localhost + ShellAgent/ShellExtensions available).
// TODO: The “TinyTorrent server” label must be removed from this UX to avoid implying a different daemon protocol.
>>>>>>> Stashed changes

interface ConnectionManagerProps {
    onReconnect: () => void;
    serverClass: ServerClass;
    isNativeMode: boolean;
}

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
                Pick<ConnectionProfile, "host" | "port" | "username" | "password">
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
    const { rpcStatus } = useLifecycle();
    return {
        activeProfile,
        handleUpdate,
        endpointPreview,
        isOffline: rpcStatus === STATUS.connection.ERROR,
    };
}

type ServerType = "tinytorrent" | "transmission" | null;

const SERVER_TYPE_LABELS: Record<string, string> = {
    tinytorrent: "settings.connection.server_type_tinytorrent",
    transmission: "settings.connection.server_type_transmission",
};

export function ConnectionCredentialsCard({
    onReconnect,
    serverClass,
    isNativeMode,
}: ConnectionManagerProps) {
    const { t } = useTranslation();
    const [showAdvanced, setShowAdvanced] = useState(false);
    const { activeProfile, handleUpdate, isOffline } =
        useConnectionManagerState();
    const { rpcStatus } = useLifecycle();
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

    const serverType = useMemo<ServerType>(() => {
        if (rpcStatus !== STATUS.connection.CONNECTED) return null;
        if (serverClass === "tinytorrent") return "tinytorrent";
        return "transmission";
    }, [rpcStatus, serverClass]);

    const serverTypeLabel = useMemo(() => {
        if (!serverType) return null;

        return t(
            SERVER_TYPE_LABELS[serverType] ??
                `settings.connection.server_type_${serverType}`
        );
    }, [serverType, t]);

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
                        <h3 className="text-scaled font-semibold text-foreground truncate">
                            {profileLabel}
                        </h3>
                        <p className="text-label text-foreground/60 font-mono break-all">
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
                <p className="text-label text-foreground/60">
                    {t("settings.connection.local_mode_info")}
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-stage">
            <div className="flex flex-col gap-tools sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-tight">
                    <h3 className="text-scaled font-semibold text-foreground truncate">
                        {profileLabel}
                    </h3>
                    <p className="text-label text-foreground/60 font-mono break-all">
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
                        {serverType && serverTypeLabel && (
                            <Chip
                                size="md"
                                variant="shadow"
                                color="default"
                                startContent={
                                    serverType === "tinytorrent" ? (
                                        <img
                                            src="/tinyTorrent.svg"
                                            alt=""
                                            className="size-dot"
                                        />
                                    ) : serverType === "transmission" ? (
                                        <Download
                                            strokeWidth={ICON_STROKE_WIDTH}
                                            className="toolbar-icon-size-sm shrink-0"
                                        />
                                    ) : null
                                }
                            >
                                {serverTypeLabel}
                            </Chip>
                        )}
                    </div>
                    <Button
                        size="md"
                        variant="shadow"
                        color="primary"
                        onPress={onReconnect}
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
                        className="text-label uppercase text-warning"
                        style={{ letterSpacing: "var(--tt-tracking-wide)" }}
                    >
                        {t("settings.connection.offline_warning")}
                    </p>
                )}
                {isInsecureBasicAuth && (
                    <p className="text-label text-warning">
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
                            <p className="text-label text-foreground/60">
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
                    <p className="text-label text-foreground/60 mt-tight">
                        {t(
                            "settings.connection.local_mode_info",
                            "Using bundled local daemon - remote settings are disabled."
                        )}
                    </p>
                )}
            </div>
        </div>
    );
}

interface ConnectionExtensionCardProps {
    serverClass: ServerClass;
}

export function ConnectionExtensionCard({
    serverClass,
}: ConnectionExtensionCardProps) {
    const { t } = useTranslation();
    const { rpcStatus } = useLifecycle();

    const modeLabelKey = useMemo(() => {
        if (rpcStatus !== STATUS.connection.CONNECTED) {
            return "settings.connection.detecting_mode_label";
        }
        if (serverClass === "tinytorrent") {
            return "settings.connection.native_mode_label";
        }
        return "settings.connection.transmission_mode_label";
    }, [rpcStatus, serverClass]);

    const modeDescriptionKey = useMemo(() => {
        if (rpcStatus !== STATUS.connection.CONNECTED) {
            return "settings.connection.detecting_mode_summary";
        }
        if (serverClass === "tinytorrent") {
            return "settings.connection.native_mode_summary";
        }
        return "settings.connection.transmission_mode_summary";
    }, [rpcStatus, serverClass]);

    return (
        <div className="space-y-tight">
            <p className="text-label uppercase text-foreground/60">
                {t("settings.connection.mode_label")}
            </p>
            <p className="text-scaled font-semibold text-foreground">
                {t(modeLabelKey)}
            </p>
            <p className="text-label text-foreground/60">
                {t(modeDescriptionKey)}
            </p>
            {rpcStatus === STATUS.connection.ERROR && (
                <p className="text-label text-warning">
                    {t("settings.connection.offline_warning")}
                </p>
            )}
        </div>
    );
}

export function ConnectionManager(props: ConnectionManagerProps) {
    return (
        <>
            <ConnectionCredentialsCard {...props} />
            <ConnectionExtensionCard {...props} />
        </>
    );
}
