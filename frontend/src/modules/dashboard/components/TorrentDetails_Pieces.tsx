import { ArrowDown, ArrowUp } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { GlassPanel } from "@/shared/ui/layout/GlassPanel";
import { DETAILS, TABLE, SPLIT, WORKBENCH } from "@/shared/ui/layout/glass-surface";
import AppTooltip from "@/shared/ui/components/AppTooltip";
import { registry } from "@/config/logic";
import { useEngineSpeedHistory } from "@/shared/hooks/useEngineSpeedHistory";
import { usePiecesMapViewModel, type PiecesMapViewModel } from "@/modules/dashboard/hooks/usePiecesMapViewModel";
import { getEffectiveProgress } from "@/modules/dashboard/components/TorrentProgressDisplay";
import { TORRENTTABLE_COLUMN_DEFS } from "@/modules/dashboard/components/TorrentTable_ColumnDefs";
import { getColumnWidthCss } from "@/modules/dashboard/components/TorrentTable_Shared";
import type { OptimisticStatusEntry } from "@/modules/dashboard/types/contracts";
import type { TorrentEntity as Torrent } from "@/services/rpc/entities";
import { NetworkGraph } from "@/shared/ui/graphs/NetworkGraph";
import { SmoothProgressBar } from "@/shared/ui/components/SmoothProgressBar";
import { status } from "@/shared/status";
import { getEffectiveTorrentState } from "@/modules/dashboard/utils/torrentStatus";
import { formatBytes, formatSpeed } from "@/shared/utils/format";

const { visualizations } = registry;
const PIECE_MAP_HUD = visualizations.details.pieceMap.hud;
const HUD_RICH_FIELD_WIDTH = getColumnWidthCss(
    TORRENTTABLE_COLUMN_DEFS.progress.id,
    TORRENTTABLE_COLUMN_DEFS.progress.width ?? TORRENTTABLE_COLUMN_DEFS.progress.minSize ?? 110,
);

interface PiecesTabProps {
    torrent: Torrent;
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
    optimisticStatus?: OptimisticStatusEntry;
}

type PiecesViewProps = {
    viewModel: PiecesMapViewModel;
    torrent: Torrent;
    optimisticStatus?: OptimisticStatusEntry;
    sequentialDownload: boolean;
    showPersistentHud: boolean;
};

type PiecesHudFieldId =
    | "progress"
    | "verified"
    | "missing"
    | "unavailable"
    | "rare"
    | "pieces"
    | "piece_size"
    | "speed";

type SwarmTone = "verified" | "common" | "rare" | "dead" | "missing";
type LegendCell = {
    key: string;
    label: string;
    swatch: { background: string; borderColor?: string; backgroundImage?: string };
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
        return ["verified", "missing", "progress"];
    }
    if (width < PIECE_MAP_HUD.field_breakpoints_px.compact_plus) {
        return ["verified", "missing", "unavailable", "progress"];
    }
    if (width < PIECE_MAP_HUD.field_breakpoints_px.summary) {
        return ["verified", "missing", "unavailable", "rare", "progress"];
    }
    if (width < PIECE_MAP_HUD.field_breakpoints_px.summary_plus) {
        return ["verified", "missing", "unavailable", "rare", "pieces", "progress"];
    }
    if (width < PIECE_MAP_HUD.field_breakpoints_px.extended) {
        return ["verified", "missing", "unavailable", "rare", "pieces", "piece_size", "progress"];
    }
    return ["verified", "missing", "unavailable", "rare", "pieces", "piece_size", "speed", "progress"];
};

const buildLegendCells = ({
    availabilityMissing,
    palette,
    t,
}: {
    availabilityMissing: boolean;
    palette: Palette;
    t: Translate;
}): Array<LegendCell | null> => {
    const getSwatch = (tone: SwarmTone) => resolveMapAvailabilitySwatchVisual({ palette, tone });

    return availabilityMissing
        ? [
              {
                  key: "verified",
                  label: t("torrent_modal.stats.verified"),
                  swatch: getSwatch("verified"),
              },
              {
                  key: "missing",
                  label: t("torrent_modal.stats.missing"),
                  swatch: getSwatch("missing"),
              },
              null,
              null,
          ]
        : [
              {
                  key: "verified",
                  label: t("torrent_modal.stats.verified"),
                  swatch: getSwatch("verified"),
              },
              {
                  key: "common",
                  label: t("torrent_modal.availability.legend_common"),
                  swatch: getSwatch("common"),
              },
              {
                  key: "rare",
                  label: t("torrent_modal.availability.legend_rare"),
                  swatch: getSwatch("rare"),
              },
              {
                  key: "dead",
                  label: t("torrent_modal.piece_map.legend_dead"),
                  swatch: getSwatch("dead"),
              },
          ];
};

