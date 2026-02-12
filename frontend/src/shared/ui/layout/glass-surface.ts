import { SURFACE_BORDER } from "@/config/logic";
import { TEXT_ROLE } from "@/config/textRoles";

// Reusable glass surface styling for popups and dropdowns.
export const GLASS_MODAL_SURFACE =
    "glass-panel surface-layer-2 text-foreground shadow-visual-large rounded-modal";
export const MODAL_SURFACE_FRAME =
    "flex flex-col overflow-hidden border border-default/20";
export const MODAL_SURFACE_HEADER = "border-b border-default/20";
export const MODAL_SURFACE_FOOTER = "border-t border-default/20";
export const GLASS_MENU_SURFACE =
    "glass-panel surface-layer-2 text-foreground shadow-menu-large rounded-modal";
export const MENU_SURFACE_FRAME =
    "overflow-hidden border border-default/20 p-tight";
export const MENU_SURFACE_LIST = "overflow-hidden";
export const MENU_ITEM_SURFACE =
    "rounded-panel px-panel py-tight text-scaled font-medium transition-colors hover:bg-content2/70 hover:text-foreground active:bg-content2/80";
export const MENU_SECTION_HEADING = TEXT_ROLE.label;
export const PANEL_SURFACE_FRAME =
    "rounded-panel border border-default/10 overflow-hidden";
export const PANEL_SURFACE_INSET_FRAME =
    "rounded-panel border border-default/15 overflow-hidden";
export const PANE_SURFACE_FRAME =
    "flex flex-col min-h-0 overflow-hidden rounded-panel border border-default/20 shadow-small";
export const GLASS_TOOLTIP_CLASSNAMES = {
    content: `bg-content1/80 border ${SURFACE_BORDER} backdrop-blur-3xl shadow-visual-large rounded-2xl px-panel py-tight text-scaled leading-tight text-foreground/90`,
    arrow: "bg-content1/80",
} as const;
export const INPUT_CLASSNAMES_MONO_SURFACE = {
    input: "font-mono text-scaled selection:bg-primary/20 selection:text-foreground !outline-none focus:!outline-none focus-visible:!outline-none",
    inputWrapper:
        "surface-layer-1 transition-colors shadow-none group-hover:border-default/10",
} as const;
export const INPUT_CLASSNAMES_MONO_SURFACE_EMPHASIZED = {
    inputWrapper:
        "surface-layer-1 border border-default/10 shadow-none focus-within:border-primary/70",
    content: "",
    input: "bg-transparent text-scaled font-mono text-foreground placeholder:text-foreground/30",
} as const;

export const GLASS_PANEL_SURFACE =
    "glass-panel surface-layer-1 text-foreground";

export const BLOCK_SHADOW = "shadow-small";
export const PANEL_SHADOW = "shadow-medium";
export const GLASS_BLOCK_SURFACE = "acrylic  shadow-inner";
