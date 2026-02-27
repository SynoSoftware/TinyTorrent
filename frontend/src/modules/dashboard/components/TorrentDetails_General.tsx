// FILE: src/modules/dashboard/torrent-detail/GeneralTab.tsx
import { Button } from "@heroui/react";
import { Folder, Play, Pause, Trash2 } from "lucide-react";
import React, { useCallback, useState } from "react";
import RemoveConfirmationModal from "@/modules/torrent-remove/components/RemoveConfirmationModal";
import { useTranslation } from "react-i18next";
import type { TorrentDetailEntity as TorrentDetail } from "@/services/rpc/entities";
import { GlassPanel } from "@/shared/ui/layout/GlassPanel";
import { AlertPanel } from "@/shared/ui/layout/AlertPanel";
import { SmoothProgressBar } from "@/shared/ui/components/SmoothProgressBar";
import { registry } from "@/config/logic";
import { TEXT_ROLE } from "@/config/textRoles";
import { DETAILS } from "@/shared/ui/layout/glass-surface";
import SetDownloadPathModal from "@/modules/dashboard/components/SetDownloadPathModal";
import { status } from "@/shared/status";
import type { DashboardDetailViewModel } from "@/app/viewModels/useAppViewModel";
import type { TorrentCommandOutcome } from "@/app/context/AppCommandContext";
const { layout, visuals, ui } = registry;

interface GeneralTabProps {
    torrent: TorrentDetail;
    canSetLocation: boolean;
    onTorrentAction: DashboardDetailViewModel["tabs"]["general"]["handleTorrentAction"];
    setLocation: DashboardDetailViewModel["tabs"]["general"]["setLocation"];
}

