import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useSession } from "@/app/context/SessionContext";
import { AlertTriangle, Link2, MousePointer, PlugZap } from "lucide-react";
import { registry } from "@/config/logic";

import { status } from "@/shared/status";
import type { AmbientHudCard } from "@/app/types/workspace";
const { visuals } = registry;

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
        const connectedVisual =
            visuals.status.recipes[status.connection.connected];
        const idleVisual = visuals.status.recipes[status.connection.idle];
        const offlineVisual = visuals.status.recipes[status.connection.offline];
        const errorVisual = visuals.status.recipes[status.connection.error];
        const fallbackConnectionSurface =
            connectedVisual?.hudSurface ??
            idleVisual?.hudSurface ??
            offlineVisual?.hudSurface ??
            errorVisual?.hudSurface ??
            visuals.workspace.hud.drop.idle.surface;
        const fallbackConnectionIconBg =
            connectedVisual?.hudIconBg ??
            idleVisual?.hudIconBg ??
            offlineVisual?.hudIconBg ??
            errorVisual?.hudIconBg ??
            visuals.workspace.hud.drop.idle.iconBg;
        let connectionTitle = "";
        let connectionDescription = "";
        let connectionSurface = "";
        let connectionIconBg = "";
        const connectionVisual =
            visuals.status.recipes[rpcStatus] ?? visuals.status.recipes[status.connection.connected];
        const connectionIcon =
            rpcStatus === status.connection.error ? AlertTriangle : PlugZap;

        if (rpcStatus === status.connection.connected) {
            connectionTitle = t("workspace.stage.connection_online_title");
            connectionDescription = t(
                "workspace.stage.connection_online_description",
                {
                    engine: engineLabel,
                    version: engineVersionLabel,
                },
            );
            connectionSurface =
                connectionVisual?.hudSurface ?? fallbackConnectionSurface;
            connectionIconBg =
                connectionVisual?.hudIconBg ?? fallbackConnectionIconBg;
        } else if (rpcStatus === status.connection.idle) {
            connectionTitle = isDetectingEngine
                ? t("workspace.stage.connection_detecting_title")
                : t("workspace.stage.connection_idle_title");
            connectionDescription = isDetectingEngine
                ? t("workspace.stage.connection_detecting_description")
                : t("workspace.stage.connection_idle_description");
            connectionSurface =
                connectionVisual?.hudSurface ?? fallbackConnectionSurface;
            connectionIconBg =
                connectionVisual?.hudIconBg ?? fallbackConnectionIconBg;
        } else {
            connectionTitle = t("workspace.stage.connection_error_title");
            connectionDescription = t(
                "workspace.stage.connection_error_description",
            );
            connectionSurface =
                connectionVisual?.hudSurface ?? fallbackConnectionSurface;
            connectionIconBg =
                connectionVisual?.hudIconBg ?? fallbackConnectionIconBg;
        }

        const dragTitle = isDragActive
            ? t("workspace.stage.drop_active_title")
            : t("workspace.stage.drop_idle_title");
        const dragDescription = isDragActive
            ? t("workspace.stage.drop_active_description")
            : t("workspace.stage.drop_idle_description");
        const dragVisual = isDragActive
            ? visuals.workspace.hud.drop.active
            : visuals.workspace.hud.drop.idle;

        const deepLinkTitle = t("workspace.stage.deeplink_idle_title");
        const deepLinkDescription = t(
            "workspace.stage.deeplink_idle_description",
        );
        const deepLinkVisual = visuals.workspace.hud.deepLink.idle;

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
                surfaceClass: dragVisual.surface,
                iconBgClass: dragVisual.iconBg,
                icon: MousePointer,
            },
            {
                id: "deeplink",
                label: t("workspace.stage.deeplink_label"),
                title: deepLinkTitle,
                description: deepLinkDescription,
                surfaceClass: deepLinkVisual.surface,
                iconBgClass: deepLinkVisual.iconBg,
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

