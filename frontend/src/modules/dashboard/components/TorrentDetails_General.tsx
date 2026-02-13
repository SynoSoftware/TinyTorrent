// FILE: src/modules/dashboard/torrent-detail/GeneralTab.tsx
import { Button } from "@heroui/react";
import {
    Folder,
    Play,
    Pause,
    Trash2,
} from "lucide-react";
import React from "react";
import RemoveConfirmationModal from "@/modules/torrent-remove/components/RemoveConfirmationModal";
import { useTranslation } from "react-i18next";
import type { TorrentDetail } from "@/modules/dashboard/types/torrent";
import { useTorrentDetailsGeneralViewModel } from "@/modules/dashboard/hooks/useTorrentDetailsGeneralViewModel";
import { GlassPanel } from "@/shared/ui/layout/GlassPanel";
import { AlertPanel } from "@/shared/ui/layout/AlertPanel";
import { SmoothProgressBar } from "@/shared/ui/components/SmoothProgressBar";
import { ICON_STROKE_WIDTH } from "@/config/logic";
import { TEXT_ROLE } from "@/config/textRoles";
import { SetLocationEditor } from "@/modules/dashboard/components/SetLocationEditor";
import { DETAIL_VIEW_CLASS } from "@/shared/ui/layout/glass-surface";

interface GeneralTabProps {
    torrent: TorrentDetail;
    downloadDir: string;
    activePeers: number;
    isRecoveryBlocked?: boolean;
}

export const GeneralTab = ({
    torrent,
    downloadDir,
    activePeers,
    isRecoveryBlocked,
}: GeneralTabProps) => {
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
        <div className={DETAIL_VIEW_CLASS.generalRoot}>
            <GlassPanel
                className={DETAIL_VIEW_CLASS.generalCard}
            >
                <div className={DETAIL_VIEW_CLASS.generalHeaderRow}>
                    <div className={DETAIL_VIEW_CLASS.generalPrimaryCol}>
                        <div className={TEXT_ROLE.caption}>
                            {t("torrent_modal.labels.save_path")}
                        </div>
                        <code
                            className={DETAIL_VIEW_CLASS.generalPathCode}
                        >
                            {downloadDir ?? torrent.downloadDir ?? torrent.savePath ?? ""}
                        </code>
                    </div>
                    <div className={DETAIL_VIEW_CLASS.generalVerifyCol}>
                        <div className={TEXT_ROLE.caption}>
                            {t("torrent_modal.controls.verify")}
                        </div>
                        <div className={DETAIL_VIEW_CLASS.generalVerifyWrap}>
                            {(() => {
                                const p = torrent.verificationProgress ?? 0;
                                const percent = p > 1 ? p : p * 100;
                                return (
                                    <SmoothProgressBar
                                        value={percent}
                                        trackClassName={DETAIL_VIEW_CLASS.generalVerificationTrack}
                                        indicatorClassName={
                                            DETAIL_VIEW_CLASS.generalVerificationIndicator
                                        }
                                    />
                                );
                            })()}
                        </div>
                    </div>
                </div>
            </GlassPanel>
            {general.showLocationEditor && general.setLocationEditorState && (
                <SetLocationEditor
                    value={general.setLocationEditorState.inputPath}
                    error={general.setLocationEditorState.error}
                    isBusy={general.generalIsBusy}
                    caption={general.generalCaption}
                    statusMessage={general.generalStatusMessage}
                    disableCancel={general.generalIsVerifying}
                    onChange={general.onLocationChange}
                    onSubmit={() => void general.onLocationSubmit()}
                    onCancel={general.onLocationCancel}
                />
            )}

            {general.showMissingFilesError && (
                <AlertPanel severity="warning">
                    <div className={DETAIL_VIEW_CLASS.generalWarningStack}>
                        <span className={TEXT_ROLE.statusWarning}>
                            {t("torrent_modal.errors.no_data_found_title")}
                        </span>
                        <div className={DETAIL_VIEW_CLASS.generalProbeStack}>
                            {general.probeLines.map((line) => (
                                <span key={line}>{line}</span>
                            ))}
                        </div>
                        {general.classificationLabel && (
                            <div className={TEXT_ROLE.bodySmall}>
                                {general.classificationLabel}
                            </div>
                        )}
                        {recoveryBlockedMessage && (
                            <div className={DETAIL_VIEW_CLASS.generalRecoveryHint}>
                                {recoveryBlockedMessage}
                            </div>
                        )}
                    </div>
                </AlertPanel>
            )}

            <div className={DETAIL_VIEW_CLASS.generalControlsGrid}>
                <div className={DETAIL_VIEW_CLASS.generalControlsSpan}>
                    <GlassPanel
                        className={DETAIL_VIEW_CLASS.generalCard}
                    >
                        <div className={DETAIL_VIEW_CLASS.generalHeaderRow}>
                            <div>
                                <div className={TEXT_ROLE.caption}>
                                    {t("torrent_modal.controls.title")}
                                </div>
                                <div className={DETAIL_VIEW_CLASS.generalControlsDescription}>
                                    {t("torrent_modal.controls.description")}
                                </div>
                            </div>
                            <div className={DETAIL_VIEW_CLASS.generalControlsMeta}>
                                <div className={DETAIL_VIEW_CLASS.generalControlsActions}>
                                    {/* Force reannounce moved to Trackers tab per UX decision */}
                                    <Button
                                        size="md"
                                        variant="flat"
                                        color={isActive ? "default" : "primary"}
                                        onPress={general.onToggleStartStop}
                                        isDisabled={Boolean(isRecoveryBlocked)}
                                    >
                                        <>
                                            <ToggleIcon
                                                size={16}
                                                strokeWidth={ICON_STROKE_WIDTH}
                                                className={DETAIL_VIEW_CLASS.generalButtonIcon}
                                            />
                                            {mainActionLabel}
                                        </>
                                    </Button>
                                    <Button
                                        size="md"
                                        variant="flat"
                                        color="default"
                                        onPress={general.onSetLocation}
                                        isDisabled={!general.canSetLocation}
                                    >
                                        <>
                                            <Folder
                                                size={16}
                                                strokeWidth={
                                                    ICON_STROKE_WIDTH
                                                }
                                                className={DETAIL_VIEW_CLASS.generalButtonIcon}
                                            />
                                            {t("directory_browser.select", {
                                                name: t(
                                                    "torrent_modal.labels.save_path"
                                                ),
                                            })}
                                        </>
                                    </Button>
                                    <Button
                                        size="md"
                                        variant="flat"
                                        color="danger"
                                        onPress={general.openRemoveModal}
                                    >
                                        <>
                                            <Trash2
                                                size={16}
                                                strokeWidth={ICON_STROKE_WIDTH}
                                                className={DETAIL_VIEW_CLASS.generalButtonIcon}
                                            />
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
                <RemoveConfirmationModal
                    isOpen={general.showRemoveModal}
                    onClose={general.closeRemoveModal}
                    onConfirm={general.onConfirmRemove}
                    torrentCount={1}
                    torrentIds={[torrent.id]}
                />
            )}
        </div>
    );
};

export default GeneralTab;

// Recovery modal: keep at module bottom to avoid cluttering main render logic

