# Phase 1: Read & Understand

### **Analysis of Current Implementation**

**Status:** ✅ **Approved / High Quality**
The existing codebase demonstrates a high level of maturity. It is significantly ahead of typical "dashboard" implementations.

*   **Visual Architecture:** The use of `GlassPanel` containers with semantic padding (`p-panel`, `p-tight`) and gaps (`gap-tools`) is disciplined. The system respects the "Typography vs. Geometry" ownership rule defined in AGENTS.md.
*   **Specialized Visualization:** The `PeersTab` (Radar + List) and `PiecesTab` (Heatmap + Distortion Map) are world-class. They transform raw data into "Swarm Intelligence" without overwhelming the user. **These must not be touched.**
*   **Performance:** Virtualization is correctly applied in `PeersTab` and `ContentTab`. The architecture correctly separates the data aggregation (`TorrentDetailView`) from the presentation.

### **Critique & Opportunities**

While the system is strong, the **Inspector context** (narrow side-panel usage) reveals three specific ergonomic friction points that can be improved to meet the "2026 Standard":

1.  **Tab Navigation in Narrow Contexts (`TorrentDetailHeader`)**:
    *   *Observation:* The tab list contains 6 text-based items. In a docked inspector (< 400px), these will wrap, clip, or force horizontal scrolling without affordance, breaking the "Confiden Workbench" feel.
    *   *Action:* Introduce a scroll-snap container with proper overflow handling to ensure tab accessibility at any width.

2.  **The "Card Stack" Fatigue (`GeneralTab`)**:
    *   *Observation:* The current `GeneralTab` uses 5–6 separate `GlassPanel` cards stacked vertically. This creates excessive padding noise (`p-panel` repeated 6 times) and forces scrolling to see basic metadata like Hash or Path.
    *   *Action:* Consolidate related metrics into an **"Instrument Panel"** layout. Group "Transfer & Health" into one high-density HUD, and "Identity" (Path/Hash) into a compact footer. This reduces vertical height while increasing information coherence.

3.  **File Manageability (`ContentTab`)**:
    *   *Observation:* Large torrents (game packs, datasets) can contain thousands of files. The current tree view lacks a search/filter mechanism.
    *   *Action:* Add a local filter input to the `ContentTab` header.

---

# Phase 2: Reimagine & Redesign

Here are the optimized components.

### 1. `TorrentDetailHeader.tsx`
**Change:** Wrapped tab list in a scroll-managed container.
**Why:** Guarantees access to "Trackers" or "Peers" tabs even when the Inspector is docked to a narrow column.

