import constants from "@/config/constants.json";
import {
    ShortcutIntents,
    type ShortcutIntent,
} from "@/shared/controlPlane/shortcutVocabulary";

export { ShortcutIntents };
export type { ShortcutIntent };

export const KeyboardScope = {
    Dashboard: "dashboard",
    Modal: "modal",
    Settings: "settings",
    App: "app",
} as const;

export const ShortcutKeymap: Record<ShortcutIntent, string | string[]> =
    constants.shortcuts.keymap;

export const resolveShortcutIntent = (
    shortcut: ShortcutIntent | undefined,
): string | string[] | undefined => {
    if (!shortcut) return undefined;
    return ShortcutKeymap[shortcut];
};

type KeyboardLikeEvent = Pick<
    KeyboardEvent,
    "key" | "ctrlKey" | "altKey" | "shiftKey" | "metaKey"
>;

const normalizeKeyToken = (value: string) => value.trim().toLowerCase();

const normalizeModifierToken = (value: string) => {
    const token = normalizeKeyToken(value);
    if (token === "control") return "ctrl";
    if (token === "command" || token === "cmd") return "meta";
    if (token === "option") return "alt";
    return token;
};

const parseShortcutBinding = (binding: string) => {
    const tokens = binding
        .split("+")
        .map(normalizeModifierToken)
        .filter(Boolean);
    if (!tokens.length) return null;
    const key = tokens[tokens.length - 1];
    const modifiers = new Set(tokens.slice(0, -1));
    return { key, modifiers };
};

const matchesShortcutBinding = (
    event: KeyboardLikeEvent,
    binding: string | string[] | undefined,
) => {
    if (!binding) return false;
    const candidates = Array.isArray(binding) ? binding : [binding];
    return candidates.some((candidate) => {
        const parsed = parseShortcutBinding(candidate);
        if (!parsed) return false;

        const requiresCtrl = parsed.modifiers.has("ctrl");
        const requiresAlt = parsed.modifiers.has("alt");
        const requiresShift = parsed.modifiers.has("shift");
        const requiresMeta = parsed.modifiers.has("meta");

        if (
            event.ctrlKey !== requiresCtrl ||
            event.altKey !== requiresAlt ||
            event.shiftKey !== requiresShift ||
            event.metaKey !== requiresMeta
        ) {
            return false;
        }

        return normalizeKeyToken(event.key) === parsed.key;
    });
};

export const resolveShortcutIntentFromKeyboardEvent = (
    event: KeyboardLikeEvent,
    intents: readonly ShortcutIntent[],
): ShortcutIntent | undefined =>
    intents.find((intent) =>
        matchesShortcutBinding(event, ShortcutKeymap[intent]),
    );

export const Shortcuts = {
    intents: ShortcutIntents,
    scopes: KeyboardScope,
    keymap: ShortcutKeymap,
} as const;
