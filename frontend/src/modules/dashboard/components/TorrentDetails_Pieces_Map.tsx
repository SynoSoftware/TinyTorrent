import { useTranslation } from "react-i18next";
import { TEXT_ROLE } from "@/config/textRoles";
import { SPLIT } from "@/shared/ui/layout/glass-surface";
import {
    usePiecesMapViewModel,
    type PiecesMapProps,
    type PiecesMapViewModel,
} from "@/modules/dashboard/hooks";

const PiecesMapView = ({ viewModel }: { viewModel: PiecesMapViewModel }) => {
    const { t } = useTranslation();
    const {
        refs: { rootRef, canvasRef, overlayRef },
        palette,
        totalPieces,
        pieceSizeLabel,
        doneCount,
        downloadingCount,
        missingCount,
        hasBinaryPieceStates,
        tooltipLines,
        tooltipStyle,
        isDragging,
        handlers,
    } = viewModel;
    const cursor = isDragging ? "grabbing" : "grab";

    return (
        <div className={SPLIT.contentStack}>
            <div
                className={SPLIT.mapStatsRow}
                style={SPLIT.mapStatsTrackingStyle}
            >
                <div className={SPLIT.mapStatColumn}>
                    <span className={TEXT_ROLE.label}>
                        {t("torrent_modal.stats.pieces")}
                    </span>
                    <span className={TEXT_ROLE.code}>{totalPieces}</span>
                </div>

                <div className={SPLIT.mapStatColumn}>
                    <span className={TEXT_ROLE.label}>
                        {t("torrent_modal.stats.piece_size")}
                    </span>
                    <span className={TEXT_ROLE.code}>{pieceSizeLabel}</span>
                </div>

                <div className={SPLIT.mapStatColumn}>
                    <span className={TEXT_ROLE.label}>
                        {t("torrent_modal.stats.verified")}
                    </span>
                    <span className={TEXT_ROLE.code}>{doneCount}</span>
                </div>

                <div className={SPLIT.mapStatColumn}>
                    <span className={TEXT_ROLE.label}>
                        {t("torrent_modal.stats.downloading")}
                    </span>
                    <span className={SPLIT.mapStatWarningCount}>
                        {downloadingCount}
                    </span>
                </div>

                <div className={SPLIT.mapStatColumn}>
                    <span className={TEXT_ROLE.label}>
                        {t("torrent_modal.stats.missing")}
                    </span>
                    <span className={SPLIT.mapStatDangerCount}>
                        {missingCount}
                    </span>
                </div>
            </div>

            {hasBinaryPieceStates && (
                <div className={SPLIT.mapNote}>
                    {t("torrent_modal.piece_map.binary_states_note")}
                </div>
            )}

            <div ref={rootRef} className={SPLIT.mapFrame}>
                <div className={SPLIT.mapFrameInner}>
                    <canvas
                        ref={canvasRef}
                        className={SPLIT.mapCanvasLayer}
                        onMouseMove={handlers.onMouseMove}
                        onMouseLeave={handlers.onMouseLeave}
                        onMouseDown={handlers.onMouseDown}
                        style={SPLIT.builder.canvasInteractionStyle(cursor)}
                    />
                    <canvas
                        ref={overlayRef}
                        className={SPLIT.mapCanvasOverlayLayer}
                    />

                    {tooltipLines.length > 0 && tooltipStyle && (
                        <div className={SPLIT.mapTooltip} style={tooltipStyle}>
                            {tooltipLines.map((line, index) => (
                                <span
                                    key={`piece-tooltip-${index}`}
                                    className={
                                        index === 0
                                            ? SPLIT.mapTooltipPrimaryLine
                                            : SPLIT.mapTooltipSecondaryLine
                                    }
                                >
                                    {line}
                                </span>
                            ))}
                        </div>
                    )}

                    <div className={SPLIT.mapHintWrap}>
                        <div className={SPLIT.mapHintChip}>
                            {t("torrent_modal.piece_map.hint_interact")}
                        </div>
                    </div>
                </div>
            </div>

            <div className={SPLIT.mapLegendRow}>
                <span className={SPLIT.mapLegendItem}>
                    <span
                        className={SPLIT.mapLegendSwatch}
                        style={SPLIT.builder.legendSwatchStyle({
                            background: palette.success,
                        })}
                    />
                    <span className={TEXT_ROLE.bodyMuted}>
                        {t("torrent_modal.stats.verified")}
                    </span>
                </span>

                <span className={SPLIT.mapLegendItem}>
                    <span
                        className={SPLIT.mapLegendSwatch}
                        style={SPLIT.builder.legendSwatchStyle({
                            background: palette.warning,
                            borderColor: palette.primary,
                        })}
                    />
                    <span className={TEXT_ROLE.bodyMuted}>
                        {t("torrent_modal.stats.downloading")}
                    </span>
                </span>

                <span className={SPLIT.mapLegendItem}>
                    <span
                        className={SPLIT.mapLegendSwatch}
                        style={SPLIT.builder.legendSwatchStyle({
                            background: palette.foreground,
                            borderColor: palette.danger,
                            opacity: 0.2,
                        })}
                    />
                    <span className={TEXT_ROLE.bodyMuted}>
                        {t("torrent_modal.stats.missing")}
                    </span>
                </span>
            </div>
        </div>
    );
};

export const PiecesMap = (props: PiecesMapProps) => {
    const viewModel = usePiecesMapViewModel(props);
    return <PiecesMapView viewModel={viewModel} />;
};
