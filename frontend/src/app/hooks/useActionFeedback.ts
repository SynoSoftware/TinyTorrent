import { useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { addToast } from "@heroui/toast";

import type { FeedbackTone } from "@/shared/types/feedback";
import {
    ACTION_FEEDBACK_START_TOAST_DURATION_MS,
    TOAST_DISPLAY_DURATION_MS,
} from "@/config/logic";

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
            timeout: ACTION_FEEDBACK_START_TOAST_DURATION_MS,
        },
        done: { key: "toolbar.feedback.resumed", tone: "success" },
    },
    pause: {
        start: {
            key: "toolbar.feedback.pausing",
            tone: "warning",
            timeout: ACTION_FEEDBACK_START_TOAST_DURATION_MS,
        },
        done: { key: "toolbar.feedback.paused", tone: "warning" },
    },
    recheck: {
        start: {
            key: "toolbar.feedback.rehashing",
            tone: "info",
            timeout: ACTION_FEEDBACK_START_TOAST_DURATION_MS,
        },
        done: { key: "toolbar.feedback.rehashed", tone: "success" },
    },
    remove: {
        start: {
            key: "toolbar.feedback.removing",
            tone: "danger",
            timeout: ACTION_FEEDBACK_START_TOAST_DURATION_MS,
        },
        done: { key: "toolbar.feedback.removed", tone: "danger" },
    },
    "remove-with-data": {
        start: {
            key: "toolbar.feedback.removing",
            tone: "danger",
            timeout: ACTION_FEEDBACK_START_TOAST_DURATION_MS,
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

const TOAST_DURATION_MS = TOAST_DISPLAY_DURATION_MS;

const TONE_TO_TOAST: Record<
    FeedbackTone,
    (message: string, timeout?: number) => void
> = {
    info: (message, timeout) => {
        addToast({
            title: message,
            color: "primary",
            severity: "primary",
            timeout: timeout ?? TOAST_DURATION_MS,
            hideCloseButton: true,
        });
    },
    success: (message, timeout) => {
        addToast({
            title: message,
            color: "success",
            severity: "success",
            timeout: timeout ?? TOAST_DURATION_MS,
            hideCloseButton: true,
        });
    },
    warning: (message, timeout) => {
        addToast({
            title: message,
            color: "warning",
            severity: "warning",
            timeout: timeout ?? TOAST_DURATION_MS,
            hideCloseButton: true,
        });
    },
    danger: (message, timeout) => {
        addToast({
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
            TONE_TO_TOAST[tone](message, timeout);
        },
        []
    );

    const pendingStarts = useRef<Set<string>>(new Set());
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
            }
            showFeedback(
                t(descriptor.key, { count }),
                descriptor.tone as FeedbackTone,
                descriptor.timeout
            );
        },
        [showFeedback, t]
    );

    return {
        announceAction,
        showFeedback,
    };
}
