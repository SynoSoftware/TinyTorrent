import { Input, Tab, Tabs, cn } from "@heroui/react";
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
import { useFocusState } from "@/app/context/FocusContext";
import { APP_VERSION } from "@/shared/version";
import { useTheme } from "@/shared/hooks/useTheme";
import {
    BLOCK_SHADOW,
    GLASS_BLOCK_SURFACE,
} from "@/shared/ui/layout/glass-surface";
import { getShellTokens } from "@/config/logic";

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
    const { isDark, toggle } = useTheme();
    const Icon = isDark ? Moon : Sun;

    return (
        <header
            className={cn(
                "sticky top-0 z-30 w-full shrink-0 select-none overflow-visible"
            )}
        >
            <div
                className="app-titlebar flex w-full items-stretch"
                style={{
                    ...shell.surfaceStyle,
                    height: "var(--tt-navbar-h)",
                    // Use the semantic panel spacing as the flex gap between
                    // the main navbar blocks (left content and right controls).
                    // This avoids per-component margins and follows the token
                    // pipeline (no magic numbers).
                    gap: "var(--spacing-panel)",
                }}
            >
                <div
                    className={cn(
                        GLASS_BLOCK_SURFACE,
                        BLOCK_SHADOW,
                        // remove `px-panel` here so horizontal padding is supplied
                        // centrally by `...shell.frameStyle` (see config/logic.ts)
                        "flex grow h-full min-w-0 items-center justify-between gap-stage py-tight relative"
                    )}
                    style={{
                        ...shell.outerStyle,
                        // rely on shell.frameStyle + parent gap for spacing;
                        // keeping per-component margin was causing drift.
                    }}
                >
                    <div className="flex items-center gap-tools min-w-0">
                        <div className="flex items-center gap-tools pr-tight">
                            <div
                                className="flex items-center justify-center"
                                style={{
                                    width: "var(--tt-brand-icon-size)",
                                    height: "var(--tt-brand-icon-size)",
                                }}
                            >
                                <TinyTorrentIcon title={t("brand.name")} />
                            </div>
                            <div className="hidden xl:flex flex-col justify-center ml-tight">
                                <span className="font-bold tracking-tight text-foreground text-base leading-none  text-navbar">
                                    {t("brand.name")}
                                </span>
                                <span className="text-default-400 font-mono text-xs font-medium leading-none mt-0.5">
                                    {t("brand.version", {
                                        version: APP_VERSION,
                                    })}
                                </span>
                            </div>
                        </div>

                        <div className="hidden min-[600px]:flex h-sep w-px bg-default-200/50 mx-tight" />

                        <div className="hidden min-[1200px]:flex text-navbar min-w-0">
                            <Tabs
                                aria-label={t("nav.filter_aria")}
                                variant="light"
                                size="lg"
                                radius="full"
                                selectedKey={filter}
                                onSelectionChange={(k) =>
                                    setFilter(k as string)
                                }
                                classNames={{
                                    base: "",
                                    tabList:
                                        "bg-default-100/50 p-tight border border-default-200/50 shadow-inner gap-tight h-navbar-pill overflow-visible",
                                    cursor: "bg-background shadow-sm border-default-100 h-navbar-cursor rounded-full",
                                    tab: "px-panel font-semibold text-default-500 transition-colors text-navbar",
                                }}
                            >
                                <Tab
                                    key="all"
                                    title={
                                        <div className="flex items-center gap-tight">
                                            <StatusIcon
                                                Icon={ListChecks}
                                                size="lg"
                                                className="text-default-400"
                                            />
                                            <span className="hidden min-[1600px]:inline">
                                                {t("nav.filter_all")}
                                            </span>
                                        </div>
                                    }
                                />
                                <Tab
                                    key="downloading"
                                    title={
                                        <div className="flex items-center gap-tight">
                                            <StatusIcon
                                                Icon={DownloadCloud}
                                                size="lg"
                                                className="text-default-400"
                                            />
                                            <span className="hidden min-[1600px]:inline">
                                                {t("nav.filter_downloading")}
                                            </span>
                                        </div>
                                    }
                                />
                                <Tab
                                    key="seeding"
                                    title={
                                        <div className="flex items-center gap-tight">
                                            <StatusIcon
                                                Icon={UploadCloud}
                                                size="lg"
                                                className="text-default-400"
                                            />
                                            <span className="hidden min-[1600px]:inline">
                                                {t("nav.filter_seeding")}
                                            </span>
                                        </div>
                                    }
                                />
                            </Tabs>
                        </div>

                        <div className="hidden min-[1400px]:flex">
                            <Input
                                classNames={{
                                    base: "transition-all",
                                    mainWrapper: "h-navbar-pill",
                                    input: "text-navbar font-medium text-foreground/90 whitespace-nowrap overflow-hidden text-ellipsis placeholder:opacity-70",
                                    inputWrapper:
                                        "h-full flex items-center gap-tools flex-nowrap font-normal text-default-500 bg-default-100/50 hover:bg-default-200/50 p-tight border border-default-200/50 focus-within:bg-default-100 focus-within:border-primary/20 shadow-inner rounded-full transition-colors",
                                }}
                                style={{
                                    width: "var(--tt-search-width)",
                                    fontSize: "var(--tt-fz-navbar)",
                                }}
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
                                        className="text-default-400"
                                    />
                                }
                            />
                        </div>
                    </div>
                    <div
                        className={cn(
                            "flex items-center gap-tools transition-opacity duration-200 shrink-0",
                            "opacity-100"
                        )}
                    >
                        <div className="flex items-center gap-tools min-w-0">
                            <ToolbarIconButton
                                Icon={FileUp}
                                ariaLabel={t("toolbar.add_torrent")}
                                title={t("toolbar.add_torrent")}
                                onPress={onAddTorrent}
                                className="text-primary hover:text-primary-600 hover:bg-primary/10 ring-1 ring-primary/20"
                                iconSize="lg"
                            />

                            <ToolbarIconButton
                                Icon={Magnet}
                                ariaLabel={t("toolbar.add_magnet")}
                                title={t("toolbar.add_magnet")}
                                onPress={onAddMagnet}
                                className="text-primary hover:text-primary-600 hover:bg-primary/10"
                                iconSize="lg"
                            />
                        </div>
                        <div
                            className="hidden sm:flex w-px bg-default-200/50 mx-tight"
                            style={{ height: "calc(var(--tt-navbar-h) / 2)" }}
                        />

                        <div
                            className={cn(
                                "flex items-center gap-tools transition-opacity duration-200",
                                !hasSelection
                                    ? "opacity-30 pointer-events-none grayscale"
                                    : "opacity-100"
                            )}
                        >
                            <ToolbarIconButton
                                Icon={Play}
                                ariaLabel={t("toolbar.resume")}
                                title={t("toolbar.resume")}
                                onPress={selectionActions.ensureActive}
                                disabled={!hasSelection}
                                className="text-success hover:text-success-600 hover:bg-success/10"
                                iconSize="lg"
                            />
                            <ToolbarIconButton
                                Icon={Pause}
                                ariaLabel={t("toolbar.pause")}
                                title={t("toolbar.pause")}
                                onPress={selectionActions.ensurePaused}
                                disabled={!hasSelection}
                                className={cn(
                                    "text-warning hover:text-warning-600 hover:bg-warning/10",
                                    emphasizeActions?.pause
                                        ? "ring-1 ring-warning/30 shadow-sm"
                                        : ""
                                )}
                                iconSize="lg"
                            />
                            <div className=" hidden min-[600px]:flex  gap-tools ">
                                <ToolbarIconButton
                                    Icon={RotateCcw}
                                    ariaLabel={t("toolbar.recheck")}
                                    title={t("toolbar.recheck")}
                                    onPress={selectionActions.ensureValid}
                                    disabled={!hasSelection}
                                    className={cn(
                                        "text-default-500 hover:text-foreground hover:bg-default-200",
                                        emphasizeActions?.forceRecheck
                                            ? "ring-1 ring-default/20 shadow-sm"
                                            : ""
                                    )}
                                    iconSize="lg"
                                />
                                <ToolbarIconButton
                                    Icon={Trash2}
                                    ariaLabel={t("toolbar.remove")}
                                    title={t("toolbar.remove")}
                                    onPress={selectionActions.ensureRemoved}
                                    disabled={!hasSelection}
                                    className="text-danger hover:text-danger-600 hover:bg-danger/10"
                                    iconSize="lg"
                                />
                            </div>
                        </div>

                        <div
                            className="hidden sm:flex w-px bg-default-200/50 mx-tight"
                            style={{ height: "calc(var(--tt-navbar-h) / 2)" }}
                        />

                        <ToolbarIconButton
                            Icon={Settings}
                            ariaLabel={t("toolbar.settings")}
                            title={t("toolbar.settings")}
                            onPress={onSettings}
                            className="text-default-400 hover:text-foreground"
                            style={{ overflow: "visible" }}
                            iconSize="lg"
                        />
                        <div
                            className="flex max-[799px]:flex min-[800px]:hidden
