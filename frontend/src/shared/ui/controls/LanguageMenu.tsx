import {
    Dropdown,
    DropdownTrigger,
    DropdownMenu,
    DropdownItem,
    cn,
} from "@heroui/react";
import { Check, Globe } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ICON_STROKE_WIDTH } from "../../../config/iconography";
import { UsFlagIcon, NlFlagIcon, EsFlagIcon, ZhFlagIcon } from "../flags/Flags";
import { ToolbarIconButton } from "../layout/toolbar-button";

type LanguageCode = "en" | "nl" | "es" | "zh";

type LanguageOption = {
    code: LanguageCode;
    labelKey: string;
    /**
     * Prefer a ReactNode so you can swap emoji for real SVG flags later.
     * For now we use emoji so this stays drop-in.
     */
    flagIcon: ReactNode;
};

const STORAGE_KEY = "tiny-torrent-language";

const languages: LanguageOption[] = [
    { code: "en", labelKey: "language.english", flagIcon: <UsFlagIcon /> },
    { code: "nl", labelKey: "language.dutch", flagIcon: <NlFlagIcon /> },
    { code: "es", labelKey: "language.spanish", flagIcon: <EsFlagIcon /> },
    { code: "zh", labelKey: "language.chinese", flagIcon: <ZhFlagIcon /> },
];

const SUPPORTED_CODES: LanguageCode[] = languages.map((option) => option.code);

const normalizeLocale = (value: string) => value.split("-")[0]?.toLowerCase();

const getNavigatorLanguage = (): LanguageCode => {
    if (typeof navigator === "undefined") return "en";

    const locale = navigator.language ?? navigator.languages?.[0] ?? "en";
    const normalized = normalizeLocale(locale) as LanguageCode | undefined;

    return SUPPORTED_CODES.includes(normalized ?? "en") ? normalized! : "en";
};

const getStoredLanguage = (): LanguageCode => {
    if (typeof window === "undefined") return getNavigatorLanguage();

    const stored = window.localStorage.getItem(STORAGE_KEY)?.toLowerCase() as
        | LanguageCode
        | null
        | undefined;

    if (stored && SUPPORTED_CODES.includes(stored)) {
        return stored;
    }

    return getNavigatorLanguage();
};

export function LanguageMenu() {
    const { t, i18n } = useTranslation();

    const [selection, setSelection] = useState<LanguageCode>(() =>
        getStoredLanguage()
    );

    const activeOption = useMemo(
        () =>
            languages.find((option) => option.code === selection) ??
            languages[0],
        [selection]
    );

    useEffect(() => {
        i18n.changeLanguage(selection).catch(() => null);

        if (typeof window !== "undefined") {
            window.localStorage.setItem(STORAGE_KEY, selection);
        }
    }, [selection, i18n]);

    const activeLabel = t(activeOption.labelKey);
    const icon = (
        <Globe
            size={18}
            strokeWidth={ICON_STROKE_WIDTH}
            className="text-current"
        />
    );

    return (
        <Dropdown placement="bottom-end" backdrop="transparent">
            <DropdownTrigger>
                <ToolbarIconButton
                    icon={icon}
                    ariaLabel={`${t("language.menu_label")}: ${activeLabel}`}
                    title={activeLabel}
                />
            </DropdownTrigger>

            <DropdownMenu
                aria-label={t("language.menu_label")}
                variant="light"
                className={cn(
                    "min-w-[12rem]",
                    "bg-content1/80 border border-content1/40",
                    "backdrop-blur-3xl",
                    "shadow-[0_18px_60px_rgba(0,0,0,0.55)]",
                    "rounded-2xl",
                    "p-1"
                )}
                itemClasses={{
                    base: cn(
                        "px-3 py-2",
                        "text-sm font-medium",
                        "flex items-center justify-between",
                        "rounded-xl",
                        "transition-colors",
                        "data-[hover=true]:bg-content2/70",
                        "data-[hover=true]:text-foreground",
                        "data-[pressed=true]:bg-content2/80",
                        "data-[selected=true]:bg-primary/15",
                        "data-[selected=true]:text-primary"
                    ),
                }}
            >
                {languages.map((option) => {
                    const isActive = selection === option.code;

                    return (
                        <DropdownItem
                            key={option.code}
                            onPress={() => setSelection(option.code)}
                            isSelected={isActive}
                            startContent={
                                <span className="text-lg leading-none">
                                    {option.flagIcon}
                                </span>
                            }
                            endContent={
                                isActive ? (
                                    <Check
                                        size={22}
                                        strokeWidth={ICON_STROKE_WIDTH}
                                        className="text-primary"
                                    />
                                ) : null
                            }
                        >
                            {t(option.labelKey)}
                        </DropdownItem>
                    );
                })}
            </DropdownMenu>
        </Dropdown>
    );
}
