import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import type { FeedbackTone } from "../../shared/types/feedback";
import type { GlobalActionFeedback } from "../types/workspace";

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

export function useActionFeedback() {
    const { t } = useTranslation();
    const [feedback, setFeedback] = useState<GlobalActionFeedback | null>(null);
    const timerRef = useRef<number | null>(null);

    const showFeedback = useCallback((message: string, tone: FeedbackTone) => {
        setFeedback({ message, tone });
        if (timerRef.current) {
            window.clearTimeout(timerRef.current);
        }
        timerRef.current = window.setTimeout(() => {
            setFeedback(null);
            timerRef.current = null;
        }, 3000);
    }, []);

    useEffect(() => {
        return () => {
            if (timerRef.current) {
                window.clearTimeout(timerRef.current);
            }
        };
    }, []);

    const announceAction = useCallback(
        (action: FeedbackAction, stage: FeedbackStage, count: number) => {
            const descriptor =
                GLOBAL_ACTION_FEEDBACK_CONFIG[action][stage];
            showFeedback(
                t(descriptor.key, { count }),
                descriptor.tone as FeedbackTone
            );
        },
        [showFeedback, t]
    );

    return {
        globalActionFeedback: feedback,
        announceAction,
        showFeedback,
    };
}
