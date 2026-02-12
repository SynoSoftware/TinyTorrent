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
import { ICON_STROKE_WIDTH, SURFACE_BORDER } from "@/config/logic";
import { TEXT_ROLE, withColor, withOpacity } from "@/config/textRoles";
import { SetLocationEditor } from "@/modules/dashboard/components/SetLocationEditor";

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
        <div className="space-y-stage">
            <GlassPanel
                className={`p-panel space-y-3 bg-content1/30 border ${SURFACE_BORDER}`}
            >
                <div className="flex items-center justify-between">
                    <div className="flex-1">
                        <div className={TEXT_ROLE.caption}>
                            {t("torrent_modal.labels.save_path")}
                        </div>
                        <code
                            className={`${TEXT_ROLE.codeMuted} bg-content1/20 px-tight py-tight rounded wrap-break-word mt-2`}
                        >
                            {downloadDir ?? torrent.downloadDir ?? torrent.savePath ?? ""}
                        </code>
                    </div>
                    <div className="w-1/3 pl-4">
                        <div className={TEXT_ROLE.caption}>
                            {t("torrent_modal.controls.verify")}
                        </div>
                        <div className="mt-2">
                            {(() => {
                                const p = torrent.verificationProgress ?? 0;
                                const percent = p > 1 ? p : p * 100;
                                return (
                                    <SmoothProgressBar
                                        value={percent}
                                        trackClassName="h-3 bg-transparent"
                                        indicatorClassName="h-3 bg-gradient-to-r from-primary to-success"
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
                    <div className="flex flex-col gap-tools">
                        <span className={TEXT_ROLE.statusWarning}>
                            {t("torrent_modal.errors.no_data_found_title")}
                        </span>
                        <div className={`flex flex-col gap-tight ${TEXT_ROLE.codeMuted} text-warning/80`}>
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
                            <div className={`${withColor(TEXT_ROLE.caption, "warning")} text-warning/80`}>
                                {recoveryBlockedMessage}
                            </div>
                        )}
                    </div>
                </AlertPanel>
            )}

            <div className="grid gap-tools sm:grid-cols-2">
                <div className="col-span-2">
                    <GlassPanel
                        className={`p-panel space-y-4 bg-content1/30 border ${SURFACE_BORDER}`}
                    >
                        <div className="flex items-center justify-between">
                            <div>
                                <div className={TEXT_ROLE.caption}>
                                    {t("torrent_modal.controls.title")}
                                </div>
                                <div className={withOpacity(TEXT_ROLE.body, 50)}>
                                    {t("torrent_modal.controls.description")}
                                </div>
                            </div>
                            <div className="flex flex-col gap-tight">
                                <div className="flex items-center gap-tools">
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
                                                className="mr-2"
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
                                                className="mr-2"
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
                                                className="mr-2"
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

