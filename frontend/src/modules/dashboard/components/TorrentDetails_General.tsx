// FILE: src/modules/dashboard/torrent-detail/GeneralTab.tsx
import { Button, Switch } from "@heroui/react";
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
import React, { useState } from "react";
import RemoveConfirmationModal from "@/modules/torrent-remove/components/RemoveConfirmationModal";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { TorrentDetail } from "@/modules/dashboard/types/torrent";
import { useRecoveryContext } from "@/app/context/RecoveryContext";
import { useTorrentCommands } from "@/app/context/TorrentCommandContext";
import type { CapabilityState } from "@/app/types/capabilities";
import { formatPercent, formatRatio } from "@/shared/utils/format";
import { GlassPanel } from "@/shared/ui/layout/GlassPanel";
import { SmoothProgressBar } from "@/shared/ui/components/SmoothProgressBar";
import { ICON_STROKE_WIDTH } from "@/config/logic";
import { writeClipboard } from "@/shared/utils/clipboard";
import { TEXT_ROLES } from "../hooks/utils/textRoles";
import StatusIcon from "@/shared/ui/components/StatusIcon";
import { ToolbarIconButton } from "@/shared/ui/layout/toolbar-button";
import {
    formatMissingFileDetails,
} from "@/modules/dashboard/utils/missingFiles";
import { useMissingFilesProbe } from "@/services/recovery/missingFilesStore";
import { useOpenTorrentFolder } from "@/app/hooks/useOpenTorrentFolder";
import STATUS from "@/shared/status";
import { SetLocationInlineEditor } from "@/modules/dashboard/components/SetLocationInlineEditor";
import {
    getSetLocationOutcomeMessage,
    getSurfaceCaptionKey,
} from "@/app/utils/setLocation";

