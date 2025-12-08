// src/shared/ui/flags/Flags.tsx
import type { SVGProps } from "react";
import { cn } from "@heroui/react";

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
