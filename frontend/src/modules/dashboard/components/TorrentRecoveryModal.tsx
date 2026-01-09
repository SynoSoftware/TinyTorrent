import React from "react";
import { useTranslation } from "react-i18next";
import {
    Modal,
    ModalContent,
    ModalHeader,
    ModalBody,
    ModalFooter,
    Button,
} from "@heroui/react";
import type {
    RecoveryPlan,
    RecoveryOutcome,
} from "@/services/recovery/recovery-controller";

interface Props {
    isOpen: boolean;
    plan: RecoveryPlan | null;
    outcome: RecoveryOutcome | null;
    onClose: () => void;
    onPrimary: () => Promise<void> | void;
    onPickPath: (path: string) => Promise<void> | void;
    onVerify: () => Promise<void> | void;
    // When provided, called to open native browse and should resolve to a path or null
    onBrowse?: () => Promise<string | null> | void;
    isBusy?: boolean;
}

export const TorrentRecoveryModal = ({
    isOpen,
    plan,
    outcome,
    onClose,
    onPrimary,
    onPickPath,
    onVerify,
    onBrowse,
    isBusy = false,
}: Props) => {
    const { t } = useTranslation();
    const ACTION_KEY: Record<string, string> = {
        resume: "recovery.action.resume",
        verify: "recovery.action.verify",
        reannounce: "recovery.action.reannounce",
        reDownloadHere: "recovery.action.redownload_here",
        pickPath: "recovery.action.pick_path",
        openFolder: "recovery.action.open_folder",
    };

    const primaryLabel = plan
        ? t(ACTION_KEY[plan.primaryAction] ?? "recovery.primary")
        : t("recovery.primary");
    const message = outcome?.message ?? plan?.rationale ?? "";

    return (
        <Modal isOpen={isOpen} onOpenChange={onClose}>
            <ModalContent className="max-w-modal">
                <ModalHeader>
                    {t("recovery.modal.title", { action: primaryLabel })}
                </ModalHeader>
                <ModalBody>
                    <div className="space-y-3">
                        <div>{t("recovery.outcome_message", { message })}</div>
                        {outcome && outcome.kind === "path-needed" && (
                            <div className="text-label text-foreground/60">
                                {outcome.reason
                                    ? t("recovery.modal.reason", {
                                          reason: t(
                                              `recovery.reason.${String(
                                                  outcome.reason
                                              ).replace("-", "_")}`
                                          ),
                                      })
                                    : null}
                            </div>
                        )}
                    </div>
                </ModalBody>
                <ModalFooter>
                    <div className="flex items-center justify-end gap-tools w-full">
                        <Button
                            size="md"
                            variant="shadow"
                            color="primary"
                            isDisabled={isBusy}
                            onPress={() => {
                                void onPrimary();
                            }}
                        >
                            {primaryLabel}
                        </Button>
                        {onVerify && (
                            <Button
                                size="md"
                                variant="shadow"
                                color="default"
                                isDisabled={isBusy}
                                onPress={async () => {
                                    await onVerify();
                                }}
                            >
                                {t("torrent_modal.controls.verify")}
                            </Button>
                        )}
                        <Button
                            size="md"
                            variant="shadow"
                            color="default"
                            isDisabled={isBusy}
                            onPress={async () => {
                                // Prefer native browse when provided by parent; otherwise fall back to prompt
                                try {
                                    if (typeof onBrowse === "function") {
                                        const path = (await onBrowse()) as
                                            | string
                                            | null
                                            | void;
                                        if (path) {
                                            await onPickPath(path as string);
                                            return;
                                        }
                                    }
                                } catch (e) {
                                    // fall through to prompt fallback
                                }
                                const pick = window.prompt(
                                    t("recovery.prompt.enter_new_path")
                                );
                                if (pick === null) return;
                                const trimmed = pick.trim();
                                if (!trimmed) return;
                                await onPickPath(trimmed);
                            }}
                        >
                            {t("recovery.choose_another_folder")}
                        </Button>
                        <Button
                            size="md"
                            variant="flat"
                            color="default"
                            onPress={() => {
                                void onClose();
                            }}
                        >
                            {t("modals.cancel")}
                        </Button>
                    </div>
                </ModalFooter>
            </ModalContent>
        </Modal>
    );
};

export default TorrentRecoveryModal;
