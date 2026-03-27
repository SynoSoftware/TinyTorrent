type NavigatorPlatformSource = {
    userAgent?: string;
    platform?: string;
    userAgentData?: {
        platform?: string;
    };
};

export type BrowserPlatform =
    | { kind: "windows"; majorVersion: number | null; minorVersion: number | null }
    | { kind: "macos" | "linux" | "android" | "ios" | "unknown" };

export function detectBrowserPlatform(
    source: NavigatorPlatformSource | undefined = typeof navigator === "undefined" ? undefined : navigator,
): BrowserPlatform {
    if (!source) {
        return { kind: "unknown" };
    }

    const userAgent = source.userAgent?.toLowerCase() ?? "";
    const platform = (source.userAgentData?.platform ?? source.platform ?? "").toLowerCase();

    if (userAgent.includes("android") || platform.includes("android")) {
        return { kind: "android" };
    }

    if (
        userAgent.includes("iphone") ||
        userAgent.includes("ipad") ||
        userAgent.includes("ipod") ||
        platform.includes("iphone") ||
        platform.includes("ipad")
    ) {
        return { kind: "ios" };
    }

    if (platform.includes("mac") || userAgent.includes("mac os x")) {
        return { kind: "macos" };
    }

    if (platform.includes("linux") || userAgent.includes("linux")) {
        return { kind: "linux" };
    }

    const windowsVersionMatch = userAgent.match(/windows nt (\d+)\.(\d+)/);
    if (platform.includes("win") || windowsVersionMatch) {
        return {
            kind: "windows",
            majorVersion: windowsVersionMatch ? Number(windowsVersionMatch[1]) : null,
            minorVersion: windowsVersionMatch ? Number(windowsVersionMatch[2]) : null,
        };
    }

    return { kind: "unknown" };
}
