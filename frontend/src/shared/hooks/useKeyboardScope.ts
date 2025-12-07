import { useCallback, useEffect } from "react";
import hotkeys from "hotkeys-js";

const DEFAULT_SCOPE = "default";

export function useKeyboardScope(scope: string) {
    useEffect(() => {
        hotkeys.setScope(DEFAULT_SCOPE);
        return () => {
            hotkeys.setScope(DEFAULT_SCOPE);
        };
    }, []);

    const activate = useCallback(() => {
        hotkeys.setScope(scope);
    }, [scope]);

    const deactivate = useCallback(() => {
        hotkeys.setScope(DEFAULT_SCOPE);
    }, []);

    return { activate, deactivate };
}
