import { useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { addToast, closeToast } from "@heroui/toast";

import type { FeedbackTone } from "@/shared/types/feedback";
import { registry } from "@/config/logic";
const { timing, ui } = registry;

type FeedbackDescriptor = {
    key: string;
    tone: FeedbackTone;
    timeout?: number;
};

const GLOBAL_ACTION_FEEDBACK_CONFIG_INTERNAL = {
    resume: {
        start: {
            key: "toolbar.feedback.resuming",
            tone: "info",
            timeout: timing.ui.actionFeedbackStartToastMs,
        },
        done: { key: "toolbar.feedback.resumed", tone: "success" },
    },
    pause: {
        start: {
            key: "toolbar.feedback.pausing",
            tone: "warning",
            timeout: timing.ui.actionFeedbackStartToastMs,
        },
        done: { key: "toolbar.feedback.paused", tone: "warning" },
    },
    recheck: {
        start: {
            key: "toolbar.feedback.rehashing",
            tone: "info",
            timeout: timing.ui.actionFeedbackStartToastMs,
        },
        done: { key: "toolbar.feedback.rehashed", tone: "success" },
    },
    remove: {
        start: {
            key: "toolbar.feedback.removing",
            tone: "danger",
            timeout: timing.ui.actionFeedbackStartToastMs,
        },
        done: { key: "toolbar.feedback.removed", tone: "danger" },
    },
    "remove-with-data": {
        start: {
            key: "toolbar.feedback.removing",
            tone: "danger",
            timeout: timing.ui.actionFeedbackStartToastMs,
        },
        done: {
            key: "toolbar.feedback.removed",
            tone: "danger",
        },
    },
} as const;

export type FeedbackAction = keyof typeof GLOBAL_ACTION_FEEDBACK_CONFIG_INTERNAL;
export const GLOBAL_ACTION_FEEDBACK_CONFIG =
    GLOBAL_ACTION_FEEDBACK_CONFIG_INTERNAL;
export type FeedbackStage = "start" | "done";

const TOAST_DURATION_MS = timing.ui.toastMs;

const TONE_TO_TOAST: Record<
    FeedbackTone,
    (message: string, timeout?: number) => string | null
> = {
    info: (message, timeout) => {
        return addToast({
            title: message,
            color: "primary",
            severity: "primary",
            timeout: timeout ?? TOAST_DURATION_MS,
            hideCloseButton: true,
        });
    },
    success: (message, timeout) => {
        return addToast({
            title: message,
            color: "success",
            severity: "success",
            timeout: timeout ?? TOAST_DURATION_MS,
            hideCloseButton: true,
        });
    },
    warning: (message, timeout) => {
        return addToast({
            title: message,
            color: "warning",
            severity: "warning",
            timeout: timeout ?? TOAST_DURATION_MS,
            hideCloseButton: true,
        });
    },
    danger: (message, timeout) => {
        return addToast({
            title: message,
            color: "danger",
            severity: "danger",
            timeout: timeout ?? TOAST_DURATION_MS,
            hideCloseButton: true,
        });
    },
};
// Invariant: feedback is command-driven. Each logical command yields a single actionId,
// start is idempotent (no duplicate toasts), done/error clears that identity, and
// correctness lives in the workflow (not in timeouts). Anything beyond these rules
// must go through the CommandDescriptor refactor described in the workflow TODO.
export function useActionFeedback() {
    const { t } = useTranslation();
    const showFeedback = useCallback(
        (message: string, tone: FeedbackTone, timeout?: number) => {
            return TONE_TO_TOAST[tone](message, timeout);
        },
        []
    );

    const pendingStarts = useRef<Set<string>>(new Set());
    const startToastKeys = useRef<Map<string, string>>(new Map());
    const announceAction = useCallback(
        (
            action: FeedbackAction,
            stage: FeedbackStage,
            count: number,
            actionId?: string
        ) => {
            const descriptor = GLOBAL_ACTION_FEEDBACK_CONFIG[action][stage] as FeedbackDescriptor;
            const makeKey = (id?: string) =>
                id ? `${action}:${id}` : action;

            if (stage === "start" && actionId) {
                const key = makeKey(actionId);
                if (pendingStarts.current.has(key)) {
                    return;
                }
                pendingStarts.current.add(key);
            }
            if (stage === "done" && actionId) {
                const key = makeKey(actionId);
                pendingStarts.current.delete(key);
                const startToastKey = startToastKeys.current.get(key);
                if (startToastKey) {
                    closeToast(startToastKey);
                    startToastKeys.current.delete(key);
                }
            }
            const toastKey = showFeedback(
                t(descriptor.key, { count }),
                descriptor.tone as FeedbackTone,
                descriptor.timeout
            );
            if (stage === "start" && actionId && toastKey) {
                const key = makeKey(actionId);
                startToastKeys.current.set(key, toastKey);
            }
        },
        [showFeedback, t]
    );

    return {
        announceAction,
        showFeedback,
    };
}

