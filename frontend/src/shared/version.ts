import pkg from "@/../package.json";

type PackageJson = { version?: string };
const pkgTyped = pkg as PackageJson;

const normalizedVersion =
    typeof pkgTyped.version === "string" && pkgTyped.version.trim().length > 0
        ? pkgTyped.version.trim()
        : "0.0.0-unknown";

const parts = normalizedVersion.split(".");
const displayVersion =
    parts.length === 3 && parts[2] === "0"
        ? `${parts[0]}.${parts[1]}`
        : normalizedVersion;

export const APP_VERSION = displayVersion;
