/**
 * Shared generic text roles only.
 *
 * This file is not allowed to encode feature contexts, migration tooling,
 * or variant builders. Context-specific text treatment belongs to the
 * owning surface authority, not here.
 */

export const textRole = {
    heading: "text-scaled font-bold text-foreground",
    headingCaps: "text-scaled font-bold uppercase tracking-label text-foreground",
    headingLarge: "text-navbar font-bold text-foreground",
    headingSection: "text-scaled font-semibold text-foreground",

    label: "text-label font-bold uppercase tracking-label text-foreground/60",
    labelPrimary: "text-label font-bold uppercase tracking-label text-foreground",
    labelMuted: "text-label font-semibold uppercase tracking-0-2 text-foreground/40",
    labelDense: "text-label font-semibold uppercase tracking-0-2 text-foreground/50",

    body: "text-scaled text-foreground",
    bodyMuted: "text-scaled text-foreground/70",
    bodyStrong: "text-scaled font-semibold text-foreground",
    bodySmall: "text-label text-foreground/70",

    code: "font-mono text-scaled text-foreground",
    codeMuted: "font-mono text-label text-foreground/70",
    codeCaption: "font-mono text-label uppercase tracking-widest text-foreground/70",

    caption: "text-label text-foreground/60",
    placeholder: "text-scaled text-foreground/30",
    link: "text-scaled text-foreground/80 hover:text-foreground underline-offset-2 hover:underline",
    buttonText: "text-scaled font-semibold text-foreground",

    statusWarning: "text-scaled font-semibold uppercase tracking-tight text-warning",
    statusSuccess: "text-scaled text-success",
    statusError: "text-scaled text-danger",
} as const;
