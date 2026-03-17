import { Checkbox } from "@heroui/react";
import { Copy, Folder } from "lucide-react";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
    getCapabilityHintKey,
    getCapabilityUiState,
    type CapabilityState,
} from "@/app/types/capabilities";
import type { DashboardDetailViewModel } from "@/app/viewModels/useAppViewModel";
import { useActionFeedback } from "@/app/hooks/useActionFeedback";
import { useTorrentClipboard } from "@/modules/dashboard/hooks/useTorrentClipboard";
import SetDownloadPathModal from "@/modules/dashboard/components/SetDownloadPathModal";
import { formatQueueOrdinal } from "@/modules/dashboard/components/TorrentTable_ColumnDefs";
import { getTorrentEtaDisplay } from "@/modules/dashboard/components/TorrentEtaDisplay";
import { TorrentProgressDisplay } from "@/modules/dashboard/components/TorrentProgressDisplay";
import { getTorrentCompactSpeedValue } from "@/modules/dashboard/components/TorrentTable_SpeedColumnCell";
import { TorrentTable_StatusCell } from "@/modules/dashboard/components/TorrentTable_StatusColumnCell";
import type { TorrentDetailEntity, TorrentTrackerEntity } from "@/services/rpc/entities";
import {
    torrentHeadlineFields,
    torrentHeadlineOrder,
    type TorrentHeadlineFieldId,
} from "@/modules/dashboard/utils/torrentHeadlineFields";
import {
    DETAILS,
    FORM_CONTROL,
} from "@/shared/ui/layout/glass-surface";
import { ToolbarIconButton } from "@/shared/ui/layout/toolbar-button";
import { useUiClock } from "@/shared/hooks/useUiClock";
import { formatBytes, formatDate, formatRelativeTime, formatSpeed, formatTime } from "@/shared/utils/format";

interface GeneralTabProps {
    torrent: TorrentDetailEntity;
    isDetailFullscreen: boolean;
    sequentialDownloadCapability: CapabilityState;
    onTorrentAction: DashboardDetailViewModel["tabs"]["general"]["handleTorrentAction"];
    onSequentialToggle: DashboardDetailViewModel["tabs"]["general"]["handleSequentialToggle"];
    setLocation: DashboardDetailViewModel["tabs"]["general"]["setLocation"];
    optimisticStatus?: DashboardDetailViewModel["optimisticStatus"];
}

type DisplayRow = {
    key: string;
    label: string;
    value: ReactNode;
    actions?: ReactNode;
    block?: boolean;
};

type SectionProps = {
    title: string;
    description?: string;
    rows: DisplayRow[];
};

const findPrimaryTracker = (trackers?: TorrentTrackerEntity[]): TorrentTrackerEntity | null => {
    if (!trackers?.length) {
        return null;
    }

    return (
        [...trackers].sort((left, right) => {
            if (left.tier !== right.tier) {
                return left.tier - right.tier;
            }
            if (Boolean(left.isBackup) !== Boolean(right.isBackup)) {
                return left.isBackup ? 1 : -1;
            }
            return (left.id ?? Number.MAX_SAFE_INTEGER) - (right.id ?? Number.MAX_SAFE_INTEGER);
        })[0] ?? null
    );
};

const formatLimitValue = (
    isLimited: boolean | undefined,
    limit: number | undefined,
    infiniteLabel: string,
    unknownLabel: string,
) => {
    if (!isLimited) {
        return infiniteLabel;
    }
    if (typeof limit === "number" && Number.isFinite(limit) && limit >= 0) {
        return formatSpeed(limit);
    }
    return unknownLabel;
};

const renderDirectionalPeerValue = ({
    downloadingFrom,
    uploadingTo,
    t,
}: {
    downloadingFrom: number | undefined;
    uploadingTo: number | undefined;
    t: ReturnType<typeof useTranslation>["t"];
}) => (
    <div className={DETAILS.generalMetricPair}>
        <span>
            {t("torrent_modal.general.values.downloading_from_count", {
                count: downloadingFrom ?? 0,
            })}
        </span>
        <span className={DETAILS.generalMetricMuted}>/</span>
        <span>
            {t("torrent_modal.general.values.uploading_to_count", {
                count: uploadingTo ?? 0,
            })}
        </span>
    </div>
);

