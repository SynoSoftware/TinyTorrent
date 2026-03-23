import { describe, expect, it } from "vitest";
import type { RowSelectionState } from "@tanstack/react-table";
import {
    moveQueuePacketByDirection,
    reorderQueuePacketByDropTarget,
    resolveQueuePacket,
} from "@/modules/dashboard/hooks/utils/queue-reorder";

const makeSelection = (ids: string[]): RowSelectionState =>
    Object.fromEntries(ids.map((id) => [id, true])) as RowSelectionState;

describe("queue-reorder", () => {
    it("uses queue order for packet membership and order", () => {
        const packet = resolveQueuePacket({
            queueOrder: ["row-1", "row-2", "row-3", "row-4", "row-5"],
            rowSelection: makeSelection(["row-5", "row-1", "row-3"]),
            actedRowId: "row-5",
        });

        expect(packet).toEqual({
            movingIds: ["row-1", "row-3", "row-5"],
            currentInsertionIndex: 0,
        });
    });

    it("uses only the acted row when the acted row is outside the selection", () => {
        const packet = resolveQueuePacket({
            queueOrder: ["row-1", "row-2", "row-3", "row-4"],
            rowSelection: makeSelection(["row-1", "row-3"]),
            actedRowId: "row-2",
        });

        expect(packet?.movingIds).toEqual(["row-2"]);
    });

    it("resolves drop targets against the reduced queue", () => {
        const packet = resolveQueuePacket({
            queueOrder: ["row-1", "row-2", "row-3", "row-4", "row-5"],
            rowSelection: makeSelection(["row-1", "row-3", "row-5"]),
            actedRowId: "row-1",
        });
        if (!packet) {
            throw new Error("packet_missing");
        }

        const reorder = reorderQueuePacketByDropTarget(
            ["row-1", "row-2", "row-3", "row-4", "row-5"],
            packet,
            "row-4",
            true,
        );

        expect(reorder).toEqual({
            movingIds: ["row-1", "row-3", "row-5"],
            nextOrder: ["row-2", "row-4", "row-1", "row-3", "row-5"],
            targetInsertionIndex: 2,
        });
    });

    it("moves by one adjacent insertion step for queue up and down", () => {
        const packet = resolveQueuePacket({
            queueOrder: ["row-1", "row-2", "row-3", "row-4"],
            rowSelection: makeSelection(["row-2", "row-3"]),
            actedRowId: "row-2",
        });
        if (!packet) {
            throw new Error("packet_missing");
        }

        expect(
            moveQueuePacketByDirection(
                ["row-1", "row-2", "row-3", "row-4"],
                packet,
                "down",
            ),
        ).toEqual({
            movingIds: ["row-2", "row-3"],
            nextOrder: ["row-1", "row-4", "row-2", "row-3"],
            targetInsertionIndex: 2,
        });

        expect(
            moveQueuePacketByDirection(
                ["row-1", "row-2", "row-3", "row-4"],
                packet,
                "up",
            ),
        ).toEqual({
            movingIds: ["row-2", "row-3"],
            nextOrder: ["row-2", "row-3", "row-1", "row-4"],
            targetInsertionIndex: 0,
        });
    });

    it("returns null when the target resolves to the current insertion position", () => {
        const packet = resolveQueuePacket({
            queueOrder: ["row-1", "row-2", "row-3"],
            rowSelection: makeSelection(["row-2"]),
            actedRowId: "row-2",
        });
        if (!packet) {
            throw new Error("packet_missing");
        }

        expect(
            reorderQueuePacketByDropTarget(
                ["row-1", "row-2", "row-3"],
                packet,
                "row-3",
                false,
            ),
        ).toBeNull();
    });

    it("collapses a non-contiguous packet when dropped at its current reduced insertion position", () => {
        const packet = resolveQueuePacket({
            queueOrder: [
                "row-1",
                "row-2",
                "row-3",
                "row-4",
                "row-5",
                "row-6",
                "row-7",
                "row-8",
                "row-9",
            ],
            rowSelection: makeSelection([
                "row-4",
                "row-5",
                "row-6",
                "row-7",
                "row-9",
            ]),
            actedRowId: "row-4",
        });
        if (!packet) {
            throw new Error("packet_missing");
        }

        expect(
            reorderQueuePacketByDropTarget(
                [
                    "row-1",
                    "row-2",
                    "row-3",
                    "row-4",
                    "row-5",
                    "row-6",
                    "row-7",
                    "row-8",
                    "row-9",
                ],
                packet,
                "row-8",
                false,
            ),
        ).toEqual({
            movingIds: ["row-4", "row-5", "row-6", "row-7", "row-9"],
            nextOrder: [
                "row-1",
                "row-2",
                "row-3",
                "row-4",
                "row-5",
                "row-6",
                "row-7",
                "row-9",
                "row-8",
            ],
            targetInsertionIndex: 3,
        });
    });

    it("treats drag-to-beginning/end as equivalent to move-to-top/bottom", () => {
        const queueOrder = ["row-1", "row-2", "row-3", "row-4"];
        const packet = resolveQueuePacket({
            queueOrder,
            rowSelection: makeSelection(["row-2", "row-3"]),
            actedRowId: "row-2",
        });
        if (!packet) {
            throw new Error("packet_missing");
        }

        expect(
            reorderQueuePacketByDropTarget(queueOrder, packet, "row-1", false),
        ).toEqual(moveQueuePacketByDirection(queueOrder, packet, "top"));
        expect(
            reorderQueuePacketByDropTarget(queueOrder, packet, "row-4", true),
        ).toEqual(moveQueuePacketByDirection(queueOrder, packet, "bottom"));
    });
});
