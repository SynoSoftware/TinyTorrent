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
import { GlassPanel } from "@/shared/ui/layout/GlassPanel";
import {
    FORM,
    INPUT,
    SURFACE,
} from "@/shared/ui/layout/glass-surface";
import { useAddTorrentModalContext } from "@/modules/torrent-add/components/AddTorrentModalContext";
export const DESTINATION_INPUT_LAYOUT_ID = "add-torrent-destination-input";

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

            <div className={FORM.workflow.destinationRow}>
                <motion.div
                    layout
                    layoutId={DESTINATION_INPUT_LAYOUT_ID}
                    className={FORM.workflow.destinationInputWrap}
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
                        classNames={INPUT.monoEmphasized}
                        startContent={
                            <FolderOpen
                                className={FORM.workflow.destinationInputIcon}
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
                            <FolderOpen className={FORM.workflow.actionIcon} />
                        </Button>
                    </Tooltip>
                )}
            </div>

            <div
                className={cn(
                    FORM.workflow.status,
                    FORM.builder.statusToneClass(destinationGate.statusKind),
                )}
            >
                {destinationGate.statusKind === "danger" ||
                destinationGate.statusKind === "warning" ? (
                    <AlertTriangle className={FORM.workflow.statusIcon} />
                ) : destinationGate.statusKind === "ok" ? (
                    <CheckCircle2 className={FORM.workflow.statusSuccessIcon} />
                ) : (
                    <Info className={FORM.workflow.statusInfoIcon} />
                )}
                <span className={FORM.workflow.statusMessage}>
                    {destinationGate.statusMessage}
                </span>
            </div>

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
