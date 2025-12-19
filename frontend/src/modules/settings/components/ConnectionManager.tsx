import { Button, Chip, Input } from "@heroui/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { EngineAdapter } from "@/services/rpc/engine-adapter";
import type { TinyTorrentCapabilities } from "@/services/rpc/entities";
import type { RpcStatus } from "@/shared/types/rpc";
import { GlassPanel } from "@/shared/ui/layout/GlassPanel";
import {
    useConnectionConfig,
    buildRpcEndpoint,
    type ConnectionProfile,
} from "@/app/context/ConnectionConfigContext";

interface ConnectionManagerProps {
    rpcStatus: RpcStatus;
    onReconnect: () => void;
    torrentClient: EngineAdapter;
}

type ExtendedState =
    | { status: "idle" }
    | { status: "loading" }
    | { status: "available"; info: TinyTorrentCapabilities }
    | { status: "unavailable" }
    | { status: "error" };

export function ConnectionManager({
    rpcStatus,
    onReconnect,
    torrentClient,
}: ConnectionManagerProps) {
    const { t } = useTranslation();
    const { activeProfile, updateProfile } = useConnectionConfig();
    const [extendedState, setExtendedState] = useState<ExtendedState>({
        status: "idle",
    });
    const isOffline = rpcStatus !== "connected";

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

    const refreshExtendedState = useCallback(async () => {
        if (isOffline || !torrentClient.getExtendedCapabilities) {
            setExtendedState({ status: "unavailable" });
            return;
        }
        setExtendedState({ status: "loading" });
        try {
            const info = await torrentClient.getExtendedCapabilities?.(true);
            if (info) {
                setExtendedState({ status: "available", info });
            } else {
                setExtendedState({ status: "unavailable" });
            }
        } catch {
            setExtendedState({ status: "error" });
        }
    }, [isOffline, torrentClient]);

    useEffect(() => {
        if (rpcStatus !== "connected") {
            setExtendedState({ status: "idle" });
            return;
        }
        void refreshExtendedState();
    }, [refreshExtendedState, rpcStatus]);

    const statusLabel = useMemo(() => {
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

    const extendedLabel = useMemo(() => {
        switch (extendedState.status) {
            case "available":
                return t("settings.connection.extended_available");
            case "loading":
                return t("settings.connection.extended_checking");
            case "error":
                return t("settings.connection.extended_error");
            case "unavailable":
                return t("settings.connection.extended_unavailable");
            default:
                return t("settings.connection.extended_unknown");
        }
    }, [extendedState.status, t]);

    const extendedColor = useMemo<
        "success" | "danger" | "warning" | "primary"
    >(() => {
        switch (extendedState.status) {
            case "available":
                return "success";
            case "error":
                return "danger";
            case "loading":
                return "primary";
            case "unavailable":
                return "warning";
            default:
                return "primary";
        }
    }, [extendedState.status]);

    const featureSummary = useMemo(() => {
        if (
            extendedState.status !== "available" ||
            extendedState.info.features.length === 0
        ) {
            return null;
        }
        return extendedState.info.features.join(", ");
    }, [extendedState]);
    const showTokenInput = extendedState.status === "available";
    const endpointPreview = useMemo(
        () => buildRpcEndpoint(activeProfile),
        [activeProfile]
    );

    return (
        <div className="space-y-5">
            <GlassPanel className="p-5 space-y-4 border border-content1/20 bg-content1/80">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                        <p className="text-[10px] uppercase tracking-[0.4em] text-foreground/40">
                            {t("settings.connection.current_connection")}
                        </p>
                        <h3 className="text-sm font-semibold text-foreground truncate">
                            {activeProfile.label ||
                                t("settings.connection.profile_placeholder")}
                        </h3>
                        <p className="text-xs text-foreground/60">
                            {endpointPreview}
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <Chip size="sm" variant="flat" color={statusColor}>
                            {statusLabel}
                        </Chip>
                        <Button
                            size="sm"
                            variant="light"
                            color="primary"
                            onPress={onReconnect}
                            type="button"
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
                            className="h-[42px]"
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
                            className="h-[42px]"
                        />
                    </div>
                    {extendedState.status !== "idle" &&
                        extendedState.status !== "loading" && (
                            <>
                                {showTokenInput ? (
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
                                    />
                                ) : (
                                    <div className="grid gap-3 sm:grid-cols-2">
                                        <Input
                                            label={t(
                                                "settings.connection.username"
                                            )}
                                            labelPlacement="outside"
                                            variant="bordered"
                                            size="sm"
                                            value={activeProfile.username}
                                            onChange={(event) =>
                                                handleUpdate({
                                                    username:
                                                        event.target.value,
                                                })
                                            }
                                        />
                                        <Input
                                            label={t(
                                                "settings.connection.password"
                                            )}
                                            labelPlacement="outside"
                                            variant="bordered"
                                            size="sm"
                                            type="password"
                                            value={activeProfile.password}
                                            onChange={(event) =>
                                                handleUpdate({
                                                    password:
                                                        event.target.value,
                                                })
                                            }
                                        />
                                    </div>
                                )}
                            </>
                        )}
                </div>
            </GlassPanel>

            <GlassPanel className="p-5 space-y-4 border border-content1/20 bg-content1/80">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                        <p className="text-[10px] uppercase tracking-[0.4em] text-foreground/40">
                            {t("settings.connection.extended_title")}
                        </p>
                        <h3 className="text-sm font-semibold text-foreground">
                            {t("settings.connection.extended_subtitle")}
                        </h3>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <Chip size="sm" variant="flat" color={extendedColor}>
                            {extendedLabel}
                        </Chip>
                        <Button
                            size="sm"
                            variant="light"
                            color="primary"
                            disabled={
                                extendedState.status === "loading" || isOffline
                            }
                            onPress={refreshExtendedState}
                            type="button"
                        >
                            {t("settings.connection.extended_check_button")}
                        </Button>
                    </div>
                </div>
                <div className="space-y-2">
                    {isOffline && (
                        <div className="rounded-medium border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
                            {t("settings.connection.extended_offline")}
                        </div>
                    )}

                    {extendedState.status === "available" && featureSummary && (
                        <div className="rounded-medium border border-content1/30 bg-content1/60 px-3 py-2 text-xs text-foreground/70">
                            {t("settings.connection.extended_features", {
                                features: featureSummary,
                            })}
                        </div>
                    )}

                    {extendedState.status === "available" &&
                        !featureSummary && (
                            <div className="rounded-medium border border-content1/30 bg-content1/60 px-3 py-2 text-xs text-foreground/70">
                                {t(
                                    "settings.connection.extended_features_none"
                                )}
                            </div>
                        )}

                    {extendedState.status === "available" &&
                        extendedState.info?.platform && (
                            <div className="rounded-medium border border-content1/30 bg-content1/60 px-3 py-2 text-xs text-foreground/70">
                                {t("settings.connection.extended_platform", {
                                    platform: extendedState.info.platform,
                                })}
                            </div>
                        )}

                    {extendedState.status === "available" &&
                        extendedState.info && (
                            <>
                                <div className="rounded-medium border border-content1/30 bg-content1/60 px-3 py-2 text-xs text-foreground/70">
                                    {t("settings.connection.extended_version", {
                                        serverVersion:
                                            extendedState.info.serverVersion ??
                                            extendedState.info.version ??
                                            t(
                                                "settings.connection.extended_version_unknown"
                                            ),
                                        rpcVersion:
                                            extendedState.info.rpcVersion,
                                    })}
                                </div>

                                {(extendedState.info.websocketPath ||
                                    extendedState.info.websocketEndpoint) && (
                                    <div className="rounded-medium border border-content1/30 bg-content1/60 px-3 py-2 text-xs text-foreground/70">
                                        {t(
                                            "settings.connection.extended_websocket",
                                            {
                                                path:
                                                    extendedState.info
                                                        .websocketPath ??
                                                    extendedState.info
                                                        .websocketEndpoint,
                                            }
                                        )}
                                    </div>
                                )}
                            </>
                        )}

                    {extendedState.status === "idle" && (
                        <div className="rounded-medium border border-content1/20 bg-content1/40 px-3 py-2 text-xs text-foreground/60">
                            {t("settings.connection.extended_helper")}
                        </div>
                    )}

                    {extendedState.status === "loading" && (
                        <div className="rounded-medium border border-content1/20 bg-content1/40 px-3 py-2 text-xs text-foreground/60">
                            {t("settings.connection.extended_checking")}
                        </div>
                    )}

                    {extendedState.status === "unavailable" && (
                        <div className="rounded-medium border border-content1/20 bg-content1/40 px-3 py-2 text-xs text-foreground/60">
                            {t("settings.connection.extended_unavailable")}
                        </div>
                    )}

                    {extendedState.status === "error" && (
                        <div className="rounded-medium border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
                            {t("settings.connection.extended_error")}
                        </div>
                    )}
                </div>
            </GlassPanel>
        </div>
    );
}