const resolveMapAvailabilitySwatchVisual = (params: {
    palette: Palette;
    tone: SwarmTone;
}) => {
    switch (params.tone) {
        case "verified":
            return {
                background: params.palette.success,
                borderColor: undefined as string | undefined,
                backgroundImage: undefined as string | undefined,
            };
        case "common":
            return {
                background: `color-mix(in oklab, ${params.palette.primary} 35%, transparent)`,
                borderColor: undefined as string | undefined,
                backgroundImage: undefined as string | undefined,
            };
        case "rare":
            return {
                background: `color-mix(in oklab, ${params.palette.warning} 75%, transparent)`,
                borderColor: undefined as string | undefined,
                backgroundImage: `repeating-linear-gradient(135deg, color-mix(in oklab, ${params.palette.foreground} 22%, transparent) 0 1px, transparent 1px 4px)`,
            };
        case "dead":
            return {
                background: `color-mix(in oklab, ${params.palette.foreground} 12%, transparent)`,
                borderColor: params.palette.danger,
                backgroundImage: undefined as string | undefined,
            };
        default:
            return {
                background: `color-mix(in oklab, ${params.palette.foreground} 18%, transparent)`,
                borderColor: undefined as string | undefined,
                backgroundImage: undefined as string | undefined,
            };
    }
};

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
                <span className={SPLIT.mapHudLabel}>{label}</span>
            </AppTooltip>
            <span className={valueClass}>{value}</span>
        </div>
    );
};

const renderHudCell = ({ cell, className = "overflow-hidden" }: { cell: ReactNode; className?: string }) => (
    <div className={`flex h-full w-full min-w-0 ${className}`}>{cell}</div>
);

const getHudFieldShellClass = (fieldId: PiecesHudFieldId) =>
    fieldId === "speed"
        ? "flex h-full shrink-0 min-w-0 overflow-visible"
        : fieldId === "progress"
          ? "flex h-full shrink-0 min-w-0 overflow-hidden"
          : "flex min-w-0 overflow-hidden";

const getHudFieldShellStyle = (fieldId: PiecesHudFieldId) =>
    fieldId === "progress" || fieldId === "speed"
        ? ({
              width: HUD_RICH_FIELD_WIDTH,
          } as const)
        : undefined;

const getPiecesHudProgressIndicatorClass = (torrent: Torrent, optimisticStatus?: OptimisticStatusEntry) => {
    const effectiveState = getEffectiveTorrentState(torrent, optimisticStatus);

    if (effectiveState === status.torrent.paused) {
        return TABLE.columnDefs.progressIndicatorPaused;
    }
    if (effectiveState === status.torrent.seeding) {
        return TABLE.columnDefs.progressIndicatorSeeding;
    }
    return TABLE.columnDefs.progressIndicatorActive;
};

const PiecesHudProgressCell = ({
    torrent,
    optimisticStatus,
}: {
    torrent: Torrent;
    optimisticStatus?: OptimisticStatusEntry;
}) => {
    const progressValue = getEffectiveProgress(torrent, optimisticStatus);
    const progressPercent = progressValue * 100;
    const completedBytes = torrent.totalSize * progressValue;

    return (
        <div className={`${DETAILS.generalProgressWrap} h-full w-full justify-between px-tight`}>
            <div className={`${DETAILS.generalProgressMetrics} min-w-0`}>
                <span className={`${SPLIT.mapHudValue} whitespace-nowrap`}>{progressPercent.toFixed(1)}%</span>
                <span className={`${TABLE.columnDefs.progressSecondary} whitespace-nowrap`}>{formatBytes(completedBytes)}</span>
            </div>
            <SmoothProgressBar
                value={progressPercent}
                className={`${DETAILS.generalProgressBar} py-tight`}
                trackClassName={TABLE.columnDefs.progressTrack}
                indicatorClassName={getPiecesHudProgressIndicatorClass(torrent, optimisticStatus)}
            />
        </div>
    );
};

