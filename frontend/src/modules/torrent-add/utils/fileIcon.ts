import {
    File as FileIcon,
    FileText,
    FileVideo,
    type LucideIcon,
} from "lucide-react";
import { registry } from "@/config/logic";
import { classifyFileKind } from "@/modules/torrent-add/services/fileSelection";
const { visuals } = registry;

export interface FileIconVisual {
    Icon: LucideIcon;
    toneClass: string;
}

export function resolveFileIcon(path: string): FileIconVisual {
    const kind = classifyFileKind(path);
    if (kind === "video") {
        return {
            Icon: FileVideo,
            toneClass: visuals.fileIcons.video,
        };
    }
    if (kind === "text") {
        return {
            Icon: FileText,
            toneClass: visuals.fileIcons.text,
        };
    }
    return {
        Icon: FileIcon,
        toneClass: visuals.fileIcons.generic,
    };
}
