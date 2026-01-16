import type {
    ConnectionMode,
    SetLocationOutcome,
    SetLocationPolicyReason,
    SetLocationSurface,
    SetLocationUnsupportedReason,
} from "@/app/context/RecoveryContext";

export const REASON_LABEL_KEY: Record<
    Exclude<
        SetLocationUnsupportedReason | SetLocationPolicyReason,
        "browse-unavailable"
    >,
    string
> = {
    "manual-disabled": "set_location.reason.manual_disabled",
    "inline-conflict": "set_location.reason.inline_conflict",
};

const SURFACE_CAPTION_KEY: Record<SetLocationSurface, string> = {
    "context-menu": "set_location.caption.context_menu",
    "general-tab": "set_location.caption.general_tab",
    "recovery-modal": "set_location.caption.recovery_modal",
};

export const getSurfaceCaptionKey = (surface: SetLocationSurface): string =>
    SURFACE_CAPTION_KEY[surface];

export type SetLocationOutcomeMessage = {
    type: "unsupported" | "conflict";
    labelKey: string;
};

export const getSetLocationOutcomeMessage = (
    outcome: SetLocationOutcome | null,
    surface: SetLocationSurface,
    connectionMode: ConnectionMode
): SetLocationOutcomeMessage | null => {
    // TODO: Deprecate `connectionMode` and switch this helper to `uiMode: "Full" | "Rpc"`.
    // TODO: The only UX distinction we need here is whether ShellExtensions browsing is available (Full) or not (Rpc).
    // TODO: When migrated, remove any “tinytorrent-*” naming from translation keys and replace with `set_location.reason.browse_unavailable_full` vs `..._rpc` (or equivalent).
    if (
        !outcome ||
        (outcome.kind !== "unsupported" && outcome.kind !== "conflict")
    ) {
        return null;
    }
    if (outcome.surface !== surface) return null;
    let labelKey: string | undefined;
    if (outcome.reason === "browse-unavailable") {
        labelKey =
            connectionMode === "tinytorrent-local-shell"
                ? "set_location.reason.browse_unavailable_local_shell"
                : "set_location.reason.browse_unavailable_remote";
    } else {
        labelKey = REASON_LABEL_KEY[outcome.reason];
    }
    if (!labelKey) return null;
    return {
        type: outcome.kind,
        labelKey,
    };
};
