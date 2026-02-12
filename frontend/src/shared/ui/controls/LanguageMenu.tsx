// All config tokens imported from '@/config/logic'. Icon sizing uses ICON_STROKE_WIDTH from config. SCALE_BASES tokenization flagged for follow-up.
// Language preference is now managed by the Preferences provider.

import {
    Dropdown,
    DropdownTrigger,
    DropdownMenu,
    DropdownItem,
    cn,
} from "@heroui/react";
import { Check, Globe } from "lucide-react";
import { type ReactNode, type SVGProps, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ICON_STROKE_WIDTH } from "@/config/logic";
import { ToolbarIconButton } from "@/shared/ui/layout/toolbar-button";
import { usePreferences } from "@/app/context/PreferencesContext";
import {
    STANDARD_SURFACE_CLASS,
} from "@/shared/ui/layout/glass-surface";

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

type FlagProps = SVGProps<SVGSVGElement>;

function baseFlagProps(className?: string): FlagProps {
    return {
        viewBox: "0 0 640 480",
        width: "1.25em",
        height: "1.25em",
        preserveAspectRatio: "xMidYMid meet",
        className: cn("inline-block align-middle", className),
        role: "img",
        "aria-hidden": true,
    } as FlagProps;
}

export function UsFlagIcon({ className, ...props }: FlagProps) {
    return (
        <svg {...baseFlagProps(className)} {...props}>
            <defs>
                <clipPath id="us-clip">
                    <path d="M0 0h640v480H0z" />
                </clipPath>
            </defs>
            <g clipPath="url(#us-clip)">
                <path fill="#b22234" d="M0 0h640v480H0z" />
                <path
                    fill="#fff"
                    d="M0 55.4h640v55.4H0zm0 110.9h640v55.4H0zm0 110.9h640v55.4H0zm0 110.9h640V448H0z"
                />
                <path fill="#3c3b6e" d="M0 0h274.3v221.8H0z" />
            </g>
        </svg>
    );
}

export function NlFlagIcon({ className, ...props }: FlagProps) {
    return (
        <svg {...baseFlagProps(className)} {...props}>
            <rect width="640" height="480" fill="#21468b" />
            <rect width="640" height="320" y="0" fill="#ae1c28" />
            <rect width="640" height="160" y="160" fill="#fff" />
        </svg>
    );
}

export function EsFlagIcon({ className, ...props }: FlagProps) {
    return (
        <svg {...baseFlagProps(className)} {...props}>
            <rect width="640" height="480" fill="#aa151b" />
            <rect width="640" height="240" y="120" fill="#f1bf00" />
        </svg>
    );
}

export function ZhFlagIcon({ className, ...props }: FlagProps) {
    return (
        <svg {...baseFlagProps(className)} {...props}>
            <rect width="640" height="480" fill="#de2910" />
            <polygon
                fill="#ffde00"
                points="128,96 148,154 209,154 159,190 179,247 128,212 77,247 97,190 47,154 108,154"
            />
        </svg>
    );
}

const languages: LanguageOption[] = [
    { code: "en", labelKey: "language.english", flagIcon: <UsFlagIcon /> },
    { code: "nl", labelKey: "language.dutch", flagIcon: <NlFlagIcon /> },
    { code: "es", labelKey: "language.spanish", flagIcon: <EsFlagIcon /> },
    { code: "zh", labelKey: "language.chinese", flagIcon: <ZhFlagIcon /> },
];

export function LanguageMenu() {
    const { t } = useTranslation();
    const {
        preferences: { language },
        setLanguage,
    } = usePreferences();

    const activeOption = useMemo(
        () =>
            languages.find((option) => option.code === language) ??
            languages[0],
        [language],
    );

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
                variant="shadow"
                className={STANDARD_SURFACE_CLASS.menu.dirPickerSurface}
                itemClasses={STANDARD_SURFACE_CLASS.menu.itemSplitClassNames}
            >
                {languages.map((option) => {
                    const isActive = language === option.code;

                    return (
                        <DropdownItem
                            key={option.code}
                            onPress={() => setLanguage(option.code)}
                            isSelected={isActive}
                            className={
                                isActive
                                    ? STANDARD_SURFACE_CLASS.menu.itemSelectedPrimary
                                    : undefined
                            }
                            startContent={
                                <span className={STANDARD_SURFACE_CLASS.menu.flagInlineWrap}>
                                    {option.flagIcon}
                                </span>
                            }
                            endContent={
                                isActive ? (
                                    <Check
                                        size={22}
                                        strokeWidth={ICON_STROKE_WIDTH}
                                        className={STANDARD_SURFACE_CLASS.menu.checkIconPrimary}
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
