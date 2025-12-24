import { Button, Chip, Input, Switch } from "@heroui/react";
import { RefreshCw, CheckCircle, XCircle, Download } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { RpcStatus } from "@/shared/types/rpc";
import type { TinyTorrentCapabilities } from "@/services/rpc/entities";
import {
    useConnectionConfig,
    buildRpcEndpoint,
    buildRpcServerUrl,
    type ConnectionProfile,
    DEFAULT_PROFILE_ID,
} from "@/app/context/ConnectionConfigContext";
import Runtime from "@/app/runtime";
import {
    useRpcExtension,
    type RpcExtensionAvailability,
} from "@/app/context/RpcExtensionContext";

interface ConnectionManagerProps {
    rpcStatus: RpcStatus;
    onReconnect: () => void;
}

interface ConnectionExtensionCardProps {
    rpcStatus: RpcStatus;
}

interface ConnectionManagerState {
    activeProfile: ConnectionProfile;
    handleUpdate: (patch: Partial<ConnectionProfile>) => void;
    endpointPreview: string;
    isOffline: boolean;
    availability: RpcExtensionAvailability;
    capabilities: TinyTorrentCapabilities | null;
    isRefreshing: boolean;
    refresh: () => void;
    enabled: boolean;
    setEnabled: (value: boolean) => void;
    featureList: string[];
    showTokenInput: boolean;
    websocketEndpoint?: string;
    isMocked: boolean;
    mockNoticeVisible: boolean;
}

function useConnectionManagerState(
    rpcStatus: RpcStatus
): ConnectionManagerState {
    const { activeProfile, updateProfile } = useConnectionConfig();
    const {
        availability,
        capabilities,
        isRefreshing,
        refresh,
        enabled,
        setEnabled,
        isMocked,
        mockNoticeVisible,
    } = useRpcExtension();
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
    const featureList = useMemo(() => {
        if (availability !== "available") {
            return [];
        }
        return capabilities?.features ?? [];
    }, [availability, capabilities]);
    const showTokenInput = availability === "available";
    const websocketEndpoint =
        capabilities?.websocketPath ?? capabilities?.websocketEndpoint;
    return {
        activeProfile,
        handleUpdate,
        endpointPreview,
        isOffline: rpcStatus === "error",
        availability,
        capabilities,
        isRefreshing,
        refresh,
        enabled,
        setEnabled,
        featureList,
        showTokenInput,
        websocketEndpoint,
        isMocked,
        mockNoticeVisible,
    };
}

type ServerType = "tinytorrent" | "transmission" | "detecting" | null;

