import { Button, Chip, Input, Switch } from "@heroui/react";
import { RefreshCw, CheckCircle, XCircle, Download } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { RpcStatus } from "@/shared/types/rpc";
import type { ServerClass } from "@/services/rpc/entities";
import {
    useConnectionConfig,
    buildRpcEndpoint,
    buildRpcServerUrl,
    type ConnectionProfile,
    DEFAULT_PROFILE_ID,
} from "@/app/context/ConnectionConfigContext";

interface ConnectionManagerProps {
    rpcStatus: RpcStatus;
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

function useConnectionManagerState(
    rpcStatus: RpcStatus
): ConnectionManagerState {
    const { activeProfile, updateProfile } = useConnectionConfig();
    const handleUpdate = useCallback(
        (
            patch: Partial<
                Pick<
                    ConnectionProfile,
                    "host" | "port" | "username" | "password" | "token"
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
    return {
        activeProfile,
        handleUpdate,
        endpointPreview,
        isOffline: rpcStatus === "error",
    };
}

type ServerType = "tinytorrent" | "transmission" | null;

export function ConnectionCredentialsCard({
    rpcStatus,
    onReconnect,
    serverClass,
    isNativeMode,
}: ConnectionManagerProps) {
    const { t } = useTranslation();
    const [showAdvanced, setShowAdvanced] = useState(false);
    const { activeProfile, handleUpdate, isOffline } =
        useConnectionManagerState(rpcStatus);
    const connectionStatusLabel = useMemo(() => {
        const map: Record<RpcStatus, string> = {
            connected: t("status_bar.rpc_connected"),
            error: t("status_bar.rpc_error"),
            idle: t("status_bar.rpc_idle"),
        };
        return map[rpcStatus];
    }, [rpcStatus, t]);
    const statusColor = useMemo<"success" | "warning" | "danger">(() => {
        if (rpcStatus === "connected") return "success";
        if (rpcStatus === "error") return "danger";
        return "warning";
    }, [rpcStatus]);

    const serverType = useMemo<ServerType>(() => {
        if (rpcStatus !== "connected") return null;
        if (serverClass === "tinytorrent") return "tinytorrent";
        if (serverClass === "transmission") return "transmission";
        return null;
    }, [rpcStatus, serverClass]);

    const serverTypeLabel = useMemo(() => {
        if (!serverType) return null;

        return t(`settings.connection.server_type_${serverType}`);
    }, [serverType, t]);

    const remoteInputsEnabled = !isNativeMode;

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
    const isAuthModeResolved = rpcStatus === "connected";
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
                            {t("settings.connection.show_advanced", "Advanced")}
                        </Button>
                    </div>
                </div>
                <p className="text-label text-foreground/60">
                    {t(
                        "settings.connection.local_mode_info",
                        "Using bundled local daemon - remote settings are disabled."
                    )}
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
                                        style={{
                                            width: "var(--tt-icon-size)",
                                            height: "var(--tt-icon-size)",
                                        }}
                                    />
                                ) : (
                                    <XCircle
                                        style={{
                                            width: "var(--tt-icon-size)",
                                            height: "var(--tt-icon-size)",
                                        }}
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
                                            style={{
                                                width: "var(--tt-icon-size)",
                                                height: "var(--tt-icon-size)",
                                            }}
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
                                style={{
                                    width: "var(--tt-icon-size)",
                                    height: "var(--tt-icon-size)",
                                }}
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
                        <Input
                            label={t("settings.connection.token")}
                            labelPlacement="outside"
                            variant="bordered"
                            size="md"
                            value={activeProfile.token}
                            onChange={(event) =>
                                handleUpdate({
                                    token: event.target.value,
                                })
                            }
                            disabled={!remoteInputsEnabled}
                        />
                        {!activeProfile.token && (
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
                        )}
                    </>
                )}
                {isNativeMode && (
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

export function ConnectionManager(props: ConnectionManagerProps) {
    return (
        <>
            <ConnectionCredentialsCard {...props} />
        </>
    );
}
