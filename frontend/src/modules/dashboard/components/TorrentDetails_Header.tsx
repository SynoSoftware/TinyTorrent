import { cn } from "@heroui/react";
import { useTranslation } from "react-i18next";
import { Pin, PinOff, X, Info, type LucideIcon } from "lucide-react";
import {
    ICON_SIZE_CLASSES,
    ToolbarIconButton,
} from "@/shared/ui/layout/toolbar-button";
import { registry } from "@/config/logic";
import type { TorrentDetailEntity as TorrentDetail } from "@/services/rpc/entities";
import type { DetailTab } from "@/modules/dashboard/types/contracts";
import type { TorrentDetailTabDefinition } from "@/modules/dashboard/hooks/useDetailTabs";
import type {
    TorrentDetailHeaderAction,
    TorrentDetailHeaderActionTone,
} from "@/modules/dashboard/types/torrentDetailHeader";
import { DETAILS, WORKBENCH } from "@/shared/ui/layout/glass-surface";
import { sanitizeDomIdToken } from "@/shared/utils/dom";
const { visuals } = registry;

const NAME_MAX_LENGTH = 56;

const truncateTorrentName = (value?: string, fallback?: string) => {
    if (!value && fallback) return fallback;
    if (!value) return "";
    const trimmed = value.trim();
    if (trimmed.length <= NAME_MAX_LENGTH) return trimmed;
    const half = Math.floor((NAME_MAX_LENGTH - 1) / 2);
    return `${trimmed.slice(0, half)}~${trimmed.slice(trimmed.length - half)}`;
};

type GlobalHeaderAction = {
    icon: LucideIcon;
    ariaLabel: string;
    onClick: () => void;
};

interface TorrentDetailHeaderProps {
    torrent?: TorrentDetail | null;
    isDetailFullscreen?: boolean;
    isStandalone?: boolean;
    onDock?: () => void;
    onPopout?: () => void;
    onClose?: () => void;
    activeTab: DetailTab;
    onTabChange: (tab: DetailTab) => void;
    tabs: Array<Pick<TorrentDetailTabDefinition, "id" | "labelKey">>;
    headerActions?: TorrentDetailHeaderAction[];
    statusLabel?: string | null;
    statusTooltip?: string | null;
    primaryHint?: string | null;
}

