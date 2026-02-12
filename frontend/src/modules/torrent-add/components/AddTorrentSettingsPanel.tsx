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
import {
    IMPORT_FORM_CLASS,
    FORM_UI_CLASS,
    buildImportFormStatusToneClass,
    CHECKBOX_LABEL_BODY_SMALL_CLASSNAMES,
    ICON_BUTTON_SURFACE,
    INPUT_CLASSNAMES_MONO_SURFACE,
    MENU_ITEM_CLASSNAMES,
    MENU_LIST_CLASSNAMES,
    MENU_SURFACE_CLASS,
} from "@/shared/ui/layout/glass-surface";

export function AddTorrentSettingsPanel() {
    const { t } = useTranslation();
    const {
        destinationInput,
        destinationGate,
        settings,
    } = useAddTorrentModalContext();

    return (
        <div className={IMPORT_FORM_CLASS.root}>
            <div
                className={IMPORT_FORM_CLASS.group}
                onDrop={settings.onDrop}
                onDragOver={settings.onDragOver}
                onDragLeave={settings.onDragLeave}
            >
                <div className={FORM_UI_CLASS.switchBlock}>
                    <Tooltip content={t("modals.add_torrent.destination_prompt_help")}>
                        <label
                            className={IMPORT_FORM_CLASS.label}
                        >
                            <HardDrive className="toolbar-icon-size-md" />{" "}
                            {t("modals.add_torrent.destination")}
                        </label>
                    </Tooltip>
                </div>

                <div className={IMPORT_FORM_CLASS.destinationRow}>
                    <motion.div
                        layout
                        layoutId={DESTINATION_INPUT_LAYOUT_ID}
                        className={IMPORT_FORM_CLASS.destinationInputWrap}
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
                                className={ICON_BUTTON_SURFACE}
                            >
                                <FolderOpen className={IMPORT_FORM_CLASS.actionIcon} />
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
                                className={ICON_BUTTON_SURFACE}
                            >
                                <ChevronDown className={IMPORT_FORM_CLASS.actionIcon} />
                            </Button>
                        </DropdownTrigger>
                        <DropdownMenu
                            aria-label={t("modals.add_torrent.history")}
                            variant="shadow"
                            className={MENU_SURFACE_CLASS}
                            classNames={MENU_LIST_CLASSNAMES}
                            itemClasses={MENU_ITEM_CLASSNAMES}
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
                        IMPORT_FORM_CLASS.status,
                        buildImportFormStatusToneClass(
                            settings.statusKind,
                        ),
                    )}
                >
                    {settings.statusKind === "danger" ||
                    settings.statusKind === "warning" ? (
                        <AlertTriangle className={IMPORT_FORM_CLASS.statusIcon} />
                    ) : settings.statusKind === "ok" ? (
                        <CheckCircle2 className="toolbar-icon-size-md shrink-0 text-success" />
                    ) : (
                        <Info className={IMPORT_FORM_CLASS.statusInfoIcon} />
                    )}
                    {settings.spaceErrorDetail ? (
                        <Tooltip content={settings.spaceErrorDetail}>
                            <span className={IMPORT_FORM_CLASS.statusMessage}>
                                {settings.statusMessage}
                            </span>
                        </Tooltip>
                    ) : (
                        <span className={IMPORT_FORM_CLASS.statusMessage}>
                            {settings.statusMessage}
                        </span>
                    )}
                </div>
            </div>

            {settings.showTransferFlags && (
                <>
                    <Divider className={IMPORT_FORM_CLASS.flagsDivider} aria-hidden="true" />
                    <div className={IMPORT_FORM_CLASS.flagsGroup}>
                        <label
                            className={IMPORT_FORM_CLASS.label}
                        >
                            <Hash className="toolbar-icon-size-md" />{" "}
                            {t("modals.add_torrent.transfer_flags")}
                        </label>
                        <div className={IMPORT_FORM_CLASS.flagsCheckboxes}>
                            <Checkbox
                                isSelected={settings.sequential}
                                onValueChange={settings.setSequential}
                                classNames={CHECKBOX_LABEL_BODY_SMALL_CLASSNAMES}
                            >
                                <span className="flex items-center">
                                    <ListOrdered className={IMPORT_FORM_CLASS.flagsIcon} />
                                    {t(
                                        "modals.add_torrent.sequential_download"
                                    )}
                                </span>
                            </Checkbox>
                            <Divider className={IMPORT_FORM_CLASS.flagsItemDivider} />
                            <Checkbox
                                isSelected={settings.skipHashCheck}
                                onValueChange={settings.setSkipHashCheck}
                                classNames={CHECKBOX_LABEL_BODY_SMALL_CLASSNAMES}
                            >
                                <span className="flex items-center">
                                    <CheckCircle2 className={IMPORT_FORM_CLASS.flagsIcon} />
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

