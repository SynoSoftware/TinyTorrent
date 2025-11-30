import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./en.json";

const STORAGE_KEY = "tiny-torrent-language";
const FALLBACK_LANGUAGE = "en";

const resolveNavigatorLang = () => {
  if (typeof navigator === "undefined") return FALLBACK_LANGUAGE;
  const locale = navigator.language ?? navigator.languages?.[0] ?? FALLBACK_LANGUAGE;
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
