import { cn } from "@heroui/react";
import type { ComponentPropsWithoutRef } from "react";

export type SectionPadding =
    | "none"
    | "panel"
    | "stage"
    | "shell"
    | "overlay"
    | "modal";

const SECTION_PADDING_CLASS: Record<SectionPadding, string> = {
    none: "",
    panel: "p-panel",
    stage: "p-stage",
    shell: "px-panel py-stage sm:px-stage lg:px-stage",
    overlay: "px-panel pt-stage",
    modal: "p-panel sm:p-stage",
};

interface SectionProps extends ComponentPropsWithoutRef<"div"> {
    centered?: boolean;
    padding?: SectionPadding;
}

export function Section({
    className,
    centered = false,
    padding = "none",
    ...props
}: SectionProps) {
    return (
        <div
            className={cn(
                "w-full min-w-0",
                centered && "mx-auto",
                SECTION_PADDING_CLASS[padding],
                className,
            )}
            {...props}
        />
    );
}
