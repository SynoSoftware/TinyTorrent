import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useActionFeedback } from "@/app/hooks/useActionFeedback";
import { NativeShell } from "@/app/runtime";

export function useOpenTorrentFolder() {
    const { showFeedback } = useActionFeedback();
    const { t } = useTranslation();
    return useCallback(
        async (path?: string | null) => {
            if (!path) return;
            if (!NativeShell.isAvailable) {
                showFeedback(
                    t("recovery.feedback.open_remote_folder"),
                    "warning"
                );
                return;
            }
            try {
                await NativeShell.openPath(path);
            } catch (err) {
                console.error("open folder failed", err);
                showFeedback(
                    t("recovery.feedback.open_path_failed"),
                    "warning"
                );
            }
        },
        [showFeedback, t]
    );
}
