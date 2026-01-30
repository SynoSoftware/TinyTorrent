const STORAGE_KEY = "tiny-torrent-language";
const FALLBACK_LANGUAGE = "en";

export const SUPPORTED_LANGUAGE_CODES = ["en", "nl", "es", "zh"] as const;

export type LanguageCode = (typeof SUPPORTED_LANGUAGE_CODES)[number];

const normalizeLang = (value: string | null | undefined): string | null => {
    if (!value) return null;
    return value.split("-")[0]?.toLowerCase() ?? null;
};

export const resolveNavigatorLanguage = (): LanguageCode => {
    if (typeof navigator === "undefined") return FALLBACK_LANGUAGE;
    const locale = navigator.language ?? navigator.languages?.[0] ?? FALLBACK_LANGUAGE;
    const normalized = normalizeLang(locale);
    return (
        (SUPPORTED_LANGUAGE_CODES.includes(normalized as LanguageCode)
            ? (normalized as LanguageCode)
            : FALLBACK_LANGUAGE)
    );
};

export const sanitizeLanguage = (value: string | null | undefined): LanguageCode => {
    const normalized = normalizeLang(value);
    if (normalized && SUPPORTED_LANGUAGE_CODES.includes(normalized as LanguageCode)) {
        return normalized as LanguageCode;
    }
    if (normalized === "system") {
        return resolveNavigatorLanguage();
    }
    return FALLBACK_LANGUAGE;
};

export const getInitialLanguage = (): LanguageCode => {
    if (typeof window === "undefined") return resolveNavigatorLanguage();
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return sanitizeLanguage(stored ?? null);
};

export const persistLanguage = (value: LanguageCode) => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, value);
};

export const getLanguageStorageKey = () => STORAGE_KEY;

export const getFallbackLanguage = () => FALLBACK_LANGUAGE;
