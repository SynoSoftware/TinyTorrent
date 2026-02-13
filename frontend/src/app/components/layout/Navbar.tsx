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
    NAV,
} from "@/shared/ui/layout/glass-surface";
import {
    getShellTokens,
    STATUS_VISUAL_KEYS,
    STATUS_VISUALS,
} from "@/config/logic";
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
            NAV.toneButtonFallback.primary,
        success:
            STATUS_VISUALS[STATUS_VISUAL_KEYS.tone.SUCCESS]?.button ??
            NAV.toneButtonFallback.success,
        warning:
            STATUS_VISUALS[STATUS_VISUAL_KEYS.tone.WARNING]?.button ??
            NAV.toneButtonFallback.warning,
        danger:
            STATUS_VISUALS[STATUS_VISUAL_KEYS.tone.DANGER]?.button ??
            NAV.toneButtonFallback.danger,
        neutral:
            STATUS_VISUALS[STATUS_VISUAL_KEYS.tone.NEUTRAL]?.button ??
            NAV.toneButtonFallback.neutral,
    };
    const handleFilterSelectionChange = (key: Key) => {
        if (typeof key !== "string") return;
        if (!isDashboardFilter(key)) return;
        setFilter(key);
    };

    return (
        <header className={cn(NAV.root, NAV.workbenchSurface)}>
            <div
                className={NAV.titlebar}
                style={{
                    ...shell.surfaceStyle,
                    ...NAV.titlebarBaseStyle,
                }}
            >
                <div
                    className={cn(
                        NAV.workbenchShell,
                        // remove `px-panel` here so horizontal padding is supplied
                        // centrally by `...shell.frameStyle` (see config/logic.ts)
                        NAV.main,
                    )}
                    style={{
                        ...shell.outerStyle,
                    }}
                >
                    <div className={NAV.left}>
                        <div className={NAV.brandGroup}>
                            <div
                                className={NAV.brandIconWrap}
                                style={NAV.brandIconStyle}
                            >
                                <TinyTorrentIcon title={t("brand.name")} />
                            </div>
                            <div className={NAV.brandTextWrap}>
                                <span className={NAV.brandName}>
                                    {t("brand.name")}
                                </span>
                                <span className={NAV.brandVersion}>
                                    {t("brand.version", {
                                        version: APP_VERSION,
                                    })}
                                </span>
                            </div>
                        </div>

                        <div className={NAV.primarySeparator} />

                        <div className={NAV.tabsWrap}>
                            <Tabs
                                aria-label={t("nav.filter_aria")}
                                variant="light"
                                size="lg"
                                radius="full"
                                selectedKey={filter}
                                onSelectionChange={handleFilterSelectionChange}
                                classNames={NAV.filterTabsClassNames}
                            >
                                <Tab
                                    key="all"
                                    title={
                                        <div className={NAV.tabTitle}>
                                            <StatusIcon
                                                Icon={ListChecks}
                                                size="lg"
                                                className={NAV.tabIcon}
                                            />
                                            <span className={NAV.tabLabel}>
                                                {t("nav.filter_all")}
                                            </span>
                                        </div>
                                    }
                                />
                                <Tab
                                    key="downloading"
                                    title={
                                        <div className={NAV.tabTitle}>
                                            <StatusIcon
                                                Icon={DownloadCloud}
                                                size="lg"
                                                className={NAV.tabIcon}
                                            />
                                            <span className={NAV.tabLabel}>
                                                {t("nav.filter_downloading")}
                                            </span>
                                        </div>
                                    }
                                />
                                <Tab
                                    key="seeding"
                                    title={
                                        <div className={NAV.tabTitle}>
                                            <StatusIcon
                                                Icon={UploadCloud}
                                                size="lg"
                                                className={NAV.tabIcon}
                                            />
                                            <span className={NAV.tabLabel}>
                                                {t("nav.filter_seeding")}
                                            </span>
                                        </div>
                                    }
                                />
                            </Tabs>
                        </div>

                        <div className={NAV.searchWrap}>
                            <Input
                                classNames={NAV.searchInputClassNames}
                                style={NAV.searchStyle}
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
                                        className={NAV.searchIcon}
                                    />
                                }
                            />
                        </div>
                    </div>
                    <div className={NAV.actions}>
                        <div className={NAV.primaryActions}>
                            <ToolbarIconButton
                                Icon={FileUp}
                                ariaLabel={t("toolbar.add_torrent")}
                                title={t("toolbar.add_torrent")}
                                onPress={onAddTorrent}
                                className={cn(
                                    toneButtonClass.primary,
                                    NAV.primaryActionEmphasis,
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
                            className={NAV.selectionSeparator}
                            style={NAV.selectionSeparatorStyle}
                        />

                        <div
                            className={buildAppNavSelectionActionsClass(
                                hasSelection,
                            )}
                        >
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
                                        ? NAV.selectionPauseEmphasis
                                        : "",
                                )}
                                iconSize="lg"
                            />
                            <div className={NAV.selectionExtraActions}>
                                <ToolbarIconButton
                                    Icon={RotateCcw}
                                    ariaLabel={t("toolbar.recheck")}
                                    title={t("toolbar.recheck")}
                                    onPress={selectionActions.ensureValid}
                                    disabled={!hasSelection}
                                    className={cn(
                                        toneButtonClass.neutral,
                                        emphasizeActions?.forceRecheck
                                            ? NAV.selectionRecheckEmphasis
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
                            className={NAV.selectionSeparator}
                            style={NAV.selectionSeparatorStyle}
                        />

                        <ToolbarIconButton
                            Icon={Settings}
                            ariaLabel={t("toolbar.settings")}
                            title={t("toolbar.settings")}
                            onPress={onSettings}
                            className={cn(
                                NAV.ghostAction,
                                NAV.ghostActionOverflow,
                            )}
                            iconSize="lg"
                        />
                        <div className={NAV.themeMobileWrap}>
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
                                    NAV.ghostAction,
                                    NAV.ghostActionOverflow,
                                )}
                                iconSize="lg"
                            />
                        </div>
                    </div>

                    {rehashStatus?.active && (
                        <div className={NAV.rehashWrap}>
                            <div className={NAV.rehashTooltipWrap}>
                                <SmoothProgressBar
                                    value={Math.min(
                                        Math.max(rehashStatus.value, 0),
                                        100,
                                    )}
                                    trackClassName={NAV.rehashTrack}
                                    indicatorClassName={NAV.rehashIndicator}
                                />
                                <div className={NAV.rehashTooltip}>
                                    {rehashStatus.label}:{" "}
                                    {Math.round(rehashStatus.value)}%
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div
                    className={cn(NAV.workbenchShell, NAV.windowControls)}
                    style={{
                        ...shell.outerStyle,
                        ...NAV.windowControlsStyle,
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
