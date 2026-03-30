import { Card, CardBody, CardHeader, cn } from "@heroui/react";
import type { ReactNode } from "react";
import { registry } from "@/config/logic";
import { form } from "@/shared/ui/layout/glass-surface";
import type { SettingsSectionTone } from "@/modules/settings/data/settings-tabs";
const { visuals } = registry;

interface SettingsSectionProps {
    title?: string;
    description?: string;
    className?: string;
    tone?: SettingsSectionTone;
    children: ReactNode;
}

export function SettingsSection({
    title,
    description,
    className,
    tone,
    children,
}: SettingsSectionProps) {
    const toneClass =
        tone == null
            ? undefined
            : visuals.status.recipes[visuals.status.keys.tone[tone]].panel;

    return (
        <Card className={cn(form.sectionCard, toneClass, className)}>
            {(title || description) && (
                <CardHeader className={form.sectionHeader}>
                    <div className={form.sectionHeaderStack}>
                        {title ? <h3 className={form.sectionTitle}>{title}</h3> : null}
                        {description ? (
                            <p className={form.sectionDescription}>{description}</p>
                        ) : null}
                    </div>
                </CardHeader>
            )}
            <CardBody className={form.sectionBody}>{children}</CardBody>
        </Card>
    );
}
