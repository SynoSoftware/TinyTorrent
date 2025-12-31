import { useCallback, useState } from "react";

type ToggleCommitCallback = (
    indexes: number[],
    state: boolean
) => Promise<void> | void;

export function useOptimisticToggle(onCommit: ToggleCommitCallback) {
    const [optimisticState, setOptimisticState] = useState<Record<number, boolean>>(
        {}
    );

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

            const result = onCommit(indexes, wanted);

            const revert = () => {
                setOptimisticState((prev) => {
                    const next = { ...prev };
                    indexes.forEach((index) => {
                        delete next[index];
                    });
                    return next;
                });
            };

            if (result && typeof (result as any).then === "function") {
                (result as Promise<void>).finally(revert);
            } else {
                revert();
            }
        },
        [onCommit]
    );

    return { optimisticState, toggle };
}
