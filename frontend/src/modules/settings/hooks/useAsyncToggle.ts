import { useCallback, useState } from "react";

export type AsyncToggleActionResult =
    | { status: "applied" }
    | { status: "unsupported"; reason: string };

export type AsyncToggleOutcome =
    | { status: "applied" }
    | { status: "noop"; reason: "unchanged" }
    | { status: "canceled"; reason: "pending" }
    | { status: "unsupported"; reason: string }
    | { status: "failed"; reason: "execution_failed"; error: Error };

export interface AsyncToggleResult {
    pending: boolean;
    onChange: (next: boolean) => Promise<AsyncToggleOutcome>;
}

export function useAsyncToggle(
    value: boolean,
    setter: (next: boolean) => void,
    action?: (next: boolean) => Promise<AsyncToggleActionResult>
): AsyncToggleResult {
    const [pending, setPending] = useState(false);

    const onChange = useCallback(
        async (next: boolean) => {
            if (pending) {
                return { status: "canceled", reason: "pending" } as const;
            }
            if (next === value) {
                return { status: "noop", reason: "unchanged" } as const;
            }
            const previous = value;
            setter(next);
            setPending(true);
            try {
                if (action) {
                    const result = await action(next);
                    if (result.status === "unsupported") {
                        setter(previous);
                        return {
                            status: "unsupported",
                            reason: result.reason,
                        } as const;
                    }
                }
                return { status: "applied" } as const;
            } catch (error) {
                setter(previous);
                return {
                    status: "failed",
                    reason: "execution_failed",
                    error:
                        error instanceof Error
                            ? error
                            : new Error(String(error)),
                } as const;
            } finally {
                setPending(false);
            }
        },
        [action, pending, setter, value]
    );

    return { pending, onChange };
}
