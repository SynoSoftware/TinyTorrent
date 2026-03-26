export const uiRoles = {
    surfaces: {
        panel: "rounded-panel border border-default/20 bg-content1/10",
        card: "rounded-2xl border border-default/20 bg-content1/15 shadow-small",
        overlay: "rounded-2xl border border-default/20 bg-background/90 backdrop-blur-xl shadow-medium",
        inset: "rounded-panel bg-content1/20",
    },
    text: {
        primary: "text-foreground",
        secondary: "text-foreground/80",
        muted: "text-foreground/60",
        subtle: "text-foreground/45",
        danger: "text-danger",
    },
    borders: {
        subtle: "border border-default/10",
        default: "border border-default/20",
        strong: "border border-default/35",
    },
} as const;

export type UiRoles = typeof uiRoles;
