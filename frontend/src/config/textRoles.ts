/**
 * Text Role System — Typography + Semantic Classification
 *
 * Replaces scattered className strings with centralized, semantic text roles.
 * Each role defines typography (size, weight, tracking) + semantic intent (color, opacity).
 *
 * Philosophy:
 * - One role = one intent (heading, label, body, code, etc.)
 * - No inline assembly: `text-scaled font-bold uppercase tracking-0-2 text-foreground/60`
 *   becomes `TEXT_ROLE.label`
 * - Typography scales with --fz; color tokens come from theme
 *
 * Usage:
 * ```tsx
 * import { TEXT_ROLE } from "@/config/textRoles";
 * <h2 className={TEXT_ROLE.heading}>Dashboard</h2>
 * <p className={TEXT_ROLE.label}>Status</p>
 * <code className={TEXT_ROLE.code}>magnet:?xt=...</code>
 * ```
 */

// ============================================================================
// Core Text Roles (Primary Interface)
// ============================================================================

/**
 * Standard text roles for UI components.
 * These cover 90% of use cases and enforce consistency.
 */
export const TEXT_ROLE = {
    // --- Headings ---
    heading: "text-scaled font-bold text-foreground",
    headingEmphasis: "text-scaled font-bold text-foreground",
    headingLarge: "text-navbar font-bold text-foreground", // Modal titles, section headers
    headingSection: "text-scaled font-semibold text-foreground", // SubsectionTitles

    // --- Labels (uppercase, tracked) ---
    label: "text-label font-bold uppercase tracking-label text-foreground/60",
    labelPrimary:
        "text-label font-bold uppercase tracking-label text-foreground",
    labelMuted:
        "text-label font-semibold uppercase tracking-0-2 text-foreground/40",
    labelDense:
        "text-label font-semibold uppercase tracking-0-2 text-foreground/50",

    // --- Body Text ---
    body: "text-scaled text-foreground",
    bodyMuted: "text-scaled text-foreground/70",
    bodyStrong: "text-scaled font-semibold text-foreground",
    bodySmall: "text-label text-foreground/70",

    // --- Code / Monospace ---
    code: "font-mono text-scaled text-foreground",
    codeMuted: "font-mono text-label text-foreground/70",
    codeCaption:
        "font-mono text-label uppercase tracking-widest text-foreground/70",

    // --- Interactive States ---
    link: "text-scaled text-foreground/80 hover:text-foreground underline-offset-2 hover:underline",
    buttonText: "text-scaled font-semibold text-foreground",

    // --- Status & Alerts ---
    statusWarning:
        "text-scaled font-semibold uppercase tracking-tight text-warning",
    statusSuccess: "text-scaled text-success",
    statusError: "text-scaled text-danger",

    // --- Special Contexts ---
    placeholder: "text-scaled text-foreground/30",
    caption: "text-label text-foreground/60",
} as const;

// ============================================================================
// Extended Text Roles (Specialized)
// ============================================================================

/**
 * Specialized roles for specific UI contexts.
 * Use only when the base TEXT_ROLE doesn't fit.
 */
export const TEXT_ROLE_EXTENDED = {
    // --- Modal/Dialog specific ---
    modalTitle:
        "text-scaled font-bold uppercase tracking-label text-foreground",
    modalCaption: "text-label text-foreground/70",

    // --- Table Headers ---
    tableHeader:
        "text-label font-bold uppercase tracking-label text-default-500",
    tableCell: "text-scaled text-foreground/75",

    // --- Status Bar ---
    statusBarLabel: "font-bold uppercase tracking-0-2 text-foreground/30",
    statusBarValue: "text-scaled text-foreground",

    // --- Command Palette ---
    commandSection:
        "text-scaled font-semibold uppercase tracking-0-2 text-default-500",

    // --- Settings ---
    settingsLabel:
        "text-label font-bold tracking-wider text-foreground/60 uppercase",

    // --- Chart / Visualization ---
    chartLabel: "uppercase tracking-wider font-bold text-label",
    chartLabelSuccess:
        "uppercase tracking-wider font-bold text-success/60 text-label",
    chartLabelPrimary:
        "uppercase tracking-wider font-bold text-primary/60 text-label",
    chartLabelMuted:
        "uppercase text-foreground/30 tracking-0-4 text-label font-black",

    // --- File Explorer ---
    fileTreeHeader:
        "text-label font-bold uppercase tracking-label text-default-500 bg-default-100/50",

    // --- Badges & Pills ---
    badge: "text-label font-semibold uppercase tracking-tight",
    badgeMuted:
        "text-label text-foreground/40 font-semibold uppercase tracking-wider",
    pill: "text-label text-foreground/70",

    // --- Recovery / Error States ---
    errorContext:
        "text-label font-mono text-foreground/40 text-center max-w-modal",
} as const;

// ============================================================================
// Deprecated (for migration tracking)
// ============================================================================

/**
 * @deprecated Use TEXT_ROLE.label instead
 */
export const HEADER_BASE = TEXT_ROLE.label;

/**
 * @deprecated Use TEXT_ROLE.body instead
 */
export const BODY_TEXT = TEXT_ROLE.body;

// ============================================================================
// Composition Helpers (when you need variants)
// ============================================================================

/**
 * Creates a text role with custom opacity.
 * Use sparingly — prefer predefined roles when possible.
 *
 * @example
 * withOpacity(TEXT_ROLE.body, 50) // "text-scaled text-foreground/50"
 */
export function withOpacity(baseRole: string, opacity: number): string {
    return baseRole.replace(
        /text-foreground(\/\d+)?/,
        `text-foreground/${opacity}`,
    );
}

/**
 * Creates a text role with custom color.
 *
 * @example
 * withColor(TEXT_ROLE.label, "success") // "text-label font-bold ... text-success"
 */
export function withColor(baseRole: string, color: string): string {
    return baseRole.replace(/text-foreground(\/\d+)?/, `text-${color}`);
}

// ============================================================================
// Migration Map (for bulk replacements)
// ============================================================================

/**
 * Mapping of common inline patterns to their TEXT_ROLE equivalents.
 * Use this for search-and-replace during migration.
 */
export const MIGRATION_MAP = {
    "text-scaled font-bold text-foreground": "TEXT_ROLE.heading",
    "text-label font-bold uppercase tracking-label text-foreground/60":
        "TEXT_ROLE.label",
    "font-mono text-label uppercase tracking-widest": "TEXT_ROLE.codeCaption",
    "text-label text-foreground/70": "TEXT_ROLE.bodySmall",
    "text-scaled text-foreground/75": "TEXT_ROLE_EXTENDED.tableCell",
    "font-bold uppercase tracking-0-2 text-foreground/30":
        "TEXT_ROLE_EXTENDED.statusBarLabel",
    "text-scaled font-semibold uppercase tracking-0-2 text-default-500":
        "TEXT_ROLE_EXTENDED.commandSection",
    "text-label font-bold tracking-wider text-foreground/60 uppercase":
        "TEXT_ROLE_EXTENDED.settingsLabel",
} as const;
