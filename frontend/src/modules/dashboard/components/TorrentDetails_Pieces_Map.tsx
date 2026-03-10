import { useTranslation } from "react-i18next";
import { TEXT_ROLE } from "@/config/textRoles";
import { SPLIT } from "@/shared/ui/layout/glass-surface";
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
    const {
        refs: { rootRef, canvasRef, overlayRef, tooltipRef },
        palette,
        totalPieces,
        pieceSizeLabel,
        verifiedCount,
        verifiedPercent,
        missingCount,
        rareCount,
        deadCount,
        availabilityMissing,
        tooltipDetail,
        tooltipStyle,
        handlers,
    } = viewModel;

    const legendCells = availabilityMissing
        ? [
              {
                  key: "verified",
                  label: t("torrent_modal.stats.verified"),
                  swatch: { background: palette.success },
              },
              {
                  key: "missing",
                  label: t("torrent_modal.stats.missing"),
                  swatch: { background: palette.foreground, opacity: 0.2 },
              },
              null,
              null,
          ]
        : [
              {
                  key: "verified",
                  label: t("torrent_modal.stats.verified"),
                  swatch: { background: palette.success },
              },
              {
                  key: "common",
                  label: t("torrent_modal.availability.legend_common"),
                  swatch: { background: palette.primary, opacity: 0.35 },
              },
              {
                  key: "rare",
                  label: t("torrent_modal.availability.legend_rare"),
                  swatch: { background: palette.warning },
              },
              {
                  key: "dead",
                  label: t("torrent_modal.piece_map.legend_dead"),
                  swatch: { background: palette.danger },
              },
          ];
    const resolveDetailSegmentVisual = (tone: "verified" | "common" | "rare" | "dead" | "missing") => {
        if (tone === "verified") {
            return { color: palette.success, opacity: 1, borderColor: undefined as string | undefined };
        }
        if (tone === "common") {
            return { color: palette.primary, opacity: 0.35, borderColor: undefined as string | undefined };
        }
        if (tone === "rare") {
            return { color: palette.warning, opacity: 0.75, borderColor: undefined as string | undefined };
        }
        if (tone === "dead") {
            return { color: palette.foreground, opacity: 0.12, borderColor: palette.danger };
        }
        return { color: palette.foreground, opacity: 0.18, borderColor: undefined as string | undefined };
    };
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
        <div className={SPLIT.mapPanel}>
            <div className={SPLIT.mapFrame}>
                <div ref={rootRef} className={SPLIT.mapFrameInner}>
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

                    <canvas
                        ref={canvasRef}
                        className={SPLIT.mapCanvasLayer}
                        onMouseMove={handlers.onMouseMove}
                        onMouseLeave={handlers.onMouseLeave}
                        style={SPLIT.builder.canvasInteractionStyle("default")}
                    />
                    <canvas
                        ref={overlayRef}
                        className={SPLIT.mapCanvasOverlayLayer}
                    />

                    {tooltipDetail && (
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
                            <span className={SPLIT.mapTooltipPrimaryLine}>
                                {tooltipDetail.title}
                            </span>
                            {tooltipDetail.swatches.length > 0 && (
                                <div
                                    className={SPLIT.mapTooltipSwatchGrid}
                                    style={SPLIT.builder.swatchGridStyle({
                                        gap: tooltipDetail.swatchGap,
                                    })}
                                >
                                    {tooltipDetail.swatches.map((swatch, index) => {
                                        const visual = resolveDetailSegmentVisual(swatch.tone);
                                        const rarePattern =
                                            swatch.tone === "rare"
                                                ? `repeating-linear-gradient(135deg, color-mix(in oklab, ${palette.foreground} 22%, transparent) 0 1px, transparent 1px 4px)`
                                                : undefined;
                                        return (
                                            <span
                                                key={`piece-tooltip-swatch-${index}`}
                                                className={SPLIT.mapTooltipSwatch}
                                                style={SPLIT.builder.legendSwatchStyle({
                                                    background: visual.color,
                                                    opacity: visual.opacity,
                                                    size: tooltipDetail.swatchSize,
                                                    borderColor: visual.borderColor,
                                                    backgroundImage: rarePattern,
                                                })}
                                            />
                                        );
                                    })}
                                </div>
                            )}
                            <div className={SPLIT.mapTooltipInfoStack}>
                                <span className={SPLIT.mapTooltipSecondaryLine}>
                                    {tooltipDetail.summary}
                                </span>
                                {tooltipDetail.availabilityLine && (
                                    <span className={SPLIT.mapTooltipSecondaryLine}>
                                        {t("torrent_modal.stats.availability")}:{" "}
                                        {tooltipDetail.availabilityLine}
                                    </span>
                                )}
                            </div>
                        </div>
                    )}

                    {showPersistentHud && (
                        <div className={SPLIT.mapLegendFloat}>
                            <div className={SPLIT.mapLegendGrid}>
                                {legendCells.map((cell, index) =>
                                    cell ? (
                                        <span
                                            key={`piece-map-legend-${cell.key}`}
                                            className={SPLIT.mapLegendCell}
                                        >
                                            <span className={SPLIT.mapLegendItem}>
                                                <span
                                                    className={SPLIT.mapLegendSwatch}
                                                    style={SPLIT.builder.legendSwatchStyle(
                                                        cell.swatch,
                                                    )}
                                                />
                                                <span className={TEXT_ROLE.bodyMuted}>
                                                    {cell.label}
                                                </span>
                                            </span>
                                        </span>
                                    ) : (
                                        <span
                                            key={`piece-map-legend-placeholder-${index}`}
                                            className={`${SPLIT.mapLegendCell} ${SPLIT.mapLegendCellPlaceholder}`}
                                            aria-hidden="true"
                                        >
                                            <span className={SPLIT.mapLegendItem}>.</span>
                                        </span>
                                    ),
                                )}
                            </div>
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
