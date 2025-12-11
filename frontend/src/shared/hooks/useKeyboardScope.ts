import { useCallback, useEffect } from "react";
import { useHotkeysContext } from "react-hotkeys-hook";

export const DEFAULT_KEYBOARD_SCOPE = "default";

export function useKeyboardScope(scope: string) {
    const { enableScope, disableScope } = useHotkeysContext();

    const activate = useCallback(() => {
        enableScope(scope);
    }, [enableScope, scope]);

    const deactivate = useCallback(() => {
        disableScope(scope);
    }, [disableScope, scope]);

    useEffect(
        () => () => {
            disableScope(scope);
        },
        [disableScope, scope]
    );

    return { activate, deactivate };
}
