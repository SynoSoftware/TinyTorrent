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
import {
    Card,
    CardBody,
    CardHeader,
    Checkbox,
    Select,
    SelectItem,
    cn,
} from "@heroui/react";
import AppTooltip from "@/shared/ui/components/AppTooltip";
import type { LibtorrentPriority } from "@/services/rpc/entities";
import { formatBytes } from "@/shared/utils/format";
import { ProgressCell } from "@/shared/ui/components/SmoothProgressBar";
import type { FileNodeRowViewModel } from "@/shared/ui/workspace/fileExplorerTreeTypes";
import { TEXT_ROLE } from "@/config/textRoles";
import {
    FILE_BROWSER,
    FORM_CONTROL,
    FORM,
    TABLE,
} from "@/shared/ui/layout/glass-surface";
import {
    fileExplorerPriorityValues,
    getFileExplorerPriorityKey,
} from "@/shared/ui/workspace/fileExplorerTreeModel";
import type { FileExplorerPrioritySelectKey } from "@/shared/ui/workspace/fileExplorerTreeTypes";

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

interface FileExplorerTreeRowProps {
    row: FileNodeRowViewModel;
    showProgress: boolean;
    gridTemplateColumns: string;
    layout: "table" | "card";
    onToggleExpand: () => void;
    onWantedChange: (wanted: boolean) => void;
    onSetPriority: (
        priority: LibtorrentPriority | "skip",
        indexes?: number[],
    ) => void;
    t: (key: string) => string;
}

