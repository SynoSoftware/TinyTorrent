import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Link2, MousePointer, PlugZap } from "lucide-react";

import type { EngineInfo } from "../../services/rpc/entities";
import type { RpcStatus } from "../../shared/types/rpc";
import type { AmbientHudCard } from "../types/workspace";

const formatMicrocopyValue = (value: string, max = 48) => {
    if (!value) return "";
    if (value.length <= max) return value;
    return `${value.slice(0, max)}...`;
};

interface UseHudCardsParams {
    rpcStatus: RpcStatus;
    engineInfo: EngineInfo | null;
    isDetectingEngine: boolean;
    isDragActive: boolean;
    pendingTorrentFile: File | null;
    incomingMagnetLink: string | null;
    dismissedHudCardSet: Set<string>;
}

export function useHudCards({
    rpcStatus,
    engineInfo,
    isDetectingEngine,
    isDragActive,
    pendingTorrentFile,
    incomingMagnetLink,
    dismissedHudCardSet,
}: UseHudCardsParams) {
    const { t } = useTranslation();

    const hudCards = useMemo<AmbientHudCard[]>(() => {
        const engineLabel = engineInfo?.name
            ? engineInfo.name
            : t("workspace.stage.engine_fallback", {
                  defaultValue: "Torrent engine",
              });
        const engineVersionLabel = engineInfo?.version
            ? ` v${engineInfo.version}`
            : "";
        let connectionTitle = "";
        let connectionDescription = "";
        let connectionSurface = "";
        let connectionIconBg = "";
        const connectionIcon =
            rpcStatus === "error" ? AlertTriangle : PlugZap;

        if (rpcStatus === "connected") {
            connectionTitle = t("workspace.stage.connection_online_title", {
                defaultValue: "Link secured",
            });
            connectionDescription = t(
                "workspace.stage.connection_online_description",
                {
                    defaultValue: `Talking to ${engineLabel}${engineVersionLabel}`,
                }
            );
            connectionSurface =
                "bg-gradient-to-br from-success/15 via-background/30 to-background/10";
            connectionIconBg = "bg-success/15 text-success";
        } else if (rpcStatus === "idle") {
            connectionTitle = isDetectingEngine
                ? t("workspace.stage.connection_detecting_title", {
                      defaultValue: "Detecting client",
                  })
                : t("workspace.stage.connection_idle_title", {
                      defaultValue: "Waiting for engine",
                  });
            connectionDescription = isDetectingEngine
                ? t("workspace.stage.connection_detecting_description", {
                      defaultValue: "Scanning your local adapters...",
                  })
                : t("workspace.stage.connection_idle_description", {
                      defaultValue: "Open your client or tap reconnect.",
                  });
            connectionSurface =
                "bg-gradient-to-br from-warning/15 via-background/30 to-background/5";
            connectionIconBg = "bg-warning/15 text-warning";
        } else {
            connectionTitle = t("workspace.stage.connection_error_title", {
                defaultValue: "Connection interrupted",
            });
            connectionDescription = t(
                "workspace.stage.connection_error_description",
                {
                    defaultValue:
                        "We're retrying automatically--use Reconnect for a manual nudge.",
                }
            );
            connectionSurface =
                "bg-gradient-to-br from-danger/20 via-background/25 to-background/5";
            connectionIconBg = "bg-danger/15 text-danger";
        }

        const dragTitle = isDragActive
            ? t("workspace.stage.drop_active_title", {
                  defaultValue: "Release to queue",
              })
            : pendingTorrentFile
            ? t("workspace.stage.drop_file_ready_title", {
                  defaultValue: "File staged",
              })
            : t("workspace.stage.drop_idle_title", {
                  defaultValue: "Drop torrents anywhere",
              });
        const dragDescription = isDragActive
            ? t("workspace.stage.drop_active_description", {
                  defaultValue: "We'll parse and schedule this payload instantly.",
              })
            : pendingTorrentFile
            ? t("workspace.stage.drop_file_ready_description", {
                  defaultValue: `Primed: ${formatMicrocopyValue(
                      pendingTorrentFile.name,
                      34
                  )}`,
              })
            : t("workspace.stage.drop_idle_description", {
                  defaultValue:
                      "Drag .torrent files or folders across the stage to fast-track importing.",
              });
        const dragSurface = isDragActive
            ? "bg-gradient-to-br from-primary/20 via-primary/5 to-transparent"
            : "bg-gradient-to-br from-content1/10 via-content1/5 to-transparent";
        const dragIconBg = isDragActive
            ? "bg-primary/15 text-primary"
            : "bg-foreground/10 text-foreground/60";

        const deepLinkReady = Boolean(incomingMagnetLink);
        const magnetPreview = incomingMagnetLink
            ? formatMicrocopyValue(incomingMagnetLink, 60)
            : "";
        const deepLinkTitle = deepLinkReady
            ? t("workspace.stage.deeplink_ready_title", {
                  defaultValue: "Magnet captured",
              })
            : t("workspace.stage.deeplink_idle_title", {
                  defaultValue: "Deep links armed",
              });
        const deepLinkDescription = deepLinkReady
            ? t("workspace.stage.deeplink_ready_description", {
                  defaultValue: `Composer pre-filled with ${magnetPreview}`,
              })
            : t("workspace.stage.deeplink_idle_description", {
                  defaultValue:
                      "Share any magnet:? URL or magnet query to auto-open the Add modal.",
              });
        const deepSurface = deepLinkReady
            ? "bg-gradient-to-br from-pink-500/20 via-background/30 to-transparent"
            : "bg-gradient-to-br from-foreground/10 via-background/30 to-transparent";
        const deepIconBg = deepLinkReady
            ? "bg-pink-500/20 text-pink-50"
            : "bg-foreground/10 text-foreground/60";

        return [
            {
                id: "connection",
                label: t("workspace.stage.connection_label", {
                    defaultValue: "Connection health",
                }),
                title: connectionTitle,
                description: connectionDescription,
                surfaceClass: connectionSurface,
                iconBgClass: connectionIconBg,
                icon: connectionIcon,
            },
            {
                id: "drop",
                label: t("workspace.stage.drop_label", {
                    defaultValue: "Drag & drop",
                }),
                title: dragTitle,
                description: dragDescription,
                surfaceClass: dragSurface,
                iconBgClass: dragIconBg,
                icon: MousePointer,
            },
            {
                id: "deeplink",
                label: t("workspace.stage.deeplink_label", {
                    defaultValue: "Deep-link submissions",
                }),
                title: deepLinkTitle,
                description: deepLinkDescription,
                surfaceClass: deepSurface,
                iconBgClass: deepIconBg,
                icon: Link2,
            },
        ];
    }, [
        incomingMagnetLink,
        isDetectingEngine,
        isDragActive,
        pendingTorrentFile,
        rpcStatus,
        engineInfo,
        t,
    ]);

    const visibleHudCards = useMemo(
        () =>
            hudCards.filter((card) => !dismissedHudCardSet.has(card.id)),
        [hudCards, dismissedHudCardSet]
    );

    return {
        hudCards,
        visibleHudCards,
    };
}