const PiecesHudSpeedCell = ({
    downHistory,
    upHistory,
    downSpeed,
    upSpeed,
    t,
}: {
    downHistory: number[];
    upHistory: number[];
    downSpeed: number;
    upSpeed: number;
    t: Translate;
}) => {
    const sharedMaxValue = useMemo(() => Math.max(1, ...downHistory, ...upHistory), [downHistory, upHistory]);

    return (
        <div className="relative h-full w-full min-w-0 overflow-visible">
            <div className={`${WORKBENCH.status.speedCompactGraphWrap} overflow-visible`}>
                <div className={WORKBENCH.status.speedCompactLayer}>
                    <NetworkGraph
                        data={downHistory}
                        color="success"
                        maxValue={sharedMaxValue}
                        className={WORKBENCH.status.speedCompactDownGraph}
                    />
                </div>
                <div className={WORKBENCH.status.speedCompactUpLayer}>
                    <NetworkGraph
                        data={upHistory}
                        color="primary"
                        maxValue={sharedMaxValue}
                        className={WORKBENCH.status.speedCompactUpGraph}
                    />
                </div>

                <div className={WORKBENCH.status.speedCompactOverlay}>
                    <div className={WORKBENCH.status.speedCompactOverlayRow}>
                        <div className={WORKBENCH.status.speedCompactColumn}>
                            <ArrowDown className={WORKBENCH.status.speedCompactDownIcon} aria-hidden="true" />
                            <span className={WORKBENCH.status.srOnly}>{t("status_bar.down")}</span>
                            <span className={WORKBENCH.status.speedCompactValue}>{formatSpeed(downSpeed)}</span>
                        </div>
                        <div className={WORKBENCH.status.speedCompactDivider} />
                        <div className={WORKBENCH.status.speedCompactColumn}>
                            <ArrowUp className={WORKBENCH.status.speedCompactUpIcon} aria-hidden="true" />
                            <span className={WORKBENCH.status.srOnly}>{t("status_bar.up")}</span>
                            <span className={WORKBENCH.status.speedCompactValue}>{formatSpeed(upSpeed)}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const PiecesHud = ({
    torrent,
    optimisticStatus,
    visibleFields,
    totalPieces,
    pieceSizeLabel,
    verifiedCount,
    missingCount,
    rareCount,
    deadCount,
    availabilityMissing,
    t,
}: {
    torrent: Torrent;
    optimisticStatus?: OptimisticStatusEntry;
    visibleFields: readonly PiecesHudFieldId[];
    totalPieces: number;
    pieceSizeLabel: string;
    verifiedCount: number;
    missingCount: number;
    rareCount: number;
    deadCount: number;
    availabilityMissing: boolean;
    t: Translate;
}) => {
    const { down, up } = useEngineSpeedHistory(String(torrent.id ?? torrent.hash ?? ""));
    const unknownLabel = t("labels.unknown");
    const fieldViews: Record<PiecesHudFieldId, ReactNode> = {
        progress: renderHudCell({
            cell: <PiecesHudProgressCell torrent={torrent} optimisticStatus={optimisticStatus} />,
        }),
        verified: renderHudStat({
            label: t("torrent_modal.stats.verified"),
            value: verifiedCount,
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
        speed: renderHudCell({
            cell: (
                <PiecesHudSpeedCell
                    downHistory={down}
                    upHistory={up}
                    downSpeed={torrent.speed.down}
                    upSpeed={torrent.speed.up}
                    t={t}
                />
            ),
            className: "overflow-visible",
        }),
    };
    return (
        <div className={SPLIT.mapHud} style={SPLIT.mapStatsTrackingStyle}>
            {visibleFields.map((fieldId) => (
                <div key={fieldId} className={getHudFieldShellClass(fieldId)} style={getHudFieldShellStyle(fieldId)}>
                    {fieldViews[fieldId]}
                </div>
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
                        const visual = resolveMapAvailabilitySwatchVisual({
                            palette,
                            tone: swatch.tone as SwarmTone,
                        });
                        return (
                            <span
                                key={`piece-tooltip-swatch-${index}`}
                                className={SPLIT.mapTooltipSwatch}
                                style={SPLIT.builder.legendSwatchStyle({
                                    background: visual.background,
                                    size: tooltipDetail.swatchSize,
                                    borderColor: visual.borderColor,
                                    backgroundImage: visual.backgroundImage,
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
                                <span className={SPLIT.mapLegendText}>{cell.label}</span>
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
                <span className={SPLIT.mapLegendModeLabel}>{t("torrent_modal.piece_map.download_mode")}</span>
                <span className={SPLIT.mapLegendModeValue}>{t(`torrent_modal.piece_map.mode_${mode}`)}</span>
            </div>
        </div>
    </div>
);

const PiecesView = ({
    viewModel,
    torrent,
    optimisticStatus,
    sequentialDownload,
    showPersistentHud,
}: PiecesViewProps) => {
    const { t } = useTranslation();
    const panelRef = useRef<HTMLDivElement>(null);
    const [panelWidth, setPanelWidth] = useState<number>(PIECE_MAP_HUD.legend_inline_min_width_px);
    const {
        refs: { rootRef, canvasRef, overlayRef, tooltipRef },
        palette,
        totalPieces,
        pieceSizeLabel,
        verifiedCount,
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
    const showInlineLegend = panelWidth >= PIECE_MAP_HUD.field_breakpoints_px.compact_plus;

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
                                torrent={torrent}
                                optimisticStatus={optimisticStatus}
                                visibleFields={visibleFields}
                                totalPieces={totalPieces}
                                pieceSizeLabel={pieceSizeLabel}
                                verifiedCount={verifiedCount}
                                missingCount={missingCount}
                                rareCount={rareCount}
                                deadCount={deadCount}
                                availabilityMissing={availabilityMissing}
                                t={t}
                            />
                            {showInlineLegend ? (
                                <PiecesLegend legendCells={legendCells} mode={downloadMode} t={t} inline />
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
                        <PiecesLegend legendCells={legendCells} mode={downloadMode} t={t} inline={false} />
                    ) : null}
                </div>
            </div>
        </GlassPanel>
    );
};

export const PiecesTab = ({
    torrent,
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
    optimisticStatus,
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
            torrent={torrent}
            optimisticStatus={optimisticStatus}
            sequentialDownload={sequentialDownload}
            showPersistentHud={showPersistentHud}
        />
    );
};
