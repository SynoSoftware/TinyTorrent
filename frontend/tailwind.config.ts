// tailwind.config.ts
import type { Config } from "tailwindcss";

const config: Config = {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
        "!./docs/**",
        "!./**/*.md",
        "!./scripts/**",
    ],
    theme: {
        extend: {}, // Keep this empty for now
    },
    darkMode: "class",
    plugins: [],
};

export default config;
