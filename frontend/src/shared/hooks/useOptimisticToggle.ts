import { useCallback, useState } from "react";

type ToggleCommitCallback = (
    indexes: number[],
    state: boolean
) => Promise<void> | void;

export function useOptimisticToggle(onCommit: ToggleCommitCallback) {
    const [optimisticState, setOptimisticState] = useState<
        Record<number, boolean>
    >({});

    const toggle = useCallback(
        (indexes: number[], wanted: boolean) => {
            if (!indexes.length) return;
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
                const result = onCommit(indexes, wanted);
                if (result && typeof (result as any).then === "function") {
                    // Only revert on rejection.
                    (result as Promise<void>).catch(() => {
                        revert();
                    });
                }
                // If onCommit is synchronous and succeeds, keep optimistic state
                // until engine-confirmed reconciliation (heartbeat) clears it.
            } catch (err) {
                // Synchronous failure — revert optimistic state immediately.
                revert();
            }
        },
        [onCommit]
    );

    return { optimisticState, toggle };
}
