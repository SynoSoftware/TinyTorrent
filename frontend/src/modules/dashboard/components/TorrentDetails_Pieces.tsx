import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { GlassPanel } from "@/shared/ui/layout/GlassPanel";
import { TABLE, SPLIT } from "@/shared/ui/layout/glass-surface";
import AppTooltip from "@/shared/ui/components/AppTooltip";
import { TEXT_ROLE } from "@/config/textRoles";
import { registry } from "@/config/logic";
import { formatSpeed } from "@/shared/utils/format";
import { usePiecesMapViewModel, type PiecesMapViewModel } from "@/modules/dashboard/hooks/usePiecesMapViewModel";

const { visualizations } = registry;
const PIECE_MAP_HUD = visualizations.details.pieceMap.hud;

interface PiecesTabProps {
    torrentKey: string | number;
    piecePercent: number;
    pieceCount?: number;
    pieceSize?: number;
    pieceStates?: number[];
    pieceAvailability?: number[];
    sequentialDownload: boolean;
    downloadSpeed: number;
    uploadSpeed: number;
    showPersistentHud: boolean;
}

type PiecesViewProps = {
    viewModel: PiecesMapViewModel;
    sequentialDownload: boolean;
    showPersistentHud: boolean;
};

type PiecesHudFieldId =
    | "verified"
    | "missing"
    | "unavailable"
    | "rare"
    | "pieces"
    | "piece_size"
    | "download"
    | "upload";

type SwarmTone = "verified" | "common" | "rare" | "dead" | "missing";
type LegendCell = {
    key: string;
    label: string;
    swatch: { background: string; opacity?: number };
};
type DownloadMode = "sequential" | "random";
type TooltipDetail = NonNullable<PiecesMapViewModel["tooltipDetail"]>;
type Palette = PiecesMapViewModel["palette"];
type Translate = ReturnType<typeof useTranslation>["t"];
type HudTone = "default" | "warning" | "danger";

const HIDDEN_TOOLTIP_STYLE = {
    left: 0,
    top: 0,
    visibility: "hidden",
} as const;

const getVisibleHudFields = (width: number): PiecesHudFieldId[] => {
    if (width < PIECE_MAP_HUD.field_breakpoints_px.compact) {
        return ["verified", "missing", "unavailable"];
    }
    if (width < PIECE_MAP_HUD.field_breakpoints_px.compact_plus) {
        return ["verified", "missing", "unavailable", "rare"];
    }
    if (width < PIECE_MAP_HUD.field_breakpoints_px.summary) {
        return ["verified", "missing", "unavailable", "rare", "pieces"];
    }
    if (width < PIECE_MAP_HUD.field_breakpoints_px.summary_plus) {
        return ["verified", "missing", "unavailable", "rare", "pieces", "piece_size"];
    }
    if (width < PIECE_MAP_HUD.field_breakpoints_px.extended) {
        return ["verified", "missing", "unavailable", "rare", "pieces", "piece_size", "download"];
    }
    if (width < PIECE_MAP_HUD.field_breakpoints_px.wide) {
        return ["verified", "missing", "unavailable", "rare", "pieces", "piece_size", "download"];
    }
    return ["verified", "missing", "unavailable", "rare", "pieces", "piece_size", "download", "upload"];
};

const buildLegendCells = ({
    availabilityMissing,
    palette,
    t,
}: {
    availabilityMissing: boolean;
    palette: Palette;
    t: Translate;
}): Array<LegendCell | null> =>
    availabilityMissing
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