interface GeneralTabProps {
    torrent: TorrentDetail;
    downloadDir: string;
    sequentialCapability: CapabilityState;
    superSeedingCapability: CapabilityState;
    onSequentialToggle?: (enabled: boolean) => Promise<void> | void;
    onSuperSeedingToggle?: (enabled: boolean) => Promise<void> | void;
    progressPercent: number;
    timeRemainingLabel: string;
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

const getTorrentKey = (
    entry?: { id?: string | number; hash?: string } | null
) => entry?.id?.toString() ?? entry?.hash ?? "";

export const GeneralTab = ({
    torrent,
    downloadDir,
    sequentialCapability: _sequentialCapability,
    superSeedingCapability: _superSeedingCapability,
    onSequentialToggle: _onSequentialToggle,
    onSuperSeedingToggle: _onSuperSeedingToggle,
    progressPercent: _progressPercent,
    timeRemainingLabel: _timeRemainingLabel,
    activePeers,
    isRecoveryBlocked,
}: GeneralTabProps) => {
    const { t } = useTranslation();
    const handleCopyHash = () => writeClipboard(torrent.hash);

    const renderCapabilityNote = (state: CapabilityState) => {
        if (state === "supported") return null;
        const message =
            state === "unsupported"
                ? t("torrent_modal.controls.not_supported")
                : t("torrent_modal.controls.capability_probe_pending");
        return <span className="text-scaled text-warning">{message}</span>;
    };

    const peerCount = activePeers;
    const {
        serverClass,
        handleSetLocation,
        handleDownloadMissing,
        inlineSetLocationState,
        cancelInlineSetLocation,
        confirmInlineSetLocation,
        handleInlineLocationChange,
        setLocationCapability,
        getLocationOutcome,
        canOpenFolder,
        connectionMode,
    } = useRecoveryContext();
    const currentTorrentKey = getTorrentKey(torrent);
    const outcomeMessage = getSetLocationOutcomeMessage(
        getLocationOutcome("general-tab", currentTorrentKey),
        "general-tab",
        connectionMode
    );
    const unsupportedLocationMessage =
        outcomeMessage && t(outcomeMessage.labelKey);
    const probe = useMissingFilesProbe(torrent.id);
    const probeMode =
        serverClass === "tinytorrent"
            ? "local"
            : serverClass === "transmission"
            ? "remote"
            : "unknown";
    const probeLines = formatMissingFileDetails(t, probe);

    const effectiveState =
        torrent.errorEnvelope?.recoveryState &&
        torrent.errorEnvelope.recoveryState !== "ok"
            ? torrent.errorEnvelope.recoveryState
            : torrent.state;

    const showMissingFilesError =
        effectiveState === STATUS.torrent.MISSING_FILES;

    const openFolder = useOpenTorrentFolder();
    const currentPath =
        downloadDir ?? torrent.savePath ?? torrent.downloadDir ?? "";

    const { handleTorrentAction } = useTorrentCommands();
    const canSetLocation =
        setLocationCapability.canBrowse || setLocationCapability.supportsManual;
    const handleSetLocationAction = () => {
        if (!handleSetLocation) return;
        void handleSetLocation(torrent, { surface: "general-tab" });
    };

    const inlineEditorKey = inlineSetLocationState?.torrentKey ?? "";
    const showInlineEditor =
        inlineSetLocationState?.surface === "general-tab" &&
        inlineEditorKey &&
        inlineEditorKey === currentTorrentKey;
    const generalIsVerifying =
        inlineSetLocationState?.status === "verifying";
    const generalIsBusy = inlineSetLocationState?.status !== "idle";
    const generalStatusMessage = generalIsVerifying
        ? t("recovery.status.applying_location")
        : undefined;
    const generalCaption = t(getSurfaceCaptionKey("general-tab"));

    const handleResumeAction = () => {
        void handleTorrentAction("resume", torrent);
    };

    const stateKey = typeof torrent.state === "string" ? torrent.state : "unknown";
    const statusLabelKey = `table.status_${stateKey}`;
    const statusLabel = t(statusLabelKey, {
        defaultValue: stateKey.replace(/_/g, " "),
    });

    const recoveryStateLabel = torrent.errorEnvelope?.errorClass
        ? t(`recovery.class.${torrent.errorEnvelope.errorClass}`)
        : statusLabel;
    const statusIconClass = showMissingFilesError
        ? "text-warning/70"
        : "text-foreground/60";

    const mainAction = handleResumeAction;
    const mainLabel = t("toolbar.resume");
    const downloadRate = torrent.speed?.down ?? 0;
    const uploadRate = torrent.speed?.up ?? 0;
    const recoveryBlockedMessage = isRecoveryBlocked
        ? t("recovery.status.blocked")
        : null;

    const handlePauseAction = () => {
        console.warn(
            "pause action requires a typed onPause handler; global events removed"
        );
    };

    const [showRemoveModal, setShowRemoveModal] = useState(false);

    const handleRemoveAction = () => {
        setShowRemoveModal(true);
    };

    const handleRemoveConfirm = async (deleteData: boolean) => {
        setShowRemoveModal(false);
        const action = deleteData ? "remove-with-data" : "remove";
        try {
            await handleTorrentAction(action, torrent);
        } catch (err) {
            console.error("remove torrent action failed", err);
        }
    };

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

    const isActive =
        torrent.state === "downloading" || torrent.state === "seeding";
    const mainActionLabel = isActive ? t("toolbar.pause") : t("toolbar.resume");

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
            {showInlineEditor && inlineSetLocationState && (
                <SetLocationInlineEditor
                    value={inlineSetLocationState.inputPath}
                    error={inlineSetLocationState.error}
                    isBusy={generalIsBusy}
                    caption={generalCaption}
                    statusMessage={generalStatusMessage}
                    disableCancel={generalIsVerifying}
                    onChange={handleInlineLocationChange}
                    onSubmit={() => void confirmInlineSetLocation()}
                    onCancel={cancelInlineSetLocation}
                />
            )}

            {showMissingFilesError && (
                <GlassPanel className="p-panel border border-warning/30 bg-warning/10">
                    <div className="flex flex-col gap-tools">
                        <span className="text-scaled font-semibold uppercase tracking-tight text-warning">
                            {t("torrent_modal.errors.no_data_found_title")}
                        </span>
                        <div className="flex flex-col gap-tight text-label font-mono text-warning/80">
                            {probeLines.map((line) => (
                                <span key={line}>{line}</span>
                            ))}
                        </div>
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
                                onPress={() =>
                                    handleDownloadMissing?.(torrent)
                                }
                                isDisabled={!handleDownloadMissing}
                                className="h-auto"
                            >
                                {t("recovery.action_download")}
                            </Button>
                            <Button
                                variant="light"
                                size="md"
                                color="default"
                                onPress={() => void openFolder(currentPath)}
                                isDisabled={!currentPath || !canOpenFolder}
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
                                        onPress={() => {
                                            if (isActive) handlePauseAction();
                                            else handleResumeAction();
                                        }}
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
                                        onPress={() =>
                                            void handleSetLocationAction()
                                        }
                                        isDisabled={!canSetLocation}
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
                                        onPress={() => handleRemoveAction()}
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
                                {unsupportedLocationMessage && (
                                    <div className="text-label text-warning/80">
                                        {unsupportedLocationMessage}
                                    </div>
                                )}
                            </div>
                        </div>
                    </GlassPanel>
                </div>
            </div>
            {showRemoveModal && (
                <RemoveConfirmationModal
                    isOpen={showRemoveModal}
                    onClose={() => setShowRemoveModal(false)}
                    onConfirm={handleRemoveConfirm}
                    torrentCount={1}
                    torrentIds={[torrent.id]}
                />
            )}
        </div>
    );
};

export default GeneralTab;

// Recovery modal: keep at module bottom to avoid cluttering main render logic
