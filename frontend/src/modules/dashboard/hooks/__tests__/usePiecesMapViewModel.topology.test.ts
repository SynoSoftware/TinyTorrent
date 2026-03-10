import { describe, expect, it } from "vitest";
import { piecesMapTopologyInternals } from "@/modules/dashboard/hooks/usePiecesMapViewModel";

describe("usePiecesMapViewModel topology", () => {
    const viewportWidth = 960;
    const viewportHeight = 520;
    const totalPieces = 12_000;
    const minDisplayBlockPx = 12;
    const cellSize = 10;
    const gap = 2;
    const chunkInterval = 10;
    const chunkGap = 3;
    const fallbackColumns = 60;

    const rootRaster = piecesMapTopologyInternals.resolveRootRaster({
        viewportWidth,
        viewportHeight,
        totalPieces,
        minDisplayBlockPx,
        cellSize,
        gap,
        chunkInterval,
        chunkGap,
        fallbackColumns,
    });

    const findFirstChildTopology = (preferredPiecesPerBlock: number) => {
        const zoomMultipliers = [1.25, 1.5, 2, 2.5, 4, 6, 8];

        for (const zoomMultiplier of zoomMultipliers) {
            const topology = piecesMapTopologyInternals.resolveDisplayTopology({
                viewportWidth,
                viewportHeight,
                totalPieces,
                minDisplayBlockPx,
                rootRaster,
                preferredPiecesPerBlock,
                zoomMultiplier,
                cellSize,
                gap,
                chunkInterval,
                chunkGap,
            });
            if (topology.piecesPerBlock < preferredPiecesPerBlock) {
                return topology;
            }
        }

        return null;
    };

    it("keeps zoom levels on the same parent raster", () => {
        const overviewTopology = piecesMapTopologyInternals.resolveDisplayTopology({
            viewportWidth,
            viewportHeight,
            totalPieces,
            minDisplayBlockPx,
            rootRaster,
            zoomMultiplier: 1,
            cellSize,
            gap,
            chunkInterval,
            chunkGap,
        });
        const childTopology = findFirstChildTopology(overviewTopology.piecesPerBlock);

        expect(overviewTopology.piecesPerBlock).toBe(8);
        expect(childTopology?.piecesPerBlock).toBe(4);

        const overviewPosition = piecesMapTopologyInternals.resolveBlockGridPosition({
            pieceIndex: 8867,
            totalPieces,
            rootRaster,
            topology: overviewTopology,
        });
        const childPosition = piecesMapTopologyInternals.resolveBlockGridPosition({
            pieceIndex: 8867,
            totalPieces,
            rootRaster,
            topology: childTopology!,
        });

        expect(overviewPosition?.rootRow).toBe(childPosition?.rootRow);
        expect(overviewPosition?.rootCol).toBe(childPosition?.rootCol);
        expect(overviewPosition?.row).toBe(overviewPosition?.rootRow);
        expect(overviewPosition?.col).toBe(overviewPosition?.rootCol);
        expect(childPosition?.row).toBe(childPosition?.rootRow);
        expect(childPosition?.col).toBe((childPosition?.rootCol ?? 0) * 2);
    });

    it("splits parent ranges into contiguous child ranges", () => {
        const overviewTopology = piecesMapTopologyInternals.resolveDisplayTopology({
            viewportWidth,
            viewportHeight,
            totalPieces,
            minDisplayBlockPx,
            rootRaster,
            zoomMultiplier: 1,
            cellSize,
            gap,
            chunkInterval,
            chunkGap,
        });
        const childTopology = findFirstChildTopology(overviewTopology.piecesPerBlock);

        const parentRange = piecesMapTopologyInternals.resolveCellPieceRange({
            row: 0,
            col: 0,
            topology: overviewTopology,
            rootRaster,
            totalPieces,
        });
        const firstChildRange = piecesMapTopologyInternals.resolveCellPieceRange({
            row: 0,
            col: 0,
            topology: childTopology!,
            rootRaster,
            totalPieces,
        });
        const secondChildRange = piecesMapTopologyInternals.resolveCellPieceRange({
            row: 0,
            col: 1,
            topology: childTopology!,
            rootRaster,
            totalPieces,
        });

        expect(parentRange).toEqual({
            startPieceIndex: 0,
            endPieceIndex: 7,
        });
        expect(firstChildRange).toEqual({
            startPieceIndex: 0,
            endPieceIndex: 3,
        });
        expect(secondChildRange).toEqual({
            startPieceIndex: 4,
            endPieceIndex: 7,
        });
    });
});
