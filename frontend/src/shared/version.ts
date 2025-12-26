import manifest from "@/version.json";

const normalizedVersion =
    typeof manifest.version === "string" && manifest.version.trim().length > 0
        ? manifest.version.trim()
        : "0.0.0-unknown";

const parts = normalizedVersion.split(".");
const displayVersion =
    parts.length === 3 && parts[2] === "0"
        ? `${parts[0]}.${parts[1]}`
        : normalizedVersion;

export const APP_VERSION = displayVersion;
