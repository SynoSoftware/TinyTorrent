// FILE: src/modules/dashboard/torrent-detail/GeneralTab.tsx
import { Button } from "@heroui/react";
import { Folder, Play, Pause, Trash2, Download } from "lucide-react";
import React from "react";
import RemoveConfirmationModal from "@/modules/torrent-remove/components/RemoveConfirmationModal";
import { useTranslation } from "react-i18next";
import type { TorrentDetail } from "@/modules/dashboard/types/torrent";
import { useTorrentDetailsGeneralViewModel } from "@/modules/dashboard/hooks";
import { GlassPanel } from "@/shared/ui/layout/GlassPanel";
import { AlertPanel } from "@/shared/ui/layout/AlertPanel";
import { SmoothProgressBar } from "@/shared/ui/components/SmoothProgressBar";
import { ICON_STROKE_WIDTH } from "@/config/logic";
import { TEXT_ROLE } from "@/config/textRoles";
import { DETAILS } from "@/shared/ui/layout/glass-surface";

interface GeneralTabProps {
    torrent: TorrentDetail;
    downloadDir: string;
    activePeers: number;
    isRecoveryBlocked?: boolean;
}

export const GeneralTab = ({ torrent, downloadDir, activePeers, isRecoveryBlocked }: GeneralTabProps) => {
    const { t } = useTranslation();
    void activePeers;
    const general = useTorrentDetailsGeneralViewModel({
        torrent,
        downloadDir,
        isRecoveryBlocked,
        t,
    });

    const recoveryBlockedMessage = general.recoveryBlockedMessage;

    const isActive = general.isActive;
    const mainActionLabel = general.mainActionLabel;
    const ToggleIcon = isActive ? Pause : Play;

    return (
        <div className={DETAILS.generalRoot}>
            <GlassPanel className={DETAILS.generalCard}>
                <div className={DETAILS.generalHeaderRow}>
                    <div className={DETAILS.generalPrimaryCol}>
                        <div className={TEXT_ROLE.caption}>{t("torrent_modal.labels.save_path")}</div>
                        <code className={DETAILS.generalPathCode}>{downloadDir ?? torrent.downloadDir ?? torrent.savePath ?? ""}</code>
                    </div>
                    <div className={DETAILS.generalVerifyCol}>
                        <div className={TEXT_ROLE.caption}>{t("torrent_modal.controls.verify")}</div>
                        <div className={DETAILS.generalVerifyWrap}>
                            {(() => {
                                const p = torrent.verificationProgress ?? 0;
                                const percent = p > 1 ? p : p * 100;
                                return <SmoothProgressBar value={percent} trackClassName={DETAILS.generalVerificationTrack} indicatorClassName={DETAILS.generalVerificationIndicator} />;
                            })()}
                        </div>
                    </div>
                </div>
            </GlassPanel>

            {general.showMissingFilesError && (
                <AlertPanel severity="warning">
                    <div className={DETAILS.generalWarningStack}>
                        <span className={TEXT_ROLE.statusWarning}>{t("torrent_modal.errors.no_data_found_title")}</span>
                        <div className={DETAILS.generalProbeStack}>
                            {general.probeLines.map((line) => (
                                <span key={line}>{line}</span>
                            ))}
                        </div>
                        {general.classificationLabel && <div className={TEXT_ROLE.bodySmall}>{general.classificationLabel}</div>}
                        {recoveryBlockedMessage && <div className={DETAILS.generalRecoveryHint}>{recoveryBlockedMessage}</div>}
                    </div>
                </AlertPanel>
            )}
            {general.transmissionError && (
                <AlertPanel severity="danger">
                    <div className={DETAILS.generalWarningStack}>
                        <span className={TEXT_ROLE.statusWarning}>{t("torrent_modal.errors.transmission_error_title")}</span>
                        <div className={`${TEXT_ROLE.bodySmall} whitespace-pre-wrap`}>
                            {general.transmissionError}
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
                                    <Button size="md" variant="flat" color={isActive ? "default" : "primary"} onPress={general.onToggleStartStop} isDisabled={Boolean(isRecoveryBlocked)}>
                                        <>
                                            <ToggleIcon size={16} strokeWidth={ICON_STROKE_WIDTH} className={DETAILS.generalButtonIcon} />
                                            {mainActionLabel}
                                        </>
                                    </Button>
                                    {!isActive && (
                                        <Button size="md" variant="flat" color="primary" onPress={general.onStartNow} isDisabled={Boolean(isRecoveryBlocked)}>
                                            <>
                                                <Play size={16} strokeWidth={ICON_STROKE_WIDTH} className={DETAILS.generalButtonIcon} />
                                                {t("table.actions.start_now")}
                                            </>
                                        </Button>
                                    )}
                                    <Button size="md" variant="flat" color="default" onPress={general.onSetLocation} isDisabled={!general.canSetLocation}>
                                        <>
                                            <Folder size={16} strokeWidth={ICON_STROKE_WIDTH} className={DETAILS.generalButtonIcon} />
                                            {t("directory_browser.select", {
                                                name: t("torrent_modal.labels.save_path"),
                                            })}
                                        </>
                                    </Button>
                                    <Button
                                        size="md"
                                        variant="flat"
                                        color="warning"
                                        onPress={general.onDownloadMissing}
                                        isLoading={general.isDownloadMissingInFlight}
                                        isDisabled={
                                            Boolean(isRecoveryBlocked) ||
                                            general.isDownloadMissingInFlight ||
                                            !general.canDownloadMissing
                                        }
                                    >
                                        <>
                                            <Download size={16} strokeWidth={ICON_STROKE_WIDTH} className={DETAILS.generalButtonIcon} />
                                            {t("recovery.action_download")}
                                        </>
                                    </Button>
                                    <Button size="md" variant="flat" color="danger" onPress={general.openRemoveModal}>
                                        <>
                                            <Trash2 size={16} strokeWidth={ICON_STROKE_WIDTH} className={DETAILS.generalButtonIcon} />
                                            {t("toolbar.remove")}
                                        </>
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </GlassPanel>
                </div>
            </div>
            {general.showRemoveModal && (
                <RemoveConfirmationModal isOpen={general.showRemoveModal} onClose={general.closeRemoveModal} onConfirm={general.onConfirmRemove} torrentCount={1} torrentIds={[torrent.id]} />
            )}
        </div>
    );
};

export default GeneralTab;

// Recovery modal: keep at module bottom to avoid cluttering main render logic
