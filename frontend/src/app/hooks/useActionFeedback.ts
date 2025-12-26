import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { addToast } from "@heroui/toast";

import type { FeedbackTone } from "@/shared/types/feedback";
import { CONFIG } from "@/config/logic";

export const GLOBAL_ACTION_FEEDBACK_CONFIG = {
    resume: {
        start: { key: "toolbar.feedback.resuming", tone: "info" },
        done: { key: "toolbar.feedback.resumed", tone: "success" },
    },
    pause: {
        start: { key: "toolbar.feedback.pausing", tone: "warning" },
        done: { key: "toolbar.feedback.paused", tone: "warning" },
    },
    recheck: {
        start: { key: "toolbar.feedback.rehashing", tone: "info" },
        done: { key: "toolbar.feedback.rehashed", tone: "success" },
    },
    remove: {
        start: { key: "toolbar.feedback.removing", tone: "danger" },
        done: { key: "toolbar.feedback.removed", tone: "danger" },
    },
    "remove-with-data": {
        start: { key: "toolbar.feedback.removing", tone: "danger" },
        done: { key: "toolbar.feedback.removed", tone: "danger" },
    },
} as const;

export type FeedbackAction = keyof typeof GLOBAL_ACTION_FEEDBACK_CONFIG;
export type FeedbackStage = "start" | "done";

const TOAST_DURATION_MS = CONFIG.ui.toast_display_duration_ms;

const TONE_TO_TOAST: Record<FeedbackTone, (message: string) => void> = {
    info: (message) => {
        addToast({
            title: message,
            color: "primary",
            severity: "primary",
            timeout: TOAST_DURATION_MS,
            hideCloseButton: true,
        });
    },
    success: (message) => {
        addToast({
            title: message,
            color: "success",
            severity: "success",
            timeout: TOAST_DURATION_MS,
            hideCloseButton: true,
        });
    },
    warning: (message) => {
        addToast({
            title: message,
            color: "warning",
            severity: "warning",
            timeout: TOAST_DURATION_MS,
            hideCloseButton: true,
        });
    },
    danger: (message) => {
        addToast({
            title: message,
            color: "danger",
            severity: "danger",
            timeout: TOAST_DURATION_MS,
            hideCloseButton: true,
        });
    },
};

export function useActionFeedback() {
    const { t } = useTranslation();
    const showFeedback = useCallback((message: string, tone: FeedbackTone) => {
        TONE_TO_TOAST[tone](message);
    }, []);

    const announceAction = useCallback(
        (action: FeedbackAction, stage: FeedbackStage, count: number) => {
            const descriptor = GLOBAL_ACTION_FEEDBACK_CONFIG[action][stage];
            showFeedback(
                t(descriptor.key, { count }),
                descriptor.tone as FeedbackTone
            );
        },
        [showFeedback, t]
    );

    return {
        announceAction,
        showFeedback,
    };
}
