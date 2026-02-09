import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "@/i18n/en.json";
import {
    getFallbackLanguage,
    getInitialLanguage,
    SUPPORTED_LANGUAGE_CODES,
} from "@/app/preferences/language";

i18n.use(initReactI18next).init({
    resources: {
        en: { translation: en },
    },
    fallbackLng: getFallbackLanguage(),
    lng: getInitialLanguage(),
    supportedLngs: SUPPORTED_LANGUAGE_CODES,
    interpolation: { escapeValue: false },
});

i18n.on("missingKey", (_lng, _ns, key) => {
    const proc = (globalThis as { process?: { env?: { NODE_ENV?: string } } })
        .process;
    if (proc && proc.env && proc.env.NODE_ENV === "development") {
        throw new Error(`Missing i18n key: ${key}`);
    }
});

export default i18n;