export const TorrentDetailHeader = (props: TorrentDetailHeaderProps) => {
    const {
        torrent,
        isDetailFullscreen = false,
        isStandalone = false,
        onDock,
        onPopout,
        onClose,
        activeTab,
        onTabChange,
        tabs,
        headerActions = [],
        statusLabel,
        statusTooltip,
        primaryHint,
    } = props;

    const { t } = useTranslation();
    const toneButtonClass: Record<TorrentDetailHeaderActionTone, string> = {
        success:
            visuals.status.recipes[visuals.status.keys.tone.success]?.button ??
            WORKBENCH.nav.toneButtonFallback.success,
        warning:
            visuals.status.recipes[visuals.status.keys.tone.warning]?.button ??
            WORKBENCH.nav.toneButtonFallback.warning,
        danger:
            visuals.status.recipes[visuals.status.keys.tone.danger]?.button ??
            WORKBENCH.nav.toneButtonFallback.danger,
        neutral:
            visuals.status.recipes[visuals.status.keys.tone.neutral]?.button ??
            WORKBENCH.nav.toneButtonFallback.neutral,
        default:
            WORKBENCH.nav.ghostAction,
    } as const;
    const renderedName = truncateTorrentName(
        torrent?.name,
        t("general.unknown"),
    );
    const tabDomIdPrefix = sanitizeDomIdToken(
        String(torrent?.id ?? torrent?.hash ?? "inspector"),
    );

    const globalActions: GlobalHeaderAction[] = [];
    if (!isDetailFullscreen && onPopout) {
        globalActions.push({
            icon: PinOff,
            ariaLabel: t("torrent_modal.actions.popout"),
            onClick: onPopout,
        });
    }
    if (isDetailFullscreen && onDock) {
        globalActions.push({
            icon: Pin,
            ariaLabel: t("torrent_modal.actions.dock"),
            onClick: onDock,
        });
    }
    if (onClose) {
        globalActions.push({
            icon: X,
            ariaLabel: t("torrent_modal.actions.close"),
            onClick: onClose,
        });
    }

    return (
        <div
            className={DETAILS.builder.headerClass(isStandalone)}
            style={DETAILS.headerTrackingStyle}
        >
            <div className={DETAILS.headerLeft}>
                <Info
                    strokeWidth={visuals.icon.strokeWidth}
                    className={`${DETAILS.headerInfoIcon} ${ICON_SIZE_CLASSES.lg}`}
                />
                <span className={DETAILS.headerTitle}>
                    {renderedName}
                    {statusLabel ? (
                        <span
                            className={DETAILS.headerStatus}
                            title={statusTooltip ?? undefined}
                        >
                            {statusLabel}
                            {primaryHint ? (
                                <em className={DETAILS.headerPrimaryHint}>
                                    - {primaryHint}
                                </em>
                            ) : null}
                        </span>
                    ) : null}
                </span>
            </div>

            <div className={DETAILS.headerCenter}>
                <div
                    className={DETAILS.headerTabs}
                    role="tablist"
                    aria-label={t("inspector.panel_label")}
                >
                    {tabs.map((tab) => {
                        const isActive = activeTab === tab.id;

                        return (
                            <button
                                key={tab.id}
                                type="button"
                                id={`${tabDomIdPrefix}-tab-${tab.id}`}
                                role="tab"
                                aria-selected={isActive}
                                aria-controls={`${tabDomIdPrefix}-panel-${tab.id}`}
                                tabIndex={isActive ? 0 : -1}
                                onClick={() => onTabChange(tab.id)}
                                className={DETAILS.builder.headerTabButtonClass(
                                    isActive,
                                )}
                            >
                                {!isActive && (
                                    <span
                                        aria-hidden="true"
                                        className={DETAILS.headerTabHoverGlow}
                                        style={DETAILS.builder.headerTabHoverGlowStyle()}
                                    />
                                )}
                                {isActive && (
                                    <span
                                        aria-hidden="true"
                                        className={DETAILS.headerTabLightBloom}
                                        style={DETAILS.builder.headerTabLightBloomStyle()}
                                    />
                                )}
                                <span>{t(tab.labelKey)}</span>
                                {isActive && (
                                    <span
                                        aria-hidden="true"
                                        className={DETAILS.headerTabLightSource}
                                        style={DETAILS.builder.headerTabLightSourceStyle()}
                                    />
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className={DETAILS.headerRight}>
                {headerActions.length > 0 && (
                    <>
                        <div className={DETAILS.headerContextActions}>
                            {headerActions.map((action, index) => (
                                <ToolbarIconButton
                                    key={`tab-header-action-${index}`}
                                    Icon={action.icon}
                                    ariaLabel={action.ariaLabel}
                                    title={action.ariaLabel}
                                    onPress={action.onPress}
                                    className={cn(
                                        DETAILS.headerContextActionButton,
                                        toneButtonClass[action.tone],
                                    )}
                                    iconSize="md"
                                />
                            ))}
                        </div>
                        {globalActions.length > 0 && (
                            <div
                                className={DETAILS.headerContextDivider}
                                aria-hidden="true"
                            />
                        )}
                    </>
                )}
                {globalActions.map((action, index) => (
                    <ToolbarIconButton
                        key={`global-header-action-${index}`}
                        Icon={action.icon}
                        ariaLabel={action.ariaLabel}
                        title={action.ariaLabel}
                        onClick={action.onClick}
                        iconSize="md"
                    />
                ))}
            </div>
        </div>
    );
};
