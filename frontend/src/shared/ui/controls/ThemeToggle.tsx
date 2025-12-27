// All config tokens imported from '@/config/logic'. Icon sizing uses ICON_STROKE_WIDTH from config. SCALE_BASES tokenization flagged for follow-up.

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ICON_STROKE_WIDTH } from "@/config/logic";
import { ToolbarIconButton } from "@/shared/ui/layout/toolbar-button";

const STORAGE_KEY = "tiny-torrent-theme";

const getSystemTheme = () => {
    if (typeof window === "undefined") return "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
};

const getStoredTheme = (): "dark" | "light" => {
    if (typeof window === "undefined") return getSystemTheme();
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "dark" || stored === "light") {
        return stored;
    }
    return getSystemTheme();
};

const applyTheme = (mode: "dark" | "light") => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    root.dataset.theme = mode;
    root.style.colorScheme = mode;
    root.classList.toggle("dark", mode === "dark");
    root.classList.toggle("light", mode === "light");
};

export function ThemeToggle() {
    const { t } = useTranslation();
    const [mode, setMode] = useState<"dark" | "light">(() => getStoredTheme());

    useEffect(() => {
        applyTheme(mode);
        if (typeof window !== "undefined") {
            window.localStorage.setItem(STORAGE_KEY, mode);
        }
    }, [mode]);

    const toggleMode = () => {
        setMode((prev) => (prev === "dark" ? "light" : "dark"));
    };

    const label = mode === "dark" ? t("theme.dark") : t("theme.light");
    const icon =
        mode === "dark" ? (
            <Moon
                strokeWidth={ICON_STROKE_WIDTH}
                className="text-current"
                style={{
                    width: "var(--tt-status-icon-lg)",
                    height: "var(--tt-status-icon-lg)",
                }}
            />
        ) : (
            <Sun
                strokeWidth={ICON_STROKE_WIDTH}
                className="text-current"
                style={{
                    width: "var(--tt-status-icon-lg)",
                    height: "var(--tt-status-icon-lg)",
                }}
            />
        );

    return (
        <ToolbarIconButton
            icon={icon}
            ariaLabel={t("theme.toggle_label", { value: label })}
            onPress={toggleMode}
        />
    );
}
