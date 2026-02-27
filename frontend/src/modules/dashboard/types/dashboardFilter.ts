import { status } from "@/shared/status";

export const all = "all" as const;
export const downloading = status.torrent.downloading;
export const seeding = status.torrent.seeding;

export const dashboardFilters = {
    all,
    downloading,
    seeding,
} as const;

export type DashboardFilter =
    | typeof all
    | typeof downloading
    | typeof seeding;

export const isDashboardFilter = (value: string): value is DashboardFilter =>
    value === all ||
    value === downloading ||
    value === seeding;
