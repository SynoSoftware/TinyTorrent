// ─────────────────────────────────────────────────────────────
// useTheme.ts — state + side effects (no visuals)
// Location: src/shared/theme/useTheme.ts
// ─────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import {
    applyTheme,
    getInitialTheme,
    persistTheme,
    type ThemeMode,
} from "../utils/theme";

export function useTheme() {
    const [mode, setMode] = useState<ThemeMode>(getInitialTheme);

    useEffect(() => {
        applyTheme(mode);
        persistTheme(mode);
    }, [mode]);

    return {
        mode,
        isDark: mode === "dark",
        toggle: () => setMode((m) => (m === "dark" ? "light" : "dark")),
        set: setMode,
    };
}