const resolveSwatchVisual = (palette: Palette, tone: SwarmTone) => {
    if (tone === "verified") {
        return {
            color: palette.success,
            borderColor: undefined as string | undefined,
        };
    }
    if (tone === "common") {
        return {
            color: `color-mix(in oklab, ${palette.primary} 35%, transparent)`,
            borderColor: undefined as string | undefined,
        };
    }
    if (tone === "rare") {
        return {
            color: `color-mix(in oklab, ${palette.warning} 75%, transparent)`,
            borderColor: undefined as string | undefined,
        };
    }
    if (tone === "dead") {
        return {
            color: `color-mix(in oklab, ${palette.foreground} 12%, transparent)`,
            borderColor: palette.danger,
        };
    }
    return {
        color: `color-mix(in oklab, ${palette.foreground} 18%, transparent)`,
        borderColor: undefined as string | undefined,
    };
};

const resolveRarePattern = (palette: Palette, tone: SwarmTone) =>
    tone === "rare"
        ? `repeating-linear-gradient(135deg, color-mix(in oklab, ${palette.foreground} 22%, transparent) 0 1px, transparent 1px 4px)`
        : undefined;

const renderHudStat = ({
    label,
    value,
    tooltip,
    quiet = false,
    tone = "default",
}: {
    label: string;
    value: string | number;
    tooltip?: string;
    quiet?: boolean;
    tone?: HudTone;
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
            <AppTooltip content={tooltip ?? label}>
                <span className={SPLIT.mapHudLabel}>
                    {label}
                </span>
            </AppTooltip>
            <span className={valueClass}>{value}</span>
        </div>
    );
};

const PiecesHud = ({
    visibleFields,
    downloadSpeed,
    uploadSpeed,
    totalPieces,
    pieceSizeLabel,
    verifiedCount,
    verifiedPercent,
    missingCount,
    rareCount,
    deadCount,
    availabilityMissing,
    t,
}: {
    visibleFields: readonly PiecesHudFieldId[];
    downloadSpeed: number;
    uploadSpeed: number;
    totalPieces: number;
    pieceSizeLabel: string;
    verifiedCount: number;
    verifiedPercent: number;
    missingCount: number;
    rareCount: number;
    deadCount: number;
    availabilityMissing: boolean;
    t: Translate;
}) => {
    const unknownLabel = t("labels.unknown");
    const fieldViews: Record<PiecesHudFieldId, ReactNode> = {
        verified: renderHudStat({
            label: t("torrent_modal.stats.verified"),
            value: `${verifiedPercent}% (${verifiedCount})`,
            tooltip: t("torrent_modal.pieces_hud.tooltips.verified"),
        }),
        missing: renderHudStat({
            label: t("torrent_modal.stats.missing"),
            value: missingCount,
            quiet: missingCount === 0,
            tooltip: t("torrent_modal.pieces_hud.tooltips.missing"),
        }),
        unavailable: renderHudStat({
            label: t("torrent_modal.pieces_hud.labels.unavailable_pieces"),
            value: availabilityMissing ? unknownLabel : deadCount,
            quiet: availabilityMissing || deadCount === 0,
            tone: !availabilityMissing && deadCount > 0 ? "danger" : "default",
            tooltip: t("torrent_modal.pieces_hud.tooltips.unavailable_pieces"),
        }),
        rare: renderHudStat({
            label: t("torrent_modal.pieces_hud.labels.rare_pieces"),
            value: availabilityMissing ? unknownLabel : rareCount,
            quiet: availabilityMissing || rareCount === 0,
            tone: !availabilityMissing && rareCount > 0 ? "warning" : "default",
            tooltip: t("torrent_modal.pieces_hud.tooltips.rare_pieces"),
        }),
        pieces: renderHudStat({
            label: t("torrent_modal.stats.pieces"),
            value: totalPieces,
        }),
        piece_size: renderHudStat({
            label: t("torrent_modal.stats.piece_size"),
            value: pieceSizeLabel,
        }),
        download: renderHudStat({
            label: t("torrent_modal.pieces_hud.labels.download"),
            value: formatSpeed(downloadSpeed),
            quiet: downloadSpeed <= 0,
        }),
        upload: renderHudStat({
            label: t("torrent_modal.pieces_hud.labels.upload"),
            value: formatSpeed(uploadSpeed),
            quiet: uploadSpeed <= 0,
        }),
    };

    return (
        <div className={SPLIT.mapHud} style={SPLIT.mapStatsTrackingStyle}>
            {visibleFields.map((fieldId) => (
                <div key={fieldId}>{fieldViews[fieldId]}</div>
            ))}
        </div>
    );
};

