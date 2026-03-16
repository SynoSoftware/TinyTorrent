import {
    Checkbox,
    Divider,
    Tooltip,
} from "@heroui/react";
import { useTranslation } from "react-i18next";
import {
    CheckCircle2,
    HardDrive,
    Hash,
    ListOrdered,
    PauseCircle,
} from "lucide-react";
import { TEXT_ROLE } from "@/config/textRoles";
import { useAddTorrentModalContext } from "@/modules/torrent-add/components/AddTorrentModalContext";
import {
    FORM,
    FORM_CONTROL,
} from "@/shared/ui/layout/glass-surface";
import { DestinationPathEditor } from "@/shared/ui/workspace/DestinationPathEditor";

export function AddTorrentSettingsPanel() {
    const { t } = useTranslation();
    const { destinationInput, destinationGate, settings } = useAddTorrentModalContext();

    return (
        <div className={FORM.workflow.root}>
            <div
                className={FORM.workflow.section}
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

                <DestinationPathEditor
                    id="add-torrent-settings-destination"
                    label={t("directory_browser.path_label")}
                    labelClassName={TEXT_ROLE.caption}
                    labelColumnClassName={FORM.locationEditorCompactLabelColumn}
                    value={destinationInput.value}
                    history={destinationInput.history}
                    ariaLabel={t("modals.add_torrent.destination_input_aria")}
                    placeholder={t("modals.add_torrent.destination_placeholder")}
                    onValueChange={destinationInput.onChange}
                    onBlur={destinationInput.onBlur}
                    onEnter={settings.onEnter}
                    onEscape={destinationInput.onEscape}
                    autoFocus={settings.autoFocusDestination}
                    inputClassNames={FORM.locationEditorInputClassNames}
                    inputTextClassName={TEXT_ROLE.codeMuted}
                    feedback={settings.feedback}
                    browseAction={
                        destinationGate.showBrowseAction
                            ? {
                                  ariaLabel: t("modals.add_torrent.destination_prompt_browse"),
                                  label: t("modals.set_download_location.browse"),
                                  onPress: () => {
                                      void destinationGate.onBrowse();
                                  },
                                  isLoading: destinationGate.isTouchingDirectory,
                              }
                            : undefined
                    }
                />
            </div>

            {settings.showTransferFlags && (
                <>
                    <Divider
                        className={FORM.workflow.flagsDivider}
                        aria-hidden="true"
                    />
                    <div className={FORM.workflow.section}>
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