const SummarySection = ({
    torrent,
    optimisticStatus,
    t,
}: {
    torrent: TorrentDetailEntity;
    optimisticStatus?: DashboardDetailViewModel["optimisticStatus"];
    t: ReturnType<typeof useTranslation>["t"];
}) => {
    const eta = getTorrentEtaDisplay(torrent, t);
    const speedValue = getTorrentCompactSpeedValue(torrent);

    const rows = useMemo<DisplayRow[]>(() => {
        const renderValueByFieldId: Record<TorrentHeadlineFieldId, ReactNode> = {
            name: <span className={DETAILS.generalSummaryName}>{torrent.name}</span>,
            speed: speedValue !== null ? formatSpeed(speedValue) : t("labels.unknown"),
            queue: formatQueueOrdinal(torrent.queuePosition),
            peers: String(torrent.peerSummary.connected ?? 0),
            uploadingTo: String(torrent.peerSummary.sending ?? 0),
            downloadingFrom: String(torrent.peerSummary.getting ?? 0),
            size: formatBytes(torrent.totalSize),
            status: (
                <div className={DETAILS.generalSummaryStatus}>
                    <TorrentTable_StatusCell torrent={torrent} t={t} optimisticStatus={optimisticStatus} />
                </div>
            ),
            eta: <span title={eta.tooltip}>{eta.value}</span>,
            progress: <TorrentProgressDisplay torrent={torrent} optimisticStatus={optimisticStatus} />,
            added: <span title={formatDate(torrent.added)}>{formatRelativeTime(torrent.added)}</span>,
        };

        return torrentHeadlineOrder.map((fieldId) => ({
            key: fieldId,
            label: t(
                torrentHeadlineFields[fieldId].summaryLabelKey ??
                    torrentHeadlineFields[fieldId].tableLabelKey ??
                    "labels.unknown",
            ),
            value: renderValueByFieldId[fieldId],
            block: fieldId === "progress",
        }));
    }, [eta.tooltip, eta.value, optimisticStatus, speedValue, t, torrent]);

    return (
        <SectionBlock
            title={t("torrent_modal.general.sections.summary")}
            description={t("torrent_modal.general.sections.summary_description")}
            rows={rows}
            summary
        />
    );
};

function SectionBlock({ title, description, rows, summary = false }: SectionProps & { summary?: boolean }) {
    return (
        <section className={DETAILS.generalSection}>
            <div className={DETAILS.generalSectionHeader}>
                <div className={DETAILS.generalSectionHeading}>
                    <h3 className={DETAILS.generalSectionTitle}>{title}</h3>
                    {description ? <p className={DETAILS.generalSectionDescription}>{description}</p> : null}
                </div>
            </div>
            <div className={summary ? DETAILS.generalSummaryGrid : DETAILS.generalMetricGrid}>
                {rows.map((row) => (
                    <div key={row.key} className={row.block ? DETAILS.generalMetricRowBlock : DETAILS.generalMetricRow}>
                        <div className={DETAILS.generalMetricContent}>
                            <div className={DETAILS.generalMetricLabel}>{row.label}</div>
                            <div className={row.block ? DETAILS.generalMetricValueBlock : DETAILS.generalMetricValue}>
                                {row.value}
                            </div>
                        </div>
                        {row.actions ? <div className={DETAILS.generalMetricActions}>{row.actions}</div> : null}
                    </div>
                ))}
            </div>
        </section>
    );
}