const PiecesTooltip = ({
    tooltipDetail,
    tooltipRef,
    tooltipStyle,
    palette,
    t,
}: {
    tooltipDetail: TooltipDetail | null;
    tooltipRef: PiecesMapViewModel["refs"]["tooltipRef"];
    tooltipStyle: PiecesMapViewModel["tooltipStyle"];
    palette: Palette;
    t: Translate;
}) => {
    if (!tooltipDetail) {
        return null;
    }

    return (
        <div ref={tooltipRef} className={SPLIT.mapTooltip} style={tooltipStyle ?? HIDDEN_TOOLTIP_STYLE}>
            <span className={SPLIT.mapTooltipPrimaryLine}>{tooltipDetail.title}</span>
            {tooltipDetail.swatches.length > 0 && (
                <div
                    className={SPLIT.mapTooltipSwatchGrid}
                    style={SPLIT.builder.swatchGridStyle({
                        gap: tooltipDetail.swatchGap,
                        columns: tooltipDetail.swatchColumns,
                    })}
                >
                    {tooltipDetail.swatches.map((swatch, index) => {
                        const visual = resolveSwatchVisual(palette, swatch.tone);
                        return (
                            <span
                                key={`piece-tooltip-swatch-${index}`}
                                className={SPLIT.mapTooltipSwatch}
                                style={SPLIT.builder.legendSwatchStyle({
                                    background: visual.color,
                                    size: tooltipDetail.swatchSize,
                                    borderColor: visual.borderColor,
                                    backgroundImage: resolveRarePattern(palette, swatch.tone),
                                })}
                            />
                        );
                    })}
                </div>
            )}
            <div className={SPLIT.mapTooltipInfoStack}>
                <span className={SPLIT.mapTooltipSecondaryLine}>{tooltipDetail.summary}</span>
                {tooltipDetail.availabilityLine && (
                    <span className={SPLIT.mapTooltipSecondaryLine}>
                        {t("torrent_modal.stats.availability")}: {tooltipDetail.availabilityLine}
                    </span>
                )}
            </div>
        </div>
    );
};

