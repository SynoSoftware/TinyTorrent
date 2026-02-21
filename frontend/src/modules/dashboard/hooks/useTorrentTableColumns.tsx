import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import type { TFunction } from "i18next";
import {
    DEFAULT_COLUMN_ORDER,
    TORRENTTABLE_COLUMN_DEFS,
    type ColumnId,
} from "@/modules/dashboard/components/TorrentTable_ColumnDefs";
import { ICON_STROKE_WIDTH_DENSE } from "@/config/logic";
import type { Torrent } from "@/modules/dashboard/types/torrent";
import type { DashboardTableMeta } from "@/modules/dashboard/components/TorrentTable_ColumnDefs";
import type { OptimisticStatusMap } from "@/modules/dashboard/types/optimistic";
import type { RefObject } from "react";
import { TABLE } from "@/shared/ui/layout/glass-surface";

export function useTorrentTableColumns({
    t,
    speedHistoryRef,
    optimisticStatuses,
}: {
    t: TFunction;
    speedHistoryRef: RefObject<Record<string, Array<number | null>>>;
    optimisticStatuses: OptimisticStatusMap;
}): { columns: ColumnDef<Torrent>[]; tableMeta: DashboardTableMeta } {
    const columns = useMemo<ColumnDef<Torrent>[]>(() => {
        const cols = DEFAULT_COLUMN_ORDER.map((colId) => {
            const id = colId as ColumnId;
            const def = TORRENTTABLE_COLUMN_DEFS[id];
            if (!def) return null;
            const sortAccessor = def.sortAccessor;
            const accessorKey = sortAccessor ? undefined : def.rpcField;
            const accessorFn = sortAccessor
                ? (torrent: Torrent) => sortAccessor(torrent)
                : undefined;
            return {
                id,
                accessorKey,
                accessorFn,
                enableSorting: Boolean(def.sortable),
                header: () => {
                    const label = def.labelKey ? t(def.labelKey) : "";
                    const HeaderIcon = def.headerIcon;
                    return HeaderIcon ? (
                        <div
                            className={TABLE.columnHeaderLabel}
                            style={TABLE.columnHeaderLabelTrackingStyle}
                        >
                            <HeaderIcon
                                strokeWidth={ICON_STROKE_WIDTH_DENSE}
                                className={TABLE.columnHeaderPulseIcon}
                            />
                            <span>{label}</span>
                        </div>
                    ) : (
                        label
                    );
                },
                size: def.width ?? 150,
                enableResizing: true,
                meta: { align: def.align },
                cell: ({ row, table }) => {
                    const CellRenderer = def.render;
                    const optimisticStatus = (
                        table.options.meta as DashboardTableMeta | undefined
                    )?.optimisticStatuses[row.original.id];
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
    }, [t]);

    const tableMeta = useMemo<DashboardTableMeta>(
        () => ({
            speedHistoryRef,
            optimisticStatuses,
        }),
        [optimisticStatuses, speedHistoryRef],
    );

    return { columns, tableMeta };
}