const getFileIcon = (filename: string) => {
    const extension = filename.split(".").pop()?.toLowerCase();
    if (["mp4", "mkv", "avi", "mov", "webm"].includes(extension || "")) {
        return <FileVideo className={FILE_BROWSER.iconVideo} />;
    }
    if (["mp3", "wav", "flac", "aac"].includes(extension || "")) {
        return <FileAudio className={FILE_BROWSER.iconAudio} />;
    }
    if (["jpg", "jpeg", "png", "gif", "webp"].includes(extension || "")) {
        return <FileImage className={FILE_BROWSER.iconImage} />;
    }
    if (["txt", "md", "pdf", "doc", "docx"].includes(extension || "")) {
        return <FileText className={FILE_BROWSER.iconText} />;
    }
    return <FileIcon className={FILE_BROWSER.iconDefault} />;
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
    const completedBytes =
        row.node.bytesCompleted ?? row.node.totalSize * displayProgress;
    const renderedIcon = row.node.isFolder ? (
        <Folder className={FILE_BROWSER.rowFolderIcon} />
    ) : (
        getFileIcon(row.node.name)
    );
    const renderedPriorityControl = (
        <Select
            aria-label={t("fields.priority")}
            selectedKeys={new Set([getFileExplorerPriorityKey(row.priority, row.isWanted)])}
            onSelectionChange={(keys) => {
                const [next] = [...keys];
                if (!next) return;
                const option = prioritySelectOptions.find((candidate) => candidate.key === next);
                if (!option) return;
                onSetPriority(option.value, row.node.descendantIndexes);
            }}
            variant="bordered"
            size="sm"
            classNames={FORM_CONTROL.prioritySelectClassNames}
        >
            {prioritySelectOptions.map((option) => {
                const Icon = option.icon;
                return (
                    <SelectItem
                        key={option.key}
                        startContent={<Icon className={option.iconClass} />}
                    >
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
                row.isWanted
                    ? TABLE.columnDefs.progressIndicatorActive
                    : TABLE.columnDefs.progressIndicatorPaused
            }
            ariaLabel={t("labels.download_progress")}
        />
    ) : null;

    if (layout === "card") {
        return (
            <Card
                className={cn(
                    FORM.sectionCard,
                    !row.isWanted && FILE_BROWSER.rowDimmed,
                )}
                style={
                    {
                        "--tt-file-depth": String(row.node.depth),
                    } as CSSProperties
                }
            >
                <CardHeader className={cn(FORM.sectionHeader, FILE_BROWSER.cardHeader)}>
                    <div className={FILE_BROWSER.cardHeaderContent}>
                        <div className={FILE_BROWSER.rowCheckboxWrap}>
                            <Checkbox
                                size="sm"
                                radius="sm"
                                isSelected={row.isSelected}
                                isIndeterminate={row.isIndeterminate}
                                onValueChange={onWantedChange}
                                classNames={FORM_CONTROL.checkboxPrimaryClassNames}
                            />
                        </div>
                        <div className={FILE_BROWSER.cardNameGroup}>
                            {row.node.isFolder ? (
                                <button
                                    type="button"
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        onToggleExpand();
                                    }}
                                    className={FILE_BROWSER.chevronButton}
                                >
                                    {row.isExpanded ? (
                                        <ChevronDown className={FILE_BROWSER.iconSmall} />
                                    ) : (
                                        <ChevronRight className={FILE_BROWSER.iconSmall} />
                                    )}
                                </button>
                            ) : (
                                <div className={FILE_BROWSER.rowIndentSpacer} />
                            )}
                            <div className={FILE_BROWSER.rowIconWrap}>{renderedIcon}</div>
                            <div className={FILE_BROWSER.cardNameContent}>
                                <AppTooltip content={row.node.name}>
                                    {row.node.isFolder ? (
                                        <button
                                            type="button"
                                            className={cn(
                                                FORM.sectionTitle,
                                                FILE_BROWSER.cardTitleButton,
                                            )}
                                            onClick={onToggleExpand}
                                        >
                                            {row.node.name}
                                        </button>
                                    ) : (
                                        <span
                                            className={cn(
                                                FORM.sectionTitle,
                                                FILE_BROWSER.cardTitleText,
                                            )}
                                        >
                                            {row.node.name}
                                        </span>
                                    )}
                                </AppTooltip>
                                <p
                                    className={cn(
                                        FORM.sectionDescription,
                                        TEXT_ROLE.caption,
                                        FILE_BROWSER.cardDescription,
                                    )}
                                >
                                    {row.node.path}
                                </p>
                            </div>
                        </div>
                    </div>
                </CardHeader>
                <CardBody className={cn(FORM.sectionBody, FILE_BROWSER.cardBody)}>
                    {renderedProgress ? (
                        <div className={FILE_BROWSER.rowProgressWrap}>
                            {renderedProgress}
                        </div>
                    ) : null}
                    <div className={FILE_BROWSER.cardFooter}>
                        <div className={FILE_BROWSER.cardFooterGroup}>
                            {renderedPriorityControl}
                        </div>
                        <div className={FILE_BROWSER.rowSizeText}>
                            {formatBytes(row.node.totalSize)}
                        </div>
                    </div>
                </CardBody>
            </Card>
        );
    }

    return (
        <div
            className={cn(
                FILE_BROWSER.row,
                !row.isWanted && FILE_BROWSER.rowDimmed,
            )}
            style={
                {
                    "--tt-file-depth": String(row.node.depth),
                    gridTemplateColumns,
                } as CSSProperties
            }
        >
            <div className={FILE_BROWSER.rowCheckboxWrap}>
                <Checkbox
                    size="sm"
                    radius="sm"
                    isSelected={row.isSelected}
                    isIndeterminate={row.isIndeterminate}
                    onValueChange={onWantedChange}
                    classNames={FORM_CONTROL.checkboxPrimaryClassNames}
                />
            </div>

            <div className={FILE_BROWSER.rowNameCell}>
                {row.node.isFolder ? (
                    <button
                        type="button"
                        onClick={(event) => {
                            event.stopPropagation();
                            onToggleExpand();
                        }}
                        className={FILE_BROWSER.chevronButton}
                    >
                        {row.isExpanded ? (
                            <ChevronDown className={FILE_BROWSER.iconSmall} />
                        ) : (
                            <ChevronRight className={FILE_BROWSER.iconSmall} />
                        )}
                    </button>
                ) : (
                    <div className={FILE_BROWSER.rowIndentSpacer} />
                )}

                <div className={FILE_BROWSER.rowIconWrap}>{renderedIcon}</div>

                <AppTooltip content={row.node.name}>
                    <span
                        className={cn(
                            FILE_BROWSER.rowNameBase,
                            row.node.isFolder
                                ? FILE_BROWSER.rowNameFolder
                                : FILE_BROWSER.rowNameFile,
                        )}
                        onClick={row.node.isFolder ? onToggleExpand : undefined}
                    >
                        {row.node.name}
                    </span>
                </AppTooltip>
            </div>

            <div className={FILE_BROWSER.rowPriorityWrap}>{renderedPriorityControl}</div>

            {renderedProgress ? (
                <div className={FILE_BROWSER.rowProgressWrap}>{renderedProgress}</div>
            ) : null}

            <div className={FILE_BROWSER.rowSizeText}>
                {formatBytes(row.node.totalSize)}
            </div>
        </div>
    );
});
