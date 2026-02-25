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
import { WORKBENCH } from "@/shared/ui/layout/glass-surface";
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
        primary: STATUS_VISUALS[STATUS_VISUAL_KEYS.tone.PRIMARY]?.button ?? WORKBENCH.nav.toneButtonFallback.primary,
        success: STATUS_VISUALS[STATUS_VISUAL_KEYS.tone.SUCCESS]?.button ?? WORKBENCH.nav.toneButtonFallback.success,
        warning: STATUS_VISUALS[STATUS_VISUAL_KEYS.tone.WARNING]?.button ?? WORKBENCH.nav.toneButtonFallback.warning,
        danger: STATUS_VISUALS[STATUS_VISUAL_KEYS.tone.DANGER]?.button ?? WORKBENCH.nav.toneButtonFallback.danger,
        neutral: STATUS_VISUALS[STATUS_VISUAL_KEYS.tone.NEUTRAL]?.button ?? WORKBENCH.nav.toneButtonFallback.neutral,
    };
    const handleFilterSelectionChange = (key: Key) => {
        if (typeof key !== "string") return;
        if (!isDashboardFilter(key)) return;
        setFilter(key);
    };

    return (
        <header className={cn(WORKBENCH.nav.root, WORKBENCH.nav.surface)}>
            <div
                className={WORKBENCH.nav.titlebar}
                style={{
                    ...shell.surfaceStyle,
                    ...WORKBENCH.nav.titlebarBaseStyle,
                }}
            >
                <div
                    className={cn(
                        WORKBENCH.nav.shell,
                        // remove `px-panel` here so horizontal padding is supplied
                        // centrally by `...shell.frameStyle` (see config/logic.ts)
                        WORKBENCH.nav.main,
                    )}
                    style={{
                        ...shell.outerStyle,
                    }}
                >
                    <div className={WORKBENCH.nav.left}>
                        <div className={WORKBENCH.nav.brandGroup}>
                            <div className={WORKBENCH.nav.brandIconWrap} style={WORKBENCH.nav.brandIconStyle}>
                                <TinyTorrentIcon title={t("brand.name")} />
                            </div>
                            <div className={WORKBENCH.nav.brandTextWrap}>
                                <span className={WORKBENCH.nav.brandName}>{t("brand.name")}</span>
                                <span className={WORKBENCH.nav.brandVersion}>
                                    {t("brand.version", {
                                        version: APP_VERSION,
                                    })}
                                </span>
                            </div>
                        </div>

                        <div className={WORKBENCH.nav.primarySeparator} />

                        <div className={WORKBENCH.nav.tabsWrap}>
                            <Tabs
                                aria-label={t("nav.filter_aria")}
                                variant="light"
                                size="lg"
                                radius="full"
                                selectedKey={filter}
                                onSelectionChange={handleFilterSelectionChange}
                                classNames={WORKBENCH.nav.filterTabsClassNames}
                            >
                                <Tab
                                    key="all"
                                    title={
                                        <div className={WORKBENCH.nav.tabTitle}>
                                            <StatusIcon Icon={ListChecks} size="lg" className={WORKBENCH.nav.tabIcon} />
                                            <span className={WORKBENCH.nav.tabLabel}>{t("nav.filter_all")}</span>
                                        </div>
                                    }
                                />
                                <Tab
                                    key="downloading"
                                    title={
                                        <div className={WORKBENCH.nav.tabTitle}>
                                            <StatusIcon
                                                Icon={DownloadCloud}
                                                size="lg"
                                                className={WORKBENCH.nav.tabIcon}
                                            />
                                            <span className={WORKBENCH.nav.tabLabel}>
                                                {t("nav.filter_downloading")}
                                            </span>
                                        </div>
                                    }
                                />
                                <Tab
                                    key="seeding"
                                    title={
                                        <div className={WORKBENCH.nav.tabTitle}>
                                            <StatusIcon
                                                Icon={UploadCloud}
                                                size="lg"
                                                className={WORKBENCH.nav.tabIcon}
                                            />
                                            <span className={WORKBENCH.nav.tabLabel}>{t("nav.filter_seeding")}</span>
                                        </div>
                                    }
                                />
                            </Tabs>
                        </div>

                        <div className={WORKBENCH.nav.searchWrap}>
                            <Input
                                classNames={WORKBENCH.nav.searchInputClassNames}
                                style={WORKBENCH.nav.searchStyle}
                                placeholder={t("nav.search_placeholder")}
                                size="md"
                                value={searchQuery}
                                data-command-search="true"
                                onFocus={() => setActivePart("search")}
                                onChange={(event) => setSearchQuery(event.currentTarget.value)}
                                startContent={
                                    <StatusIcon Icon={Search} size="lg" className={WORKBENCH.nav.searchIcon} />
                                }
                            />
                        </div>
                    </div>
                    <div className={WORKBENCH.nav.actions}>
                        <div className={WORKBENCH.nav.primaryActions}>
                            <ToolbarIconButton
                                Icon={FileUp}
                                ariaLabel={t("toolbar.add_torrent")}
                                title={t("toolbar.add_torrent")}
                                onPress={onAddTorrent}
                                className={cn(toneButtonClass.primary, WORKBENCH.nav.primaryActionEmphasis)}
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
                            className={WORKBENCH.nav.selectionSeparator}
                            style={WORKBENCH.nav.selectionSeparatorStyle}
                        />

                        <div className={WORKBENCH.nav.builder.selectionActionsClass(hasSelection)}>
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
                                    emphasizeActions?.pause ? WORKBENCH.nav.selectionPauseEmphasis : "",
                                )}
                                iconSize="lg"
                            />
                            <div className={WORKBENCH.nav.selectionExtraActions}>
                                <ToolbarIconButton
                                    Icon={RotateCcw}
                                    ariaLabel={t("toolbar.recheck")}
                                    title={t("toolbar.recheck")}
                                    onPress={selectionActions.ensureValid}
                                    disabled={!hasSelection}
                                    className={cn(
                                        toneButtonClass.neutral,
                                        emphasizeActions?.forceRecheck ? WORKBENCH.nav.selectionRecheckEmphasis : "",
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
                            className={WORKBENCH.nav.selectionSeparator}
                            style={WORKBENCH.nav.selectionSeparatorStyle}
                        />

                        <ToolbarIconButton
                            Icon={Settings}
                            ariaLabel={t("toolbar.settings")}
                            title={t("toolbar.settings")}
                            onPress={onSettings}
                            className={cn(WORKBENCH.nav.ghostAction, WORKBENCH.nav.ghostActionOverflow)}
                            iconSize="lg"
                        />
                        <div className={WORKBENCH.nav.themeMobileWrap}>
                            <ToolbarIconButton
                                Icon={Icon}
                                ariaLabel={t("theme.toggle_label", {
                                    value: isDark ? t("theme.dark") : t("theme.light"),
                                })}
                                title={t("theme.toggle")}
                                onPress={toggleTheme}
                                className={cn(WORKBENCH.nav.ghostAction, WORKBENCH.nav.ghostActionOverflow)}
                                iconSize="lg"
                            />
                        </div>
                    </div>

                    {rehashStatus?.active && (
                        <div className={WORKBENCH.nav.rehashWrap}>
                            <div className={WORKBENCH.nav.rehashTooltipWrap}>
                                <SmoothProgressBar
                                    value={Math.min(Math.max(rehashStatus.value, 0), 100)}
                                    trackClassName={WORKBENCH.nav.rehashTrack}
                                    indicatorClassName={WORKBENCH.nav.rehashIndicator}
                                />
                                <div className={WORKBENCH.nav.rehashTooltip}>
                                    {rehashStatus.label}: {Math.round(rehashStatus.value)}%
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div
                    className={cn(WORKBENCH.nav.shell, WORKBENCH.nav.windowControls)}
                    style={{
                        ...shell.outerStyle,
                        ...WORKBENCH.nav.windowControlsStyle,
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
