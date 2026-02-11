import {
    Button,
    Checkbox,
    Divider,
    Dropdown,
    DropdownItem,
    DropdownMenu,
    DropdownTrigger,
    Input,
    Tooltip,
    cn,
} from "@heroui/react";
import { motion } from "framer-motion";
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
import { DESTINATION_INPUT_LAYOUT_ID } from "@/modules/torrent-add/components/AddTorrentDestinationGatePanel";
import { useAddTorrentModalContext } from "@/modules/torrent-add/components/AddTorrentModalContext";
import { INPUT_CLASSNAMES_MONO_SURFACE } from "@/shared/ui/layout/glass-surface";

export function AddTorrentSettingsPanel() {
    const { t } = useTranslation();
    const {
        destinationInput,
        destinationGate,
        settings,
    } = useAddTorrentModalContext();

    return (
        <div className="p-panel flex flex-col flex-1 min-h-0 overflow-y-auto custom-scrollbar">
            <div
                className="flex flex-col gap-panel mb-panel"
                onDrop={settings.onDrop}
                onDragOver={settings.onDragOver}
                onDragLeave={settings.onDragLeave}
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
                    <motion.div
                        layout
                        layoutId={DESTINATION_INPUT_LAYOUT_ID}
                        className="w-full flex-1"
                    >
                        <Input
                            value={destinationInput.value}
                            onChange={(e) =>
                                destinationInput.onChange(e.target.value)
                            }
                            onBlur={destinationInput.onBlur}
                            onKeyDown={destinationInput.onKeyDown}
                            aria-label={t(
                                "modals.add_torrent.destination_input_aria"
                            )}
                            placeholder={t(
                                "modals.add_torrent.destination_placeholder"
                            )}
                            variant="flat"
                            autoComplete="off"
                            classNames={INPUT_CLASSNAMES_MONO_SURFACE}
                            startContent={
                                <FolderOpen className="toolbar-icon-size-md text-primary mb-tight" />
                            }
                        />
                    </motion.div>
                    {destinationGate.showBrowseAction && (
                        <Tooltip
                            content={t(
                                "modals.add_torrent.destination_prompt_browse"
                            )}
                        >
                            <Button
                                onPress={destinationGate.onBrowse}
                                isIconOnly
                                size="md"
                                variant="flat"
                                isLoading={destinationGate.isTouchingDirectory}
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
                            {settings.recentPaths.length > 0 ? (
                                settings.recentPaths.map((path) => (
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
                                        onPress={() =>
                                            settings.applyRecentPath(path)
                                        }
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
                        settings.statusKind === "danger"
                            ? "text-danger"
                            : settings.statusKind === "warning"
                                ? "text-warning"
                                : "text-foreground/60"
                    )}
                >
                    {settings.statusKind === "danger" ||
                    settings.statusKind === "warning" ? (
                        <AlertTriangle className="toolbar-icon-size-md shrink-0" />
                    ) : settings.statusKind === "ok" ? (
                        <CheckCircle2 className="toolbar-icon-size-md shrink-0 text-success" />
                    ) : (
                        <Info className="toolbar-icon-size-md shrink-0 text-foreground/40" />
                    )}
                    {settings.spaceErrorDetail ? (
                        <Tooltip content={settings.spaceErrorDetail}>
                            <span className="truncate">
                                {settings.statusMessage}
                            </span>
                        </Tooltip>
                    ) : (
                        <span className="truncate">{settings.statusMessage}</span>
                    )}
                </div>
            </div>

            {settings.showTransferFlags && (
                <>
                    <Divider className="my-panel bg-foreground/25" aria-hidden="true" />
                    <div className="flex flex-col gap-tools">
                        <label className="text-label font-bold tracking-wider text-foreground/60 uppercase mb-panel flex items-center gap-tools">
                            <Hash className="toolbar-icon-size-md" />{" "}
                            {t("modals.add_torrent.transfer_flags")}
                        </label>
                        <div className="flex flex-col gap-tools">
                            <Checkbox
                                isSelected={settings.sequential}
                                onValueChange={settings.setSequential}
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
                                isSelected={settings.skipHashCheck}
                                onValueChange={settings.setSkipHashCheck}
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
