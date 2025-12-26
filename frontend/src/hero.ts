// hero.ts
import { heroui } from "@heroui/react";

export default heroui({
    defaultTheme: "dark", // Default to Stealth mode per AGENTS.md
    themes: {
        light: {
            extend: "light",
            layout: {
                radius: {
                    small: "var(--r-sm)",
                    medium: "var(--r-md)",
                    large: "var(--r-lg)",
                },
            },
            colors: {
                // Brand primaries
                primary: {
                    DEFAULT: "#009F6B",
                    foreground: "#FFFFFF",
                    50: "#E6F6EF", // Useful for subtle hover states
                    100: "#C0E8D6",
                    200: "#99D9BD",
                    300: "#73CAA4",
                    400: "#4DBB8B",
                    500: "#009F6B",
                    600: "#008C5E",
                    700: "#007951",
                    800: "#006644",
                    900: "#005337",
                },

                // Functional
                success: "#00A86B",
                warning: "#F5A623",
                danger: "#D64545",

                // Base page + text
                background: "#F3FBF6", // Minty white
                foreground: "#1C1C1C", // High contrast text

                // REVISED: Desaturated divider to prevent "Cartoonish" look
                divider: "#D1E0D6",
                focus: "#009F6B",

                // Surface levels
                content1: "#FFFFFF", // Pure white cards
                content2: "#F6FDF9", // Very subtle tint
                content3: "#ECF9F2",
                content4: "#D1FAE5", // High contrast accent surface

                // Neutral Grays (Important for borders/secondary text)
                default: {
                    100: "#F0F5F2",
                    200: "#E1E8E4",
                    300: "#D2DBD6",
                    400: "#C3CEC8",
                    500: "#A5B0AA", // Base gray text
                    600: "#86908B",
                    foreground: "#1C1C1C",
                },
            },
        },

        dark: {
            extend: "dark",
            layout: {
                radius: {
                    small: "var(--r-sm)",
                    medium: "var(--r-md)",
                    large: "var(--r-lg)",
                },
            },
            colors: {
                // Neon Primary
                primary: {
                    DEFAULT: "#00DFA2",
                    foreground: "#000000",
                    50: "#E0FCF5",
                    100: "#B3F8E4",
                    200: "#80F3D2",
                    300: "#4DEFC0",
                    400: "#26EBAF",
                    500: "#00DFA2",
                    600: "#00B885", // Hover state
                    700: "#009169",
                    800: "#006B4D",
                    900: "#004431",
                },

                success: "#1FD18C",
                warning: "#E6A11B",
                danger: "#FF4545", // Slightly brighter danger for dark mode visibility

                // *** Neutral graphite base ***
                background: "#09090b", // Deepest charcoal (Zinc-950) - better for OLED
                foreground: "#FAFAFA", // Almost white

                divider: "#27272a", // Zinc-800

                // *** Neutral surfaces (Graphite/Zinc scale) ***
                // Used for Cards, Modals, Tables
                content1: "#18181b", // Zinc-900
                content2: "#27272a", // Zinc-800
                content3: "#3f3f46", // Zinc-700
                content4: "#52525b", // Zinc-600

                focus: "#00DFA2",

                // Neutral Grays (Matches the Zinc scale)
                default: {
                    100: "#18181b",
                    200: "#27272a",
                    300: "#3f3f46",
                    400: "#52525b",
                    500: "#71717a",
                    600: "#a1a1aa",
                    foreground: "#FAFAFA",
                },

                // Key for Glassmorphism
                overlay: "#000000", // Used for modal backdrops
            },
        },
    },
});
