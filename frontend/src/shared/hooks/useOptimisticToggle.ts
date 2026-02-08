import { useCallback, useState } from "react";

export type OptimisticToggleCommitOutcome =
    | { status: "applied" }
    | { status: "rejected"; reason: "empty_indexes" | "commit_rejected" }
    | {
          status: "unsupported";
          reason: "missing_handler" | "action_not_supported";
      }
    | { status: "failed"; reason: "execution_failed" };

type ToggleCommitCallback = (
    indexes: number[],
    state: boolean,
) => Promise<OptimisticToggleCommitOutcome> | OptimisticToggleCommitOutcome;

export function useOptimisticToggle(onCommit: ToggleCommitCallback) {
    const [optimisticState, setOptimisticState] = useState<
        Record<number, boolean>
    >({});

    const toggle = useCallback(
        async (
            indexes: number[],
            wanted: boolean,
        ): Promise<OptimisticToggleCommitOutcome> => {
            if (!indexes.length) {
                return { status: "rejected", reason: "empty_indexes" };
            }
            setOptimisticState((prev) => {
                const next = { ...prev };
                indexes.forEach((index) => {
                    next[index] = wanted;
                });
                return next;
            });

            // Commit the optimistic change via provided callback.
            // Important: do NOT clear optimistic state on promise completion.
            // Only clear on explicit failure (sync throw or rejected promise).
            const revert = () => {
                setOptimisticState((prev) => {
                    const next = { ...prev };
                    indexes.forEach((index) => {
                        delete next[index];
                    });
                    return next;
                });
            };

            try {
                const outcome = await onCommit(indexes, wanted);
                if (outcome.status !== "applied") {
                    revert();
                }
                return outcome;
            } catch {
                // Synchronous failure — revert optimistic state immediately.
                revert();
                return { status: "failed", reason: "execution_failed" };
            }
        },
        [onCommit],
    );

    return { optimisticState, toggle };
}
