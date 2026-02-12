import { memo, type CSSProperties } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, File as FileIcon, FileAudio, FileImage, FileText, FileVideo, Folder, Minus, X } from "lucide-react";
import {
    Checkbox,
    Chip,
    cn,
    Dropdown,
    DropdownItem,
    DropdownMenu,
    DropdownTrigger,
    Progress,
} from "@heroui/react";
import type { LibtorrentPriority } from "@/services/rpc/entities";
import { formatBytes } from "@/shared/utils/format";
import type { FileNodeRowViewModel } from "@/shared/ui/workspace/fileExplorerTreeTypes";
import {
    FILE_BROWSER_CLASS,
    FORM_CONTROL_CLASS,
    STANDARD_SURFACE_CLASS,
} from "@/shared/ui/layout/glass-surface";

interface FileExplorerTreeRowProps {
    row: FileNodeRowViewModel;
    onToggleExpand: () => void;
    onSelectionChange: (selected: boolean) => void;
    onSetPriority: (priority: LibtorrentPriority | "skip", indexes?: number[]) => void;
    t: (key: string) => string;
}

const getFileIcon = (filename: string) => {
    const extension = filename.split(".").pop()?.toLowerCase();
    if (["mp4", "mkv", "avi", "mov", "webm"].includes(extension || "")) {
        return <FileVideo className={FILE_BROWSER_CLASS.iconVideo} />;
    }
    if (["mp3", "wav", "flac", "aac"].includes(extension || "")) {
        return <FileAudio className={FILE_BROWSER_CLASS.iconAudio} />;
    }
    if (["jpg", "jpeg", "png", "gif", "webp"].includes(extension || "")) {
        return <FileImage className={FILE_BROWSER_CLASS.iconImage} />;
    }
    if (["txt", "md", "pdf", "doc", "docx"].includes(extension || "")) {
        return <FileText className={FILE_BROWSER_CLASS.iconText} />;
    }
    return <FileIcon className={FILE_BROWSER_CLASS.iconDefault} />;
};

const getPriorityColor = (priority: LibtorrentPriority, isWanted: boolean) => {
    if (!isWanted) return "default";
    if (priority >= 6) return "success";
    if (priority <= 2) return "warning";
    return "primary";
};

const getPriorityLabel = (
    priority: LibtorrentPriority,
    isWanted: boolean,
    t: (key: string) => string,
) => {
    if (!isWanted) return t("priority.skip");
    if (priority >= 6) return t("priority.high");
    if (priority <= 2) return t("priority.low");
    return t("priority.normal");
};

export const FileExplorerTreeRow = memo(function FileExplorerTreeRow({
    row,
    onToggleExpand,
    onSelectionChange,
    onSetPriority,
    t,
}: FileExplorerTreeRowProps) {
    const progress =
        (row.node.bytesCompleted / Math.max(1, row.node.totalSize)) * 100;

    return (
        <div
            className={cn(
                FILE_BROWSER_CLASS.row,
                !row.isWanted && FILE_BROWSER_CLASS.rowDimmed,
            )}
            style={
                {
                    "--tt-file-depth": String(row.node.depth),
                } as CSSProperties
            }
        >
            <div className={FILE_BROWSER_CLASS.rowCheckboxWrap}>
                <Checkbox
                    size="sm"
                    radius="sm"
                    isSelected={row.isSelected}
                    isIndeterminate={row.isIndeterminate}
                    onValueChange={onSelectionChange}
                    classNames={FORM_CONTROL_CLASS.checkboxPrimaryClassNames}
                />
            </div>

            <div className={FILE_BROWSER_CLASS.rowNameCell}>
                {row.node.isFolder ? (
                    <button
                        onClick={(event) => {
                            event.stopPropagation();
                            onToggleExpand();
                        }}
                        className={FILE_BROWSER_CLASS.chevronButton}
                    >
                        {row.isExpanded ? (
                            <ChevronDown className={FILE_BROWSER_CLASS.iconSmall} />
                        ) : (
                            <ChevronRight className={FILE_BROWSER_CLASS.iconSmall} />
                        )}
                    </button>
                ) : (
                    <div className={FILE_BROWSER_CLASS.rowIndentSpacer} />
                )}

                <div className={FILE_BROWSER_CLASS.rowIconWrap}>
                    {row.node.isFolder ? (
                        <Folder className={FILE_BROWSER_CLASS.rowFolderIcon} />
                    ) : (
                        getFileIcon(row.node.name)
                    )}
                </div>

                <span
                    className={cn(
                        FILE_BROWSER_CLASS.rowNameBase,
                        row.node.isFolder
                            ? FILE_BROWSER_CLASS.rowNameFolder
                            : FILE_BROWSER_CLASS.rowNameFile,
                    )}
                    title={row.node.name}
                    onClick={row.node.isFolder ? onToggleExpand : undefined}
                >
                    {row.node.name}
                </span>
            </div>

            <div className={FILE_BROWSER_CLASS.rowPriorityWrap}>
                <Dropdown>
                    <DropdownTrigger>
                        <Chip
                            size="sm"
                            variant="flat"
                            color={getPriorityColor(row.priority, row.isWanted)}
                            className={FILE_BROWSER_CLASS.priorityChip}
                            classNames={FORM_CONTROL_CLASS.priorityChipClassNames}
                        >
                            {getPriorityLabel(row.priority, row.isWanted, t)}
                        </Chip>
                    </DropdownTrigger>
                    <DropdownMenu
                        onAction={(key) => {
                            const indexes = row.node.descendantIndexes;
                            if (key === "high") onSetPriority(7, indexes);
                            if (key === "normal") onSetPriority(4, indexes);
                            if (key === "low") onSetPriority(1, indexes);
                            if (key === "skip") onSetPriority("skip", indexes);
                        }}
                        variant="shadow"
                        className={STANDARD_SURFACE_CLASS.menu.surface}
                        classNames={STANDARD_SURFACE_CLASS.menu.listClassNames}
                        itemClasses={STANDARD_SURFACE_CLASS.menu.itemClassNames}
                    >
                        <DropdownItem
                            key="high"
                            startContent={
                                <ArrowUp className={FILE_BROWSER_CLASS.priorityMenuHighIcon} />
                            }
                        >
                            {t("priority.high")}
                        </DropdownItem>
                        <DropdownItem
                            key="normal"
                            startContent={
                                <Minus
                                    className={FILE_BROWSER_CLASS.priorityMenuNormalIcon}
                                />
                            }
                        >
                            {t("priority.normal")}
                        </DropdownItem>
                        <DropdownItem
                            key="low"
                            startContent={
                                <ArrowDown className={FILE_BROWSER_CLASS.priorityMenuLowIcon} />
                            }
                        >
                            {t("priority.low")}
                        </DropdownItem>
                        <DropdownItem
                            key="skip"
                            className={FILE_BROWSER_CLASS.priorityMenuDangerItem}
                            startContent={
                                <X className={FILE_BROWSER_CLASS.priorityMenuSkipIcon} />
                            }
                        >
                            {t("priority.dont_download")}
                        </DropdownItem>
                    </DropdownMenu>
                </Dropdown>
            </div>

            <div className={FILE_BROWSER_CLASS.rowProgressWrap}>
                <Progress
                    size="sm"
                    value={progress}
                    color={progress === 100 ? "success" : "primary"}
                    classNames={FILE_BROWSER_CLASS.progressClassNames}
                    aria-label="Download progress"
                />
            </div>

            <div className={FILE_BROWSER_CLASS.rowSizeText}>
                {formatBytes(row.node.totalSize)}
            </div>
        </div>
    );
});