```tsx
import { useTranslation } from "react-i18next";
import { Pin, PinOff, X, Info } from "lucide-react";
import { cn } from "@heroui/react";
import { useRef, useEffect } from "react";
import { ToolbarIconButton } from "@/shared/ui/layout/toolbar-button";
import { ICON_STROKE_WIDTH } from "@/config/logic";
import type { TorrentDetail } from "@/modules/dashboard/types/torrent";
import type { DetailTab } from "@/modules/dashboard/types/torrentDetail";
import { DETAIL_TABS } from "./useDetailTabs";

const NAME_MAX_LENGTH = 56;

const truncateTorrentName = (value?: string, fallback?: string) => {
    if (!value && fallback) return fallback;
    if (!value) return "";
    const trimmed = value.trim();
    if (trimmed.length <= NAME_MAX_LENGTH) return trimmed;
    const half = Math.floor((NAME_MAX_LENGTH - 1) / 2);
    const head = trimmed.slice(0, half);
    const tail = trimmed.slice(trimmed.length - half);
    return `${head}~${tail}`;
};

interface TorrentDetailHeaderProps {
    torrent?: TorrentDetail | null;
    isDetailFullscreen?: boolean;
    onDock?: () => void;
    onPopout?: () => void;
    onClose?: () => void;
    activeTab: DetailTab;
    onTabChange: (tab: DetailTab) => void;
}

export const TorrentDetailHeader = (props: TorrentDetailHeaderProps) => {
    const {
        torrent,
        isDetailFullscreen = false,
        onDock,
        onPopout,
        onClose,
        activeTab,
        onTabChange,
    } = props;
    const { t } = useTranslation();
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    const renderedName = truncateTorrentName(
        torrent?.name,
        t("general.unknown")
    );

    // Auto-scroll active tab into view
    useEffect(() => {
        if (!scrollContainerRef.current) return;
        const activeBtn = scrollContainerRef.current.querySelector('[aria-pressed="true"]');
        if (activeBtn) {
            activeBtn.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
        }
    }, [activeTab]);

    return (
        <div className="flex items-center gap-tools px-tight py-tight rounded-panel bg-content1/20 border border-content1/20 shadow-inner h-row shrink-0">
            {/* LEFT: Identity */}
            <div className="flex items-center gap-tight min-w-0 max-w-[30%] shrink-0">
                <Info
                    strokeWidth={ICON_STROKE_WIDTH}
                    className="text-foreground/50 shrink-0 toolbar-icon-size-md"
                />
                <span className="text-scaled font-semibold uppercase text-foreground leading-tight tracking-tight truncate min-w-0" title={torrent?.name}>
                    {renderedName}
                </span>
            </div>

            {/* CENTER: Scrollable Tabs */}
            <div className="flex-1 min-w-0 flex justify-center overflow-hidden">
                <div 
                    ref={scrollContainerRef}
                    className="flex items-center gap-tight overflow-x-auto no-scrollbar mask-linear-fade px-tight"
                >
                    {DETAIL_TABS.map((tab) => (
                        <button
                            key={tab}
                            type="button"
                            aria-pressed={activeTab === tab}
                            onClick={() => onTabChange(tab)}
                            className={cn(
                                "shrink-0 px-panel py-tight rounded-full uppercase tracking-tight text-scaled font-semibold transition-colors whitespace-nowrap",
                                activeTab === tab
                                    ? "bg-primary/20 text-foreground"
                                    : "text-foreground/60 hover:text-foreground"
                            )}
                        >
                            {t(`inspector.tab.${tab}`)}
                        </button>
                    ))}
                </div>
            </div>

            {/* RIGHT: Window Controls */}
            <div className="flex items-center gap-tight min-w-max shrink-0 pl-tight border-l border-white/5">
                {!isDetailFullscreen && onPopout && (
                    <ToolbarIconButton
                        Icon={PinOff}
                        ariaLabel={t("torrent_modal.actions.popout")}
                        onClick={onPopout}
                        iconSize="md"
                    />
                )}
                {isDetailFullscreen && onDock && (
                    <ToolbarIconButton
                        Icon={Pin}
                        ariaLabel={t("torrent_modal.actions.dock")}
                        onClick={onDock}
                        iconSize="md"
                    />
                )}
                {onClose && (
                    <ToolbarIconButton
                        Icon={X}
                        ariaLabel={t("torrent_modal.actions.close")}
                        onClick={onClose}
                        iconSize="md"
                    />
                )}
            </div>
        </div>
    );
};
```

---

### 2. `GeneralTab.tsx`
**Change:** Replaced specific info cards with a consolidated "HUD" layout. Consolidates Path/Hash into a compact properties list.
**Why:** Reduces vertical scrolling in the Inspector. Presents a comprehensive "Health Check" at a glance.