export const GeneralTab = ({
    torrent,
    isDetailFullscreen,
    sequentialDownloadCapability,
    onSequentialToggle,
    setLocation,
    optimisticStatus,
}: GeneralTabProps) => {
    const { t } = useTranslation();
    const { showFeedback } = useActionFeedback();
    const { copyToClipboard } = useTorrentClipboard();
    const [showSetDownloadPathModal, setShowSetDownloadPathModal] = useState(false);
    const { lastTickAt } = useUiClock();
    const nowSeconds = Math.floor(lastTickAt / 1000);

    const primaryTracker = useMemo(() => findPrimaryTracker(torrent.trackers), [torrent.trackers]);

    const unavailableLabel = t("torrent_modal.general.values.unavailable");
    const unknownLabel = t("labels.unknown");
    const infiniteLabel = t("torrent_modal.general.values.infinite");
    const notCompletedLabel = t("torrent_modal.general.values.not_completed");
    const sequentialUiState = getCapabilityUiState(
        sequentialDownloadCapability,
    );
    const sequentialHelperText = t(
        getCapabilityHintKey(sequentialDownloadCapability),
    );

    const handleCopyHash = useCallback(async () => {
        const outcome = await copyToClipboard(torrent.hash);
        if (outcome.status === "copied") {
            showFeedback(t("torrent_modal.general.feedback.hash_copied"), "success");
            return;
        }
        if (outcome.status === "unsupported") {
            showFeedback(t("torrent_modal.general.feedback.clipboard_unavailable"), "warning");
            return;
        }
        showFeedback(t("torrent_modal.general.feedback.hash_copy_failed"), "danger");
    }, [copyToClipboard, showFeedback, t, torrent.hash]);

    const openSetDownloadPathModal = useCallback(() => {
        setShowSetDownloadPathModal(true);
    }, []);

    const closeSetDownloadPathModal = useCallback(() => {
        setShowSetDownloadPathModal(false);
    }, []);

    const transferRows = useMemo<DisplayRow[]>(() => {
        const rows: DisplayRow[] = [
            {
                key: "time-active",
                label: t("torrent_modal.general.fields.time_active"),
                value: formatTime((torrent.secondsDownloading ?? 0) + (torrent.secondsSeeding ?? 0)),
            },
            {
                key: "connections",
                label: t("torrent_modal.general.fields.connections"),
                value: String(torrent.peerSummary.connected ?? 0),
            },
            {
                key: "downloaded",
                label: t("torrent_modal.general.fields.downloaded"),
                value: formatBytes(torrent.downloaded),
            },
            {
                key: "uploaded",
                label: t("torrent_modal.general.fields.uploaded"),
                value: formatBytes(torrent.uploaded),
            },
            {
                key: "download-speed",
                label: t("torrent_modal.general.fields.download_speed"),
                value: formatSpeed(torrent.speed.down),
            },
            {
                key: "upload-speed",
                label: t("torrent_modal.general.fields.upload_speed"),
                value: formatSpeed(torrent.speed.up),
            },
            {
                key: "peers",
                label: t("torrent_modal.general.fields.peers"),
                value: renderDirectionalPeerValue({
                    downloadingFrom: torrent.peerSummary.getting,
                    uploadingTo: torrent.peerSummary.sending,
                    t,
                }),
            },
            {
                key: "seeds",
                label: t("torrent_modal.general.fields.seeds"),
                value:
                    typeof primaryTracker?.seederCount === "number" && primaryTracker.seederCount >= 0 ? (
                        String(primaryTracker.seederCount)
                    ) : (
                        <span className={DETAILS.generalUnavailable}>{unavailableLabel}</span>
                    ),
            },
            {
                key: "download-limit",
                label: t("torrent_modal.general.fields.download_limit"),
                value: formatLimitValue(torrent.downloadLimited, torrent.downloadLimit, infiniteLabel, unknownLabel),
            },
            {
                key: "upload-limit",
                label: t("torrent_modal.general.fields.upload_limit"),
                value: formatLimitValue(torrent.uploadLimited, torrent.uploadLimit, infiniteLabel, unknownLabel),
            },
        ];

        if (!isDetailFullscreen) {
            rows.splice(1, 0, {
                key: "eta",
                label: t("torrent_modal.general.fields.eta"),
                value: getTorrentEtaDisplay(torrent, t).value,
            });
        }

        rows.push({
            key: "wasted",
            label: t("torrent_modal.general.fields.wasted"),
            value: formatBytes(torrent.corruptEver ?? 0),
        });

        if (
            typeof primaryTracker?.nextAnnounceTime === "number" &&
            primaryTracker.nextAnnounceTime > nowSeconds
        ) {
            rows.push({
                key: "reannounce-in",
                label: t("torrent_modal.general.fields.reannounce_in"),
                value: formatTime(primaryTracker.nextAnnounceTime - nowSeconds),
            });
        }

        rows.push({
            key: "sequential-download",
            label: t("torrent_modal.controls.title"),
            value: (
                <div className={DETAILS.generalProgressWrap}>
                    <Checkbox
                        isSelected={Boolean(torrent.sequentialDownload)}
                        isDisabled={sequentialUiState.disabled}
                        onValueChange={(enabled) => {
                            void onSequentialToggle(enabled);
                        }}
                        classNames={FORM_CONTROL.checkboxLabelBodySmallClassNames}
                    >
                        {t("torrent_modal.controls.sequential")}
                    </Checkbox>
                    <span className={DETAILS.generalMetricMuted}>
                        {sequentialHelperText}
                    </span>
                </div>
            ),
            block: true,
        });

        return rows;
    }, [
        infiniteLabel,
        isDetailFullscreen,
        nowSeconds,
        onSequentialToggle,
        primaryTracker,
        sequentialHelperText,
        sequentialUiState.disabled,
        t,
        torrent,
        unavailableLabel,
        unknownLabel,
    ]);

    const informationRows = useMemo<DisplayRow[]>(() => {
        const rows: DisplayRow[] = [
            {
                key: "pieces",
                label: t("torrent_modal.general.fields.pieces"),
                value:
                    typeof torrent.pieceCount === "number" && typeof torrent.pieceSize === "number"
                        ? t("torrent_modal.general.values.pieces", {
                              count: torrent.pieceCount,
                              size: formatBytes(torrent.pieceSize),
                          })
                        : unknownLabel,
            },
            {
                key: "completed-on",
                label: t("torrent_modal.general.fields.completed_on"),
                value:
                    typeof torrent.doneDate === "number" && torrent.doneDate > 0
                        ? formatDate(torrent.doneDate)
                        : notCompletedLabel,
            },
            {
                key: "private",
                label: t("torrent_modal.general.fields.private"),
                value: torrent.isPrivate
                    ? t("torrent_modal.general.values.private")
                    : t("torrent_modal.general.values.public"),
            },
            {
                key: "save-path",
                label: t("torrent_modal.labels.save_path"),
                value: <span className={DETAILS.generalMetricCode}>{setLocation.currentPath}</span>,
                actions: (
                    <ToolbarIconButton
                        Icon={Folder}
                        ariaLabel={t(setLocation.policy.actionLabelKey)}
                        title={t(setLocation.policy.actionLabelKey)}
                        onPress={openSetDownloadPathModal}
                        iconSize="md"
                    />
                ),
                block: true,
            },
        ];

        if (torrent.comment && torrent.comment.trim().length > 0) {
            rows.push({
                key: "comment",
                label: t("torrent_modal.general.fields.comment"),
                value: <div className={DETAILS.generalCommentValue}>{torrent.comment}</div>,
                block: true,
            });
        }

        if (torrent.creator && torrent.creator.trim().length > 0) {
            rows.push({
                key: "created-by",
                label: t("torrent_modal.general.fields.created_by"),
                value: torrent.creator,
            });
        }

        if (typeof torrent.dateCreated === "number" && torrent.dateCreated > 0) {
            rows.push({
                key: "created-on",
                label: t("torrent_modal.general.fields.created_on"),
                value: formatDate(torrent.dateCreated),
            });
        }

        rows.push({
            key: "info-hash",
            label: t("torrent_modal.labels.info_hash"),
            value: <span className={DETAILS.generalMetricCode}>{torrent.hash}</span>,
            actions: (
                <ToolbarIconButton
                    Icon={Copy}
                    ariaLabel={t("torrent_modal.general.actions.copy_hash")}
                    title={t("torrent_modal.general.actions.copy_hash")}
                    onPress={() => {
                        void handleCopyHash();
                    }}
                    iconSize="md"
                />
            ),
            block: true,
        });

        return rows;
    }, [
        handleCopyHash,
        notCompletedLabel,
        openSetDownloadPathModal,
        setLocation.currentPath,
        setLocation.policy.actionLabelKey,
        t,
        torrent.comment,
        torrent.creator,
        torrent.dateCreated,
        torrent.doneDate,
        torrent.hash,
        torrent.isPrivate,
        torrent.pieceCount,
        torrent.pieceSize,
        unknownLabel,
    ]);

    return (
        <div className={DETAILS.generalRoot}>
            {isDetailFullscreen ? <SummarySection torrent={torrent} optimisticStatus={optimisticStatus} t={t} /> : null}
            <SectionBlock
                title={t("torrent_modal.general.sections.transfer")}
                description={t("torrent_modal.general.sections.transfer_description")}
                rows={transferRows}
            />
            <SectionBlock
                title={t("torrent_modal.general.sections.information")}
                description={t("torrent_modal.general.sections.information_description")}
                rows={informationRows}
            />
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
