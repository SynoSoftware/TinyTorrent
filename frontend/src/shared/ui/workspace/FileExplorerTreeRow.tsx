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
    CHECKBOX_PRIMARY_CLASSNAMES,
    FILE_TREE_CHEVRON_BUTTON_CLASS,
    FILE_TREE_PRIORITY_CHIP_CLASS,
    FILE_TREE_PROGRESS_CLASSNAMES,
    FILE_TREE_ROW_CLASS,
    FILE_TREE_ROW_DIMMED_CLASS,
    MENU_ITEM_CLASSNAMES,
    MENU_LIST_CLASSNAMES,
    MENU_SURFACE_CLASS,
    PRIORITY_CHIP_CLASSNAMES,
} from "@/shared/ui/layout/glass-surface";
import { TEXT_ROLE } from "@/config/textRoles";

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
        return <FileVideo className="toolbar-icon-size-sm text-primary" />;
    }
    if (["mp3", "wav", "flac", "aac"].includes(extension || "")) {
        return <FileAudio className="toolbar-icon-size-sm text-warning" />;
    }
    if (["jpg", "jpeg", "png", "gif", "webp"].includes(extension || "")) {
        return <FileImage className="toolbar-icon-size-sm text-success" />;
    }
    if (["txt", "md", "pdf", "doc", "docx"].includes(extension || "")) {
        return <FileText className="toolbar-icon-size-sm text-default-500" />;
    }
    return <FileIcon className="toolbar-icon-size-sm text-default-400" />;
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
                FILE_TREE_ROW_CLASS,
                !row.isWanted && FILE_TREE_ROW_DIMMED_CLASS,
            )}
            style={
                {
                    "--tt-file-depth": String(row.node.depth),
                } as CSSProperties
            }
        >
            <div className="flex items-center justify-center">
                <Checkbox
                    size="sm"
                    radius="sm"
                    isSelected={row.isSelected}
                    isIndeterminate={row.isIndeterminate}
                    onValueChange={onSelectionChange}
                    classNames={CHECKBOX_PRIMARY_CLASSNAMES}
                />
            </div>

            <div className="flex items-center overflow-hidden min-w-0 pr-panel pl-file-tree-indent">
                {row.node.isFolder ? (
                    <button
                        onClick={(event) => {
                            event.stopPropagation();
                            onToggleExpand();
                        }}
                        className={FILE_TREE_CHEVRON_BUTTON_CLASS}
                    >
                        {row.isExpanded ? (
                            <ChevronDown className="toolbar-icon-size-sm" />
                        ) : (
                            <ChevronRight className="toolbar-icon-size-sm" />
                        )}
                    </button>
                ) : (
                    <div className="w-file-tree-indent-spacer" />
                )}

                <div className="mr-tight text-default-500 shrink-0">
                    {row.node.isFolder ? (
                        <Folder className="toolbar-icon-size-sm fill-default-400/20" />
                    ) : (
                        getFileIcon(row.node.name)
                    )}
                </div>

                <span
                    className={cn(
                        "text-scaled truncate cursor-default",
                        row.node.isFolder
                            ? "font-medium text-foreground"
                            : "text-foreground/80",
                    )}
                    title={row.node.name}
                    onClick={row.node.isFolder ? onToggleExpand : undefined}
                >
                    {row.node.name}
                </span>
            </div>

            <div className="flex justify-center">
                <Dropdown>
                    <DropdownTrigger>
                        <Chip
                            size="sm"
                            variant="flat"
                            color={getPriorityColor(row.priority, row.isWanted)}
                            className={FILE_TREE_PRIORITY_CHIP_CLASS}
                            classNames={PRIORITY_CHIP_CLASSNAMES}
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
                        className={MENU_SURFACE_CLASS}
                        classNames={MENU_LIST_CLASSNAMES}
                        itemClasses={MENU_ITEM_CLASSNAMES}
                    >
                        <DropdownItem
                            key="high"
                            startContent={
                                <ArrowUp className="toolbar-icon-size-sm text-success" />
                            }
                        >
                            {t("priority.high")}
                        </DropdownItem>
                        <DropdownItem
                            key="normal"
                            startContent={
                                <Minus className="toolbar-icon-size-sm text-primary" />
                            }
                        >
                            {t("priority.normal")}
                        </DropdownItem>
                        <DropdownItem
                            key="low"
                            startContent={
                                <ArrowDown className="toolbar-icon-size-sm text-warning" />
                            }
                        >
                            {t("priority.low")}
                        </DropdownItem>
                        <DropdownItem
                            key="skip"
                            className="text-danger"
                            startContent={<X className="toolbar-icon-size-sm" />}
                        >
                            {t("priority.dont_download")}
                        </DropdownItem>
                    </DropdownMenu>
                </Dropdown>
            </div>

            <div className="flex flex-col justify-center px-tight">
                <Progress
                    size="sm"
                    value={progress}
                    color={progress === 100 ? "success" : "primary"}
                    classNames={FILE_TREE_PROGRESS_CLASSNAMES}
                    aria-label="Download progress"
                />
            </div>

            <div className={`${TEXT_ROLE.codeMuted} text-right text-default-400`}>
                {formatBytes(row.node.totalSize)}
            </div>
        </div>
    );
});
