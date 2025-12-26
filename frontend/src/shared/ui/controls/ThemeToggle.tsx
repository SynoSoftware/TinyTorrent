/*
 AGENTS-TODO: Replace relative imports with '@/config/logic' and use SCALE_BASES for icon sizes.
 */

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
                size={22}
                strokeWidth={ICON_STROKE_WIDTH}
                className="text-base"
            />
        ) : (
            <Sun
                size={22}
                strokeWidth={ICON_STROKE_WIDTH}
                className="text-base"
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
