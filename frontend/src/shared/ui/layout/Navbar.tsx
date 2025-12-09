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
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { ThemeToggle } from "../controls/ThemeToggle";
import { ICON_STROKE_WIDTH } from "../../../config/iconography";
import { ToolbarIconButton } from "../layout/toolbar-button";
import { SmoothProgressBar } from "../components/SmoothProgressBar";
import type { FeedbackMessage, FeedbackTone } from "../../types/feedback";
import { BLOCK_SHADOW, GLASS_BLOCK_SURFACE, PANEL_SHADOW } from "./shadows";

const FEEDBACK_TONE_CLASSES: Record<FeedbackTone, string> = {
    info: "text-primary",
    success: "text-success",
    warning: "text-warning",
    danger: "text-danger",
};

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
    actionFeedback?: FeedbackMessage | null;
    rehashStatus?: {
        active: boolean;
        value: number;
        label: string;
    };
    workspaceStyle: "classic" | "immersive";
    onWorkspaceToggle: () => void;
    workspaceToggleLabel: string;
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
    actionFeedback,
    rehashStatus,
    workspaceStyle,
    onWorkspaceToggle,
    workspaceToggleLabel,
}: NavbarProps) {
    const { t } = useTranslation();

    return (
        <header
            className={cn(
                "app-titlebar sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between gap-6 px-6 select-none rounded-[28px] relative overflow-visible transition-all",
                GLASS_BLOCK_SURFACE,
                BLOCK_SHADOW
            )}
        >
            {/* Feedback Toast */}
            {actionFeedback && (
                <div className="pointer-events-none absolute bottom-[-16px] left-1/2 -translate-x-1/2 z-50">
                    <div
                        className={cn(
                            "flex items-center gap-2 rounded-full border border-content1/20 bg-background/80 px-4 py-1.5 text-[11px] font-bold uppercase tracking-widest backdrop-blur-xl shadow-xl animate-appearance-in",
                            PANEL_SHADOW,
                            FEEDBACK_TONE_CLASSES[actionFeedback.tone]
                        )}
                        aria-live="polite"
                    >
                        <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                        {actionFeedback.message}
                    </div>
                </div>
            )}

            {/* LEFT ZONE: Identity & Navigation */}
            <div className="flex items-center gap-6">
                {/* Brand */}
                <div className="flex items-center gap-3 pr-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 text-white shadow-lg shadow-primary/25 ring-1 ring-white/10">
                        <img
                            src="/tinyTorrent.svg"
                            alt={t("brand.name")}
                            className="h-10 w-10 object-contain"
                        />
                    </div>
                    {/* Hidden on small screens if needed, keeping accessible */}
                    <div className="hidden flex-col sm:flex">
                        <span className="text-sm font-bold tracking-tight text-foreground">
                            {t("brand.name")}
                        </span>
                        <span className="text-[10px] text-default-400 font-mono font-medium">
                            {t("brand.version")}
                        </span>
                    </div>
                </div>

                <div className="h-8 w-px bg-default-200/50" />

                {/* Filters */}
                <Tabs
                    aria-label="Filter"
                    variant="light"
                    size="sm"
                    radius="full"
                    selectedKey={filter}
                    onSelectionChange={(k) => setFilter(k as string)}
                    classNames={{
                        base: "p-0",
                        tabList:
                            "bg-default-100/50 p-1 border border-default-200/50 shadow-inner gap-1",
                        cursor: "bg-background shadow-sm border border-default-100",
                        tab: "h-7 px-3 text-[11px] font-semibold text-default-500 data-[selected=true]:text-foreground transition-colors",
                    }}
                >
                    <Tab
                        key="all"
                        title={
                            <div className="flex items-center gap-1.5">
                                <ListChecks size={13} strokeWidth={2} />
                                {t("nav.filter_all")}
                            </div>
                        }
                    />
                    <Tab
                        key="downloading"
                        title={
                            <div className="flex items-center gap-1.5">
                                <DownloadCloud size={13} strokeWidth={2} />
                                {t("nav.filter_downloading")}
                            </div>
                        }
                    />
                    <Tab
                        key="seeding"
                        title={
                            <div className="flex items-center gap-1.5">
                                <UploadCloud size={13} strokeWidth={2} />
                                {t("nav.filter_seeding")}
                            </div>
                        }
                    />
                </Tabs>
            </div>

            {/* RIGHT ZONE: Action Center */}
            <div className="flex items-center gap-3">
                {/* Search - Pushed to start of right zone */}
                <Input
                    classNames={{
                        base: "w-40 lg:w-56 h-9 transition-all hover:w-60 focus-within:w-60",
                        mainWrapper: "h-full",
                        input: "text-small",
                        inputWrapper:
                            "h-full font-normal text-default-500 bg-default-100/50 hover:bg-default-200/50 border-transparent focus-within:bg-default-100 focus-within:border-primary/20 shadow-inner rounded-full transition-colors",
                    }}
                    placeholder={t("nav.search_placeholder")}
                    size="sm"
                    value={searchQuery}
                    onChange={(event) =>
                        setSearchQuery(event.currentTarget.value)
                    }
                    startContent={
                        <Search
                            size={15}
                            strokeWidth={ICON_STROKE_WIDTH}
                            className="text-default-400"
                        />
                    }
                />

                <div className="h-6 w-px bg-default-200/50 mx-1" />

                {/* Context Actions (Selection Dependent) */}
                <div
                    className={cn(
                        "flex items-center gap-1 transition-opacity duration-200",
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

                <div className="h-6 w-px bg-default-200/50 mx-1" />

                {/* Primary Action */}
                <ToolbarIconButton
                    Icon={Plus}
                    ariaLabel={t("toolbar.add_torrent")}
                    title={t("toolbar.add_torrent")}
                    onPress={onAdd}
                    className="bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary-600 ring-1 ring-primary/20"
                />

                <div className="h-6 w-px bg-default-200/50 mx-1" />

                {/* System / Global */}
                <div className="flex items-center gap-1">
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
                    />
                    <ToolbarIconButton
                        Icon={Settings}
                        ariaLabel={t("toolbar.settings")}
                        title={t("toolbar.settings")}
                        onPress={onSettings}
                        className="text-default-400 hover:text-foreground"
                    />
                    <ThemeToggle />
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
                                trackClassName="h-[2px] bg-transparent"
                                indicatorClassName="h-full bg-gradient-to-r from-primary to-secondary shadow-[0_0_10px_rgba(var(--primary),0.5)]"
                            />
                            {/* Tooltip on hover */}
                            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-black/80 text-white text-[10px] px-2 py-1 rounded shadow-lg whitespace-nowrap pointer-events-none">
                                {rehashStatus.label}:{" "}
                                {Math.round(rehashStatus.value)}%
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </header>
    );
}
