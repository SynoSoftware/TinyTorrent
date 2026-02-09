import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useActionFeedback } from "@/app/hooks/useActionFeedback";
import { shellAgent } from "@/app/agents/shell-agent";
import type { OpenFolderOutcome } from "@/app/types/openFolder";

function normalizePath(value: string) {
    return value.replace(/[\\/]+$/, "");
}

function getParentPath(value: string) {
    const normalized = normalizePath(value);
    const lastSlash = Math.max(
        normalized.lastIndexOf("/"),
        normalized.lastIndexOf("\\")
    );
    if (lastSlash <= 0) return null;
    const parent = normalized.slice(0, lastSlash);
    return parent || null;
}

function getDriveRoot(value: string) {
    const normalized = normalizePath(value);
    const driveMatch = normalized.match(/^([a-zA-Z]:)([\\/]|$)/);
    if (driveMatch) {
        return `${driveMatch[1]}\\`;
    }
    const uncMatch = normalized.match(/^(\\\\[^\\/]+\\[^\\/]+)/);
    if (uncMatch) {
        return uncMatch[1];
    }
    return null;
}

export function useOpenTorrentFolder() {
    const { showFeedback } = useActionFeedback();
    const { t } = useTranslation();
    return useCallback(
        async (path?: string | null): Promise<OpenFolderOutcome> => {
            if (!path) {
                return { status: "missing_path" };
            }
            if (!shellAgent.isAvailable) {
                showFeedback(
                    t("recovery.feedback.open_remote_folder"),
                    "warning"
                );
                return { status: "unsupported" };
            }
            const attempts = [path];
            const parent = getParentPath(path);
            if (parent) attempts.push(parent);
            const root = getDriveRoot(path);
            if (root && root !== parent) attempts.push(root);

            let lastError: unknown = null;
            for (const target of attempts) {
                if (!target) continue;
                try {
                    await shellAgent.openPath(target);
                    if (target === path) {
                        return { status: "opened" };
                    }
                    if (target === parent) {
                        showFeedback(
                            t("recovery.feedback.folder_parent_opened"),
                            "info"
                        );
                        return { status: "opened_parent" };
                    }
                    showFeedback(
                        t("recovery.feedback.folder_parent_opened"),
                        "info"
                    );
                    return { status: "opened_root" };
                } catch (err) {
                    lastError = err;
                }
            }
            if (lastError) {
                console.error("open folder failed", lastError);
            }
            showFeedback(t("recovery.open_path_failed"), "warning");
            return { status: "failed" };
        },
        [showFeedback, t]
    );
}
