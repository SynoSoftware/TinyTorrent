import {
    Button,
    Input,
    Tooltip,
    cn,
} from "@heroui/react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import {
    AlertTriangle,
    CheckCircle2,
    FolderOpen,
    HardDrive,
    Info,
} from "lucide-react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import type { AddTorrentDestinationStatusKind } from "@/modules/torrent-add/utils/destinationStatus";

const DESTINATION_INPUT_CLASSNAMES = {
    inputWrapper:
        "surface-layer-1 border border-default/10 shadow-none focus-within:border-primary/70",
    content: "",
    input:
        "bg-transparent text-scaled font-mono text-foreground placeholder:text-foreground/30",
};
export const DESTINATION_INPUT_LAYOUT_ID = "add-torrent-destination-input";

interface GateInputProps {
    value: string;
    onChange: (next: string) => void;
    onBlur: () => void;
}

interface GateStatusProps {
    kind: AddTorrentDestinationStatusKind;
    message: string;
}

interface GateActions {
    onConfirm: () => void;
    onBrowse: () => Promise<void>;
}

interface GateValidation {
    isValid: boolean;
    isLoading: boolean;
    showBrowse: boolean;
}

export interface AddTorrentDestinationGatePanelProps {
    input: GateInputProps;
    status: GateStatusProps;
    validation: GateValidation;
    actions: GateActions;
}

export function AddTorrentDestinationGatePanel({
    input,
    status,
    validation,
    actions,
}: AddTorrentDestinationGatePanelProps) {
    const { t } = useTranslation();

    const handleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
        if (event.key === "Enter") {
            event.preventDefault();
            event.stopPropagation();
            actions.onConfirm();
        }
    };

    return (
        <div className="surface-layer-1 border border-default/10 rounded-panel p-panel flex flex-col gap-panel">
            <Tooltip content={t("modals.add_torrent.destination_prompt_help")}>
                <div className="flex items-center gap-tools text-label font-mono uppercase tracking-widest text-foreground/40">
                    <HardDrive className="toolbar-icon-size-md text-foreground/50" />
                    <span>{t("modals.add_torrent.destination_prompt_mode_full")}</span>
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
                        value={input.value}
                        onChange={(e) => input.onChange(e.target.value)}
                        onBlur={input.onBlur}
                        onKeyDown={handleKeyDown}
                        aria-label={t("modals.add_torrent.destination_input_aria")}
                        placeholder={t("modals.add_torrent.destination_placeholder")}
                        variant="flat"
                        autoComplete="off"
                        classNames={DESTINATION_INPUT_CLASSNAMES}
                        startContent={
                            <FolderOpen className="toolbar-icon-size-md text-primary" />
                        }
                    />
                </motion.div>
                {validation.showBrowse && (
                    <Tooltip
                        content={t(
                            "modals.add_torrent.destination_prompt_browse"
                        )}
                    >
                        <Button
                            onPress={actions.onBrowse}
                            isIconOnly
                            size="md"
                            variant="flat"
                            isLoading={validation.isLoading}
                            aria-label={t(
                                "modals.add_torrent.destination_prompt_browse"
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
                    status.kind === "danger"
                        ? "text-danger"
                        : status.kind === "warning"
                            ? "text-warning"
                            : "text-foreground/60"
                )}
            >
                {status.kind === "danger" || status.kind === "warning" ? (
                    <AlertTriangle className="toolbar-icon-size-md shrink-0" />
                ) : status.kind === "ok" ? (
                    <CheckCircle2 className="toolbar-icon-size-md shrink-0 text-success" />
                ) : (
                    <Info className="toolbar-icon-size-md shrink-0 text-foreground/40" />
                )}
                <span className="font-bold truncate">{status.message}</span>
            </div>

            <div className="flex justify-end">
                <Button
                    color="primary"
                    variant="shadow"
                    onPress={actions.onConfirm}
                    isDisabled={!validation.isValid}
                    className="font-bold"
                >
                    {t("modals.add_torrent.destination_gate_continue")}
                </Button>
            </div>
        </div>
    );
}
