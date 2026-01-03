export type CapabilityState = "unknown" | "supported" | "unsupported";

export type CapabilityKey = "sequentialDownload" | "superSeeding";

export interface CapabilityStore {
    sequentialDownload: CapabilityState;
    superSeeding: CapabilityState;
}

export const DEFAULT_CAPABILITY_STORE: CapabilityStore = {
    sequentialDownload: "unknown",
    superSeeding: "unknown",
};
