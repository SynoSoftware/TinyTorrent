import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useActionFeedback } from "@/app/hooks/useActionFeedback";
import { useRecoveryContext } from "@/app/context/RecoveryContext";
import { NativeShell } from "@/app/runtime";
// TODO: Replace direct NativeShell usage with the ShellAgent/ShellExtensions adapter and capability helper; do not branch on connectionMode strings.
// TODO: This hook should not infer capability (connectionMode/native shell) locally. It should consume `uiMode` (or `canOpenFolder`) from the single capability provider and call the ShellAgent adapter.
// TODO: Contract: return a typed outcome (`opened`, `opened-parent`, `unsupported`, `failed`) so callers don't infer behavior from toasts.

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
    const { connectionMode } = useRecoveryContext();
    const { t } = useTranslation();
    return useCallback(
        async (path?: string | null) => {
            if (!path) return;
            const canOpen =
                connectionMode === "tinytorrent-local-shell" &&
                NativeShell.isAvailable;
            // TODO: Replace `connectionMode` branching with `uiMode = Full | Rpc`:
            // TODO: - `uiMode=Full` => canOpen true (via ShellAgent/ShellExtensions adapter)
            // TODO: - `uiMode=Rpc`  => canOpen false
            // TODO: Also replace direct `NativeShell.openPath` usage with the ShellAgent/ShellExtensions adapter.
            if (!canOpen) {
                showFeedback(
                    t("recovery.feedback.open_remote_folder"),
                    "warning"
                );
                return;
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
                    await NativeShell.openPath(target);
                    if (target !== path) {
                        showFeedback(
                            t("recovery.feedback.folder_parent_opened"),
                            "info"
                        );
                    }
                    return;
                } catch (err) {
                    lastError = err;
                }
            }
            if (lastError) {
                console.error("open folder failed", lastError);
            }
            showFeedback(
                t("recovery.feedback.open_path_failed"),
                "warning"
            );
        },
        [showFeedback, t]
    );
}
