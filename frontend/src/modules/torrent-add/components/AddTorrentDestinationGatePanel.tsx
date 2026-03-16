import { Button, Tooltip } from "@heroui/react";
import { useTranslation } from "react-i18next";
import { HardDrive } from "lucide-react";
import { TEXT_ROLE } from "@/config/textRoles";
import { GlassPanel } from "@/shared/ui/layout/GlassPanel";
import { FORM } from "@/shared/ui/layout/glass-surface";
import { useAddTorrentModalContext } from "@/modules/torrent-add/components/AddTorrentModalContext";
import { DestinationPathEditor } from "@/shared/ui/workspace/DestinationPathEditor";

export function AddTorrentDestinationGatePanel() {
    const { t } = useTranslation();
    const { destinationInput, destinationGate } = useAddTorrentModalContext();

    return (
        <GlassPanel className={FORM.workflow.gatePanel}>
            <Tooltip content={t("modals.add_torrent.destination_prompt_help")}>
                <div className={FORM.workflow.gatePromptRow}>
                    <HardDrive className={FORM.workflow.gatePromptIcon} />
                    <span>
                        {t("modals.add_torrent.destination_prompt_mode_full")}
                    </span>
                </div>
            </Tooltip>

            <DestinationPathEditor
                id="add-torrent-gate-destination"
                label={t("directory_browser.path_label")}
                labelClassName={TEXT_ROLE.caption}
                labelColumnClassName={FORM.locationEditorCompactLabelColumn}
                value={destinationInput.value}
                history={destinationInput.history}
                ariaLabel={t("modals.add_torrent.destination_input_aria")}
                placeholder={t("modals.add_torrent.destination_placeholder")}
                onValueChange={destinationInput.onChange}
                onBlur={destinationInput.onBlur}
                onEnter={destinationGate.onEnter}
                onEscape={destinationInput.onEscape}
                autoFocus
                inputClassNames={FORM.locationEditorInputClassNames}
                inputTextClassName={TEXT_ROLE.codeMuted}
                feedback={destinationGate.feedback}
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

            <div className={FORM.workflow.gateActionsRow}>
                <Button
                    color="primary"
                    variant="shadow"
                    onPress={destinationGate.onConfirm}
                    isDisabled={!destinationGate.isDestinationValid}
                    className={FORM.workflow.gateConfirmButton}
                >
                    {t("modals.add_torrent.destination_gate_continue")}
                </Button>
            </div>
        </GlassPanel>
    );
}
