import type { SetLocationSurface } from "@/app/context/RecoveryContext";

const SURFACE_CAPTION_KEY = {
    "context-menu": "set_location.caption.context_menu",
    "general-tab": "set_location.caption.general_tab",
    "recovery-modal": "set_location.caption.recovery_modal",
} satisfies Record<SetLocationSurface, string>;

export const getSurfaceCaptionKey = (surface: SetLocationSurface): string =>
    SURFACE_CAPTION_KEY[surface];
