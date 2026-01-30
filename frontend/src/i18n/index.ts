import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./en.json";
import { getInitialLanguage } from "@/app/preferences/language";

const FALLBACK_LANGUAGE = "en";

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

export default i18n;
