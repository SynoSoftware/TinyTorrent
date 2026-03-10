import { useState } from "react";
import { ZoomIn, ZoomOut, ScanSearch } from "lucide-react";
import { useTranslation } from "react-i18next";
import { TEXT_ROLE } from "@/config/textRoles";
import { SPLIT } from "@/shared/ui/layout/glass-surface";
import { ToolbarIconButton } from "@/shared/ui/layout/toolbar-button";
import {
    usePiecesMapViewModel,
    type PiecesMapProps,
    type PiecesMapViewModel,
} from "@/modules/dashboard/hooks/usePiecesMapViewModel";

type PiecesMapViewProps = {
    viewModel: PiecesMapViewModel;
    showPersistentHud: boolean;
};

const PiecesMapView = ({
    viewModel,
    showPersistentHud,
}: PiecesMapViewProps) => {
    const { t } = useTranslation();
    const [isMapHovered, setIsMapHovered] = useState(false);
    const {
        refs: { rootRef, canvasRef, overlayRef, minimapRef, tooltipRef },
        palette,
        totalPieces,
        pieceSizeLabel,
        verifiedCount,
        verifiedPercent,
        missingCount,
        commonCount,
        rareCount,
        deadCount,
        availabilityMissing,
        zoomLabel,
        blockDensityLabel,
        showMinimap,
        showHelpHint,
        isDragging,
        tooltipLines,
        tooltipStyle,
        controls,
        handlers,
    } = viewModel;
    const showInteractionHint = isMapHovered && showHelpHint && !isDragging;
    const renderHudStat = ({
        label,
        value,
        quiet = false,
        tone = "default",
    }: {
        label: string;
        value: string | number;
        quiet?: boolean;
        tone?: "default" | "warning" | "danger";
    }) => {
        const statClass = quiet ? SPLIT.mapHudStatQuiet : SPLIT.mapHudStat;
        const valueClass =
            tone === "danger"
                ? SPLIT.mapHudValueDanger
                : tone === "warning"
                    ? SPLIT.mapHudValueWarning
                    : quiet
                        ? SPLIT.mapHudValueQuiet
                        : SPLIT.mapHudValue;

        return (
            <div className={statClass}>
                <span className={SPLIT.mapHudLabel}>{label}</span>
                <span className={valueClass}>{value}</span>
            </div>
        );
    };

    return (
        <div className={SPLIT.contentStack}>
            <div className={SPLIT.mapFrame}>
                <div
                    ref={rootRef}
                    className={SPLIT.mapFrameInner}
                    onMouseEnter={() => setIsMapHovered(true)}
                    onMouseLeave={() => setIsMapHovered(false)}
                >
                    {showPersistentHud && (
                        <div
                            className={SPLIT.mapHud}
                            style={SPLIT.mapStatsTrackingStyle}
                        >
                            {renderHudStat({
                                label: t("torrent_modal.stats.pieces"),
                                value: totalPieces,
                            })}
                            {renderHudStat({
                                label: t("torrent_modal.stats.piece_size"),
                                value: pieceSizeLabel,
                            })}
                            {renderHudStat({
                                label: t("torrent_modal.stats.verified"),
                                value: `${verifiedPercent}% (${verifiedCount})`,
                            })}
                            {renderHudStat({
                                label: t("torrent_modal.stats.missing"),
                                value: missingCount,
                                quiet: missingCount === 0,
                            })}
                            {!availabilityMissing &&
                                renderHudStat({
                                    label: t("torrent_modal.availability.legend_rare"),
                                    value: rareCount,
                                    quiet: rareCount === 0,
                                    tone: rareCount > 0 ? "warning" : "default",
                                })}
                            {!availabilityMissing &&
                                renderHudStat({
                                    label: t("torrent_modal.piece_map.dead_stat"),
                                    value: deadCount,
                                    quiet: deadCount === 0,
                                    tone: deadCount > 0 ? "danger" : "default",
                                })}
                        </div>
                    )}

                    {showPersistentHud && (
                        <div className={SPLIT.mapControlsFloat}>
                            <ToolbarIconButton
                                Icon={ZoomOut}
                                ariaLabel={t("torrent_modal.piece_map.zoom_out")}
                                onPress={controls.zoomOut}
                                isDisabled={!controls.canZoomOut}
                                className={SPLIT.mapZoomButton}
                                iconSize="sm"
                            />
                            <span className={SPLIT.mapZoomValue}>
                                {zoomLabel} · {blockDensityLabel}
                            </span>
                            <ToolbarIconButton
                                Icon={ZoomIn}
                                ariaLabel={t("torrent_modal.piece_map.zoom_in")}
                                onPress={controls.zoomIn}
                                isDisabled={!controls.canZoomIn}
                                className={SPLIT.mapZoomButton}
                                iconSize="sm"
                            />
                            <ToolbarIconButton
                                Icon={ScanSearch}
                                ariaLabel={t("torrent_modal.piece_map.zoom_reset")}
                                onPress={controls.reset}
                                className={SPLIT.mapZoomButton}
                                iconSize="sm"
                            />
                        </div>
                    )}

                    <canvas
                        ref={canvasRef}
                        className={SPLIT.mapCanvasLayer}
                        onMouseMove={handlers.onMouseMove}
                        onMouseLeave={handlers.onMouseLeave}
                        onMouseDown={handlers.onMouseDown}
                        onWheel={handlers.onWheel}
                        style={SPLIT.builder.canvasInteractionStyle(
                            isDragging ? "grabbing" : "grab",
                        )}
                    />
                    <canvas
                        ref={overlayRef}
                        className={SPLIT.mapCanvasOverlayLayer}
                    />

                    {tooltipLines.length > 0 && (
                        <div
                            ref={tooltipRef}
                            className={SPLIT.mapTooltip}
                            style={
                                tooltipStyle ?? {
                                    left: 0,
                                    top: 0,
                                    visibility: "hidden",
                                }
                            }
                        >
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

                    {showPersistentHud && (
                        <div className={SPLIT.mapLegendFloat}>
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
                            {availabilityMissing ? (
                                <span className={SPLIT.mapLegendItem}>
                                    <span
                                        className={SPLIT.mapLegendSwatch}
                                        style={SPLIT.builder.legendSwatchStyle({
                                            background: palette.foreground,
                                            opacity: 0.2,
                                        })}
                                    />
                                    <span className={TEXT_ROLE.bodyMuted}>
                                        {t("torrent_modal.stats.missing")}
                                    </span>
                                </span>
                            ) : (
                                <>
                                    <span className={SPLIT.mapLegendItem}>
                                        <span
                                            className={SPLIT.mapLegendSwatch}
                                            style={SPLIT.builder.legendSwatchStyle({
                                                background: palette.primary,
                                                opacity: 0.35,
                                            })}
                                        />
                                        <span className={TEXT_ROLE.bodyMuted}>
                                            {t("torrent_modal.availability.legend_common")}
                                        </span>
                                    </span>
                                    <span className={SPLIT.mapLegendItem}>
                                        <span
                                            className={SPLIT.mapLegendSwatch}
                                            style={SPLIT.builder.legendSwatchStyle({
                                                background: palette.warning,
                                            })}
                                        />
                                        <span className={TEXT_ROLE.bodyMuted}>
                                            {t("torrent_modal.availability.legend_rare")}
                                        </span>
                                    </span>
                                    <span className={SPLIT.mapLegendItem}>
                                        <span
                                            className={SPLIT.mapLegendSwatch}
                                            style={SPLIT.builder.legendSwatchStyle({
                                                background: palette.danger,
                                            })}
                                        />
                                        <span className={TEXT_ROLE.bodyMuted}>
                                            {t("torrent_modal.piece_map.legend_dead")}
                                        </span>
                                    </span>
                                </>
                            )}
                        </div>
                    )}

                    {(showMinimap || showInteractionHint) && (
                        <div className={SPLIT.mapCornerStack}>
                            {showMinimap && (
                                <div className={SPLIT.mapMinimap}>
                                    <div className={SPLIT.mapMinimapLabel}>
                                        {t("torrent_modal.piece_map.minimap_label")}
                                    </div>
                                    <canvas
                                        ref={minimapRef}
                                        className={SPLIT.mapMinimapCanvas}
                                        onMouseDown={handlers.onMinimapMouseDown}
                                    />
                                </div>
                            )}

                            {showInteractionHint && (
                                <div className={SPLIT.mapHintWrap}>
                                    <div className={SPLIT.mapHintChip}>
                                        {t("torrent_modal.piece_map.hint_interact")}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

type PiecesMapComponentProps = PiecesMapProps & {
    showPersistentHud?: boolean;
};

export const PiecesMap = ({
    showPersistentHud = true,
    ...props
}: PiecesMapComponentProps) => {
    const viewModel = usePiecesMapViewModel(props);
    return (
        <PiecesMapView
            viewModel={viewModel}
            showPersistentHud={showPersistentHud}
        />
    );
};
