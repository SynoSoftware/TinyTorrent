import { Button, Dropdown, DropdownTrigger, DropdownMenu, DropdownItem, cn } from "@heroui/react";
import { Check, Globe } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

type LanguageOption = { code: "en" | "nl" | "es" | "zh"; labelKey: string; flag: string };
const STORAGE_KEY = "tiny-torrent-language";

const languages: LanguageOption[] = [
  { code: "en", labelKey: "language.english", flag: "🇺🇸" },
  { code: "nl", labelKey: "language.dutch", flag: "🇳🇱" },
  { code: "es", labelKey: "language.spanish", flag: "🇪🇸" },
  { code: "zh", labelKey: "language.chinese", flag: "🇨🇳" },
];

const SUPPORTED_CODES = languages.map((option) => option.code);

const normalizeLocale = (value: string) => value.split("-")[0].toLowerCase();

const getNavigatorLanguage = (): LanguageOption["code"] => {
  if (typeof navigator === "undefined") return "en";
  const locale = navigator.language ?? navigator.languages?.[0] ?? "en";
  const normalized = normalizeLocale(locale);
  return (SUPPORTED_CODES.includes(normalized as LanguageOption["code"]) ? normalized : "en") as LanguageOption["code"];
};

const getStoredLanguage = (): LanguageOption["code"] => {
  if (typeof window === "undefined") return getNavigatorLanguage();
  const stored = window.localStorage.getItem(STORAGE_KEY)?.toLowerCase();
  if (stored && SUPPORTED_CODES.includes(stored as LanguageOption["code"])) {
    return stored as LanguageOption["code"];
  }
  return getNavigatorLanguage();
};

export function LanguageMenu() {
  const { t, i18n } = useTranslation();
  const [selection, setSelection] = useState<LanguageOption["code"]>(() => getStoredLanguage());
  const activeOption = useMemo(() => languages.find((option) => option.code === selection) ?? languages[0], [selection]);

  useEffect(() => {
    i18n.changeLanguage(selection).catch(() => null);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, selection);
    }
  }, [selection, i18n]);

  return (
    <Dropdown placement="bottom-end" backdrop="transparent">
      <DropdownTrigger>
        <Button
          variant="ghost"
          radius="full"
          size="sm"
          className="text-foreground/60 hover:text-foreground gap-2 px-3 bg-content1/10 border border-content1/20 backdrop-blur-lg shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]"
          aria-label={t("language.menu_label")}
        >
          <Globe size={16} />
          <span className="text-[12px] font-semibold tracking-[0.3em] hidden sm:inline">{t(activeOption.labelKey)}</span>
          <span className="text-[16px] leading-none">{activeOption.flag}</span>
        </Button>
      </DropdownTrigger>
      <DropdownMenu
        aria-label={t("language.menu_label")}
        className="p-0 bg-content1/10 border border-content1/30 backdrop-blur-3xl shadow-[0_30px_80px_rgba(0,0,0,0.45)] rounded-2xl overflow-hidden"
      >
        {languages.map((option, index) => (
          <DropdownItem key={option.code} onPress={() => setSelection(option.code)} className="p-0">
            <div
              className={cn(
                "flex items-center justify-between gap-3 px-4 py-2 text-[13px] font-semibold transition-colors",
                index > 0 ? "border-t border-content1/10" : "",
                selection === option.code
                  ? "bg-primary/10 border border-primary/60 text-primary"
                  : "text-foreground/70 hover:text-foreground hover:bg-content2/40"
              )}
            >
              <div className="flex items-center gap-3">
                <span className="text-[18px] leading-none">{option.flag}</span>
                <span>{t(option.labelKey)}</span>
              </div>
              {selection === option.code && <Check size={14} className="text-primary" />}
            </div>
          </DropdownItem>
        ))}
      </DropdownMenu>
    </Dropdown>
  );
}
