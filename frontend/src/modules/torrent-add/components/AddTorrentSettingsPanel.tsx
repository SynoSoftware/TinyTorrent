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
    PauseCircle,
} from "lucide-react";
import { describePathKind } from "@/modules/torrent-add/utils/destination";
import {
    DESTINATION_INPUT_LAYOUT_ID,
} from "@/modules/torrent-add/components/AddTorrentDestinationGatePanel";
import { useAddTorrentModalContext } from "@/modules/torrent-add/components/AddTorrentModalContext";
import {
    FORM,
    FORM_CONTROL,
    INPUT,
    SURFACE,
} from "@/shared/ui/layout/glass-surface";

export function AddTorrentSettingsPanel() {
    const { t } = useTranslation();
    const { destinationInput, destinationGate, settings } = useAddTorrentModalContext();

    return (
        <div className={FORM.workflow.root}>
            <div
                className={FORM.workflow.group}
                onDrop={settings.onDrop}
                onDragOver={settings.onDragOver}
                onDragLeave={settings.onDragLeave}
            >
                <div className={FORM.switchBlock}>
                    <Tooltip
                        content={t(
                            "modals.add_torrent.destination_prompt_help",
                        )}
                    >
                        <label className={FORM.workflow.label}>
                            <HardDrive className={FORM.workflow.labelIcon} />{" "}
                            {t("modals.add_torrent.destination")}
                        </label>
                    </Tooltip>
                </div>

                <div className={FORM.workflow.destinationRow}>
                    <motion.div
                        layout
                        layoutId={DESTINATION_INPUT_LAYOUT_ID}
                        className={FORM.workflow.destinationInputWrap}
                    >
                        <Input
                            value={destinationInput.value}
                            onChange={(e) =>
                                destinationInput.onChange(e.target.value)
                            }
                            onBlur={destinationInput.onBlur}
                            onKeyDown={destinationInput.onKeyDown}
                            aria-label={t(
                                "modals.add_torrent.destination_input_aria",
                            )}
                            placeholder={t(
                                "modals.add_torrent.destination_placeholder",
                            )}
                            variant="flat"
                            autoComplete="off"
                            classNames={INPUT.mono}
                            startContent={
                                <FolderOpen
                                    className={
                                        FORM.workflow.destinationInputIcon
                                    }
                                />
                            }
                        />
                    </motion.div>
                    {destinationGate.showBrowseAction && (
                        <Tooltip
                            content={t(
                                "modals.add_torrent.destination_prompt_browse",
                            )}
                        >
                            <Button
                                onPress={destinationGate.onBrowse}
                                isIconOnly
                                size="md"
                                variant="flat"
                                isLoading={destinationGate.isTouchingDirectory}
                                aria-label={t(
                                    "modals.add_torrent.destination_prompt_browse",
                                )}
                                className={SURFACE.atom.iconButton}
                            >
                                <FolderOpen
                                    className={FORM.workflow.actionIcon}
                                />
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
                                className={SURFACE.atom.iconButton}
                            >
                                <ChevronDown
                                    className={FORM.workflow.actionIcon}
                                />
                            </Button>
                        </DropdownTrigger>
                        <DropdownMenu
                            aria-label={t("modals.add_torrent.history")}
                            variant="shadow"
                            className={SURFACE.menu.surface}
                            classNames={SURFACE.menu.listClassNames}
                            itemClasses={SURFACE.menu.itemClassNames}
                        >
                            {settings.recentPaths.length > 0 ? (
                                settings.recentPaths.map((path) => (
                                    <DropdownItem
                                        key={path}
                                        description={(() => {
                                            const kind = describePathKind(path);
                                            if (kind.kind === "drive")
                                                return t(
                                                    "modals.add_torrent.path_kind_drive",
                                                    { drive: kind.drive },
                                                );
                                            if (kind.kind === "network")
                                                return t(
                                                    "modals.add_torrent.path_kind_network",
                                                );
                                            if (kind.kind === "posix")
                                                return t(
                                                    "modals.add_torrent.path_kind_posix",
                                                );
                                            return t(
                                                "modals.add_torrent.path_kind_unknown",
                                            );
                                        })()}
                                        startContent={
                                            <HardDrive
                                                className={
                                                    FORM.workflow.labelIcon
                                                }
                                            />
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
                        FORM.workflow.status,
                        FORM.builder.statusToneClass(settings.statusKind),
                    )}
                >
                    {settings.statusKind === "danger" ||
                    settings.statusKind === "warning" ? (
                        <AlertTriangle className={FORM.workflow.statusIcon} />
                    ) : settings.statusKind === "ok" ? (
                        <CheckCircle2
                            className={FORM.workflow.statusSuccessIcon}
                        />
                    ) : (
                        <Info className={FORM.workflow.statusInfoIcon} />
                    )}
                    {settings.spaceErrorDetail ? (
                        <Tooltip content={settings.spaceErrorDetail}>
                            <span className={FORM.workflow.statusMessage}>
                                {settings.statusMessage}
                            </span>
                        </Tooltip>
                    ) : (
                        <span className={FORM.workflow.statusMessage}>
                            {settings.statusMessage}
                        </span>
                    )}
                </div>
            </div>

            {settings.showTransferFlags && (
                <>
                    <Divider
                        className={FORM.workflow.flagsDivider}
                        aria-hidden="true"
                    />
                    <div className={FORM.workflow.flagsGroup}>
                        <label className={FORM.workflow.label}>
                            <Hash className={FORM.workflow.labelIcon} />{" "}
                            {t("modals.add_torrent.transfer_flags")}
                        </label>
                        <div className={FORM.workflow.flagsCheckboxes}>
                            <Checkbox
                                isSelected={settings.startPaused}
                                onValueChange={settings.setStartPaused}
                                classNames={
                                    FORM_CONTROL.checkboxLabelBodySmallClassNames
                                }
                            >
                                <span className={FORM.workflow.flagsItemLabel}>
                                    <PauseCircle
                                        className={FORM.workflow.flagsIcon}
                                    />
                                    {t("modals.add_torrent.add_paused")}
                                </span>
                            </Checkbox>
                            <Divider
                                className={FORM.workflow.flagsItemDivider}
                            />
                            <Checkbox
                                isSelected={settings.sequential}
                                onValueChange={settings.setSequential}
                                classNames={
                                    FORM_CONTROL.checkboxLabelBodySmallClassNames
                                }
                            >
                                <span className={FORM.workflow.flagsItemLabel}>
                                    <ListOrdered
                                        className={FORM.workflow.flagsIcon}
                                    />
                                    {t(
                                        "modals.add_torrent.sequential_download",
                                    )}
                                </span>
                            </Checkbox>
                            <Divider
                                className={FORM.workflow.flagsItemDivider}
                            />
                            <Checkbox
                                isSelected={settings.skipHashCheck}
                                onValueChange={settings.setSkipHashCheck}
                                classNames={
                                    FORM_CONTROL.checkboxLabelBodySmallClassNames
                                }
                            >
                                <span className={FORM.workflow.flagsItemLabel}>
                                    <CheckCircle2
                                        className={FORM.workflow.flagsIcon}
                                    />
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
