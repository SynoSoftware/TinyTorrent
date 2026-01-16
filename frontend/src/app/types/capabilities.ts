export type CapabilityState = "unknown" | "supported" | "unsupported";

export type CapabilityKey = "sequentialDownload" | "superSeeding";

export interface CapabilityStore {
    sequentialDownload: CapabilityState;
    superSeeding: CapabilityState;
}

// TODO: Keep concepts separated:
// TODO: - `CapabilityStore` is for *engine feature support* (Transmission RPC method availability / version compatibility).
// TODO: - `UiMode = "Full" | "Rpc"` (ShellExtensions available vs not) is a *UI runtime/bridge* concept.
// TODO: Do not extend this store with locality/bridge flags; introduce a dedicated `UiCapabilities` model for that (see todo.md task 4).

export const DEFAULT_CAPABILITY_STORE: CapabilityStore = {
    sequentialDownload: "unknown",
    superSeeding: "unknown",
};
