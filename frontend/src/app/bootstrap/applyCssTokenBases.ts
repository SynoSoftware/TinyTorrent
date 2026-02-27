import { registry } from "@/config/logic";
import { readInitialWorkbenchScale } from "@/app/context/PreferencesContext";

export function applyCssTokenBases() {
    if (typeof document === "undefined") return;
    const { scaleBases } = registry.ui;
    const root = document.documentElement.style;
    root.setProperty("--tt-unit-base", String(scaleBases.unit));
    root.setProperty("--tt-font-base", String(scaleBases.fontBase));
    root.setProperty("--tt-zoom-level", String(readInitialWorkbenchScale()));
}
