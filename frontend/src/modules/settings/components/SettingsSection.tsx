import { Card, cn } from "@heroui/react";
import type { ReactNode } from "react";
import { HEADER_BASE, SURFACE_BORDER } from "@/config/logic";

interface SettingsSectionProps {
    title?: string;
    description?: string;
    className?: string;
    children: ReactNode;
}

export function SettingsSection({
    title,
    description,
    className,
    children,
}: SettingsSectionProps) {
    return (
        <Card
            className={cn(
                `p-panel rounded-2xl border ${SURFACE_BORDER} bg-content1/10`,
                className
            )}
        >
            {title && (
                <h3
                    className={cn(
                        HEADER_BASE,
                        "text-scaled font-bold text-foreground/40 mb-panel leading-tight"
                    )}
                    style={{ letterSpacing: "var(--tt-tracking-ultra)" }}
                >
                    {title}
                </h3>
            )}
            {description && (
                <p
                    className={cn(HEADER_BASE, "mb-panel text-scaled")}
                    style={{ letterSpacing: "var(--tt-tracking-wide)" }}
                >
                    {description}
                </p>
            )}
            {children}
        </Card>
    );
}
