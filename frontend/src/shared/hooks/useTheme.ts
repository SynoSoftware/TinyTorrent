// ─────────────────────────────────────────────────────────────
// useTheme.ts — state + side effects (no visuals)
// Location: src/shared/theme/useTheme.ts
// ─────────────────────────────────────────────────────────────

import { useCallback } from "react";
import { usePreferences } from "@/app/context/PreferencesContext";

export function useTheme() {
    const {
        preferences: { theme },
        toggleTheme,
        setTheme,
    } = usePreferences();

    const toggle = useCallback(() => toggleTheme(), [toggleTheme]);

    return {
        mode: theme,
        isDark: theme === "dark",
        toggle,
        set: setTheme,
    };
}
