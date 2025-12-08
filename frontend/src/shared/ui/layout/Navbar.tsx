import { Button, Input, Tab, Tabs, cn } from "@heroui/react";
import {
    DownloadCloud,
    ListChecks,
    Pause,
    Play,
    RotateCcw,
    Search,
    Settings2,
    Trash2,
    UploadCloud,
    Zap,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { ThemeToggle } from "../controls/ThemeToggle";
import { LanguageMenu } from "../controls/LanguageMenu";
import { ICON_STROKE_WIDTH } from "../../../config/iconography";
import { SmoothProgressBar } from "../components/SmoothProgressBar";
import type { FeedbackMessage, FeedbackTone } from "../../types/feedback";

const FEEDBACK_TONE_CLASSES: Record<FeedbackTone, string> = {
    info: "text-primary",
    success: "text-success",
    warning: "text-warning",
    danger: "text-danger",
};

interface NavbarProps {
    filter: string;
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
}

export function Navbar({
    filter,
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
}: NavbarProps) {
    const { t } = useTranslation();

    return (
        <header className="app-titlebar z-20 flex h-16 shrink-0 items-center justify-between gap-4 px-6 sticky top-0 select-none relative overflow-visible">
            {actionFeedback && (
                <div className="pointer-events-none absolute bottom-[-14px] right-6 z-10">
                    <div
                        className={cn(
                            "rounded-full border border-content1/20 bg-content1/90 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] shadow-lg shadow-black/20 backdrop-blur-md",
                            FEEDBACK_TONE_CLASSES[actionFeedback.tone]
                        )}
                        aria-live="polite"
                    >
                        {actionFeedback.message}
                    </div>
                </div>
            )}
            <div className="flex items-center gap-8">
                {/* Brand */}
                <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary-600 text-white shadow-lg shadow-primary/20">
                        <Zap
                            size={18}
                            strokeWidth={ICON_STROKE_WIDTH}
                            fill="currentColor"
                        />
                    </div>
                    <div className="flex flex-col">
                        <span className="text-sm font-bold tracking-wide text-foreground/90">
                            {t("brand.name")}
                        </span>
                        <span className="text-[9px] text-foreground/40 font-mono tracking-widest">
                            {t("brand.version")}
                        </span>
                    </div>
                </div>

                {/* Filters */}
                <Tabs
                    aria-label="Filter"
                    variant="light"
                    size="sm"
                    selectedKey={filter}
                    onSelectionChange={(k) => setFilter(k as string)}
                    classNames={{
                        cursor: "w-full bg-primary/20 shadow-none",
                        tab: "pressable-tab h-8 px-3 text-tiny font-medium text-foreground/60 data-[selected=true]:text-primary",
                        tabContent: "group-data-[selected=true]:font-bold",
                    }}
                >
                    <Tab
                        key="all"
                        title={
                            <div className="flex items-center gap-1">
                                <ListChecks
                                    size={12}
                                    strokeWidth={ICON_STROKE_WIDTH}
                                    className="text-current"
                                />
                                {t("nav.filter_all")}
                            </div>
                        }
                    />
                    <Tab
                        key="downloading"
                        title={
                            <div className="flex items-center gap-1">
                                <DownloadCloud
                                    size={12}
                                    strokeWidth={ICON_STROKE_WIDTH}
                                    className="text-current"
                                />
                                {t("nav.filter_downloading")}
                            </div>
                        }
                    />
                    <Tab
                        key="seeding"
                        title={
                            <div className="flex items-center gap-1">
                                <UploadCloud
                                    size={12}
                                    strokeWidth={ICON_STROKE_WIDTH}
                                    className="text-current"
                                />
                                {t("nav.filter_seeding")}
                            </div>
                        }
                    />
                </Tabs>
            </div>

            {/* Global Actions */}
            <div className="flex flex-col gap-2">
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1">
                        <Button
                            isIconOnly
                            variant="ghost"
                            radius="full"
                            className="text-foreground/50 transition-colors hover:text-success disabled:text-foreground/30"
                            disabled={!hasSelection}
                            onPress={onResumeSelection}
                            aria-label={t("toolbar.resume")}
                            title={t("toolbar.resume")}
                        >
                            <Play
                                size={16}
                                strokeWidth={ICON_STROKE_WIDTH}
                                className="text-current"
                            />
                        </Button>
                        <Button
                            isIconOnly
                            variant="ghost"
                            radius="full"
                            className="text-foreground/50 transition-colors hover:text-warning disabled:text-foreground/30"
                            disabled={!hasSelection}
                            onPress={onPauseSelection}
                            aria-label={t("toolbar.pause")}
                            title={t("toolbar.pause")}
                        >
                            <Pause
                                size={16}
                                strokeWidth={ICON_STROKE_WIDTH}
                                className="text-current"
                            />
                        </Button>
                        <Button
                            isIconOnly
                            variant="ghost"
                            radius="full"
                            className="text-foreground/50 transition-colors hover:text-primary disabled:text-foreground/30"
                            disabled={!hasSelection}
                            onPress={onRecheckSelection}
                            aria-label={t("toolbar.recheck")}
                            title={t("toolbar.recheck")}
                        >
                            <RotateCcw
                                size={16}
                                strokeWidth={ICON_STROKE_WIDTH}
                                className="text-current"
                            />
                        </Button>
                        <Button
                            isIconOnly
                            variant="ghost"
                            radius="full"
                            className="text-foreground/50 transition-colors hover:text-danger disabled:text-foreground/30"
                            disabled={!hasSelection}
                            onPress={onRemoveSelection}
                            aria-label={t("toolbar.remove")}
                            title={t("toolbar.remove")}
                        >
                            <Trash2
                                size={16}
                                strokeWidth={ICON_STROKE_WIDTH}
                                className="text-current"
                            />
                        </Button>
                    </div>
                    <Input
                        classNames={{
                            base: "w-48 h-8",
                            mainWrapper: "h-full",
                            input: "text-small",
                            inputWrapper:
                                "h-full font-normal text-default-500 bg-default-400/20 dark:bg-default-500/20 border-content1/20",
                        }}
                        placeholder={t("nav.search_placeholder")}
                        size="sm"
                        startContent={
                            <Search
                                size={14}
                                strokeWidth={ICON_STROKE_WIDTH}
                                className="text-current"
                            />
                        }
                    />
                    <div className="h-6 w-px bg-content1/20 mx-1" />
                    <LanguageMenu />
                    <ThemeToggle />
                    <Button
                        isIconOnly
                        variant="ghost"
                        radius="full"
                        className="text-foreground/70"
                        onPress={onSettings}
                        aria-label={t("toolbar.settings")}
                        title={t("toolbar.settings")}
                    >
                        <Settings2
                            size={20}
                            strokeWidth={ICON_STROKE_WIDTH}
                            className="text-current"
                        />
                    </Button>
                    <Button
                        color="primary"
                        variant="shadow"
                        size="sm"
                        startContent={
                            <Zap
                                size={14}
                                strokeWidth={ICON_STROKE_WIDTH}
                                fill="currentColor"
                            />
                        }
                        onPress={onAdd}
                        className="font-bold shadow-primary/20"
                    >
                        {t("toolbar.add_torrent")}
                    </Button>
                </div>
                {rehashStatus?.active && (
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 px-6">
                        <div className="flex flex-col gap-1">
                            <div className="flex items-center justify-between text-[11px] text-foreground/50">
                                <span className="truncate">{rehashStatus.label}</span>
                                <span className="font-semibold tabular-nums">
                                    {Math.round(
                                        Math.min(
                                            Math.max(rehashStatus.value, 0),
                                            100
                                        )
                                    )}
                                    %
                                </span>
                            </div>
                            <SmoothProgressBar
                                value={Math.min(
                                    Math.max(rehashStatus.value, 0),
                                    100
                                )}
                                trackClassName="h-1 bg-content1/10"
                                indicatorClassName="h-full rounded-full bg-gradient-to-r from-primary/70 to-primary"
                            />
                        </div>
                    </div>
                )}
            </div>
        </header>
    );
}
