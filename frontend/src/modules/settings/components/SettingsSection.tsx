import { Card, cn } from "@heroui/react";
import type { ReactNode } from "react";
import { FORM } from "@/shared/ui/layout/glass-surface";

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
        <Card className={cn(FORM.sectionCard, className)}>
            {title && (
                <h3
                    className={FORM.sectionTitle}
                    style={{ letterSpacing: "var(--tt-tracking-ultra)" }}
                >
                    {title}
                </h3>
            )}
            {description && (
                <p
                    className={FORM.sectionDescription}
                    style={{ letterSpacing: "var(--tt-tracking-wide)" }}
                >
                    {description}
                </p>
            )}
            {children}
        </Card>
    );
}
