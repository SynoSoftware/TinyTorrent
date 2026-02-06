import { STATUS } from "@/shared/status";

export const DASHBOARD_FILTERS = {
    ALL: "all",
    DOWNLOADING: STATUS.torrent.DOWNLOADING,
    SEEDING: STATUS.torrent.SEEDING,
} as const;

export type DashboardFilter =
    (typeof DASHBOARD_FILTERS)[keyof typeof DASHBOARD_FILTERS];

export const isDashboardFilter = (value: string): value is DashboardFilter =>
    value === DASHBOARD_FILTERS.ALL ||
    value === DASHBOARD_FILTERS.DOWNLOADING ||
    value === DASHBOARD_FILTERS.SEEDING;
