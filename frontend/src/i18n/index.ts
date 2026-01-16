import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./en.json";

const STORAGE_KEY = "tiny-torrent-language";
const FALLBACK_LANGUAGE = "en";
// TODO: Preferences authority: language selection should be owned by the Preferences provider (todo.md task 15).
// TODO: Avoid duplicated language persistence logic across:
// TODO: - `src/i18n/index.ts` (initialization)
// TODO: - `src/shared/ui/controls/LanguageMenu.tsx` (UI selection)
// TODO: Standardize:
// TODO: - supported codes
// TODO: - “system” behavior
// TODO: - storage key + migration behavior

const resolveNavigatorLang = () => {
    if (typeof navigator === "undefined") return FALLBACK_LANGUAGE;
    const locale =
        navigator.language ?? navigator.languages?.[0] ?? FALLBACK_LANGUAGE;
    return locale.split("-")[0];
};

const getInitialLanguage = () => {
    if (typeof window === "undefined") return FALLBACK_LANGUAGE;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "system") return resolveNavigatorLang();
    if (stored) return stored;
    return resolveNavigatorLang();
};

i18n.use(initReactI18next).init({
    resources: {
        en: { translation: en },
    },
    fallbackLng: FALLBACK_LANGUAGE,
    lng: getInitialLanguage(),
    supportedLngs: ["en"],
    interpolation: { escapeValue: false },
});

i18n.on("missingKey", (_lng, _ns, key) => {
    const proc = (globalThis as any).process;
    if (proc && proc.env && proc.env.NODE_ENV === "development") {
        throw new Error(`Missing i18n key: ${key}`);
    }
});
