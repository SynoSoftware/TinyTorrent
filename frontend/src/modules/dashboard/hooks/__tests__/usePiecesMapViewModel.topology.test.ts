import { describe, expect, it } from "vitest";
import { piecesMapTopologyInternals } from "@/modules/dashboard/hooks/usePiecesMapViewModel";

describe("usePiecesMapViewModel topology", () => {
    it("chooses an aggregated overview when per-piece cells are not readable", () => {
        const topology = piecesMapTopologyInternals.resolveOverviewTopology({
            viewportWidth: 960,
            viewportHeight: 520,
            totalPieces: 12_000,
            cellSize: 10,
            gap: 2,
            fallbackColumns: 60,
        });

        expect(topology.piecesPerBlock).toBeGreaterThan(1);
        expect(topology.blockCount).toBe(Math.ceil(12_000 / topology.piecesPerBlock));
        expect(topology.columns).toBeGreaterThan(1);
        expect(topology.columns).toBeLessThanOrEqual(topology.blockCount);
        expect(topology.rows).toBeGreaterThan(0);
    });

    it("aligns columns to separator groups when enough cells are present", () => {
        const topology = piecesMapTopologyInternals.resolveOverviewTopology({
            viewportWidth: 1280,
            viewportHeight: 520,
            totalPieces: 20_000,
            cellSize: 10,
            gap: 2,
            fallbackColumns: 60,
        });

        expect(topology.columns).toBeGreaterThanOrEqual(8);
        expect(topology.columns % 8).toBe(0);
    });

    it("adjusts pieces-per-block based on available viewport space", () => {
        const dense = piecesMapTopologyInternals.resolveOverviewTopology({
            viewportWidth: 1280,
            viewportHeight: 720,
            totalPieces: 20_000,
            cellSize: 10,
            gap: 2,
            fallbackColumns: 60,
        });
        const constrained = piecesMapTopologyInternals.resolveOverviewTopology({
            viewportWidth: 640,
            viewportHeight: 280,
            totalPieces: 20_000,
            cellSize: 10,
            gap: 2,
            fallbackColumns: 60,
        });

        expect(dense.piecesPerBlock).toBeGreaterThan(0);
        expect(constrained.piecesPerBlock).toBeGreaterThan(0);
        expect(constrained.piecesPerBlock).toBeGreaterThanOrEqual(dense.piecesPerBlock);
    });

    it("maps overview cells to truthful contiguous piece ranges", () => {
        const topology = piecesMapTopologyInternals.computeOverviewTopology({
            viewportWidth: 640,
            viewportHeight: 360,
            totalPieces: 10,
            columns: 2,
            piecesPerBlock: 4,
            cellSize: 10,
            gap: 2,
        });

        expect(
            piecesMapTopologyInternals.resolveCellPieceRange({
                row: 0,
                col: 0,
                topology,
                totalPieces: 10,
            }),
        ).toEqual({
            startPieceIndex: 0,
            endPieceIndex: 3,
        });
        expect(
            piecesMapTopologyInternals.resolveCellPieceRange({
                row: 1,
                col: 0,
                topology,
                totalPieces: 10,
            }),
        ).toEqual({
            startPieceIndex: 8,
            endPieceIndex: 9,
        });
        expect(
            piecesMapTopologyInternals.resolveCellPieceRange({
                row: 1,
                col: 1,
                topology,
                totalPieces: 10,
            }),
        ).toBeNull();
    });
});
