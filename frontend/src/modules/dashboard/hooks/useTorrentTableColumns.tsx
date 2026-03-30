import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import type { TFunction } from "i18next";
import {
    DEFAULT_COLUMN_ORDER,
    TORRENTTABLE_COLUMN_DEFS,
    type ColumnId,
} from "@/modules/dashboard/components/TorrentTable_ColumnDefs";
import { registry } from "@/config/logic";
import type { TorrentEntity as Torrent } from "@/services/rpc/entities";
import type { DashboardTableMeta } from "@/modules/dashboard/components/TorrentTable_ColumnDefs";
import type { OptimisticStatusMap } from "@/modules/dashboard/types/contracts";
import type { RefObject } from "react";
import { table } from "@/shared/ui/layout/glass-surface";
import type { SpeedHistorySnapshot } from "@/shared/hooks/speedHistoryStore";
const { visuals } = registry;

export function useTorrentTableColumns({
    t,
    speedHistoryRef,
    optimisticStatuses,
    rowHeight,
}: {
    t: TFunction;
    speedHistoryRef: RefObject<Record<string, SpeedHistorySnapshot | Array<number | null>>>;
    optimisticStatuses: OptimisticStatusMap;
    rowHeight: number;
}): { columns: ColumnDef<Torrent>[]; tableMeta: DashboardTableMeta } {
    const tableMeta = useMemo<DashboardTableMeta>(
        () => ({
            speedHistoryRef,
            optimisticStatuses,
            rowHeight,
        }),
        [optimisticStatuses, rowHeight, speedHistoryRef],
    );

    const columns = useMemo<ColumnDef<Torrent>[]>(() => {
        const cols = DEFAULT_COLUMN_ORDER.map((colId) => {
            const id = colId as ColumnId;
            const def = TORRENTTABLE_COLUMN_DEFS[id];
            if (!def) return null;
            const sortAccessor = def.sortAccessor;
            const accessorKey = sortAccessor ? undefined : def.rpcField;
            const accessorFn = sortAccessor ? (torrent: Torrent) => sortAccessor(torrent, tableMeta) : undefined;
            return {
                id,
                accessorKey,
                accessorFn,
                enableSorting: Boolean(def.sortable),
                header: () => {
                    const label = def.labelKey ? t(def.labelKey) : "";
                    const HeaderIcon = def.headerIcon;
                    return HeaderIcon ? (
                        <div className={table.columnHeaderLabel} style={table.columnHeaderLabelTrackingStyle}>
                            <HeaderIcon
                                strokeWidth={visuals.icon.strokeWidthDense}
                                className={table.columnHeaderIcon}
                            />
                            <span>{label}</span>
                        </div>
                    ) : (
                        label
                    );
                },
                size: def.width ?? 150,
                minSize: def.minSize,
                enableResizing: true,
                meta: { align: def.align },
                cell: ({ row, table }) => {
                    const CellRenderer = def.render;
                    const optimisticStatus = (table.options.meta as DashboardTableMeta | undefined)?.optimisticStatuses[
                        row.original.id
                    ];
                    return (
                        <CellRenderer
                            torrent={row.original}
                            t={t}
                            isSelected={row.getIsSelected()}
                            table={table}
                            optimisticStatus={optimisticStatus}
                        />
                    );
                },
            } as ColumnDef<Torrent>;
        });
        return cols.filter(Boolean) as ColumnDef<Torrent>[];
    }, [t, tableMeta]);

    return { columns, tableMeta };
}
