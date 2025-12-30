import { Button, Input, Tab, Tabs, cn } from "@heroui/react";
import {
    DownloadCloud,
    ListChecks,
    Pause,
    Play,
    RotateCcw,
    Search,
    Settings,
    Plus,
    Trash2,
    UploadCloud,
    Monitor,
    PanelsTopLeft,
    Minimize,
    Maximize,
    X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { TinyTorrentIcon } from "@/shared/ui/components/TinyTorrentIcon";
import StatusIcon from "@/shared/ui/components/StatusIcon";
import { ThemeToggle } from "@/shared/ui/controls/ThemeToggle";
import { ICON_STROKE_WIDTH } from "@/config/logic";
import { ToolbarIconButton } from "@/shared/ui/layout/toolbar-button";
import { SmoothProgressBar } from "@/shared/ui/components/SmoothProgressBar";
import { useFocusState } from "@/app/context/FocusContext";
import { APP_VERSION } from "@/shared/version";
import {
    BLOCK_SHADOW,
    GLASS_BLOCK_SURFACE,
} from "@/shared/ui/layout/glass-surface";
import { getShellTokens } from "@/config/logic";

interface NavbarProps {
    filter: string;
    searchQuery: string;
    setSearchQuery: (value: string) => void;
    setFilter: (key: string) => void;
    onAdd: () => void;
    onSettings: () => void;
    hasSelection: boolean;
    onResumeSelection: () => void;
    onPauseSelection: () => void;
    onRecheckSelection: () => void;
    onRemoveSelection: () => void;
    rehashStatus?: {
        active: boolean;
        value: number;
        label: string;
    };
    workspaceStyle: "classic" | "immersive";
    onWorkspaceToggle: () => void;
    workspaceToggleLabel: string;
    onWindowCommand: (command: "minimize" | "maximize" | "close") => void;
}

export function Navbar({
    filter,
    searchQuery,
    setSearchQuery,
    setFilter,
    onAdd,
    onSettings,
    hasSelection,
    onResumeSelection,
    onPauseSelection,
    onRecheckSelection,
    onRemoveSelection,
    rehashStatus,
    workspaceStyle,
    onWorkspaceToggle,
    workspaceToggleLabel,
    onWindowCommand,
}: NavbarProps) {
    const { t } = useTranslation();
    const { setActivePart } = useFocusState();
    const shell = getShellTokens(workspaceStyle);

    return (
        <header
            className={cn(
                "sticky top-0 z-30 flex w-full shrink-0 select-none overflow-visible transition-all",
                GLASS_BLOCK_SURFACE,
                BLOCK_SHADOW
            )}
            style={shell.frameStyle}
        >
            <div
                className="app-titlebar flex w-full items-center justify-between"
                style={{
                    ...shell.contentStyle,
                    height: "var(--tt-navbar-h)",
                    paddingLeft: "var(--spacing-panel)",
                    paddingRight: "var(--spacing-panel)",
                    gap: "var(--tt-navbar-gap)",
                }}
            >
                {/* LEFT ZONE: Identity & Navigation */}
                <div
                    className="flex items-center"
                    style={{ gap: "var(--tt-navbar-gap)" }}
                >
                    {/* Brand */}
                    <div className="flex items-center gap-tools pr-tight">
                        <div
                            className="flex items-center justify-center rounded-xl"
                            style={{
                                width: "var(--tt-brand-icon-size)",
                                height: "var(--tt-brand-icon-size)",
                            }}
                        >
                            <TinyTorrentIcon title={t("brand.name")} />
                        </div>
                        {/* Hidden on smaller screens when space is constrained */}
                        <div className="hidden flex-col md:flex">
                            <span
                                className="font-bold tracking-tight text-foreground"
                                style={{
                                    fontSize: "var(--tt-navbar-tab-font-size)",
                                }}
                            >
                                {t("brand.name")}
                            </span>
                            <span
                                className="text-default-400 font-mono font-medium"
                                style={{
                                    fontSize: "var(--tt-navbar-meta-font-size)",
                                }}
                            >
                                {t("brand.version", { version: APP_VERSION })}
                            </span>
                        </div>
                    </div>

                    <div className="h-sep w-px bg-default-200/50 mx-tight" />

                    {/* Filters */}
                    <div className="hidden lg:flex">
                        <Tabs
                            aria-label="Filter"
                            variant="light"
                            size="lg"
                            radius="full"
                            selectedKey={filter}
                            onSelectionChange={(k) => setFilter(k as string)}
                            classNames={{
                                base: "",
                                tabList:
                                    "bg-default-100/50 p-tight border border-default-200/50 shadow-inner gap-tight",
                                cursor: "bg-background shadow-sm border border-default-100",
                                tab: "px-panel font-semibold text-default-500 transition-colors",
                            }}
                        >
                            <Tab
                                key="all"
                                title={
                                    <div className="flex items-center gap-tight">
                                        <StatusIcon
                                            Icon={ListChecks}
                                            size="md"
                                            className="text-default-400"
                                        />
                                        {t("nav.filter_all")}
                                    </div>
                                }
                            />
                            <Tab
                                key="downloading"
                                title={
                                    <div className="flex items-center gap-tight">
                                        <StatusIcon
                                            Icon={DownloadCloud}
                                            size="md"
                                            className="text-default-400"
                                        />
                                        {t("nav.filter_downloading")}
                                    </div>
                                }
                            />
                            <Tab
                                key="seeding"
                                title={
                                    <div className="flex items-center gap-tight">
                                        <StatusIcon
                                            Icon={UploadCloud}
                                            size="md"
                                            className="text-default-400"
                                        />
                                        {t("nav.filter_seeding")}
                                    </div>
                                }
                            />
                        </Tabs>
                    </div>
                </div>

                {/* RIGHT ZONE: Action Center */}
                <div className="flex items-center gap-tools">
                    {/* Search - Pushed to start of right zone */}
                    <div className="hidden sm:flex">
                        <Input
                            classNames={{
                                base: "transition-all",
                                mainWrapper: "h-full",
                                input: "text-small text-foreground/90 whitespace-nowrap overflow-hidden text-ellipsis placeholder:opacity-70",
                                inputWrapper:
                                    "h-full flex items-center gap-tools flex-nowrap font-normal text-default-500 bg-default-100/50 hover:bg-default-200/50 p-tight border border-default-200/50 focus-within:bg-default-100 focus-within:border-primary/20 shadow-inner rounded-full transition-colors",
                            }}
                            style={{ width: "var(--tt-search-width)" }}
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
                                    size="md"
                                    className="text-default-400"
                                />
                            }
                        />
                    </div>

                    <div
                        className="hidden sm:flex w-px bg-default-200/50 mx-tight"
                        style={{ height: "calc(var(--tt-navbar-h) / 2)" }}
                    />

                    {/* Context Actions (Selection Dependent) */}
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
                            onPress={onResumeSelection}
                            disabled={!hasSelection}
                            className="text-success hover:text-success-600 hover:bg-success/10"
                        />
                        <ToolbarIconButton
                            Icon={Pause}
                            ariaLabel={t("toolbar.pause")}
                            title={t("toolbar.pause")}
                            onPress={onPauseSelection}
                            disabled={!hasSelection}
                            className="text-warning hover:text-warning-600 hover:bg-warning/10"
                        />
                        <ToolbarIconButton
                            Icon={RotateCcw}
                            ariaLabel={t("toolbar.recheck")}
                            title={t("toolbar.recheck")}
                            onPress={onRecheckSelection}
                            disabled={!hasSelection}
                            className="text-default-500 hover:text-foreground hover:bg-default-200"
                        />
                        <ToolbarIconButton
                            Icon={Trash2}
                            ariaLabel={t("toolbar.remove")}
                            title={t("toolbar.remove")}
                            onPress={onRemoveSelection}
                            disabled={!hasSelection}
                            className="text-danger hover:text-danger-600 hover:bg-danger/10"
                        />
                    </div>

                    <div
                        className="hidden sm:flex w-px bg-default-200/50 mx-tight"
                        style={{ height: "calc(var(--tt-navbar-h) / 2)" }}
                    />

                    {/* Primary Action */}
                    <ToolbarIconButton
                        Icon={Plus}
                        ariaLabel={t("toolbar.add_torrent")}
                        title={t("toolbar.add_torrent")}
                        onPress={onAdd}
                        className="bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary-600 ring-1 ring-primary/20"
                    />

                    <div className="h-sep w-px bg-default-200/50 mx-tight" />

                    {/* System / Global */}
                    <div className="flex items-center gap-tools">
                        <ToolbarIconButton
                            Icon={
                                workspaceStyle === "immersive"
                                    ? PanelsTopLeft
                                    : Monitor
                            }
                            ariaLabel={workspaceToggleLabel}
                            title={workspaceToggleLabel}
                            onPress={onWorkspaceToggle}
                            className="text-default-400 hover:text-foreground"
                            style={{ overflow: "visible" }}
                        />
                        <ToolbarIconButton
                            Icon={Settings}
                            ariaLabel={t("toolbar.settings")}
                            title={t("toolbar.settings")}
                            onPress={onSettings}
                            className="text-default-400 hover:text-foreground"
                            style={{ overflow: "visible" }}
                        />
                        <ThemeToggle />
                    </div>

                    <div className="flex items-center gap-tight">
                        <ToolbarIconButton
                            Icon={Minimize}
                            ariaLabel={t("toolbar.minimize")}
                            title={t("toolbar.minimize")}
                            onPress={() => onWindowCommand("minimize")}
                            className="text-default-400 hover:text-foreground"
                        />
                        <ToolbarIconButton
                            Icon={Maximize}
                            ariaLabel={t("toolbar.maximize")}
                            title={t("toolbar.maximize")}
                            onPress={() => onWindowCommand("maximize")}
                            className="text-default-400 hover:text-foreground"
                        />
                        <ToolbarIconButton
                            Icon={X}
                            ariaLabel={t("toolbar.close")}
                            title={t("toolbar.close")}
                            onPress={() => onWindowCommand("close")}
                            className="text-danger hover:text-danger-600 hover:bg-danger/10"
                        />
                    </div>

                    {/* Progress Bar (Attached to bottom) */}
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
                                {/* Tooltip on hover */}
                                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-black/80 text-white text-scaled px-tight py-tight rounded shadow-lg whitespace-nowrap pointer-events-none">
                                    {rehashStatus.label}:{" "}
                                    {Math.round(rehashStatus.value)}%
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </header>
    );
}
