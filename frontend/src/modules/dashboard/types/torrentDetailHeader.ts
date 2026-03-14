import type { LucideIcon } from "lucide-react";

export type TorrentDetailHeaderActionTone =
    | "success"
    | "warning"
    | "danger"
    | "neutral"
    | "default";

export interface TorrentDetailHeaderAction {
    icon: LucideIcon;
    ariaLabel: string;
    onPress: () => void;
    tone: TorrentDetailHeaderActionTone;
}
