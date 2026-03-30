import { Button, Dropdown, DropdownItem, DropdownMenu, DropdownTrigger, Input, Tab, Tabs, cn } from "@heroui/react";
import { useState, type Key } from "react";
import {
    DownloadCloud,
    ListChecks,
    Menu,
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
    Plus,
    Sun,
    X,
    FileUp,
    Magnet,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { TinyTorrentIcon } from "@/shared/ui/components/TinyTorrentIcon";
import StatusIcon from "@/shared/ui/components/StatusIcon";
import AppTooltip from "@/shared/ui/components/AppTooltip";
import { ToolbarIconButton } from "@/shared/ui/layout/toolbar-button";
import { SmoothProgressBar } from "@/shared/ui/components/SmoothProgressBar";
import { WindowControlButton } from "@/shared/ui/layout/window-control-button";
import { useFocusState } from "@/app/context/AppShellStateContext";
import { APP_VERSION } from "@/shared/version";
import { usePreferences } from "@/app/context/PreferencesContext";
import Runtime from "@/app/runtime";
import { surface, workbench } from "@/shared/ui/layout/glass-surface";
import { registry } from "@/config/logic";
import { isDashboardFilter } from "@/modules/dashboard/types/dashboardFilter";

import type { NavbarViewModel } from "@/app/viewModels/useAppViewModel";
const { shell, visuals } = registry;

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
    const shellTokens = shell.getTokens(workspaceStyle);
    const {
        preferences: { theme },
        toggleTheme,
    } = usePreferences();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const isDark = theme === "dark";
    const Icon = isDark ? Moon : Sun;
    const showWindowControls = Runtime.isNativeHost;
    const toneButtonClass = {
        primary:
            visuals.status.recipes[visuals.status.keys.tone.primary]?.button ??
            workbench.nav.toneButtonFallback.primary,
        success:
            visuals.status.recipes[visuals.status.keys.tone.success]?.button ??
            workbench.nav.toneButtonFallback.success,
        warning:
            visuals.status.recipes[visuals.status.keys.tone.warning]?.button ??
            workbench.nav.toneButtonFallback.warning,
        danger:
            visuals.status.recipes[visuals.status.keys.tone.danger]?.button ?? workbench.nav.toneButtonFallback.danger,
        neutral:
            visuals.status.recipes[visuals.status.keys.tone.neutral]?.button ??
            workbench.nav.toneButtonFallback.neutral,
    };
    const handleFilterSelectionChange = (key: Key) => {
        if (typeof key !== "string") return;
        if (!isDashboardFilter(key)) return;
        setFilter(key);
    };
    const handleMobileMenuToggle = () => setIsMobileMenuOpen((current) => !current);
    const closeMobileMenu = () => setIsMobileMenuOpen(false);
    const handleMobileFilterSelectionChange = (key: Key) => {
        handleFilterSelectionChange(key);
        closeMobileMenu();
    };
    const handleMobileThemeToggle = () => {
        toggleTheme();
        closeMobileMenu();
    };
    const handleMobileSettings = () => {
        closeMobileMenu();
        onSettings();
    };
    const handleMobileAddTorrent = () => onAddTorrent();
    const handleMobileAddMagnet = () => onAddMagnet();
    const renderFilterTabs = (mobile = false) => (
        <Tabs
            aria-label={t("nav.filter_aria")}
            variant="light"
            size="lg"
            radius="full"
            selectedKey={filter}
            onSelectionChange={mobile ? handleMobileFilterSelectionChange : handleFilterSelectionChange}
            classNames={workbench.nav.filterTabsClassNames}
        >
            <Tab
                key="all"
                title={
                    <div className={workbench.nav.tabTitle}>
                        <StatusIcon Icon={ListChecks} size="lg" className={workbench.nav.tabIcon} />
                        <span className={workbench.nav.tabLabel}>{t("nav.filter_all")}</span>
                    </div>
                }
            />
            <Tab
                key="downloading"
                title={
                    <div className={workbench.nav.tabTitle}>
                        <StatusIcon Icon={DownloadCloud} size="lg" className={workbench.nav.tabIcon} />
                        <span className={workbench.nav.tabLabel}>{t("nav.filter_downloading")}</span>
                    </div>
                }
            />
            <Tab
                key="seeding"
                title={
                    <div className={workbench.nav.tabTitle}>
                        <StatusIcon Icon={UploadCloud} size="lg" className={workbench.nav.tabIcon} />
                        <span className={workbench.nav.tabLabel}>{t("nav.filter_seeding")}</span>
                    </div>
                }
            />
        </Tabs>
    );
    const renderSearchInput = (mobile = false) => (
        <Input
            classNames={workbench.nav.searchInputClassNames}
            style={mobile ? undefined : workbench.nav.searchStyle}
            placeholder={t("nav.search_placeholder")}
            size="md"
            value={searchQuery}
            data-command-search="true"
            onFocus={() => setActivePart("search")}
            onChange={(event) => setSearchQuery(event.currentTarget.value)}
            startContent={<StatusIcon Icon={Search} size="lg" className={workbench.nav.searchIcon} />}
        />
    );
    const renderSelectionExtraActions = (mobile = false) => (
        <>
            {mobile ? (
                <>
                    {renderMobilePanelButton({
                        Icon: RotateCcw,
                        label: t("toolbar.recheck"),
                        onPress: () => {
                            closeMobileMenu();
                            selectionActions.ensureValid();
                        },
                        disabled: !hasSelection,
                        color: "default",
                        className: emphasizeActions?.forceRecheck ? workbench.nav.selectionRecheckEmphasis : "",
                    })}
                    {renderMobilePanelButton({
                        Icon: Trash2,
                        label: t("toolbar.remove"),
                        onPress: () => {
                            closeMobileMenu();
                            selectionActions.ensureRemoved();
                        },
                        disabled: !hasSelection,
                        color: "danger",
                    })}
                </>
            ) : (
                <>
                    <ToolbarIconButton
                        Icon={RotateCcw}
                        ariaLabel={t("toolbar.recheck")}
                        title={t("toolbar.recheck")}
                        onPress={() => {
                            if (mobile) closeMobileMenu();
                            selectionActions.ensureValid();
                        }}
                        disabled={!hasSelection}
                        className={cn(
                            toneButtonClass.neutral,
                            emphasizeActions?.forceRecheck ? workbench.nav.selectionRecheckEmphasis : "",
                        )}
                        iconSize="lg"
                    />
                    <ToolbarIconButton
                        Icon={Trash2}
                        ariaLabel={t("toolbar.remove")}
                        title={t("toolbar.remove")}
                        onPress={() => {
                            if (mobile) closeMobileMenu();
                            selectionActions.ensureRemoved();
                        }}
                        disabled={!hasSelection}
                        className={toneButtonClass.danger}
                        iconSize="lg"
                    />
                </>
            )}
        </>
    );
    const renderMobilePanelButton = ({
        Icon: MobileIcon,
        label,
        onPress,
        disabled = false,
        color = "default",
        className,
    }: {
        Icon: typeof Play;
        label: string;
        onPress: () => void;
        disabled?: boolean;
        color?: "default" | "primary" | "success" | "warning" | "danger";
        className?: string;
    }) => (
        <Button
            size="md"
            variant="light"
            color={color}
            onPress={onPress}
            isDisabled={disabled}
            className={cn(workbench.nav.mobileMenuButton, className)}
            startContent={<StatusIcon Icon={MobileIcon} size="md" className={workbench.nav.mobileMenuButtonIcon} />}
        >
            {label}
        </Button>
    );

    return (
        <header className={cn(workbench.nav.root, workbench.nav.surface)}>
            <div
                className={workbench.nav.titlebar}
                style={{
                    ...shellTokens.surfaceStyle,
                    ...workbench.nav.titlebarBaseStyle,
                    gap: showWindowControls ? workbench.nav.titlebarBaseStyle.gap : 0,
                }}
            >
                <div
                    className={cn(
                        workbench.nav.shell,
                        // remove `px-panel` here so horizontal padding is supplied
                        // centrally by `...shell.frameStyle` (see config/logic.ts)
                        workbench.nav.main,
                        !showWindowControls && "w-full",
                    )}
                    style={{
                        ...shellTokens.outerStyle,
                    }}
                >
                    <div className={workbench.nav.left}>
                        <div className={workbench.nav.brandGroup}>
                            <div className={workbench.nav.brandIconWrap} style={workbench.nav.brandIconStyle}>
                                <TinyTorrentIcon title={t("brand.name")} />
                            </div>
                            <div className={workbench.nav.brandTextWrap}>
                                <span className={workbench.nav.brandName}>{t("brand.name")}</span>
                                <span className={workbench.nav.brandVersion}>
                                    {t("brand.version", {
                                        version: APP_VERSION,
                                    })}
                                </span>
                            </div>
                        </div>

                        <div className={workbench.nav.primarySeparator} />

                        <div className={workbench.nav.tabsWrap}>{renderFilterTabs()}</div>

                        <div className={workbench.nav.searchWrap}>{renderSearchInput()}</div>
                    </div>
                    <div className={workbench.nav.actions}>
                        <div className={cn(workbench.nav.primaryActions, "hidden sm:flex")}>
                            <ToolbarIconButton
                                Icon={FileUp}
                                ariaLabel={t("toolbar.add_torrent")}
                                title={t("toolbar.add_torrent")}
                                onPress={onAddTorrent}
                                className={cn(toneButtonClass.primary, workbench.nav.primaryActionEmphasis)}
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
                        <div className="flex sm:hidden">
                            <Dropdown placement="bottom-end" backdrop="transparent">
                                <DropdownTrigger>
                                    <ToolbarIconButton
                                        Icon={Plus}
                                        ariaLabel={t("nav.mobile_add_menu_open")}
                                        title={t("nav.mobile_add_menu_open")}
                                        className={cn(toneButtonClass.primary, workbench.nav.primaryActionEmphasis)}
                                        iconSize="lg"
                                    />
                                </DropdownTrigger>
                                <DropdownMenu
                                    aria-label={t("nav.mobile_add_menu_open")}
                                    variant="shadow"
                                    className={surface.menu.surface}
                                    classNames={surface.menu.listClassNames}
                                    itemClasses={surface.menu.itemClassNames}
                                >
                                    <DropdownItem
                                        key="add-torrent"
                                        startContent={
                                            <StatusIcon Icon={FileUp} size="md" className={surface.atom.textCurrent} />
                                        }
                                        onPress={handleMobileAddTorrent}
                                    >
                                        {t("toolbar.add_torrent")}
                                    </DropdownItem>
                                    <DropdownItem
                                        key="add-magnet"
                                        startContent={
                                            <StatusIcon Icon={Magnet} size="md" className={surface.atom.textCurrent} />
                                        }
                                        onPress={handleMobileAddMagnet}
                                    >
                                        {t("toolbar.add_magnet")}
                                    </DropdownItem>
                                </DropdownMenu>
                            </Dropdown>
                        </div>
                        <div
                            className={workbench.nav.selectionSeparator}
                            style={workbench.nav.selectionSeparatorStyle}
                        />

                        <div
                            className={cn(
                                workbench.nav.selectionActionsBase,
                                hasSelection
                                    ? workbench.nav.selectionActionsEnabled
                                    : workbench.nav.selectionActionsDisabled,
                                "hidden sm:flex",
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
                                    emphasizeActions?.pause ? workbench.nav.selectionPauseEmphasis : "",
                                )}
                                iconSize="lg"
                            />
                            <div className={workbench.nav.selectionExtraActions}>{renderSelectionExtraActions()}</div>
                        </div>

                        <div
                            className={workbench.nav.selectionSeparator}
                            style={workbench.nav.selectionSeparatorStyle}
                        />
                        {!showWindowControls ? (
                            <div className="hidden sm:flex">
                                <ToolbarIconButton
                                    Icon={Icon}
                                    ariaLabel={t("theme.toggle_label", {
                                        value: isDark ? t("theme.dark") : t("theme.light"),
                                    })}
                                    title={t("theme.toggle")}
                                    onPress={toggleTheme}
                                    className={cn(workbench.nav.ghostAction, workbench.nav.ghostActionOverflow)}
                                    iconSize="lg"
                                />
                            </div>
                        ) : null}
                        <div className="hidden sm:flex">
                            <ToolbarIconButton
                                Icon={Settings}
                                ariaLabel={t("toolbar.settings")}
                                title={t("toolbar.settings")}
                                onPress={onSettings}
                                className={cn(workbench.nav.ghostAction, workbench.nav.ghostActionOverflow)}
                                iconSize="lg"
                            />
                        </div>
                        <div className="sm:hidden">
                            <ToolbarIconButton
                                Icon={isMobileMenuOpen ? X : Menu}
                                ariaLabel={t(isMobileMenuOpen ? "nav.mobile_menu_close" : "nav.mobile_menu_open")}
                                title={t(isMobileMenuOpen ? "nav.mobile_menu_close" : "nav.mobile_menu_open")}
                                onPress={handleMobileMenuToggle}
                                className={cn(workbench.nav.ghostAction, workbench.nav.ghostActionOverflow)}
                                iconSize="lg"
                            />
                        </div>
                    </div>

                    {rehashStatus?.active && (
                        <div className={workbench.nav.rehashWrap}>
                            <AppTooltip content={`${rehashStatus.label}: ${Math.round(rehashStatus.value)}%`}>
                                <div className={workbench.nav.rehashTooltipWrap}>
                                    <SmoothProgressBar
                                        value={Math.min(Math.max(rehashStatus.value, 0), 100)}
                                        trackClassName={workbench.nav.rehashTrack}
                                        indicatorClassName={workbench.nav.rehashIndicator}
                                    />
                                </div>
                            </AppTooltip>
                        </div>
                    )}
                </div>

                {showWindowControls ? (
                    <div
                        className={cn(workbench.nav.shell, workbench.nav.windowControls)}
                        style={{
                            ...shellTokens.outerStyle,
                            ...workbench.nav.windowControlsStyle,
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
                ) : null}
            </div>

            {isMobileMenuOpen ? (
                <div className={workbench.nav.mobileStack} data-mobile-navbar="true">
                    <div className={cn(workbench.nav.shell, workbench.nav.mobilePanel)} style={shellTokens.outerStyle}>
                        <div className={workbench.nav.mobileSection}>
                            <div className={workbench.nav.mobileSearchWrap}>{renderSearchInput(true)}</div>
                            <div className={workbench.nav.mobileTabsWrap}>{renderFilterTabs(true)}</div>
                        </div>
                        {hasSelection ? (
                            <div className={workbench.nav.mobileActionGrid}>
                                {renderMobilePanelButton({
                                    Icon: Play,
                                    label: t("toolbar.resume"),
                                    onPress: () => {
                                        closeMobileMenu();
                                        selectionActions.ensureActive();
                                    },
                                    disabled: !hasSelection,
                                    color: "success",
                                })}
                                {renderMobilePanelButton({
                                    Icon: Pause,
                                    label: t("toolbar.pause"),
                                    onPress: () => {
                                        closeMobileMenu();
                                        selectionActions.ensurePaused();
                                    },
                                    disabled: !hasSelection,
                                    color: "warning",
                                    className: emphasizeActions?.pause ? workbench.nav.selectionPauseEmphasis : "",
                                })}
                                {renderSelectionExtraActions(true)}
                            </div>
                        ) : null}
                        <div className={workbench.nav.mobileUtilityActions}>
                            {renderMobilePanelButton({
                                Icon,
                                label: t("theme.toggle"),
                                onPress: handleMobileThemeToggle,
                            })}
                            {renderMobilePanelButton({
                                Icon: Settings,
                                label: t("toolbar.settings"),
                                onPress: handleMobileSettings,
                            })}
                        </div>
                    </div>
                </div>
            ) : null}
        </header>
    );
}
