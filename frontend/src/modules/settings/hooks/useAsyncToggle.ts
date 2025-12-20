import { useCallback, useState } from "react";

export interface AsyncToggleResult {
    pending: boolean;
    onChange: (next: boolean) => Promise<void>;
}

export function useAsyncToggle(
    value: boolean,
    setter: (next: boolean) => void,
    action?: (next: boolean) => Promise<void>
): AsyncToggleResult {
    const [pending, setPending] = useState(false);

    const onChange = useCallback(
        async (next: boolean) => {
            if (pending) {
                return;
            }
            const previous = value;
            setter(next);
            setPending(true);
            try {
                if (action) {
                    await action(next);
                }
            } catch {
                setter(previous);
            } finally {
                setPending(false);
            }
        },
        [action, pending, setter, value]
    );

    return { pending, onChange };
}
