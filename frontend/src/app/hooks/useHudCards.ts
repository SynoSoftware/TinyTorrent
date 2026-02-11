import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useSession } from "@/app/context/SessionContext";
import { AlertTriangle, Link2, MousePointer, PlugZap } from "lucide-react";
import { STATUS_VISUALS } from "@/config/logic";

import { STATUS } from "@/shared/status";
import type { AmbientHudCard } from "@/app/types/workspace";

interface UseHudCardsParams {
    isDragActive: boolean;
    dismissedHudCardSet: Set<string>;
}
// TODO: Align HUD cards with the “single authority” model:
// TODO: - Connection/engine labels shown to users must come from the Session+UiMode provider, not raw `engineInfo`.
// TODO: - In user-facing UX, prefer `uiMode="Full" => TinyTorrent` and `uiMode="Rpc" => Transmission` (both are Transmission RPC; uiMode is about ShellExtensions).
// TODO: - Keep `engineInfo` only for diagnostics panels / debug overlays.

export function useHudCards({
    isDragActive,
    dismissedHudCardSet,
}: UseHudCardsParams) {
    const { rpcStatus, engineInfo, isDetectingEngine } = useSession();
    const { t } = useTranslation();

    const hudCards = useMemo<AmbientHudCard[]>(() => {
        const engineLabel = engineInfo?.name
            ? engineInfo.name
            : t("workspace.stage.engine_fallback");
        const engineVersionLabel = engineInfo?.version
            ? ` v${engineInfo.version}`
            : "";
        let connectionTitle = "";
        let connectionDescription = "";
        let connectionSurface = "";
        let connectionIconBg = "";
        const connectionVisual =
            STATUS_VISUALS[rpcStatus] ?? STATUS_VISUALS[STATUS.connection.CONNECTED];
        const connectionIcon =
            rpcStatus === STATUS.connection.ERROR ? AlertTriangle : PlugZap;

        if (rpcStatus === STATUS.connection.CONNECTED) {
            connectionTitle = t("workspace.stage.connection_online_title");
            connectionDescription = t(
                "workspace.stage.connection_online_description",
                {
                    engine: engineLabel,
                    version: engineVersionLabel,
                },
            );
            connectionSurface =
                connectionVisual?.hudSurface ??
                "bg-gradient-to-br from-success/15 via-background/30 to-background/10";
            connectionIconBg =
                connectionVisual?.hudIconBg ?? "bg-success/15 text-success";
        } else if (rpcStatus === STATUS.connection.IDLE) {
            connectionTitle = isDetectingEngine
                ? t("workspace.stage.connection_detecting_title")
                : t("workspace.stage.connection_idle_title");
            connectionDescription = isDetectingEngine
                ? t("workspace.stage.connection_detecting_description")
                : t("workspace.stage.connection_idle_description");
            connectionSurface =
                connectionVisual?.hudSurface ??
                "bg-gradient-to-br from-warning/15 via-background/30 to-background/5";
            connectionIconBg =
                connectionVisual?.hudIconBg ?? "bg-warning/15 text-warning";
        } else {
            connectionTitle = t("workspace.stage.connection_error_title");
            connectionDescription = t(
                "workspace.stage.connection_error_description",
            );
            connectionSurface =
                connectionVisual?.hudSurface ??
                "bg-gradient-to-br from-danger/20 via-background/25 to-background/5";
            connectionIconBg =
                connectionVisual?.hudIconBg ?? "bg-danger/15 text-danger";
        }

        const dragTitle = isDragActive
            ? t("workspace.stage.drop_active_title")
            : t("workspace.stage.drop_idle_title");
        const dragDescription = isDragActive
            ? t("workspace.stage.drop_active_description")
            : t("workspace.stage.drop_idle_description");
        const dragSurface = isDragActive
            ? "bg-gradient-to-br from-primary/20 via-primary/5 to-transparent"
            : "bg-gradient-to-br from-content1/10 via-content1/5 to-transparent";
        const dragIconBg = isDragActive
            ? "bg-primary/15 text-primary"
            : "bg-foreground/10 text-foreground/60";

        const deepLinkTitle = t("workspace.stage.deeplink_idle_title");
        const deepLinkDescription = t(
            "workspace.stage.deeplink_idle_description",
        );
        const deepSurface =
            "bg-gradient-to-br from-foreground/10 via-background/30 to-transparent";
        const deepIconBg = "bg-foreground/10 text-foreground/60";

        return [
            {
                id: "connection",
                label: t("workspace.stage.connection_label"),
                title: connectionTitle,
                description: connectionDescription,
                surfaceClass: connectionSurface,
                iconBgClass: connectionIconBg,
                icon: connectionIcon,
            },
            {
                id: "drop",
                label: t("workspace.stage.drop_label"),
                title: dragTitle,
                description: dragDescription,
                surfaceClass: dragSurface,
                iconBgClass: dragIconBg,
                icon: MousePointer,
            },
            {
                id: "deeplink",
                label: t("workspace.stage.deeplink_label"),
                title: deepLinkTitle,
                description: deepLinkDescription,
                surfaceClass: deepSurface,
                iconBgClass: deepIconBg,
                icon: Link2,
            },
        ];
    }, [isDetectingEngine, isDragActive, rpcStatus, engineInfo, t]);

    const visibleHudCards = useMemo(
        () => hudCards.filter((card) => !dismissedHudCardSet.has(card.id)),
        [hudCards, dismissedHudCardSet],
    );

    return {
        hudCards,
        visibleHudCards,
    };
}
