import { cn } from "@heroui/react";
import type { ReactNode } from "react";

type AlertSeverity = "warning" | "danger" | "info" | "success";

const ALERT_SEVERITY_CLASS: Record<AlertSeverity, string> = {
    warning: "border-warning/30 bg-warning/10 text-warning",
    danger: "border-danger/40 bg-danger/5 text-danger",
    info: "border-primary/30 bg-primary/5 text-primary",
    success: "border-success/40 bg-success/10 text-success",
};

interface AlertPanelProps {
    severity: AlertSeverity;
    children: ReactNode;
    className?: string;
}

export function AlertPanel({ severity, children, className }: AlertPanelProps) {
    return (
        <div
            className={cn(
                "rounded-panel border p-panel text-scaled",
                ALERT_SEVERITY_CLASS[severity],
                className,
            )}
        >
            {children}
        </div>
    );
}
