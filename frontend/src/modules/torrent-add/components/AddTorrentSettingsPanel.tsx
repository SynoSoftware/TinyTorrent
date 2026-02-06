import {
    Button,
    Checkbox,
    Divider,
    Dropdown,
    DropdownItem,
    DropdownMenu,
    DropdownTrigger,
    Tooltip,
    cn,
} from "@heroui/react";
import type { DragEvent, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
    AlertTriangle,
    CheckCircle2,
    ChevronDown,
    FolderOpen,
    HardDrive,
    Hash,
    Info,
    ListOrdered,
} from "lucide-react";
import { describePathKind } from "@/modules/torrent-add/utils/destination";
import type { AddTorrentDestinationStatusKind } from "@/modules/torrent-add/utils/destinationStatus";

export interface AddTorrentSettingsPanelProps {
    renderDestinationInput: (wrapperClass?: string) => ReactNode;
    onDrop: (event: DragEvent<HTMLDivElement>) => void;
    onDragOver: (event: DragEvent) => void;
    onDragLeave: () => void;
    showBrowseAction: boolean;
    handleBrowse: () => Promise<void>;
    isTouchingDirectory: boolean;
    recentPaths: string[];
    applyRecentPath: (path?: string) => void;
    step2StatusKind: AddTorrentDestinationStatusKind;
    step2StatusMessage: string;
    spaceErrorDetail: string | null;
    showTransferFlags: boolean;
    sequential: boolean;
    skipHashCheck: boolean;
    setSequential: (next: boolean) => void;
    setSkipHashCheck: (next: boolean) => void;
}

export function AddTorrentSettingsPanel({
    renderDestinationInput,
    onDrop,
    onDragOver,
    onDragLeave,
    showBrowseAction,
    handleBrowse,
    isTouchingDirectory,
    recentPaths,
    applyRecentPath,
    step2StatusKind,
    step2StatusMessage,
    spaceErrorDetail,
    showTransferFlags,
    sequential,
    skipHashCheck,
    setSequential,
    setSkipHashCheck,
}: AddTorrentSettingsPanelProps) {
    const { t } = useTranslation();

    return (
        <div className="p-panel flex flex-col flex-1 min-h-0 overflow-y-auto custom-scrollbar">
            <div
                className="flex flex-col gap-panel mb-panel"
                onDrop={onDrop}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
            >
                <div className="flex flex-col gap-tools">
                    <Tooltip content={t("modals.add_torrent.destination_prompt_help")}>
                        <label className="text-label font-bold tracking-wider text-foreground/60 uppercase mb-panel flex items-center gap-tools">
                            <HardDrive className="toolbar-icon-size-md" />{" "}
                            {t("modals.add_torrent.destination")}
                        </label>
                    </Tooltip>
                </div>

                <div className="flex gap-tools group items-center">
                    {renderDestinationInput("flex-1")}
                    {showBrowseAction && (
                        <Tooltip
                            content={t(
                                "modals.add_torrent.destination_prompt_browse"
                            )}
                        >
                            <Button
                                onPress={handleBrowse}
                                isIconOnly
                                size="md"
                                variant="flat"
                                isLoading={isTouchingDirectory}
                                aria-label={t(
                                    "modals.add_torrent.destination_prompt_browse"
                                )}
                                className="surface-layer-1 border border-default/10"
                            >
                                <FolderOpen className="toolbar-icon-size-md text-foreground/50" />
                            </Button>
                        </Tooltip>
                    )}
                    <Dropdown>
                        <DropdownTrigger>
                            <Button
                                isIconOnly
                                size="md"
                                variant="flat"
                                aria-label={t("modals.add_torrent.history")}
                                title={t("modals.add_torrent.history")}
                                className="surface-layer-1 border border-default/10"
                            >
                                <ChevronDown className="toolbar-icon-size-md text-foreground/50" />
                            </Button>
                        </DropdownTrigger>
                        <DropdownMenu aria-label={t("modals.add_torrent.history")}>
                            {recentPaths.length > 0 ? (
                                recentPaths.map((path) => (
                                    <DropdownItem
                                        key={path}
                                        description={(() => {
                                            const kind = describePathKind(path);
                                            if (kind.kind === "drive")
                                                return t(
                                                    "modals.add_torrent.path_kind_drive",
                                                    { drive: kind.drive }
                                                );
                                            if (kind.kind === "network")
                                                return t(
                                                    "modals.add_torrent.path_kind_network"
                                                );
                                            if (kind.kind === "posix")
                                                return t(
                                                    "modals.add_torrent.path_kind_posix"
                                                );
                                            return t(
                                                "modals.add_torrent.path_kind_unknown"
                                            );
                                        })()}
                                        startContent={
                                            <HardDrive className="toolbar-icon-size-md" />
                                        }
                                        onPress={() => applyRecentPath(path)}
                                    >
                                        {path}
                                    </DropdownItem>
                                ))
                            ) : (
                                <DropdownItem key="history-empty" isDisabled>
                                    {t("modals.add_torrent.history_empty")}
                                </DropdownItem>
                            )}
                        </DropdownMenu>
                    </Dropdown>
                </div>

                <div
                    className={cn(
                        "h-status-chip flex items-center gap-tools text-label font-mono min-w-0",
                        step2StatusKind === "danger"
                            ? "text-danger"
                            : step2StatusKind === "warning"
                                ? "text-warning"
                                : "text-foreground/60"
                    )}
                >
                    {step2StatusKind === "danger" ||
                    step2StatusKind === "warning" ? (
                        <AlertTriangle className="toolbar-icon-size-md shrink-0" />
                    ) : step2StatusKind === "ok" ? (
                        <CheckCircle2 className="toolbar-icon-size-md shrink-0 text-success" />
                    ) : (
                        <Info className="toolbar-icon-size-md shrink-0 text-foreground/40" />
                    )}
                    {spaceErrorDetail ? (
                        <Tooltip content={spaceErrorDetail}>
                            <span className="truncate">{step2StatusMessage}</span>
                        </Tooltip>
                    ) : (
                        <span className="truncate">{step2StatusMessage}</span>
                    )}
                </div>
            </div>

            {showTransferFlags && (
                <>
                    <Divider className="my-panel bg-foreground/25" aria-hidden="true" />
                    <div className="flex flex-col gap-tools">
                        <label className="text-label font-bold tracking-wider text-foreground/60 uppercase mb-panel flex items-center gap-tools">
                            <Hash className="toolbar-icon-size-md" />{" "}
                            {t("modals.add_torrent.transfer_flags")}
                        </label>
                        <div className="flex flex-col gap-tools">
                            <Checkbox
                                isSelected={sequential}
                                onValueChange={setSequential}
                                classNames={{
                                    label: "text-foreground/70 text-label",
                                }}
                            >
                                <span className="flex items-center">
                                    <ListOrdered className="toolbar-icon-size-md mr-2 text-foreground/50" />
                                    {t(
                                        "modals.add_torrent.sequential_download"
                                    )}
                                </span>
                            </Checkbox>
                            <Divider className="bg-content1/5" />
                            <Checkbox
                                isSelected={skipHashCheck}
                                onValueChange={setSkipHashCheck}
                                classNames={{
                                    label: "text-foreground/70 text-label",
                                }}
                            >
                                <span className="flex items-center">
                                    <CheckCircle2 className="toolbar-icon-size-md mr-2 text-foreground/50" />
                                    {t("modals.add_torrent.skip_hash_check")}
                                </span>
                            </Checkbox>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
