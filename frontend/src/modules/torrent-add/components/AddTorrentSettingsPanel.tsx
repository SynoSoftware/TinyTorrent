import { Checkbox, Divider } from "@heroui/react";
import { useTranslation } from "react-i18next";
import { HardDrive, Hash, ListOrdered, PauseCircle } from "lucide-react";
import { getCapabilityHintKey, getCapabilityUiState } from "@/app/types/capabilities";
import { useAddTorrentModalContext } from "@/modules/torrent-add/components/AddTorrentModalContext";
import { form, formControl } from "@/shared/ui/layout/glass-surface";
import AppTooltip from "@/shared/ui/components/AppTooltip";
import { DestinationPathEditor } from "@/shared/ui/workspace/DestinationPathEditor";

export function AddTorrentSettingsPanel() {
    const { t } = useTranslation();
    const { destinationInput, destinationGate, settings } = useAddTorrentModalContext();
    const sequentialUiState = getCapabilityUiState(settings.sequentialDownloadCapability);
    const sequentialHint = t(getCapabilityHintKey(settings.sequentialDownloadCapability));
    const sequentialCheckbox = (
        <Checkbox
            isSelected={settings.sequential}
            onValueChange={settings.setSequential}
            isDisabled={sequentialUiState.disabled}
            classNames={formControl.checkboxLabelBodySmallClassNames}
        >
            <span className={form.workflow.flagsItemLabel}>
                <ListOrdered className={form.workflow.flagsIcon} />
                {t("modals.add_torrent.sequential_download")}
            </span>
        </Checkbox>
    );
    const sequentialControl = sequentialUiState.disabled ? (
        <AppTooltip content={sequentialHint}>
            <span>{sequentialCheckbox}</span>
        </AppTooltip>
    ) : (
        sequentialCheckbox
    );

    return (
        <div className={form.workflow.root}>
            <div
                className={form.workflow.section}
                onDrop={settings.onDrop}
                onDragOver={settings.onDragOver}
                onDragLeave={settings.onDragLeave}
            >
                <div className={form.switchBlock}>
                    <AppTooltip content={t("modals.add_torrent.destination_prompt_help")}>
                        <label className={form.workflow.label}>
                            <HardDrive className={form.workflow.labelIcon} /> {t("modals.add_torrent.destination")}
                        </label>
                    </AppTooltip>
                </div>

                <DestinationPathEditor
                    id="add-torrent-settings-destination"
                    label={t("directory_browser.path_label")}
                    labelColumnClassName={form.locationEditorCompactLabelColumn}
                    value={destinationInput.value}
                    history={destinationInput.history}
                    ariaLabel={t("modals.add_torrent.destination_input_aria")}
                    placeholder={t("modals.add_torrent.destination_placeholder")}
                    onValueChange={destinationInput.onChange}
                    onBlur={destinationInput.onBlur}
                    onEnter={settings.onEnter}
                    onEscape={destinationInput.onEscape}
                    autoFocus={settings.autoFocusDestination}
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
                    <Divider className={form.workflow.flagsDivider} aria-hidden="true" />
                    <div className={form.workflow.section}>
                        <label className={form.workflow.label}>
                            <Hash className={form.workflow.labelIcon} /> {t("modals.add_torrent.transfer_flags")}
                        </label>
                        <div className={form.workflow.flagsCheckboxes}>
                            <Checkbox
                                isSelected={settings.startPaused}
                                onValueChange={settings.setStartPaused}
                                classNames={formControl.checkboxLabelBodySmallClassNames}
                            >
                                <span className={form.workflow.flagsItemLabel}>
                                    <PauseCircle className={form.workflow.flagsIcon} />
                                    {t("modals.add_torrent.add_paused")}
                                </span>
                            </Checkbox>
                            <Divider className={form.workflow.flagsItemDivider} />
                            {sequentialControl}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