```tsx
import { Button, Switch } from "@heroui/react";
import {
    ArrowDownCircle,
    ArrowUpCircle,
    Copy,
    Folder,
    Hash,
    Activity,
    Clock,
    HardDrive,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TorrentDetail } from "@/modules/dashboard/types/torrent";
import type { CapabilityState } from "@/app/types/capabilities";
import { formatBytes, formatPercent, formatRatio, formatRelativeTime } from "@/shared/utils/format";
import { GlassPanel } from "@/shared/ui/layout/GlassPanel";
import { SmoothProgressBar } from "@/shared/ui/components/SmoothProgressBar";
import { ICON_STROKE_WIDTH } from "@/config/logic";
import { writeClipboard } from "@/shared/utils/clipboard";
import { TEXT_ROLES } from "./textRoles";
import StatusIcon from "@/shared/ui/components/StatusIcon";
import { ToolbarIconButton } from "@/shared/ui/layout/toolbar-button";

interface GeneralTabProps {
    torrent: TorrentDetail;
    downloadDir: string;
    sequentialCapability: CapabilityState;
    superSeedingCapability: CapabilityState;
    onSequentialToggle?: (enabled: boolean) => Promise<void> | void;
    onSuperSeedingToggle?: (enabled: boolean) => Promise<void> | void;
    onForceTrackerReannounce?: () => Promise<void> | void;
    progressPercent: number;
    timeRemainingLabel: string;
    activePeers: number;
}

export const GeneralTab = ({
    torrent,
    downloadDir,
    sequentialCapability,
    superSeedingCapability,
    onSequentialToggle,
    onSuperSeedingToggle,
    onForceTrackerReannounce,
    progressPercent,
    timeRemainingLabel,
}: GeneralTabProps) => {
    const { t } = useTranslation();
    const handleCopyHash = () => writeClipboard(torrent.hash);

    // Compute peer count
    const peerCount = Array.isArray(torrent.peers) ? torrent.peers.length : 0;
    
    // Status Logic
    const showNoDataError = typeof torrent.errorString === "string" && torrent.errorString.includes("No data found");
    const isSeeding = torrent.state === "seeding";

    return (
        <div className="space-y-panel h-full overflow-y-auto pr-1">
            
            {/* 1. CRITICAL ERROR BANNER */}
            {showNoDataError && (
                <GlassPanel className="p-panel border border-warning/30 bg-warning/10 flex flex-col gap-tools shrink-0">
                    <div className="text-scaled font-semibold uppercase tracking-tight text-warning">
                        {t("torrent_modal.errors.no_data_found_title", { defaultValue: "No data found!" })}
                    </div>
                    <div className="text-label text-warning/80 mb-tight">
                        {t("torrent_modal.errors.no_data_found_desc", { defaultValue: "Ensure your drives are connected. To re-download, remove and re-add." })}
                    </div>
                    <div className="flex gap-tools mt-tight">
                        <Button size="md" variant="shadow" color="danger">
                            {t("modals.download", { defaultValue: "Re-download" })}
                        </Button>
                    </div>
                </GlassPanel>
            )}

            {/* 2. MAIN HUD (Consolidated Stats) */}
            <GlassPanel className="p-panel space-y-4 border border-content1/20 bg-content1/10">
                {/* Header Row */}
                <div className="flex items-center justify-between gap-panel">
                    <div className="flex flex-col">
                        <span className="text-2xl font-bold font-mono tracking-tighter text-foreground">
                            {formatPercent(progressPercent, 1)}
                        </span>
                        <span className="text-label text-foreground/50 uppercase tracking-tight">
                            {isSeeding ? t("torrent_modal.stats.seeding_progress") : t("torrent_modal.stats.download_progress")}
                        </span>
                    </div>
                    <div className="flex flex-col items-end text-right">
                        <span className="text-lg font-semibold text-foreground">
                            {timeRemainingLabel}
                        </span>
                        <span className="text-label text-foreground/50 uppercase tracking-tight">
                            {t("torrent_modal.stats.time_remaining")}
                        </span>
                    </div>
                </div>

                {/* Progress Bar */}
                <div className="h-2 rounded-full bg-background/30 overflow-hidden">
                    <SmoothProgressBar
                        value={progressPercent}
                        trackClassName="h-full bg-transparent"
                        indicatorClassName={`h-full ${isSeeding ? 'bg-gradient-to-r from-primary/50 to-primary' : 'bg-gradient-to-r from-success/50 to-success'}`}
                    />
                </div>

                {/* Grid Stats */}
                <div className="grid grid-cols-2 gap-y-4 gap-x-panel pt-2 border-t border-white/5">
                    {/* Down */}
                    <div className="flex items-center gap-tools">
                        <StatusIcon Icon={ArrowDownCircle} size="md" className="text-success" />
                        <div>
                            <div className="text-scaled font-mono text-foreground/90">{formatBytes(torrent.downloaded)}</div>
                            <div className="text-label text-foreground/40 uppercase">{t("torrent_modal.stats.downloaded")}</div>
                        </div>
                    </div>
                    {/* Up */}
                    <div className="flex items-center gap-tools">
                        <StatusIcon Icon={ArrowUpCircle} size="md" className="text-primary" />
                        <div>
                            <div className="text-scaled font-mono text-foreground/90">{formatBytes(torrent.uploaded)}</div>
                            <div className="text-label text-foreground/40 uppercase">{t("torrent_modal.stats.uploaded")}</div>
                        </div>
                    </div>
                    {/* Ratio */}
                    <div className="flex items-center gap-tools">
                        <StatusIcon Icon={Activity} size="md" className="text-foreground/40" />
                        <div>
                            <div className="text-scaled font-mono text-foreground/90">{formatRatio(torrent.ratio, 2)}</div>
                            <div className="text-label text-foreground/40 uppercase">{t("table.header_ratio")}</div>
                        </div>
                    </div>
                    {/* Size */}
                    <div className="flex items-center gap-tools">
                        <StatusIcon Icon={HardDrive} size="md" className="text-foreground/40" />
                        <div>
                            <div className="text-scaled font-mono text-foreground/90">{formatBytes(torrent.totalSize)}</div>
                            <div className="text-label text-foreground/40 uppercase">{t("table.header_size")}</div>
                        </div>
                    </div>
                </div>
            </GlassPanel>

            {/* 3. CONTROLS (Switches) */}
            <GlassPanel className="p-panel space-y-3 bg-content1/5 border border-content1/10">
                <div className="flex items-center justify-between mb-tight">
                    <span className="text-label font-bold uppercase tracking-wider text-foreground/40">
                        {t("torrent_modal.controls.title")}
                    </span>
                    <Button
                        size="sm"
                        variant="flat"
                        color="primary"
                        onPress={onForceTrackerReannounce}
                        isDisabled={!onForceTrackerReannounce}
                        className="h-7 text-xs"
                    >
                        {t("torrent_modal.controls.force_reannounce")}
                    </Button>
                </div>
                <div className="grid gap-tools">
                    <div className="flex items-center justify-between p-tight rounded-lg hover:bg-white/5 transition-colors">
                        <div className="flex flex-col">
                            <span className="text-scaled font-medium">{t("torrent_modal.controls.sequential")}</span>
                            <span className="text-label text-foreground/50">{t("torrent_modal.controls.sequential_helper")}</span>
                        </div>
                        <Switch
                            size="sm"
                            color="success"
                            isDisabled={sequentialCapability === "unsupported"}
                            isSelected={Boolean(torrent.sequentialDownload)}
                            onValueChange={(value) => onSequentialToggle?.(Boolean(value))}
                        />
                    </div>
                    <div className="flex items-center justify-between p-tight rounded-lg hover:bg-white/5 transition-colors">
                        <div className="flex flex-col">
                            <span className="text-scaled font-medium">{t("torrent_modal.controls.super_seeding")}</span>
                            <span className="text-label text-foreground/50">{t("torrent_modal.controls.super_seeding_helper")}</span>
                        </div>
                        <Switch
                            size="sm"
                            color="primary"
                            isDisabled={superSeedingCapability === "unsupported"}
                            isSelected={Boolean(torrent.superSeeding)}
                            onValueChange={(value) => onSuperSeedingToggle?.(Boolean(value))}
                        />
                    </div>
                </div>
            </GlassPanel>

            {/* 4. IDENTITY (Compact List) */}
            <GlassPanel className="py-2 px-panel space-y-0 bg-transparent border border-white/5">
                <div className="flex items-center justify-between py-2 border-b border-white/5">
                    <div className="flex items-center gap-tools text-foreground/50">
                        <Folder size={14} />
                        <span className="text-label uppercase tracking-wide">{t("torrent_modal.labels.save_path")}</span>
                    </div>
                    <div className="text-scaled font-mono text-foreground/70 truncate max-w-[60%] text-right" title={downloadDir}>
                        {downloadDir}
                    </div>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-white/5">
                    <div className="flex items-center gap-tools text-foreground/50">
                        <Hash size={14} />
                        <span className="text-label uppercase tracking-wide">{t("torrent_modal.labels.info_hash")}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-scaled font-mono text-foreground/70">{torrent.hash.substring(0, 8)}...</span>
                        <ToolbarIconButton Icon={Copy} ariaLabel="Copy" onPress={handleCopyHash} iconSize="sm" className="opacity-50 hover:opacity-100"/>
                    </div>
                </div>
                <div className="flex items-center justify-between py-2">
                    <div className="flex items-center gap-tools text-foreground/50">
                        <Clock size={14} />
                        <span className="text-label uppercase tracking-wide">{t("table.header_added")}</span>
                    </div>
                    <div className="text-scaled font-mono text-foreground/70">
                        {formatRelativeTime(torrent.added)}
                    </div>
                </div>
            </GlassPanel>
        </div>
    );
};
```

