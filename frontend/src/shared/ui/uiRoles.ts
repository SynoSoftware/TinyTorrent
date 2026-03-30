// Tone/emphasis styling authority only.
// Static strings only.
// No functions, no params, no runtime composition helpers.
// This file must not define surfaces, container geometry, borders, elevation, or blur.

export const uiRoles = {
    text: {
        primary: "text-foreground",
        secondary: "text-foreground/70",
        muted: "text-foreground/60",
        subtle: "text-foreground/50",
        danger: "text-danger",
    },
} as const;

export type UiRoles = typeof uiRoles;