const PiecesLegend = ({
    legendCells,
    mode,
    t,
    inline,
}: {
    legendCells: Array<LegendCell | null>;
    mode: DownloadMode;
    t: Translate;
    inline: boolean;
}) => (
    <div className={inline ? SPLIT.mapLegendInline : SPLIT.mapLegendBelow}>
        <div className={SPLIT.mapLegendShell}>
            <div className={SPLIT.mapLegendGrid}>
                {legendCells.map((cell, index) =>
                    cell ? (
                        <span key={`piece-map-legend-${cell.key}`} className={SPLIT.mapLegendCell}>
                            <span className={SPLIT.mapLegendItem}>
                                <span
                                    className={SPLIT.mapLegendSwatch}
                                    style={SPLIT.builder.legendSwatchStyle(cell.swatch)}
                                />
                                <span className={TEXT_ROLE.bodyMuted}>{cell.label}</span>
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
            <div className={SPLIT.mapLegendMode}>
                <span className={SPLIT.mapLegendModeLabel}>
                    {t("torrent_modal.piece_map.download_mode")}
                </span>
                <span className={SPLIT.mapLegendModeValue}>
                    {t(`torrent_modal.piece_map.mode_${mode}`)}
                </span>
            </div>
        </div>
    </div>
);

const PiecesView = ({ viewModel, sequentialDownload, showPersistentHud }: PiecesViewProps) => {
    const { t } = useTranslation();
    const panelRef = useRef<HTMLDivElement>(null);
    const [panelWidth, setPanelWidth] = useState<number>(
        PIECE_MAP_HUD.legend_inline_min_width_px,
    );
    const {
        refs: { rootRef, canvasRef, overlayRef, tooltipRef },
        palette,
        downloadSpeed,
        uploadSpeed,
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
    const legendCells = buildLegendCells({ availabilityMissing, palette, t });
    const downloadMode: DownloadMode = sequentialDownload ? "sequential" : "random";
    const visibleFields = useMemo(() => getVisibleHudFields(panelWidth), [panelWidth]);
    const showInlineLegend =
        panelWidth >= PIECE_MAP_HUD.legend_inline_min_width_px;

    useEffect(() => {
        const element = panelRef.current;
        if (!element || typeof ResizeObserver === "undefined") {
            return;
        }

        const observer = new ResizeObserver((entries) => {
            const nextWidth = entries[0]?.contentRect.width;
            if (typeof nextWidth === "number" && Number.isFinite(nextWidth)) {
                setPanelWidth(Math.round(nextWidth));
            }
        });
        observer.observe(element);
        return () => {
            observer.disconnect();
        };
    }, []);

    return (
        <GlassPanel className={`${TABLE.detailsContentPanel} h-full`}>
            <div className={TABLE.detailsContentListHost}>
                <div ref={panelRef} className={SPLIT.mapPanel}>
                    {showPersistentHud && (
                        <div className={SPLIT.mapHudDockRow}>
                            <PiecesHud
                                visibleFields={visibleFields}
                                downloadSpeed={downloadSpeed}
                                uploadSpeed={uploadSpeed}
                                totalPieces={totalPieces}
                                pieceSizeLabel={pieceSizeLabel}
                                verifiedCount={verifiedCount}
                                verifiedPercent={verifiedPercent}
                                missingCount={missingCount}
                                rareCount={rareCount}
                                deadCount={deadCount}
                                availabilityMissing={availabilityMissing}
                                t={t}
                            />
                            {showInlineLegend ? (
                                <PiecesLegend
                                    legendCells={legendCells}
                                    mode={downloadMode}
                                    t={t}
                                    inline
                                />
                            ) : null}
                        </div>
                    )}
                    <div ref={rootRef} className={`${SPLIT.mapFrame} ${SPLIT.mapFrameInner}`}>
                        <canvas
                            ref={canvasRef}
                            className={SPLIT.mapCanvasLayer}
                            onMouseMove={handlers.onMouseMove}
                            onMouseLeave={handlers.onMouseLeave}
                            style={SPLIT.builder.canvasInteractionStyle("default")}
                        />
                        <canvas ref={overlayRef} className={SPLIT.mapCanvasOverlayLayer} />

                        <PiecesTooltip
                            tooltipDetail={tooltipDetail}
                            tooltipRef={tooltipRef}
                            tooltipStyle={tooltipStyle}
                            palette={palette}
                            t={t}
                        />
                    </div>
                    {showPersistentHud && !showInlineLegend ? (
                        <PiecesLegend
                            legendCells={legendCells}
                            mode={downloadMode}
                            t={t}
                            inline={false}
                        />
                    ) : null}
                </div>
            </div>
        </GlassPanel>
    );
};

export const PiecesTab = ({
    torrentKey,
    piecePercent,
    pieceCount,
    pieceSize,
    pieceStates,
    pieceAvailability,
    sequentialDownload,
    downloadSpeed,
    uploadSpeed,
    showPersistentHud = true,
}: PiecesTabProps) => {
    const viewModel = usePiecesMapViewModel({
        torrentKey,
        percent: piecePercent,
        pieceCount,
        pieceSize,
        pieceStates,
        pieceAvailability,
        downloadSpeed,
        uploadSpeed,
    });
    return (
        <PiecesView
            viewModel={viewModel}
            sequentialDownload={sequentialDownload}
            showPersistentHud={showPersistentHud}
        />
    );
};