export const GeneralTab = ({
    torrent,
    canSetLocation,
    onTorrentAction,
    setLocation,
}: GeneralTabProps) => {
    const { t } = useTranslation();
    const [showSetDownloadPathModal, setShowSetDownloadPathModal] = useState(false);
    const [showRemoveModal, setShowRemoveModal] = useState(false);

    const transmissionError =
        typeof torrent.errorString === "string" &&
        torrent.errorString.trim().length > 0
            ? torrent.errorString
            : null;
    const verificationProgress = torrent.verificationProgress ?? 0;
    const verificationPercent =
        verificationProgress > 1
            ? verificationProgress
            : verificationProgress * 100;
    const isActive =
        torrent.state === status.torrent.downloading ||
        torrent.state === status.torrent.seeding ||
        torrent.state === status.torrent.checking;
    const mainActionLabelKey = isActive ? "toolbar.pause" : "toolbar.resume";
    const mainActionLabel = t(mainActionLabelKey);
    const ToggleIcon = isActive ? Pause : Play;

    const onToggleStartStop = useCallback(() => {
        const action = isActive ? "pause" : "resume";
        void onTorrentAction(action, torrent);
    }, [isActive, onTorrentAction, torrent]);

    const onStartNow = useCallback(() => {
        void onTorrentAction("resume-now", torrent);
    }, [onTorrentAction, torrent]);

    const openSetDownloadPathModal = useCallback(() => {
        if (!canSetLocation) {
            return;
        }
        setShowSetDownloadPathModal(true);
    }, [canSetLocation]);

    const closeSetDownloadPathModal = useCallback(() => {
        setShowSetDownloadPathModal(false);
    }, []);

    const openRemoveModal = useCallback(() => {
        setShowRemoveModal(true);
    }, []);

    const closeRemoveModal = useCallback(() => {
        setShowRemoveModal(false);
    }, []);

    const onConfirmRemove = useCallback(
        async (deleteData: boolean): Promise<TorrentCommandOutcome> => {
            const action = deleteData ? "remove-with-data" : "remove";
            const outcome = await onTorrentAction(action, torrent);
            if (outcome.status === "success" || outcome.status === "canceled") {
                setShowRemoveModal(false);
            }
            return outcome;
        },
        [onTorrentAction, torrent],
    );

    return (
        <div className={DETAILS.generalRoot}>
            <GlassPanel className={DETAILS.generalCard}>
                <div className={DETAILS.generalHeaderRow}>
                    <div className={DETAILS.generalPrimaryCol}>
                        <div className={TEXT_ROLE.caption}>{t("torrent_modal.labels.save_path")}</div>
                        <code className={DETAILS.generalPathCode}>{setLocation.currentPath}</code>
                    </div>
                    <div className={DETAILS.generalVerifyCol}>
                        <div className={TEXT_ROLE.caption}>{t("torrent_modal.controls.verify")}</div>
                        <div className={DETAILS.generalVerifyWrap}>
                            <SmoothProgressBar
                                value={verificationPercent}
                                trackClassName={DETAILS.generalVerificationTrack}
                                indicatorClassName={DETAILS.generalVerificationIndicator}
                            />
                        </div>
                    </div>
                </div>
            </GlassPanel>

            {transmissionError && (
                <AlertPanel severity="danger">
                    <div className={DETAILS.generalWarningStack}>
                        <span className={TEXT_ROLE.statusWarning}>{t("torrent_modal.errors.transmission_error_title")}</span>
                        <div className={`${TEXT_ROLE.bodySmall} whitespace-pre-wrap`}>
                            {transmissionError}
                        </div>
                    </div>
                </AlertPanel>
            )}

            <div className={DETAILS.generalControlsGrid}>
                <div className={DETAILS.generalControlsSpan}>
                    <GlassPanel className={DETAILS.generalCard}>
                        <div className={DETAILS.generalHeaderRow}>
                            <div>
                                <div className={TEXT_ROLE.caption}>{t("torrent_modal.controls.title")}</div>
                                <div className={DETAILS.generalControlsDescription}>{t("torrent_modal.controls.description")}</div>
                            </div>
                            <div className={DETAILS.generalControlsMeta}>
                                <div className={DETAILS.generalControlsActions}>
                                    {/* Force reannounce moved to Trackers tab per UX decision */}
                                    <Button size="md" variant="flat" color={isActive ? "default" : "primary"} onPress={onToggleStartStop}>
                                        <>
                                            <ToggleIcon size={16} strokeWidth={visuals.icon.strokeWidth} className={DETAILS.generalButtonIcon} />
                                            {mainActionLabel}
                                        </>
                                    </Button>
                                    {!isActive && (
                                        <Button size="md" variant="flat" color="primary" onPress={onStartNow}>
                                            <>
                                                <Play size={16} strokeWidth={visuals.icon.strokeWidth} className={DETAILS.generalButtonIcon} />
                                                {t("table.actions.start_now")}
                                            </>
                                        </Button>
                                    )}
                                    <Button size="md" variant="flat" color="default" onPress={openSetDownloadPathModal} isDisabled={!canSetLocation}>
                                        <>
                                            <Folder size={16} strokeWidth={visuals.icon.strokeWidth} className={DETAILS.generalButtonIcon} />
                                            {t(setLocation.policy.actionLabelKey)}
                                        </>
                                    </Button>
                                    <Button size="md" variant="flat" color="danger" onPress={openRemoveModal}>
                                        <>
                                            <Trash2 size={16} strokeWidth={visuals.icon.strokeWidth} className={DETAILS.generalButtonIcon} />
                                            {t("toolbar.remove")}
                                        </>
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </GlassPanel>
                </div>
            </div>
            {showRemoveModal && (
                <RemoveConfirmationModal isOpen={showRemoveModal} onClose={closeRemoveModal} onConfirm={onConfirmRemove} torrentCount={1} torrentIds={[torrent.id]} />
            )}
            <SetDownloadPathModal
                isOpen={showSetDownloadPathModal}
                titleKey={setLocation.policy.modalTitleKey}
                initialPath={setLocation.currentPath}
                canPickDirectory={setLocation.canPickDirectory}
                allowCreatePath={setLocation.policy.allowCreatePath}
                onClose={closeSetDownloadPathModal}
                onPickDirectory={setLocation.pickDirectoryForSetDownloadPath}
                onApply={setLocation.applySetDownloadPath}
            />
        </div>
    );
};

export default GeneralTab;