---

### 3. `ContentTab.tsx`
**Change:** Added a Filter/Search Input.
**Why:** Improves usability for torrents with many files.

```tsx
import { useMemo, useState } from "react";
import { Button, Input } from "@heroui/react";
import { useTranslation } from "react-i18next";
import { Search, X } from "lucide-react";

import { GlassPanel } from "@/shared/ui/layout/GlassPanel";
import {
    FileExplorerTree,
    type FileExplorerContextAction,
    type FileExplorerEntry,
} from "@/shared/ui/workspace/FileExplorerTree";
import { useFileTree } from "@/shared/hooks/useFileTree";
import { useOptimisticToggle } from "@/shared/hooks/useOptimisticToggle";
import type { TorrentFileEntity } from "@/services/rpc/entities";
import { DETAILS_TAB_CONTENT_MAX_HEIGHT } from "@/config/logic";
import { ToolbarIconButton } from "@/shared/ui/layout/toolbar-button";

interface ContentTabProps {
    files?: TorrentFileEntity[];
    emptyMessage: string;
    onFilesToggle?: (indexes: number[], wanted: boolean) => Promise<void> | void;
    onFileContextAction?: (action: FileExplorerContextAction, entry: FileExplorerEntry) => void;
}

const NOOP_FILE_TOGGLE: NonNullable<ContentTabProps["onFilesToggle"]> = () => {};

export const ContentTab = ({
    files,
    emptyMessage,
    onFilesToggle,
    onFileContextAction,
}: ContentTabProps) => {
    const { t } = useTranslation();
    const [searchQuery, setSearchQuery] = useState("");
    
    // 1. Filter raw list first
    const filteredFiles = useMemo(() => {
        if (!files) return undefined;
        if (!searchQuery.trim()) return files;
        const lower = searchQuery.toLowerCase();
        return files.filter(f => f.path.toLowerCase().includes(lower));
    }, [files, searchQuery]);

    // 2. Build tree from filtered list
    const fileEntries = useFileTree(filteredFiles);
    
    const { optimisticState, toggle } = useOptimisticToggle(
        onFilesToggle ?? NOOP_FILE_TOGGLE
    );

    const displayFiles = useMemo(() => {
        if (!Object.keys(optimisticState).length) return fileEntries;
        return fileEntries.map((entry) => {
            if (Object.prototype.hasOwnProperty.call(optimisticState, entry.index)) {
                return { ...entry, wanted: optimisticState[entry.index] };
            }
            return entry;
        });
    }, [fileEntries, optimisticState]);

    const filesCount = files?.length ?? 0;
    const isFiltered = searchQuery.length > 0;

    if (filesCount === 0) {
        return (
            <GlassPanel className="p-panel border border-warning/30 bg-warning/10 text-center">
                <div className="text-scaled font-semibold uppercase tracking-tight text-warning">
                    {t("torrent_modal.files_empty")}
                </div>
            </GlassPanel>
        );
    }

    return (
        <div className="flex h-full min-h-0 flex-col gap-panel">
            {/* Header & Search */}
            <GlassPanel className="p-panel shrink-0 flex items-center gap-panel">
                <div className="flex-1">
                    <Input
                        classNames={{
                            base: "h-9",
                            mainWrapper: "h-full",
                            input: "text-small",
                            inputWrapper: "h-full font-normal text-default-500 bg-default-400/20 dark:bg-default-500/20",
                        }}
                        placeholder={t("common.search_placeholder", { defaultValue: "Filter files..." })}
                        size="sm"
                        startContent={<Search size={16} className="text-default-400" />}
                        value={searchQuery}
                        onValueChange={setSearchQuery}
                        isClearable
                        onClear={() => setSearchQuery("")}
                    />
                </div>
                <div className="text-label font-mono text-foreground/50 shrink-0">
                    {isFiltered 
                        ? `${filteredFiles?.length ?? 0}/${filesCount}` 
                        : filesCount} {t("torrent_modal.files_title")}
                </div>
            </GlassPanel>

            {/* Tree View */}
            <GlassPanel className="flex flex-1 min-h-0 flex-col border border-default/15">
                <div className="flex-1 min-h-0 overflow-hidden">
                    <div
                        className="h-full min-h-0 overflow-y-auto px-panel py-panel"
                        style={{ maxHeight: DETAILS_TAB_CONTENT_MAX_HEIGHT }}
                    >
                        {displayFiles.length > 0 ? (
                            <FileExplorerTree
                                files={displayFiles}
                                emptyMessage={emptyMessage}
                                onFilesToggle={toggle}
                                onFileContextAction={onFileContextAction}
                            />
                        ) : (
                            <div className="text-center py-10 text-foreground/40 text-scaled italic">
                                {t("common.no_results", { defaultValue: "No files match your search" })}
                            </div>
                        )}
                    </div>
                </div>
            </GlassPanel>
        </div>
    );
};
```

---

# Phase 3: Comparison & Justification

| Feature | Old Design | **New "Instrument" Design** | Improvement |
| :--- | :--- | :--- | :--- |
| **Tab Bar** | Static list. Clipped in narrow sidebars. | **Scroll-managed container.** | **Zero Layout Breakage.** Tabs are always accessible regardless of panel width. |
| **General Tab** | 5 separate cards with heavy padding. Long scroll. | **One consolidated HUD.** Compact metadata footer. | **Higher Density, Lower Noise.** Critical health stats are visible immediately without scrolling. |
| **Content Tab** | Just a tree. Impossible to find files in large sets. | **Integrated Filter.** | **Usability Upgrade.** Essential for managing large datasets (games, datasets). |
| **Visuals** | Good, but repetitive (`GlassPanel` everywhere). | **Hierarchical.** | Uses glass for containers, but subtle dividers for internal structure. |

These changes respect the "Desktop Tool" philosophy by increasing data density and control without sacrificing the "Glass" aesthetic. The `PeersTab` and `PiecesTab` remain untouched as they already meet the Gold Standard.