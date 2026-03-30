import { Button } from "@heroui/react";
import { useTranslation } from "react-i18next";
import { HardDrive } from "lucide-react";
import { GlassPanel } from "@/shared/ui/layout/GlassPanel";
import AppTooltip from "@/shared/ui/components/AppTooltip";
import { form } from "@/shared/ui/layout/glass-surface";
import { useAddTorrentModalContext } from "@/modules/torrent-add/components/AddTorrentModalContext";
import { DestinationPathEditor } from "@/shared/ui/workspace/DestinationPathEditor";

export function AddTorrentDestinationGatePanel() {
    const { t } = useTranslation();
    const { destinationInput, destinationGate } = useAddTorrentModalContext();

    return (
        <GlassPanel className={form.workflow.gatePanel}>
            <AppTooltip content={t("modals.add_torrent.destination_prompt_help")}>
                <div className={form.workflow.gatePromptRow}>
                    <HardDrive className={form.workflow.gatePromptIcon} />
                    <span>{t("modals.add_torrent.destination_prompt_mode_full")}</span>
                </div>
            </AppTooltip>

            <DestinationPathEditor
                id="add-torrent-gate-destination"
                label={t("directory_browser.path_label")}
                labelColumnClassName={form.locationEditorCompactLabelColumn}
                value={destinationInput.value}
                history={destinationInput.history}
                ariaLabel={t("modals.add_torrent.destination_input_aria")}
                placeholder={t("modals.add_torrent.destination_placeholder")}
                onValueChange={destinationInput.onChange}
                onBlur={destinationInput.onBlur}
                onEnter={destinationGate.onEnter}
                onEscape={destinationInput.onEscape}
                autoFocus
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

            <div className={form.workflow.gateActionsRow}>
                <Button
                    color="primary"
                    variant="shadow"
                    onPress={destinationGate.onConfirm}
                    isDisabled={!destinationGate.isDestinationValid}
                    className={form.workflow.gateConfirmButton}
                >
                    {t("modals.add_torrent.destination_gate_continue")}
                </Button>
            </div>
        </GlassPanel>
    );
}
