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
import { SURFACE, WORKBENCH } from "@/shared/ui/layout/glass-surface";
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
            WORKBENCH.nav.toneButtonFallback.primary,
        success:
            visuals.status.recipes[visuals.status.keys.tone.success]?.button ??
            WORKBENCH.nav.toneButtonFallback.success,
        warning:
            visuals.status.recipes[visuals.status.keys.tone.warning]?.button ??
            WORKBENCH.nav.toneButtonFallback.warning,
        danger:
            visuals.status.recipes[visuals.status.keys.tone.danger]?.button ?? WORKBENCH.nav.toneButtonFallback.danger,
        neutral:
            visuals.status.recipes[visuals.status.keys.tone.neutral]?.button ??
            WORKBENCH.nav.toneButtonFallback.neutral,
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
                        <StatusIcon Icon={DownloadCloud} size="lg" className={WORKBENCH.nav.tabIcon} />
                        <span className={WORKBENCH.nav.tabLabel}>{t("nav.filter_downloading")}</span>
                    </div>
                }
            />
            <Tab
                key="seeding"
                title={
                    <div className={WORKBENCH.nav.tabTitle}>
                        <StatusIcon Icon={UploadCloud} size="lg" className={WORKBENCH.nav.tabIcon} />
                        <span className={WORKBENCH.nav.tabLabel}>{t("nav.filter_seeding")}</span>
                    </div>
                }
            />
        </Tabs>
    );
    const renderSearchInput = (mobile = false) => (
        <Input
            classNames={WORKBENCH.nav.searchInputClassNames}
            style={mobile ? undefined : WORKBENCH.nav.searchStyle}
            placeholder={t("nav.search_placeholder")}
            size="md"
            value={searchQuery}
            data-command-search="true"
            onFocus={() => setActivePart("search")}
            onChange={(event) => setSearchQuery(event.currentTarget.value)}
            startContent={<StatusIcon Icon={Search} size="lg" className={WORKBENCH.nav.searchIcon} />}
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
                        className: emphasizeActions?.forceRecheck ? WORKBENCH.nav.selectionRecheckEmphasis : "",
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
                            emphasizeActions?.forceRecheck ? WORKBENCH.nav.selectionRecheckEmphasis : "",
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
            className={cn(WORKBENCH.nav.mobileMenuButton, className)}
            startContent={
                <StatusIcon
                    Icon={MobileIcon}
                    size="md"
                    className={WORKBENCH.nav.mobileMenuButtonIcon}
                />
            }
        >
            {label}
        </Button>
    );

    return (
        <header className={cn(WORKBENCH.nav.root, WORKBENCH.nav.surface)}>
            <div
                className={WORKBENCH.nav.titlebar}
                style={{
                    ...shellTokens.surfaceStyle,
                    ...WORKBENCH.nav.titlebarBaseStyle,
                    gap: showWindowControls ? WORKBENCH.nav.titlebarBaseStyle.gap : 0,
                }}
            >
                <div
                    className={cn(
                        WORKBENCH.nav.shell,
                        // remove `px-panel` here so horizontal padding is supplied
                        // centrally by `...shell.frameStyle` (see config/logic.ts)
                        WORKBENCH.nav.main,
                        !showWindowControls && "w-full",
                    )}
                    style={{
                        ...shellTokens.outerStyle,
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
                            {renderFilterTabs()}
                        </div>

                        <div className={WORKBENCH.nav.searchWrap}>{renderSearchInput()}</div>
                    </div>
                    <div className={WORKBENCH.nav.actions}>
                        <div className={cn(WORKBENCH.nav.primaryActions, "hidden sm:flex")}>
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
                        <div className="flex sm:hidden">
                            <Dropdown placement="bottom-end" backdrop="transparent">
                                <DropdownTrigger>
                                    <ToolbarIconButton
                                        Icon={Plus}
                                        ariaLabel={t("nav.mobile_add_menu_open")}
                                        title={t("nav.mobile_add_menu_open")}
                                        className={cn(
                                            toneButtonClass.primary,
                                            WORKBENCH.nav.primaryActionEmphasis,
                                        )}
                                        iconSize="lg"
                                    />
                                </DropdownTrigger>
                                <DropdownMenu
                                    aria-label={t("nav.mobile_add_menu_open")}
                                    variant="shadow"
                                    className={SURFACE.menu.surface}
                                    classNames={SURFACE.menu.listClassNames}
                                    itemClasses={SURFACE.menu.itemClassNames}
                                >
                                    <DropdownItem
                                        key="add-torrent"
                                        startContent={<StatusIcon Icon={FileUp} size="md" className={SURFACE.atom.textCurrent} />}
                                        onPress={handleMobileAddTorrent}
                                    >
                                        {t("toolbar.add_torrent")}
                                    </DropdownItem>
                                    <DropdownItem
                                        key="add-magnet"
                                        startContent={<StatusIcon Icon={Magnet} size="md" className={SURFACE.atom.textCurrent} />}
                                        onPress={handleMobileAddMagnet}
                                    >
                                        {t("toolbar.add_magnet")}
                                    </DropdownItem>
                                </DropdownMenu>
                            </Dropdown>
                        </div>
                        <div
                            className={WORKBENCH.nav.selectionSeparator}
                            style={WORKBENCH.nav.selectionSeparatorStyle}
                        />

                        <div className={cn(WORKBENCH.nav.builder.selectionActionsClass(hasSelection), "hidden sm:flex")}>
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
                            <div className={WORKBENCH.nav.selectionExtraActions}>{renderSelectionExtraActions()}</div>
                        </div>

                        <div
                            className={WORKBENCH.nav.selectionSeparator}
                            style={WORKBENCH.nav.selectionSeparatorStyle}
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
                                    className={cn(WORKBENCH.nav.ghostAction, WORKBENCH.nav.ghostActionOverflow)}
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
                                className={cn(WORKBENCH.nav.ghostAction, WORKBENCH.nav.ghostActionOverflow)}
                                iconSize="lg"
                            />
                        </div>
                        <div className="sm:hidden">
                            <ToolbarIconButton
                                Icon={isMobileMenuOpen ? X : Menu}
                                ariaLabel={t(isMobileMenuOpen ? "nav.mobile_menu_close" : "nav.mobile_menu_open")}
                                title={t(isMobileMenuOpen ? "nav.mobile_menu_close" : "nav.mobile_menu_open")}
                                onPress={handleMobileMenuToggle}
                                className={cn(WORKBENCH.nav.ghostAction, WORKBENCH.nav.ghostActionOverflow)}
                                iconSize="lg"
                            />
                        </div>
                    </div>

                    {rehashStatus?.active && (
                        <div className={WORKBENCH.nav.rehashWrap}>
                            <AppTooltip content={`${rehashStatus.label}: ${Math.round(rehashStatus.value)}%`}>
                                <div className={WORKBENCH.nav.rehashTooltipWrap}>
                                    <SmoothProgressBar
                                        value={Math.min(Math.max(rehashStatus.value, 0), 100)}
                                        trackClassName={WORKBENCH.nav.rehashTrack}
                                        indicatorClassName={WORKBENCH.nav.rehashIndicator}
                                    />
                                </div>
                            </AppTooltip>
                        </div>
                    )}
                </div>

                {showWindowControls ? (
                    <div
                        className={cn(WORKBENCH.nav.shell, WORKBENCH.nav.windowControls)}
                        style={{
                            ...shellTokens.outerStyle,
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
                ) : null}
            </div>

            {isMobileMenuOpen ? (
                <div className={WORKBENCH.nav.mobileStack} data-mobile-navbar="true">
                    <div
                        className={cn(WORKBENCH.nav.shell, WORKBENCH.nav.mobilePanel)}
                        style={shellTokens.outerStyle}
                    >
                        <div className={WORKBENCH.nav.mobileSection}>
                            <div className={WORKBENCH.nav.mobileSearchWrap}>{renderSearchInput(true)}</div>
                            <div className={WORKBENCH.nav.mobileTabsWrap}>{renderFilterTabs(true)}</div>
                        </div>
                        {hasSelection ? (
                            <div className={WORKBENCH.nav.mobileActionGrid}>
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
                                    className: emphasizeActions?.pause
                                        ? WORKBENCH.nav.selectionPauseEmphasis
                                        : "",
                                })}
                                {renderSelectionExtraActions(true)}
                            </div>
                        ) : null}
                        <div className={WORKBENCH.nav.mobileUtilityActions}>
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
