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
                "p-5 rounded-2xl border border-content1/20 bg-content1/10",
                className
            )}
        >
            {title && (
                <h3 className="text-[10px] font-bold uppercase tracking-[0.3em] text-foreground/40 mb-3 mt-0 leading-tight">
                    {title}
                </h3>
            )}
            {description && (
                <p className="mb-4 text-[11px] uppercase tracking-[0.25em] text-foreground/50">
                    {description}
                </p>
            )}
            {children}
        </Card>
    );
}
