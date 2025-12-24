import { IS_NATIVE_HOST } from "@/config/logic";

// Central runtime/strategy object. Consumers should import this module
// instead of directly referencing `IS_NATIVE_HOST` so that environment checks
// and behavior policies are centralized and testable.
export const Runtime = {
    // boolean: are we running inside the native packaged host?
    isNativeHost: Boolean(IS_NATIVE_HOST),

    // Whether to expose remote connection editing UI. In native-host mode
    // we often lock editing to avoid exposing remote profiles.
    allowEditingProfiles(): boolean {
        return !this.isNativeHost;
    },

    // Should the app suppress browser defaults for zoom keys? Only in native
    // host mode.
    suppressBrowserZoomDefaults(): boolean {
        return this.isNativeHost;
    },

    // Whether to enable inputs that are only valid in remote-connection mode.
    enableRemoteInputs(): boolean {
        return !this.isNativeHost;
    },
};

export default Runtime;
