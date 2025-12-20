import type { LucideIcon } from "lucide-react";
import type { Torrent } from "../../modules/dashboard/types/torrent";
import type { TorrentTableAction } from "../../modules/dashboard/components/TorrentTable";

export type RehashStatus = {
    active: boolean;
    value: number;
    label: string;
};

export type DeleteAction = Extract<TorrentTableAction, "remove" | "remove-with-data">;

export type DeleteIntent = {
    torrents: Torrent[];
    action: DeleteAction;
    deleteData: boolean;
};

export type AmbientHudCard = {
    id: string;
    label: string;
    title: string;
    description: string;
    surfaceClass: string;
    iconBgClass: string;
    icon: LucideIcon;
};