export function ConnectionCredentialsCard({
    rpcStatus,
    onReconnect,
}: ConnectionManagerProps) {
    const { t } = useTranslation();
    const [showAdvanced, setShowAdvanced] = useState(false);
    const { activeProfile, handleUpdate, isOffline, availability } =
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

        switch (availability) {
            case "available":
                return "tinytorrent";
            case "unavailable":
            case "error":
                return "transmission";
            default:
                return "detecting";
        }
    }, [availability, rpcStatus]);

    const serverTypeLabel = useMemo(() => {
        if (!serverType) return null;

        return t(`settings.connection.server_type_${serverType}`);
    }, [serverType, t]);

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
    const isAuthModeResolved =
        rpcStatus === "error" ||
        (rpcStatus === "connected" &&
            availability !== "idle" &&
            availability !== "loading");
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
    if (!Runtime.allowEditingProfiles() && !showAdvanced) {
        return (
            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <div className="min-w-0 space-y-1">
                        <h3 className="text-sm font-semibold text-foreground truncate">
                            {profileLabel}
                        </h3>
                        <p className="text-xs text-foreground/60 font-mono break-all">
                            {serverUrl}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            size="sm"
                            variant="ghost"
                            onPress={() => setShowAdvanced(true)}
                        >
                            {t("settings.connection.show_advanced", "Advanced")}
                        </Button>
                    </div>
                </div>
                <p className="text-xs text-foreground/60">
                    {t(
                        "settings.connection.local_mode_info",
                        "Using bundled local daemon — remote settings are disabled."
                    )}
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-1">
                    <h3 className="text-sm font-semibold text-foreground truncate">
                        {profileLabel}
                    </h3>
                    <p className="text-xs text-foreground/60 font-mono break-all">
                        {serverUrl}
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-8">
                    <div className="flex items-center gap-2">
                        <Chip
                            size="sm"
                            variant="light"
                            color={statusColor}
                            startContent={
                                statusColor === "success" ? (
                                    <CheckCircle size={14} />
                                ) : (
                                    <XCircle size={14} />
                                )
                            }
                        >
                            {connectionStatusLabel}
                        </Chip>
                        {serverType && serverTypeLabel && (
                            <Chip
                                size="sm"
                                variant="light"
                                color="default"
                                startContent={
                                    serverType === "tinytorrent" ? (
                                        <img
                                            src="/tinyTorrent.svg"
                                            alt=""
                                            className="h-3.5 w-3.5"
                                        />
                                    ) : serverType === "transmission" ? (
                                        <Download size={14} />
                                    ) : null
                                }
                            >
                                {serverTypeLabel}
                            </Chip>
                        )}
                    </div>
                    <Button
                        size="sm"
                        variant="shadow"
                        color="primary"
                        onPress={onReconnect}
                        type="button"
                        startContent={<RefreshCw size={16} />}
                    >
                        {t("settings.connection.reconnect")}
                    </Button>
                </div>
            </div>
            <div className="grid gap-3">
                {isOffline && (
                    <p className="text-xs uppercase tracking-[0.2em] text-warning">
                        {t("settings.connection.offline_warning")}
                    </p>
                )}
                {isInsecureBasicAuth && (
                    <p className="text-xs text-warning">
                        {t("settings.connection.insecure_basic_auth_warning")}
                    </p>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                    <Input
                        label={t("settings.connection.host")}
                        labelPlacement="outside"
                        variant="bordered"
                        size="sm"
                        value={activeProfile.host}
                        onChange={(event) =>
                            handleUpdate({ host: event.target.value })
                        }
                        className="h-[length:var(--button-h)]"
                        disabled={!Runtime.enableRemoteInputs()}
                    />
                    <Input
                        label={t("settings.connection.port")}
                        variant="bordered"
                        labelPlacement="outside"
                        size="sm"
                        type="text"
                        value={activeProfile.port}
                        onChange={(event) =>
                            handleUpdate({ port: event.target.value })
                        }
                        className="h-[length:var(--button-h)]"
                        disabled={!Runtime.enableRemoteInputs()}
                    />
                </div>
                {shouldShowAuthControls && (
                    <>
                        {!isAuthModeResolved && (
                            <p className="text-xs text-foreground/60">
                                {t("settings.connection.detecting_signin")}
                            </p>
                        )}
                        <Input
                            label={t("settings.connection.token")}
                            labelPlacement="outside"
                            variant="bordered"
                            size="sm"
                            value={activeProfile.token}
                            onChange={(event) =>
                                handleUpdate({
                                    token: event.target.value,
                                })
                            }
                            disabled={!Runtime.enableRemoteInputs()}
                        />
                        {!activeProfile.token && (
                            <div className="grid gap-3 sm:grid-cols-2">
                                <Input
                                    label={t("settings.connection.username")}
                                    labelPlacement="outside"
                                    variant="bordered"
                                    size="sm"
                                    value={activeProfile.username}
                                    onChange={(event) =>
                                        handleUpdate({
                                            username: event.target.value,
                                        })
                                    }
                                    disabled={!Runtime.enableRemoteInputs()}
                                />
                                <Input
                                    label={t("settings.connection.password")}
                                    labelPlacement="outside"
                                    variant="bordered"
                                    size="sm"
                                    type="password"
                                    value={activeProfile.password}
                                    onChange={(event) =>
                                        handleUpdate({
                                            password: event.target.value,
                                        })
                                    }
                                    disabled={!Runtime.enableRemoteInputs()}
                                />
                            </div>
                        )}
                    </>
                )}
                {!Runtime.allowEditingProfiles() && (
                    <p className="text-xs text-foreground/60 mt-2">
                        {t(
                            "settings.connection.local_mode_info",
                            "Using bundled local daemon — remote settings are disabled."
                        )}
                    </p>
                )}
            </div>
        </div>
    );
}

export function ConnectionExtensionCard({
    rpcStatus,
}: ConnectionExtensionCardProps) {
    const { t } = useTranslation();
    const { enabled, setEnabled, availability, mockNoticeVisible } =
        useConnectionManagerState(rpcStatus);
    const extensionModeHelper = useMemo(() => {
        switch (availability) {
            case "available":
                return t(
                    "settings.connection.extension_mode_helper_tinytorrent"
                );

            case "unavailable":
                return t(
                    "settings.connection.extension_mode_helper_transmission"
                );

            case "error":
            default:
                return t("settings.connection.extension_mode_helper");
        }
    }, [availability, t]);

    return (
        <div className="space-y-2">
            <Switch
                size="sm"
                isSelected={enabled}
                onValueChange={(value) => setEnabled(value)}
                aria-label={t("settings.connection.extension_mode_label")}
                classNames={{
                    base: "w-full max-w-none items-start",
                    wrapper: "shrink-0 mt-1",
                }}
            >
                <div className="flex flex-col gap-1">
                    <span className="text-sm font-semibold text-foreground">
                        {t("settings.connection.extension_mode_label")}
                    </span>
                    <span className="text-xs text-foreground/60">
                        {extensionModeHelper}
                    </span>
                </div>
            </Switch>
            {mockNoticeVisible && (
                <p className="text-xs text-warning/80">
                    {t("settings.connection.extended_mock_notice")}
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
