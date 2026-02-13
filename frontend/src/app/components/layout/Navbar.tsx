import { Input, Tab, Tabs, cn } from "@heroui/react";
import type { Key } from "react";
import {
    DownloadCloud,
    ListChecks,
    Pause,
    Play,
    RotateCcw,
    Search,
    Settings,
    Trash2,
    UploadCloud,
    Minimize,
    Maximize,
    Moon,
    Sun,
    X,
    FileUp,
    Magnet,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { TinyTorrentIcon } from "@/shared/ui/components/TinyTorrentIcon";
import StatusIcon from "@/shared/ui/components/StatusIcon";
import { ToolbarIconButton } from "@/shared/ui/layout/toolbar-button";
import { SmoothProgressBar } from "@/shared/ui/components/SmoothProgressBar";
import { WindowControlButton } from "@/shared/ui/layout/window-control-button";
import { useFocusState } from "@/app/context/AppShellStateContext";
import { APP_VERSION } from "@/shared/version";
import { usePreferences } from "@/app/context/PreferencesContext";
import {
    buildAppNavSelectionActionsClass,
    APP_NAV_CLASS,
} from "@/shared/ui/layout/glass-surface";
import { getShellTokens, STATUS_VISUAL_KEYS, STATUS_VISUALS } from "@/config/logic";
import { isDashboardFilter } from "@/modules/dashboard/types/dashboardFilter";

import type { NavbarViewModel } from "@/app/viewModels/useAppViewModel";

interface NavbarProps {
    viewModel: NavbarViewModel;
}

export function Navbar({ viewModel }: NavbarProps) {
    const {
        filter,
        searchQuery,
        setSearchQuery,
        setFilter,
        onAddTorrent,
        onAddMagnet,
        onSettings,
        hasSelection,
        rehashStatus,
        workspaceStyle,
        onWindowCommand,
        emphasizeActions,
        selectionActions,
    } = viewModel;
    const { t } = useTranslation();
    const { setActivePart } = useFocusState();
    const shell = getShellTokens(workspaceStyle);
    const {
        preferences: { theme },
        toggleTheme,
    } = usePreferences();
    const isDark = theme === "dark";
    const Icon = isDark ? Moon : Sun;
    const toneButtonClass = {
        primary:
            STATUS_VISUALS[STATUS_VISUAL_KEYS.tone.PRIMARY]?.button ??
            APP_NAV_CLASS.toneButtonFallback.primary,
        success:
            STATUS_VISUALS[STATUS_VISUAL_KEYS.tone.SUCCESS]?.button ??
            APP_NAV_CLASS.toneButtonFallback.success,
        warning:
            STATUS_VISUALS[STATUS_VISUAL_KEYS.tone.WARNING]?.button ??
            APP_NAV_CLASS.toneButtonFallback.warning,
        danger:
            STATUS_VISUALS[STATUS_VISUAL_KEYS.tone.DANGER]?.button ??
            APP_NAV_CLASS.toneButtonFallback.danger,
        neutral:
            STATUS_VISUALS[STATUS_VISUAL_KEYS.tone.NEUTRAL]?.button ??
            APP_NAV_CLASS.toneButtonFallback.neutral,
    };
    const handleFilterSelectionChange = (key: Key) => {
        if (typeof key !== "string") return;
        if (!isDashboardFilter(key)) return;
        setFilter(key);
    };

    return (
        <header
            className={cn(
                APP_NAV_CLASS.root,
                APP_NAV_CLASS.workbenchSurface,
            )}
        >
            <div
                className={APP_NAV_CLASS.titlebar}
                style={{
                    ...shell.surfaceStyle,
                    ...APP_NAV_CLASS.titlebarBaseStyle,
                }}
            >
                <div
                    className={cn(
                        APP_NAV_CLASS.workbenchShell,
                        // remove `px-panel` here so horizontal padding is supplied
                        // centrally by `...shell.frameStyle` (see config/logic.ts)
                        APP_NAV_CLASS.main,
                    )}
                    style={{
                        ...shell.outerStyle,
                    }}
                >
                    <div className={APP_NAV_CLASS.left}>
                        <div className={APP_NAV_CLASS.brandGroup}>
                            <div
                                className={APP_NAV_CLASS.brandIconWrap}
                                style={APP_NAV_CLASS.brandIconStyle}
                            >
                                <TinyTorrentIcon title={t("brand.name")} />
                            </div>
                            <div className={APP_NAV_CLASS.brandTextWrap}>
                                <span className={APP_NAV_CLASS.brandName}>
                                    {t("brand.name")}
                                </span>
                                <span className={APP_NAV_CLASS.brandVersion}>
                                    {t("brand.version", {
                                        version: APP_VERSION,
                                    })}
                                </span>
                            </div>
                        </div>

                        <div className={APP_NAV_CLASS.primarySeparator} />

                        <div className={APP_NAV_CLASS.tabsWrap}>
                            <Tabs
                                aria-label={t("nav.filter_aria")}
                                variant="light"
                                size="lg"
                                radius="full"
                                selectedKey={filter}
                                onSelectionChange={handleFilterSelectionChange}
                                classNames={APP_NAV_CLASS.filterTabsClassNames}
                            >
                                <Tab
                                    key="all"
                                    title={
                                        <div className={APP_NAV_CLASS.tabTitle}>
                                            <StatusIcon
                                                Icon={ListChecks}
                                                size="lg"
                                                className={APP_NAV_CLASS.tabIcon}
                                            />
                                            <span className={APP_NAV_CLASS.tabLabel}>
                                                {t("nav.filter_all")}
                                            </span>
                                        </div>
                                    }
                                />
                                <Tab
                                    key="downloading"
                                    title={
                                        <div className={APP_NAV_CLASS.tabTitle}>
                                            <StatusIcon
                                                Icon={DownloadCloud}
                                                size="lg"
                                                className={APP_NAV_CLASS.tabIcon}
                                            />
                                            <span className={APP_NAV_CLASS.tabLabel}>
                                                {t("nav.filter_downloading")}
                                            </span>
                                        </div>
                                    }
                                />
                                <Tab
                                    key="seeding"
                                    title={
                                        <div className={APP_NAV_CLASS.tabTitle}>
                                            <StatusIcon
                                                Icon={UploadCloud}
                                                size="lg"
                                                className={APP_NAV_CLASS.tabIcon}
                                            />
                                            <span className={APP_NAV_CLASS.tabLabel}>
                                                {t("nav.filter_seeding")}
                                            </span>
                                        </div>
                                    }
                                />
                            </Tabs>
                        </div>

                        <div className={APP_NAV_CLASS.searchWrap}>
                            <Input
                                classNames={APP_NAV_CLASS.searchInputClassNames}
                                style={APP_NAV_CLASS.searchStyle}
                                placeholder={t("nav.search_placeholder")}
                                size="md"
                                value={searchQuery}
                                data-command-search="true"
                                onFocus={() => setActivePart("search")}
                                onChange={(event) =>
                                    setSearchQuery(event.currentTarget.value)
                                }
                                startContent={
                                    <StatusIcon
                                        Icon={Search}
                                        size="lg"
                                        className={APP_NAV_CLASS.searchIcon}
                                    />
                                }
                            />
                        </div>
                    </div>
                    <div className={APP_NAV_CLASS.actions}>
                        <div className={APP_NAV_CLASS.primaryActions}>
                            <ToolbarIconButton
                                Icon={FileUp}
                                ariaLabel={t("toolbar.add_torrent")}
                                title={t("toolbar.add_torrent")}
                                onPress={onAddTorrent}
                                className={cn(
                                    toneButtonClass.primary,
                                    APP_NAV_CLASS.primaryActionEmphasis,
                                )}
                                iconSize="lg"
                            />

                            <ToolbarIconButton
                                Icon={Magnet}
                                ariaLabel={t("toolbar.add_magnet")}
                                title={t("toolbar.add_magnet")}
                                onPress={onAddMagnet}
                                className={toneButtonClass.primary}
                                iconSize="lg"
                            />
                        </div>
                        <div
                            className={APP_NAV_CLASS.selectionSeparator}
                            style={APP_NAV_CLASS.selectionSeparatorStyle}
                        />

                        <div className={buildAppNavSelectionActionsClass(hasSelection)}>
                            <ToolbarIconButton
                                Icon={Play}
                                ariaLabel={t("toolbar.resume")}
                                title={t("toolbar.resume")}
                                onPress={selectionActions.ensureActive}
                                disabled={!hasSelection}
                                className={toneButtonClass.success}
                                iconSize="lg"
                            />
                            <ToolbarIconButton
                                Icon={Pause}
                                ariaLabel={t("toolbar.pause")}
                                title={t("toolbar.pause")}
                                onPress={selectionActions.ensurePaused}
                                disabled={!hasSelection}
                                className={cn(
                                    toneButtonClass.warning,
                                    emphasizeActions?.pause
                                        ? APP_NAV_CLASS.selectionPauseEmphasis
                                        : "",
                                )}
                                iconSize="lg"
                            />
                            <div className={APP_NAV_CLASS.selectionExtraActions}>
                                <ToolbarIconButton
                                    Icon={RotateCcw}
                                    ariaLabel={t("toolbar.recheck")}
                                    title={t("toolbar.recheck")}
                                    onPress={selectionActions.ensureValid}
                                    disabled={!hasSelection}
                                    className={cn(
                                        toneButtonClass.neutral,
                                        emphasizeActions?.forceRecheck
                                            ? APP_NAV_CLASS.selectionRecheckEmphasis
                                            : "",
                                    )}
                                    iconSize="lg"
                                />
                                <ToolbarIconButton
                                    Icon={Trash2}
                                    ariaLabel={t("toolbar.remove")}
                                    title={t("toolbar.remove")}
                                    onPress={selectionActions.ensureRemoved}
                                    disabled={!hasSelection}
                                    className={toneButtonClass.danger}
                                    iconSize="lg"
                                />
                            </div>
                        </div>

                        <div
                            className={APP_NAV_CLASS.selectionSeparator}
                            style={APP_NAV_CLASS.selectionSeparatorStyle}
                        />

                        <ToolbarIconButton
                            Icon={Settings}
                            ariaLabel={t("toolbar.settings")}
                            title={t("toolbar.settings")}
                            onPress={onSettings}
                            className={cn(
                                APP_NAV_CLASS.ghostAction,
                                APP_NAV_CLASS.ghostActionOverflow,
                            )}
                            iconSize="lg"
                        />
                        <div className={APP_NAV_CLASS.themeMobileWrap}>
                            <ToolbarIconButton
                                Icon={Icon}
                                ariaLabel={t("theme.toggle_label", {
                                    value: isDark
                                        ? t("theme.dark")
                                        : t("theme.light"),
                                })}
                                title={t("theme.toggle")}
                                onPress={toggleTheme}
                                className={cn(
                                    APP_NAV_CLASS.ghostAction,
                                    APP_NAV_CLASS.ghostActionOverflow,
                                )}
                                iconSize="lg"
                            />
                        </div>
                    </div>

                    {rehashStatus?.active && (
                        <div className={APP_NAV_CLASS.rehashWrap}>
                            <div className={APP_NAV_CLASS.rehashTooltipWrap}>
                                <SmoothProgressBar
                                    value={Math.min(
                                        Math.max(rehashStatus.value, 0),
                                        100,
                                    )}
                                    trackClassName={APP_NAV_CLASS.rehashTrack}
                                    indicatorClassName={APP_NAV_CLASS.rehashIndicator}
                                />
                                <div className={APP_NAV_CLASS.rehashTooltip}>
                                    {rehashStatus.label}:{" "}
                                    {Math.round(rehashStatus.value)}%
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div
                    className={cn(
                        APP_NAV_CLASS.workbenchShell,
                        APP_NAV_CLASS.windowControls,
                    )}
                    style={{
                        ...shell.outerStyle,
                        ...APP_NAV_CLASS.windowControlsStyle,
                    }}
                >
                    <WindowControlButton
                        Icon={Icon}
                        ariaLabel={t("theme.toggle_label", {
                            value: isDark ? t("theme.dark") : t("theme.light"),
                        })}
                        title={t("theme.toggle")}
                        onPress={toggleTheme}
                    />

                    <WindowControlButton
                        Icon={Minimize}
                        ariaLabel={t("toolbar.minimize")}
                        title={t("toolbar.minimize")}
                        onPress={() => onWindowCommand("minimize")}
                    />

                    <WindowControlButton
                        Icon={Maximize}
                        ariaLabel={t("toolbar.maximize")}
                        title={t("toolbar.maximize")}
                        onPress={() => onWindowCommand("maximize")}
                    />

                    <WindowControlButton
                        Icon={X}
                        ariaLabel={t("toolbar.close")}
                        title={t("toolbar.close")}
                        onPress={() => onWindowCommand("close")}
                        tone="danger"
                    />
                </div>
            </div>
        </header>
    );
}