"
                        >
                            <ToolbarIconButton
                                Icon={Icon}
                                ariaLabel={t("theme.toggle_label", {
                                    value: isDark
                                        ? t("theme.dark")
                                        : t("theme.light"),
                                })}
                                title={t("theme.toggle")}
                                onPress={toggle}
                                className="text-default-400 hover:text-foreground"
                                style={{ overflow: "visible" }}
                                iconSize="lg"
                            />
                        </div>
                    </div>

                    {rehashStatus?.active && (
                        <div className="absolute inset-x-6 bottom-0 translate-y-1/2">
                            <div className="relative group cursor-help">
                                <SmoothProgressBar
                                    value={Math.min(
                                        Math.max(rehashStatus.value, 0),
                                        100
                                    )}
                                    trackClassName="h-track bg-transparent"
                                    indicatorClassName="h-full bg-gradient-to-r from-primary to-secondary shadow-nav"
                                />
                                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-black/80 text-white text-scaled px-tight py-tight rounded shadow-lg whitespace-nowrap pointer-events-none">
                                    {rehashStatus.label}:{" "}
                                    {Math.round(rehashStatus.value)}%
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div
                    className={cn(
                        GLASS_BLOCK_SURFACE,
                        BLOCK_SHADOW,
                        "hidden min-[800px]:flex h-full items-stretch divide-x divide-default/20 overflow-hidden"
                    )}
                    style={{
                        ...shell.outerStyle,
                        paddingLeft: 0,
                        paddingRight: 0,
                    }}
                >
                    <WindowControlButton
                        Icon={Icon}
                        ariaLabel={t("theme.toggle_label", {
                            value: isDark ? t("theme.dark") : t("theme.light"),
                        })}
                        title={t("theme.toggle")}
                        onPress={toggle}
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
