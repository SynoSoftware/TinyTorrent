import type { LucideIcon } from "lucide-react";
import type { FeedbackMessage } from "../../shared/types/feedback";
import type { Torrent } from "../../modules/dashboard/types/torrent";
import type { TorrentTableAction } from "../../modules/dashboard/components/TorrentTable";

export type GlobalActionFeedback = FeedbackMessage;

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
