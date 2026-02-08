import { cn } from "@heroui/react";
import { useTranslation } from "react-i18next";
import { TEXT_ROLES } from "@/modules/dashboard/hooks/utils/textRoles";
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
        <div className="flex flex-col flex-1 min-h-0 gap-panel">
            <div
                className="flex flex-wrap justify-between gap-panel text-foreground/50"
                style={{ letterSpacing: "var(--tt-tracking-wide)" }}
            >
                <div className="flex flex-col gap-tight">
                    <span className={TEXT_ROLES.label}>
                        {t("torrent_modal.stats.pieces")}
                    </span>
                    <span className="text-scaled font-mono text-foreground">
                        {totalPieces}
                    </span>
                </div>

                <div className="flex flex-col gap-tight">
                    <span className={TEXT_ROLES.label}>
                        {t("torrent_modal.stats.piece_size")}
                    </span>
                    <span className="text-scaled font-mono text-foreground">
                        {pieceSizeLabel}
                    </span>
                </div>

                <div className="flex flex-col gap-tight">
                    <span className={TEXT_ROLES.label}>
                        {t("torrent_modal.stats.verified")}
                    </span>
                    <span className="text-scaled font-mono text-foreground">
                        {doneCount}
                    </span>
                </div>

                <div className="flex flex-col gap-tight">
                    <span className={TEXT_ROLES.label}>
                        {t("torrent_modal.stats.downloading")}
                    </span>
                    <span className="text-scaled font-mono text-warning">
                        {downloadingCount}
                    </span>
                </div>

                <div className="flex flex-col gap-tight">
                    <span className={TEXT_ROLES.label}>
                        {t("torrent_modal.stats.missing")}
                    </span>
                    <span className="text-scaled font-mono text-danger">
                        {missingCount}
                    </span>
                </div>
            </div>

            {hasBinaryPieceStates && (
                <div className="text-scaled text-foreground/60">
                    {t("torrent_modal.piece_map.binary_states_note")}
                </div>
            )}

            <div
                ref={rootRef}
                className="relative z-10 flex-1 min-h-0 rounded-2xl border border-content1/20 bg-content1/10 p-panel overflow-hidden"
            >
                <div className="relative w-full h-full">
                    <canvas
                        ref={canvasRef}
                        className="absolute inset-0 w-full h-full block rounded-2xl"
                        onMouseMove={handlers.onMouseMove}
                        onMouseLeave={handlers.onMouseLeave}
                        onMouseDown={handlers.onMouseDown}
                        style={{
                            cursor,
                            touchAction: "none",
                            pointerEvents: "auto",
                        }}
                    />
                    <canvas
                        ref={overlayRef}
                        className="absolute inset-0 w-full h-full block rounded-2xl pointer-events-none"
                    />

                    {tooltipLines.length > 0 && tooltipStyle && (
                        <div
                            className="pointer-events-none absolute z-10 max-w-tooltip rounded-2xl border border-content1/30 bg-content1/90 px-panel py-tight text-scaled text-foreground/90 shadow-large backdrop-blur-xl"
                            style={tooltipStyle}
                        >
                            {tooltipLines.map((line, index) => (
                                <span
                                    key={`piece-tooltip-${index}`}
                                    className={cn(
                                        "block whitespace-normal text-scaled",
                                        index === 0
                                            ? "font-semibold"
                                            : "text-foreground/70"
                                    )}
                                >
                                    {line}
                                </span>
                            ))}
                        </div>
                    )}

                    <div className="absolute right-2 bottom-2 flex gap-2">
                        <div className="text-[11px] text-foreground/60 bg-content1/40 backdrop-blur-xl border border-content1/25 rounded-full px-3 py-1">
                            {t("torrent_modal.piece_map.hint_interact")}
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex gap-panel mt-tight items-center">
                <span className="flex items-center gap-tight">
                    <span
                        style={{
                            width: 14,
                            height: 14,
                            background: palette.success,
                            display: "inline-block",
                            borderRadius: 4,
                        }}
                    />
                    <span className={`${TEXT_ROLES.secondary} text-foreground/70`}>
                        {t("torrent_modal.stats.verified")}
                    </span>
                </span>

                <span className="flex items-center gap-tight">
                    <span
                        style={{
                            width: 14,
                            height: 14,
                            background: palette.warning,
                            display: "inline-block",
                            borderRadius: 4,
                            border: `1px solid ${palette.primary}`,
                        }}
                    />
                    <span className={`${TEXT_ROLES.secondary} text-foreground/70`}>
                        {t("torrent_modal.stats.downloading")}
                    </span>
                </span>

                <span className="flex items-center gap-tight">
                    <span
                        style={{
                            width: 14,
                            height: 14,
                            background: palette.foreground,
                            display: "inline-block",
                            borderRadius: 4,
                            border: `1px solid ${palette.danger}`,
                            opacity: 0.2,
                        }}
                    />
                    <span className={`${TEXT_ROLES.secondary} text-foreground/70`}>
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
