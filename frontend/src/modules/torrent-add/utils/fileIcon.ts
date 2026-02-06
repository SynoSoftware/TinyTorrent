import {
    File as FileIcon,
    FileText,
    FileVideo,
    type LucideIcon,
} from "lucide-react";
import { classifyFileKind } from "@/modules/torrent-add/services/fileSelection";

export interface FileIconVisual {
    Icon: LucideIcon;
    toneClass: string;
}

export function resolveFileIcon(path: string): FileIconVisual {
    const kind = classifyFileKind(path);
    if (kind === "video") {
        return {
            Icon: FileVideo,
            toneClass: "text-primary",
        };
    }
    if (kind === "text") {
        return {
            Icon: FileText,
            toneClass: "text-foreground/40",
        };
    }
    return {
        Icon: FileIcon,
        toneClass: "text-foreground/40",
    };
}
