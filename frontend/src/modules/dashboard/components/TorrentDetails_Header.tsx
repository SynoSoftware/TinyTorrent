import { cn } from "@heroui/react";
import { memo } from "react";
import { useTranslation } from "react-i18next";
import { Pin, PinOff, X, Info, type LucideIcon } from "lucide-react";
import AppTooltip from "@/shared/ui/components/AppTooltip";
import { ICON_SIZE_CLASSES, ToolbarIconButton } from "@/shared/ui/layout/toolbar-button";
import { registry } from "@/config/logic";
import type { TorrentDetailEntity as TorrentDetail } from "@/services/rpc/entities";
import type { DetailTab } from "@/modules/dashboard/types/contracts";
import type { TorrentDetailTabDefinition } from "@/modules/dashboard/hooks/useDetailTabs";
import type {
    TorrentDetailHeaderAction,
    TorrentDetailHeaderActionTone,
} from "@/modules/dashboard/types/torrentDetailHeader";
import { details, workbench } from "@/shared/ui/layout/glass-surface";
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

const joinClassNames = (...values: Array<string | undefined>) => cn(values) ?? "";

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

const TorrentDetailHeaderComponent = (props: TorrentDetailHeaderProps) => {
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
    const toneRecipe = visuals.status.recipes;
    const toneKeys = visuals.status.keys.tone;
    const toneButtonClass: Record<TorrentDetailHeaderActionTone, string> = {
        success: joinClassNames(
            toneRecipe[toneKeys.success]?.text,
            toneRecipe[toneKeys.success]?.button,
            workbench.nav.toneButtonFallback.success,
        ),
        warning: joinClassNames(
            toneRecipe[toneKeys.warning]?.text,
            toneRecipe[toneKeys.warning]?.button,
            workbench.nav.toneButtonFallback.warning,
        ),
        danger: joinClassNames(
            toneRecipe[toneKeys.danger]?.text,
            toneRecipe[toneKeys.danger]?.button,
            workbench.nav.toneButtonFallback.danger,
        ),
        neutral: joinClassNames(
            toneRecipe[toneKeys.neutral]?.text,
            toneRecipe[toneKeys.neutral]?.button,
            workbench.nav.toneButtonFallback.neutral,
        ),
        default: joinClassNames(
            toneRecipe[toneKeys.neutral]?.text,
            toneRecipe[toneKeys.neutral]?.button,
            workbench.nav.toneButtonFallback.neutral,
        ),
    } as const;
    const renderedName = truncateTorrentName(torrent?.name, t("general.unknown"));
    const tabDomIdPrefix = sanitizeDomIdToken(String(torrent?.id ?? torrent?.hash ?? "inspector"));

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
            className={cn(details.headerRoot, !isStandalone && details.headerRootEmbedded)}
            style={details.headerTrackingStyle}
        >
            <div className={details.headerLeft}>
                <Info
                    strokeWidth={visuals.icon.strokeWidth}
                    className={`${details.headerInfoIcon} ${ICON_SIZE_CLASSES.lg}`}
                />
                <span className={details.headerTitle}>
                    {renderedName}
                    {statusLabel ? (
                        <AppTooltip content={statusTooltip ?? statusLabel} dense placement="top" native>
                            <span className={details.headerStatus}>
                                {statusLabel}
                                {primaryHint ? <em className={details.headerPrimaryHint}>- {primaryHint}</em> : null}
                            </span>
                        </AppTooltip>
                    ) : null}
                </span>
            </div>

            <div className={details.headerCenter}>
                <div className={details.headerTabs} role="tablist" aria-label={t("inspector.panel_label")}>
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
                                className={cn(
                                    details.headerTabBase,
                                    isActive ? details.headerTabActive : details.headerTabInactive,
                                )}
                            >
                                {!isActive && (
                                    <span
                                        aria-hidden="true"
                                        className={details.headerTabHoverGlow}
                                        style={details.headerTabHoverGlowStyle}
                                    />
                                )}
                                {isActive && (
                                    <span
                                        aria-hidden="true"
                                        className={details.headerTabLightBloom}
                                        style={details.headerTabLightBloomStyle}
                                    />
                                )}
                                <span>{t(tab.labelKey)}</span>
                                {isActive && (
                                    <span
                                        aria-hidden="true"
                                        className={details.headerTabLightSource}
                                        style={details.headerTabLightSourceStyle}
                                    />
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className={details.headerRight}>
                {headerActions.length > 0 && (
                    <>
                        <div className={details.headerContextActions}>
                            {headerActions.map((action, index) => (
                                <ToolbarIconButton
                                    key={`tab-header-action-${index}`}
                                    Icon={action.icon}
                                    ariaLabel={action.ariaLabel}
                                    title={action.ariaLabel}
                                    onPress={action.onPress}
                                    className={cn(details.headerContextActionButton, toneButtonClass[action.tone])}
                                    iconSize="md"
                                />
                            ))}
                        </div>
                        {globalActions.length > 0 && (
                            <div className={details.headerContextDivider} aria-hidden="true" />
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

const areHeaderActionsEqual = (
    previous: TorrentDetailHeaderAction[] | undefined,
    next: TorrentDetailHeaderAction[] | undefined,
) => {
    if (previous === next) {
        return true;
    }
    if (!previous || !next || previous.length !== next.length) {
        return false;
    }
    for (let index = 0; index < previous.length; index += 1) {
        if (
            previous[index].icon !== next[index].icon ||
            previous[index].ariaLabel !== next[index].ariaLabel ||
            previous[index].onPress !== next[index].onPress ||
            previous[index].tone !== next[index].tone
        ) {
            return false;
        }
    }
    return true;
};

export const TorrentDetailHeader = memo(
    TorrentDetailHeaderComponent,
    (prev, next) =>
        prev.torrent === next.torrent &&
        prev.isDetailFullscreen === next.isDetailFullscreen &&
        prev.isStandalone === next.isStandalone &&
        prev.onDock === next.onDock &&
        prev.onPopout === next.onPopout &&
        prev.onClose === next.onClose &&
        prev.activeTab === next.activeTab &&
        prev.onTabChange === next.onTabChange &&
        prev.statusLabel === next.statusLabel &&
        prev.statusTooltip === next.statusTooltip &&
        prev.primaryHint === next.primaryHint &&
        areHeaderActionsEqual(prev.headerActions, next.headerActions) &&
        prev.tabs.length === next.tabs.length &&
        prev.tabs.every((tab, index) => tab.id === next.tabs[index]?.id && tab.labelKey === next.tabs[index]?.labelKey),
);
