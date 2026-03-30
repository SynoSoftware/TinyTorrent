import { memo, type CSSProperties } from "react";
import {
    ArrowDown,
    ArrowUp,
    ChevronDown,
    ChevronRight,
    File as FileIcon,
    FileAudio,
    FileImage,
    FileText,
    FileVideo,
    Folder,
    Minus,
    X,
} from "lucide-react";
import { Card, CardBody, CardHeader, Checkbox, Select, SelectItem, cn } from "@heroui/react";
import AppTooltip from "@/shared/ui/components/AppTooltip";
import type { LibtorrentPriority } from "@/services/rpc/entities";
import { registry } from "@/config/logic";
import { formatBytes } from "@/shared/utils/format";
import { ProgressCell } from "@/shared/ui/components/SmoothProgressBar";
import type { FileNodeRowViewModel } from "@/shared/ui/workspace/fileExplorerTreeTypes";
import { fileBrowser, formControl, form, table } from "@/shared/ui/layout/glass-surface";
import {
    fileExplorerPriorityValues,
    getFileExplorerSelectablePriorityKeys,
} from "@/shared/ui/workspace/fileExplorerTreeModel";
import type { FileExplorerPrioritySelectKey } from "@/shared/ui/workspace/fileExplorerTreeTypes";
const { visuals } = registry;

// eslint-disable-next-line react-refresh/only-export-components
export const prioritySelectOptions = [
    {
        key: "high",
        labelKey: "priority.high",
        icon: ArrowUp,
        iconClass: "toolbar-icon-size-md text-success",
        value: fileExplorerPriorityValues.high,
    },
    {
        key: "normal",
        labelKey: "priority.normal",
        icon: Minus,
        iconClass: "toolbar-icon-size-md text-primary",
        value: fileExplorerPriorityValues.normal,
    },
    {
        key: "low",
        labelKey: "priority.low",
        icon: ArrowDown,
        iconClass: "toolbar-icon-size-md text-warning",
        value: fileExplorerPriorityValues.low,
    },
    {
        key: "skip",
        labelKey: "priority.dont_download",
        icon: X,
        iconClass: "toolbar-icon-size-md",
        value: "skip" as const,
    },
] as const satisfies ReadonlyArray<{
    key: FileExplorerPrioritySelectKey;
    labelKey: string;
    icon: typeof ArrowUp;
    iconClass: string;
    value: LibtorrentPriority | "skip";
}>;

const priorityOptionsByKey = new Map(prioritySelectOptions.map((option) => [option.key, option] as const));

interface FileExplorerTreeRowProps {
    row: FileNodeRowViewModel;
    showProgress: boolean;
    gridTemplateColumns: string;
    layout: "table" | "card";
    onToggleExpand: () => void;
    onWantedChange: (wanted: boolean) => void;
    onSetPriority: (priority: LibtorrentPriority | "skip", indexes?: number[]) => void;
    t: (key: string) => string;
}

const getFileIcon = (filename: string) => {
    const extension = filename.split(".").pop()?.toLowerCase();
    if (["mp4", "mkv", "avi", "mov", "webm"].includes(extension || "")) {
        return <FileVideo className={fileBrowser.iconVideo} />;
    }
    if (["mp3", "wav", "flac", "aac"].includes(extension || "")) {
        return <FileAudio className={fileBrowser.iconAudio} />;
    }
    if (["jpg", "jpeg", "png", "gif", "webp"].includes(extension || "")) {
        return <FileImage className={fileBrowser.iconImage} />;
    }
    if (["txt", "md", "pdf", "doc", "docx"].includes(extension || "")) {
        return <FileText className={fileBrowser.iconText} />;
    }
    return <FileIcon className={fileBrowser.iconDefault} />;
};

