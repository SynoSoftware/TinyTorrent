import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
    Checkbox,
} from "@heroui/react";
import { Trash2, type LucideIcon } from "lucide-react";
import { usePreferences } from "@/app/context/PreferencesContext";
import type { TorrentCommandOutcome } from "@/app/context/AppCommandContext";
import type { DeleteConfirmationOutcome } from "@/modules/torrent-remove/types/deleteConfirmation";
import { useDeleteConfirmationContextOptional } from "@/modules/torrent-remove/context/DeleteConfirmationContext";
import { FORM, FORM_CONTROL } from "@/shared/ui/layout/glass-surface";
import { ModalEx } from "@/shared/ui/layout/ModalEx";

interface RemoveConfirmationModalProps {
    isOpen?: boolean;
    titleIcon?: LucideIcon;
    onClose?: () => void;
    onConfirm?: (
        deleteData: boolean,
    ) => Promise<DeleteConfirmationOutcome | TorrentCommandOutcome>;
    torrentCount?: number;
    torrentIds?: string[];
    defaultDeleteData?: boolean;
}

export function RemoveConfirmationModal({
    isOpen,
    titleIcon = Trash2,
    onClose,
    onConfirm,
    torrentCount,
    defaultDeleteData = false,
}: RemoveConfirmationModalProps) {
    const { t } = useTranslation();
    const deleteConfirmation = useDeleteConfirmationContextOptional();
    const {
        preferences: { removeTorrentDefaults },
        updatePreferences,
    } = usePreferences();
    const [deleteData, setDeleteData] = useState(defaultDeleteData);
    const [loading, setLoading] = useState(false);

    const resolvedIsOpen = isOpen ?? Boolean(deleteConfirmation?.pendingDelete);
    const resolvedTorrentCount =
        torrentCount ?? deleteConfirmation?.pendingDelete?.torrents.length ?? 0;
    const resolvedDefaultDeleteData =
        deleteConfirmation?.pendingDelete?.deleteData ??
        removeTorrentDefaults.deleteData;
    const resolvedOnClose = useMemo(
        () => onClose ?? deleteConfirmation?.clearPendingDelete ?? (() => {}),
        [deleteConfirmation?.clearPendingDelete, onClose],
    );
    const resolvedOnConfirm = useMemo(
        () =>
            onConfirm ??
            (async (nextDeleteData: boolean) => {
                if (!deleteConfirmation) {
                    return {
                        status: "failed",
                    } satisfies DeleteConfirmationOutcome;
                }
                return deleteConfirmation.confirmDelete(nextDeleteData);
            }),
        [deleteConfirmation, onConfirm],
    );
    const handleClose = React.useCallback(() => {
        if (loading) return;
        resolvedOnClose();
    }, [loading, resolvedOnClose]);

    const normalizeDeleteOutcome = (
        outcome: DeleteConfirmationOutcome | TorrentCommandOutcome,
    ): DeleteConfirmationOutcome => {
        if (outcome.status === "success") return { status: "success" };
        if (outcome.status === "canceled") return { status: "canceled" };
        if (outcome.status === "unsupported") return { status: "unsupported" };
        return { status: "failed" };
    };

    const isCloseEligibleOutcome = (outcome: DeleteConfirmationOutcome) =>
        outcome.status === "success" || outcome.status === "canceled";

    // Keep state deterministic when reopening
    useEffect(() => {
        if (resolvedIsOpen) setDeleteData(resolvedDefaultDeleteData);
    }, [resolvedDefaultDeleteData, resolvedIsOpen]);

    const handleDeleteDataChange = React.useCallback(
        (value: boolean) => {
            setDeleteData(value);
            updatePreferences({
                removeTorrentDefaults: {
                    deleteData: value,
                },
            });
        },
        [updatePreferences],
    );

    const handleConfirm = React.useCallback(async () => {
        if (loading) return;
        setLoading(true);
        let outcome: DeleteConfirmationOutcome = { status: "failed" };
        try {
            const commandOutcome = await resolvedOnConfirm(deleteData);
            outcome = normalizeDeleteOutcome(commandOutcome);
        } catch {
            outcome = { status: "failed" };
        } finally {
            setLoading(false);
        }
        if (isCloseEligibleOutcome(outcome)) {
            resolvedOnClose();
        }
    }, [deleteData, loading, resolvedOnClose, resolvedOnConfirm]);

    return (
        <ModalEx
            open={resolvedIsOpen}
            onClose={handleClose}
            title={t("remove_modal.title")}
            icon={titleIcon}
            size="sm"
            disableClose={loading}
            secondaryAction={{
                label: t("remove_modal.cancel"),
                onPress: handleClose,
                disabled: loading,
            }}
            primaryAction={
                deleteData
                    ? undefined
                    : {
                          label: t("remove_modal.confirm_remove"),
                          onPress: () => {
                              void handleConfirm();
                          },
                          disabled: loading,
                      }
            }
            dangerAction={
                deleteData
                    ? {
                          label: t("remove_modal.confirm_delete_files"),
                          onPress: () => {
                              void handleConfirm();
                          },
                          disabled: loading,
                      }
                    : undefined
            }
            onKeyDownCapture={(event) => {
                if (event.key !== "Enter" || event.defaultPrevented) {
                    return;
                }
                event.preventDefault();
                void handleConfirm();
            }}
        >
            <div className={FORM.stackTools}>
                <p>
                    {resolvedTorrentCount === 1
                        ? t("remove_modal.single_torrent_message")
                        : t("remove_modal.multiple_torrents_message", {
                              count: resolvedTorrentCount,
                          })}
                </p>

                <Checkbox
                    isSelected={deleteData}
                    onValueChange={handleDeleteDataChange}
                    classNames={FORM_CONTROL.checkboxLabelBodySmallClassNames}
                >
                    {t("remove_modal.delete_files_option")}
                </Checkbox>
            </div>
        </ModalEx>
    );
}

export default RemoveConfirmationModal;
