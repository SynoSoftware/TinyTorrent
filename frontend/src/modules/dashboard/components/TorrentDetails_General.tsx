// FILE: src/modules/dashboard/torrent-detail/GeneralTab.tsx
import { Button } from "@heroui/react";
import {
    ArrowDownCircle,
    ArrowUpCircle,
    Copy,
    Folder,
    Hash,
    Play,
    Pause,
    CheckCircle,
    RefreshCw,
    Trash2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import React from "react";
import RemoveConfirmationModal from "@/modules/torrent-remove/components/RemoveConfirmationModal";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { TorrentDetail } from "@/modules/dashboard/types/torrent";
import { useTorrentDetailsGeneralViewModel } from "@/modules/dashboard/hooks/useTorrentDetailsGeneralViewModel";
import { GlassPanel } from "@/shared/ui/layout/GlassPanel";
import { SmoothProgressBar } from "@/shared/ui/components/SmoothProgressBar";
import { ICON_STROKE_WIDTH } from "@/config/logic";
import { writeClipboard } from "@/shared/utils/clipboard";
import { TEXT_ROLES } from "../hooks/utils/textRoles";
import StatusIcon from "@/shared/ui/components/StatusIcon";
import { ToolbarIconButton } from "@/shared/ui/layout/toolbar-button";
import { SetLocationInlineEditor } from "@/modules/dashboard/components/SetLocationInlineEditor";

interface GeneralTabProps {
    torrent: TorrentDetail;
    downloadDir: string;
    activePeers: number;
    isRecoveryBlocked?: boolean;
}

interface GeneralInfoCardProps {
    icon: LucideIcon;
    label: string;
    value: ReactNode;
    helper: string;
    accent?: string;
}

const GeneralInfoCard = ({
    icon: Icon,
    label,
    value,
    helper,
    accent,
}: GeneralInfoCardProps) => (
    <GlassPanel className="p-panel">
        <div className="flex items-start gap-tools">
            <div className="flex size-icon-btn-lg items-center justify-center rounded-xl border border-content1/20 bg-content1/30">
                <StatusIcon
                    Icon={Icon}
                    size="lg"
                    className={accent ?? "text-foreground/70"}
                    strokeWidth={ICON_STROKE_WIDTH}
                />
            </div>
            <div className="flex-1">
                <div className={TEXT_ROLES.label}>{label}</div>
                <div className={`${TEXT_ROLES.primary} font-mono`}>{value}</div>
                <div className={TEXT_ROLES.helper}>{helper}</div>
            </div>
        </div>
    </GlassPanel>
);

export const GeneralTab = ({
    torrent,
    downloadDir,
    activePeers,
    isRecoveryBlocked,
}: GeneralTabProps) => {
    const { t } = useTranslation();
    const handleCopyHash = () => writeClipboard(torrent.hash);

    const peerCount = activePeers;
    const general = useTorrentDetailsGeneralViewModel({
        torrent,
        downloadDir,
        isRecoveryBlocked,
        t,
    });

    const stateKey = typeof torrent.state === "string" ? torrent.state : "unknown";
    const statusLabelKey = `table.status_${stateKey}`;
    const statusLabel = t(statusLabelKey, {
        defaultValue: stateKey.replace(/_/g, " "),
    });

    const recoveryStateLabel = torrent.errorEnvelope?.errorClass
        ? t(`recovery.class.${torrent.errorEnvelope.errorClass}`)
        : statusLabel;
    const statusIconClass = general.showMissingFilesError
        ? "text-warning/70"
        : "text-foreground/60";

    const recoveryBlockedMessage = general.recoveryBlockedMessage;

    const getIconForAction = (id: string | null | undefined) => {
        switch (id) {
            case "resume":
                return Play;
            case "forceRecheck":
                return CheckCircle;
            case "setLocation":
            case "changeLocation":
                return Folder;
            case "reDownload":
                return ArrowDownCircle;
            case "reannounce":
                return RefreshCw;
            case "pause":
                return Pause;
            case "remove":
            case "delete":
                return Trash2;
            default:
                return null;
        }
    };

    const isActive = general.isActive;
    const mainActionLabel = general.mainActionLabel;

    return (
        <div className="space-y-stage">
            <GlassPanel className="p-panel space-y-3 bg-content1/30 border border-content1/20">
                <div className="flex items-center justify-between">
                    <div className="flex-1">
                        <div className="text-label text-foreground/60">
                            {t("torrent_modal.labels.save_path")}
                        </div>
                        <code className="font-mono text-scaled text-foreground/70 bg-content1/20 px-tight py-tight rounded wrap-break-word mt-2">
                            {downloadDir ?? torrent.downloadDir ?? torrent.savePath ?? ""}
                        </code>
                    </div>
                    <div className="w-1/3 pl-4">
                        <div className="text-label text-foreground/60">
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
            {general.showInlineEditor && general.inlineSetLocationState && (
                <SetLocationInlineEditor
                    value={general.inlineSetLocationState.inputPath}
                    error={general.inlineSetLocationState.error}
                    isBusy={general.generalIsBusy}
                    caption={general.generalCaption}
                    statusMessage={general.generalStatusMessage}
                    disableCancel={general.generalIsVerifying}
                    onChange={general.onInlineChange}
                    onSubmit={() => void general.onInlineSubmit()}
                    onCancel={general.onInlineCancel}
                />
            )}

            {general.showMissingFilesError && (
                <GlassPanel className="p-panel border border-warning/30 bg-warning/10">
                    <div className="flex flex-col gap-tools">
                        <span className="text-scaled font-semibold uppercase tracking-tight text-warning">
                            {t("torrent_modal.errors.no_data_found_title")}
                        </span>
                        <div className="flex flex-col gap-tight text-label font-mono text-warning/80">
                            {general.probeLines.map((line) => (
                                <span key={line}>{line}</span>
                            ))}
                        </div>
                        {general.classificationLabel && (
                            <div className="text-label text-foreground/70">
                                {general.classificationLabel}
                            </div>
                        )}
                        {recoveryBlockedMessage && (
                            <div className="text-label text-warning/80">
                                {recoveryBlockedMessage}
                            </div>
                        )}
                        <div className="flex flex-wrap gap-tight pt-tight">
                            <Button
                                variant="shadow"
                                size="md"
                                color="primary"
                                onPress={general.onDownloadMissing}
                                className="h-auto"
                            >
                                {t("recovery.action_download")}
                            </Button>
                            <Button
                                variant="light"
                                size="md"
                                color="default"
                                onPress={general.onOpenFolder}
                                isDisabled={
                                    !general.currentPath || !general.canOpenFolder
                                }
                                className="h-auto"
                            >
                                {t("recovery.action_open_folder")}
                            </Button>
                        </div>
                    </div>
                </GlassPanel>
            )}

            <div className="grid gap-tools sm:grid-cols-2">
                <div className="col-span-2">
                    <GlassPanel className="p-panel space-y-4 bg-content1/30 border border-content1/20">
                        <div className="flex items-center justify-between">
                            <div>
                                <div className="text-label text-foreground/60">
                                    {t("torrent_modal.controls.title")}
                                </div>
                                <div className="text-scaled text-foreground/50">
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
                                        {(() => {
                                            const Icon = getIconForAction(
                                                isActive ? "pause" : "resume"
                                            );
                                            return (
                                                <>
                                                    {Icon && (
                                                        <Icon
                                                            size={16}
                                                            strokeWidth={
                                                                ICON_STROKE_WIDTH
                                                            }
                                                            className="mr-2"
                                                        />
                                                    )}
                                                    {mainActionLabel}
                                                </>
                                            );
                                        })()}
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