export const FileExplorerTreeRow = memo(function FileExplorerTreeRow({
    row,
    showProgress,
    gridTemplateColumns,
    layout,
    onToggleExpand,
    onWantedChange,
    onSetPriority,
    t,
}: FileExplorerTreeRowProps) {
    const progress = row.node.progress;
    const displayProgress = Math.max(0, Math.min(progress / 100, 1));
    const completedBytes = row.node.bytesCompleted ?? row.node.totalSize * displayProgress;
    const renderedIcon = row.node.isFolder ? (
        <Folder className={fileBrowser.rowFolderIcon} />
    ) : (
        getFileIcon(row.node.name)
    );
    const selectablePriorityKeys = getFileExplorerSelectablePriorityKeys(!row.allowsSkipPriority);
    const renderedPriorityOptions = selectablePriorityKeys
        .map((key) => priorityOptionsByKey.get(key))
        .filter((option) => option != null);
    const renderedPriorityControl = (
        <Select
            aria-label={t("fields.priority")}
            selectedKeys={row.prioritySelection}
            onSelectionChange={(keys) => {
                const [next] = [...keys];
                if (!next) return;
                const option = prioritySelectOptions.find((candidate) => candidate.key === next);
                if (!option) return;
                onSetPriority(option.value, row.node.descendantIndexes);
            }}
            placeholder={
                row.node.isFolder && row.prioritySelection.size === 0 ? t("priority.mixed") : t("fields.priority")
            }
            variant="bordered"
            size="sm"
            classNames={formControl.prioritySelectClassNames}
        >
            {renderedPriorityOptions.map((option) => {
                const Icon = option.icon;
                return (
                    <SelectItem key={option.key} startContent={<Icon className={option.iconClass} />}>
                        {t(option.labelKey)}
                    </SelectItem>
                );
            })}
        </Select>
    );
    const renderedProgress = showProgress ? (
        <ProgressCell
            progressPercent={progress}
            completedBytes={completedBytes}
            indicatorClassName={
                row.isWanted ? table.columnDefs.progressIndicatorActive : table.columnDefs.progressIndicatorPaused
            }
            ariaLabel={t("labels.download_progress")}
        />
    ) : null;

    if (layout === "card") {
        return (
            <Card
                className={cn(form.sectionCard, !row.isWanted && fileBrowser.rowDimmed)}
                style={
                    {
                        "--tt-file-depth": String(row.node.depth),
                    } as CSSProperties
                }
            >
                <CardHeader className={cn(form.sectionHeader, fileBrowser.cardHeader)}>
                    <div className={fileBrowser.cardHeaderContent}>
                        <div className={fileBrowser.rowCheckboxWrap}>
                            <Checkbox
                                size="sm"
                                radius="sm"
                                isSelected={row.isSelected}
                                isIndeterminate={row.isIndeterminate}
                                onValueChange={onWantedChange}
                                classNames={formControl.checkboxPrimaryClassNames}
                            />
                        </div>
                        <div className={fileBrowser.cardNameGroup}>
                            {row.node.isFolder ? (
                                <button
                                    type="button"
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        onToggleExpand();
                                    }}
                                    className={fileBrowser.chevronButton}
                                >
                                    {row.isExpanded ? (
                                        <ChevronDown className={fileBrowser.iconSmall} />
                                    ) : (
                                        <ChevronRight className={fileBrowser.iconSmall} />
                                    )}
                                </button>
                            ) : (
                                <div className={fileBrowser.rowIndentSpacer} />
                            )}
                            <div className={fileBrowser.rowIconWrap}>{renderedIcon}</div>
                            <div className={fileBrowser.cardNameContent}>
                                <AppTooltip content={row.node.name}>
                                    {row.node.isFolder ? (
                                        <button
                                            type="button"
                                            className={cn(form.sectionTitle, fileBrowser.cardTitleButton)}
                                            onClick={onToggleExpand}
                                        >
                                            {row.node.name}
                                        </button>
                                    ) : (
                                        <span className={cn(form.sectionTitle, fileBrowser.cardTitleText)}>
                                            {row.node.name}
                                        </span>
                                    )}
                                </AppTooltip>
                                <p
                                    className={cn(
                                        form.sectionDescription,
                                        visuals.typography.text.caption,
                                        fileBrowser.cardDescription,
                                    )}
                                >
                                    {row.node.path}
                                </p>
                            </div>
                        </div>
                    </div>
                </CardHeader>
                <CardBody className={cn(form.sectionBody, fileBrowser.cardBody)}>
                    {renderedProgress ? <div className={fileBrowser.rowProgressWrap}>{renderedProgress}</div> : null}
                    <div className={fileBrowser.cardFooter}>
                        <div className={fileBrowser.cardFooterGroup}>{renderedPriorityControl}</div>
                        <div className={fileBrowser.rowSizeText}>{formatBytes(row.node.totalSize)}</div>
                    </div>
                </CardBody>
            </Card>
        );
    }

    return (
        <div
            className={cn(fileBrowser.row, !row.isWanted && fileBrowser.rowDimmed)}
            style={
                {
                    "--tt-file-depth": String(row.node.depth),
                    gridTemplateColumns,
                } as CSSProperties
            }
        >
            <div className={fileBrowser.rowCheckboxWrap}>
                <Checkbox
                    size="sm"
                    radius="sm"
                    isSelected={row.isSelected}
                    isIndeterminate={row.isIndeterminate}
                    onValueChange={onWantedChange}
                    classNames={formControl.checkboxPrimaryClassNames}
                />
            </div>

            <div className={fileBrowser.rowNameCell}>
                {row.node.isFolder ? (
                    <button
                        type="button"
                        onClick={(event) => {
                            event.stopPropagation();
                            onToggleExpand();
                        }}
                        className={fileBrowser.chevronButton}
                    >
                        {row.isExpanded ? (
                            <ChevronDown className={fileBrowser.iconSmall} />
                        ) : (
                            <ChevronRight className={fileBrowser.iconSmall} />
                        )}
                    </button>
                ) : (
                    <div className={fileBrowser.rowIndentSpacer} />
                )}

                <div className={fileBrowser.rowIconWrap}>{renderedIcon}</div>

                <AppTooltip content={row.node.name}>
                    <span
                        className={cn(
                            fileBrowser.rowNameBase,
                            row.node.isFolder ? fileBrowser.rowNameFolder : fileBrowser.rowNameFile,
                        )}
                        onClick={row.node.isFolder ? onToggleExpand : undefined}
                    >
                        {row.node.name}
                    </span>
                </AppTooltip>
            </div>

            <div className={fileBrowser.rowPriorityWrap}>{renderedPriorityControl}</div>

            {renderedProgress ? <div className={fileBrowser.rowProgressWrap}>{renderedProgress}</div> : null}

            <div className={fileBrowser.rowSizeText}>{formatBytes(row.node.totalSize)}</div>
        </div>
    );
});
