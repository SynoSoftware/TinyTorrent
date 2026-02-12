import { Button, Input, Tooltip, cn } from "@heroui/react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import {
    AlertTriangle,
    CheckCircle2,
    FolderOpen,
    HardDrive,
    Info,
} from "lucide-react";
import { useAddTorrentModalContext } from "@/modules/torrent-add/components/AddTorrentModalContext";
import { GlassPanel } from "@/shared/ui/layout/GlassPanel";
import {
    FORM_UI_CLASS,
    buildFormStatusToneClass,
    INPUT_SURFACE_CLASS,
    SURFACE_ATOM_CLASS,
} from "@/shared/ui/layout/glass-surface";
export const DESTINATION_INPUT_LAYOUT_ID = "add-torrent-destination-input";

export function AddTorrentDestinationGatePanel() {
    const { t } = useTranslation();
    const { destinationInput, destinationGate } = useAddTorrentModalContext();

    return (
        <GlassPanel
            className={FORM_UI_CLASS.workflow.gatePanel}
        >
            <Tooltip content={t("modals.add_torrent.destination_prompt_help")}>
                <div className={FORM_UI_CLASS.workflow.gatePromptRow}>
                    <HardDrive className={FORM_UI_CLASS.workflow.gatePromptIcon} />
                    <span>
                        {t("modals.add_torrent.destination_prompt_mode_full")}
                    </span>
                </div>
            </Tooltip>

            <div className={FORM_UI_CLASS.workflow.destinationRow}>
                <motion.div
                    layout
                    layoutId={DESTINATION_INPUT_LAYOUT_ID}
                    className={FORM_UI_CLASS.workflow.destinationInputWrap}
                >
                    <Input
                        autoFocus
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
                        classNames={INPUT_SURFACE_CLASS.monoEmphasized}
                        startContent={
                            <FolderOpen
                                className={FORM_UI_CLASS.workflow.destinationInputIcon}
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
                            className={SURFACE_ATOM_CLASS.iconButton}
                        >
                            <FolderOpen className={FORM_UI_CLASS.workflow.actionIcon} />
                        </Button>
                    </Tooltip>
                )}
            </div>

            <div
                className={cn(
                    FORM_UI_CLASS.workflow.status,
                    buildFormStatusToneClass(destinationGate.statusKind),
                )}
            >
                {destinationGate.statusKind === "danger" ||
                destinationGate.statusKind === "warning" ? (
                    <AlertTriangle className={FORM_UI_CLASS.workflow.statusIcon} />
                ) : destinationGate.statusKind === "ok" ? (
                    <CheckCircle2 className={FORM_UI_CLASS.workflow.statusSuccessIcon} />
                ) : (
                    <Info className={FORM_UI_CLASS.workflow.statusInfoIcon} />
                )}
                <span className={FORM_UI_CLASS.workflow.statusMessage}>
                    {destinationGate.statusMessage}
                </span>
            </div>

            <div className={FORM_UI_CLASS.workflow.gateActionsRow}>
                <Button
                    color="primary"
                    variant="shadow"
                    onPress={destinationGate.onConfirm}
                    isDisabled={!destinationGate.isDestinationValid}
                    className={FORM_UI_CLASS.workflow.gateConfirmButton}
                >
                    {t("modals.add_torrent.destination_gate_continue")}
                </Button>
            </div>
        </GlassPanel>
    );
}
