import { useTranslation } from "react-i18next";
import { TEXT_ROLE, withColor } from "@/config/textRoles";
import {
    SPLIT_VIEW_CLASS,
    buildSplitViewCanvasInteractionStyle,
    buildSplitViewLegendSwatchStyle,
} from "@/shared/ui/layout/glass-surface";
import {
    usePiecesMapViewModel,
    type PiecesMapProps,
    type PiecesMapViewModel,
} from "@/modules/dashboard/hooks/usePiecesMapViewModel";

const PiecesMapView = ({
    viewModel,
}: {
    viewModel: PiecesMapViewModel;
}) => {
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
        <div className={SPLIT_VIEW_CLASS.contentStack}>
            <div
                className={SPLIT_VIEW_CLASS.mapStatsRow}
                style={SPLIT_VIEW_CLASS.mapStatsTrackingStyle}
            >
                <div className={SPLIT_VIEW_CLASS.mapStatColumn}>
                    <span className={TEXT_ROLE.label}>
                        {t("torrent_modal.stats.pieces")}
                    </span>
                    <span className={TEXT_ROLE.code}>
                        {totalPieces}
                    </span>
                </div>

                <div className={SPLIT_VIEW_CLASS.mapStatColumn}>
                    <span className={TEXT_ROLE.label}>
                        {t("torrent_modal.stats.piece_size")}
                    </span>
                    <span className={TEXT_ROLE.code}>
                        {pieceSizeLabel}
                    </span>
                </div>

                <div className={SPLIT_VIEW_CLASS.mapStatColumn}>
                    <span className={TEXT_ROLE.label}>
                        {t("torrent_modal.stats.verified")}
                    </span>
                    <span className={TEXT_ROLE.code}>
                        {doneCount}
                    </span>
                </div>

                <div className={SPLIT_VIEW_CLASS.mapStatColumn}>
                    <span className={TEXT_ROLE.label}>
                        {t("torrent_modal.stats.downloading")}
                    </span>
                    <span className={withColor(TEXT_ROLE.code, "warning")}>
                        {downloadingCount}
                    </span>
                </div>

                <div className={SPLIT_VIEW_CLASS.mapStatColumn}>
                    <span className={TEXT_ROLE.label}>
                        {t("torrent_modal.stats.missing")}
                    </span>
                    <span className={withColor(TEXT_ROLE.code, "danger")}>
                        {missingCount}
                    </span>
                </div>
            </div>

            {hasBinaryPieceStates && (
                <div className={SPLIT_VIEW_CLASS.mapNote}>
                    {t("torrent_modal.piece_map.binary_states_note")}
                </div>
            )}

            <div
                ref={rootRef}
                className={SPLIT_VIEW_CLASS.mapFrame}
            >
                <div className={SPLIT_VIEW_CLASS.mapFrameInner}>
                    <canvas
                        ref={canvasRef}
                        className={SPLIT_VIEW_CLASS.mapCanvasLayer}
                        onMouseMove={handlers.onMouseMove}
                        onMouseLeave={handlers.onMouseLeave}
                        onMouseDown={handlers.onMouseDown}
                        style={buildSplitViewCanvasInteractionStyle(cursor)}
                    />
                    <canvas
                        ref={overlayRef}
                        className={SPLIT_VIEW_CLASS.mapCanvasOverlayLayer}
                    />

                    {tooltipLines.length > 0 && tooltipStyle && (
                        <div
                            className={SPLIT_VIEW_CLASS.mapTooltip}
                            style={tooltipStyle}
                        >
                            {tooltipLines.map((line, index) => (
                                <span
                                    key={`piece-tooltip-${index}`}
                                    className={
                                        index === 0
                                            ? SPLIT_VIEW_CLASS.mapTooltipPrimaryLine
                                            : SPLIT_VIEW_CLASS.mapTooltipSecondaryLine
                                    }
                                >
                                    {line}
                                </span>
                            ))}
                        </div>
                    )}

                    <div className={SPLIT_VIEW_CLASS.mapHintWrap}>
                        <div className={SPLIT_VIEW_CLASS.mapHintChip}>
                            {t("torrent_modal.piece_map.hint_interact")}
                        </div>
                    </div>
                </div>
            </div>

            <div className={SPLIT_VIEW_CLASS.mapLegendRow}>
                <span className={SPLIT_VIEW_CLASS.mapLegendItem}>
                    <span
                        className={SPLIT_VIEW_CLASS.mapLegendSwatch}
                        style={buildSplitViewLegendSwatchStyle({
                            background: palette.success,
                        })}
                    />
                    <span className={TEXT_ROLE.bodyMuted}>
                        {t("torrent_modal.stats.verified")}
                    </span>
                </span>

                <span className={SPLIT_VIEW_CLASS.mapLegendItem}>
                    <span
                        className={SPLIT_VIEW_CLASS.mapLegendSwatch}
                        style={buildSplitViewLegendSwatchStyle({
                            background: palette.warning,
                            border: `1px solid ${palette.primary}`,
                        })}
                    />
                    <span className={TEXT_ROLE.bodyMuted}>
                        {t("torrent_modal.stats.downloading")}
                    </span>
                </span>

                <span className={SPLIT_VIEW_CLASS.mapLegendItem}>
                    <span
                        className={SPLIT_VIEW_CLASS.mapLegendSwatch}
                        style={buildSplitViewLegendSwatchStyle({
                            background: palette.foreground,
                            border: `1px solid ${palette.danger}`,
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
