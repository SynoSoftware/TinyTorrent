import { Card, cn } from "@heroui/react";
import type { ReactNode } from "react";

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
                "p-panel rounded-2xl border border-content1/20 bg-content1/10",
                className
            )}
        >
            {title && (
                <h3
                    className="text-scaled font-bold uppercase text-foreground/40 mb-panel  leading-tight"
                    style={{ letterSpacing: "var(--tt-tracking-ultra)" }}
                >
                    {title}
                </h3>
            )}
            {description && (
                <p
                    className="mb-panel text-scaled uppercase text-foreground/50"
                    style={{ letterSpacing: "var(--tt-tracking-wide)" }}
                >
                    {description}
                </p>
            )}
            {children}
        </Card>
    );
}
