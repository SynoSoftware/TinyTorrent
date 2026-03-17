import type { TransmissionSessionSettings, TransmissionTorrent } from "@/services/rpc/types";

// Single authority for protocol feature support resolution.
// Future Transmission RPC feature changes must be modeled here by:
// 1. adding the feature key to `VersionGatedSettingKey`
// 2. adding its minimum-version fallback to `versionGatedSettingsSpecs`
// 3. adding explicit evidence collection before version fallback where possible
// No UI/component/view-model layer may introduce parallel version or field checks.

type ParsedVersion = {
    major: number;
    minor: number;
    patch: number;
};

export type VersionSupportState = "unknown" | "supported" | "unsupported";

export type VersionGatedSettingKey =
    | "sequential_download"
    | "torrent_added_verify_mode"
    | "torrent_complete_verify_enabled";

type VersionRequirement = {
    minimum: string;
};

export type VersionGatedSettingSupport = Record<
    VersionGatedSettingKey,
    VersionRequirement & {
        detectedVersion?: string;
        state: VersionSupportState;
    }
>;

const versionGatedSettingsSpecs = {
    sequential_download: {
        minimum: "4.1.0",
        aliases: ["sequential_download", "sequentialDownload"],
        torrentAliases: ["sequential_download", "sequentialDownload"],
    },
    torrent_added_verify_mode: {
        minimum: "4.1.0",
        aliases: ["torrent_added_verify_mode"],
        torrentAliases: [],
    },
    torrent_complete_verify_enabled: {
        minimum: "4.1.0",
        aliases: ["torrent_complete_verify_enabled"],
        torrentAliases: [],
    },
} as const satisfies Record<
    VersionGatedSettingKey,
    VersionRequirement & {
        aliases: readonly (keyof TransmissionSessionSettings)[];
        torrentAliases: readonly (keyof TransmissionTorrent)[];
    }
>;

type CapabilityEvidence = boolean | null | undefined;

type VersionGatedSupportParams = {
    session: TransmissionSessionSettings | null | undefined;
    torrents?: Array<Pick<TransmissionTorrent, "sequentialDownload" | "sequential_download">> | null;
};

const getDetectedSessionVersion = (session: TransmissionSessionSettings | null | undefined) =>
    session?.["rpc-version-semver"] ?? session?.version;

const parseVersion = (value?: string | null): ParsedVersion | null => {
    if (!value) {
        return null;
    }

    const match = /(\d+)\.(\d+)\.(\d+)/.exec(value);
    if (!match) {
        return null;
    }

    return {
        major: Number(match[1]),
        minor: Number(match[2]),
        patch: Number(match[3]),
    };
};

const compareVersions = (left: ParsedVersion, right: ParsedVersion) => {
    if (left.major !== right.major) {
        return left.major - right.major;
    }
    if (left.minor !== right.minor) {
        return left.minor - right.minor;
    }
    return left.patch - right.patch;
};

const resolveCapability = (params: {
    detected?: CapabilityEvidence;
    version?: string | null;
    minimum?: string;
}): VersionSupportState => {
    if (params.detected === true) {
        return "supported";
    }

    if (params.detected === false) {
        return "unsupported";
    }

    const detected = parseVersion(params.version);
    const required = parseVersion(params.minimum);

    if (!detected || !required) {
        return "unknown";
    }

    return compareVersions(detected, required) >= 0 ? "supported" : "unsupported";
};

const hasAnyAlias = <TObject extends object>(
    value: TObject | null | undefined,
    aliases: readonly (keyof TObject)[],
): boolean => {
    if (!value) {
        return false;
    }
    return aliases.some((alias) => alias in value);
};

const getAliasedValue = <TObject extends object>(
    value: TObject | null | undefined,
    aliases: readonly (keyof TObject)[],
) => {
    if (!value) {
        return undefined;
    }

    for (const alias of aliases) {
        if (alias in value) {
            return value[alias];
        }
    }

    return undefined;
};

const getVersionGatedSettingState = (
    key: VersionGatedSettingKey,
    params: VersionGatedSupportParams,
): VersionSupportState => {
    const spec = versionGatedSettingsSpecs[key];
    return resolveCapability({
        detected:
            (spec.torrentAliases.length > 0 &&
            params.torrents?.some((torrent) => hasAnyAlias(torrent, spec.torrentAliases))
                ? true
                : null) ?? (hasAnyAlias(params.session, spec.aliases) ? true : null),
        version: getDetectedSessionVersion(params.session),
        minimum: spec.minimum,
    });
};

export function getVersionGatedSessionValue(
    session: TransmissionSessionSettings | null | undefined,
    key: "sequential_download",
): boolean | undefined;
export function getVersionGatedSessionValue(
    session: TransmissionSessionSettings | null | undefined,
    key: "torrent_added_verify_mode",
): "fast" | "full" | undefined;
export function getVersionGatedSessionValue(
    session: TransmissionSessionSettings | null | undefined,
    key: "torrent_complete_verify_enabled",
): boolean | undefined;
export function getVersionGatedSessionValue(
    session: TransmissionSessionSettings | null | undefined,
    key: VersionGatedSettingKey,
) {
    return getAliasedValue(session, versionGatedSettingsSpecs[key].aliases);
}

export const getSequentialDownloadCapabilityState = (params: VersionGatedSupportParams) =>
    getVersionGatedSettingState("sequential_download", params);

export const isVersionGatedSettingSupported = (
    session: TransmissionSessionSettings | null | undefined,
    key: VersionGatedSettingKey,
) =>
    getVersionGatedSettingState(key, {
        session,
        torrents: null,
    }) === "supported";

export const getVersionGatedSettingsSupport = (
    session: TransmissionSessionSettings | null | undefined,
): VersionGatedSettingSupport => {
    const detectedVersion = getDetectedSessionVersion(session);

    return Object.fromEntries(
        (Object.keys(versionGatedSettingsSpecs) as VersionGatedSettingKey[]).map((key) => [
            key,
            {
                minimum: versionGatedSettingsSpecs[key].minimum,
                detectedVersion,
                state: getVersionGatedSettingState(key, {
                    session,
                    torrents: null,
                }),
            },
        ]),
    ) as VersionGatedSettingSupport;
};

export const removeUnsupportedVersionGatedSettings = (
    settings: Partial<TransmissionSessionSettings>,
    support: VersionGatedSettingSupport,
) => {
    const nextSettings = { ...settings };

    for (const [key, value] of Object.entries(support) as Array<
        [VersionGatedSettingKey, VersionGatedSettingSupport[VersionGatedSettingKey]]
    >) {
        if (value.state !== "supported") {
            for (const alias of versionGatedSettingsSpecs[key].aliases) {
                delete nextSettings[alias];
            }
        }
    }

    return nextSettings;
};
