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
import { PANEL_SURFACE_FRAME } from "@/shared/ui/layout/glass-surface";

const DESTINATION_INPUT_CLASSNAMES = {
    inputWrapper:
        "surface-layer-1 border border-default/10 shadow-none focus-within:border-primary/70",
    content: "",
    input: "bg-transparent text-scaled font-mono text-foreground placeholder:text-foreground/30",
};
export const DESTINATION_INPUT_LAYOUT_ID = "add-torrent-destination-input";

export function AddTorrentDestinationGatePanel() {
    const { t } = useTranslation();
    const { destinationInput, destinationGate } = useAddTorrentModalContext();

    return (
        <GlassPanel
            className={cn(
                PANEL_SURFACE_FRAME,
                "p-panel flex flex-col gap-panel",
            )}
        >
            <Tooltip content={t("modals.add_torrent.destination_prompt_help")}>
                <div className="flex items-center gap-tools text-label font-mono uppercase tracking-widest text-foreground/40">
                    <HardDrive className="toolbar-icon-size-md text-foreground/50" />
                    <span>
                        {t("modals.add_torrent.destination_prompt_mode_full")}
                    </span>
                </div>
            </Tooltip>

            <div className="flex gap-tools items-center">
                <motion.div
                    layout
                    layoutId={DESTINATION_INPUT_LAYOUT_ID}
                    className="w-full"
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
                        classNames={DESTINATION_INPUT_CLASSNAMES}
                        startContent={
                            <FolderOpen className="toolbar-icon-size-md text-primary" />
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
                            className="surface-layer-1 border border-default/10"
                        >
                            <FolderOpen className="toolbar-icon-size-md text-foreground/50" />
                        </Button>
                    </Tooltip>
                )}
            </div>

            <div
                className={cn(
                    "h-status-chip flex items-center gap-tools text-label font-mono",
                    destinationGate.statusKind === "danger"
                        ? "text-danger"
                        : destinationGate.statusKind === "warning"
                          ? "text-warning"
                          : "text-foreground/60",
                )}
            >
                {destinationGate.statusKind === "danger" ||
                destinationGate.statusKind === "warning" ? (
                    <AlertTriangle className="toolbar-icon-size-md shrink-0" />
                ) : destinationGate.statusKind === "ok" ? (
                    <CheckCircle2 className="toolbar-icon-size-md shrink-0 text-success" />
                ) : (
                    <Info className="toolbar-icon-size-md shrink-0 text-foreground/40" />
                )}
                <span className="font-bold truncate">
                    {destinationGate.statusMessage}
                </span>
            </div>

            <div className="flex justify-end">
                <Button
                    color="primary"
                    variant="shadow"
                    onPress={destinationGate.onConfirm}
                    isDisabled={!destinationGate.isDestinationValid}
                    className="font-bold"
                >
                    {t("modals.add_torrent.destination_gate_continue")}
                </Button>
            </div>
        </GlassPanel>
    );
}
