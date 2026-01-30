// ─────────────────────────────────────────────────────────────
// theme.ts — single source of truth (logic only, no UI)
// Location: src/shared/theme/theme.ts
// ─────────────────────────────────────────────────────────────

export type ThemeMode = "dark" | "light";

const STORAGE_KEY = "tiny-torrent-theme";
// Theme utilities are now an implementation detail of the Preferences provider and should not be consumed directly by UI components.

export function getSystemTheme(): ThemeMode {
    if (typeof window === "undefined") return "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
}

export function getInitialTheme(): ThemeMode {
    if (typeof window === "undefined") return getSystemTheme();
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === "dark" || stored === "light" ? stored : getSystemTheme();
}

export function applyTheme(mode: ThemeMode) {
    if (typeof document === "undefined") return;

    const root = document.documentElement;
    root.dataset.theme = mode;
    root.style.colorScheme = mode;
    root.classList.toggle("dark", mode === "dark");
    root.classList.toggle("light", mode === "light");
}

export function persistTheme(mode: ThemeMode) {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, mode);
}
