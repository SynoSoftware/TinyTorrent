import { Tooltip, cn } from "@heroui/react";
import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type ComponentProps,
} from "react";
import { registry } from "@/config/logic";
import { SURFACE } from "@/shared/ui/layout/glass-surface";

type HeroTooltipProps = ComponentProps<typeof Tooltip>;
type AppTooltipProps = HeroTooltipProps & {
    dense?: boolean;
    operational?: boolean;
};
const { ui } = registry;
const MENU_SELECTOR = "[role='menu']";

const hasOpenMenu = () =>
    typeof document !== "undefined" &&
    document.body != null &&
    document.body.querySelector(MENU_SELECTOR) !== null;

const useTooltipInterferenceGuard = (enabled: boolean) => {
    const [isInteractionSuppressed, setIsInteractionSuppressed] =
        useState(false);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const timeoutRef = useRef<number | null>(null);

    const clearSuppressionTimeout = useCallback(() => {
        if (timeoutRef.current == null || typeof window === "undefined") return;
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
    }, []);

    const suppressFor = useCallback(
        (durationMs: number) => {
            if (typeof window === "undefined") return;
            setIsInteractionSuppressed(true);
            clearSuppressionTimeout();
            timeoutRef.current = window.setTimeout(() => {
                timeoutRef.current = null;
                setIsInteractionSuppressed(false);
            }, durationMs);
        },
        [clearSuppressionTimeout],
    );

    useEffect(() => {
        if (enabled) {
            return () => {
                clearSuppressionTimeout();
                setIsInteractionSuppressed(false);
                setIsMenuOpen(false);
            };
        }

        clearSuppressionTimeout();
        return undefined;
    }, [enabled, clearSuppressionTimeout]);

    useEffect(() => {
        if (!enabled) return;
        if (typeof window === "undefined") return;

        const handleWheel = () => suppressFor(ui.tooltip.scrollSuppressionMs);
        const handleScroll = () => suppressFor(ui.tooltip.scrollSuppressionMs);
        const handlePointerDown = () =>
            suppressFor(ui.tooltip.pointerSuppressionMs);
        const handleDragStart = () =>
            suppressFor(ui.tooltip.pointerSuppressionMs);
        const handleDragEnd = () =>
            suppressFor(ui.tooltip.scrollSuppressionMs);
        const handleDrop = () => suppressFor(ui.tooltip.scrollSuppressionMs);
        const handleContextMenu = () =>
            suppressFor(ui.tooltip.contextMenuSuppressionMs);

        window.addEventListener("wheel", handleWheel, {
            passive: true,
            capture: true,
        });
        window.addEventListener("scroll", handleScroll, {
            passive: true,
            capture: true,
        });
        window.addEventListener("pointerdown", handlePointerDown, {
            passive: true,
            capture: true,
        });
        window.addEventListener("dragstart", handleDragStart, {
            passive: true,
            capture: true,
        });
        window.addEventListener("dragend", handleDragEnd, {
            passive: true,
            capture: true,
        });
        window.addEventListener("drop", handleDrop, {
            passive: true,
            capture: true,
        });
        window.addEventListener("contextmenu", handleContextMenu, {
            passive: true,
            capture: true,
        });

        return () => {
            window.removeEventListener("wheel", handleWheel, true);
            window.removeEventListener("scroll", handleScroll, true);
            window.removeEventListener("pointerdown", handlePointerDown, true);
            window.removeEventListener("dragstart", handleDragStart, true);
            window.removeEventListener("dragend", handleDragEnd, true);
            window.removeEventListener("drop", handleDrop, true);
            window.removeEventListener("contextmenu", handleContextMenu, true);
        };
    }, [enabled, suppressFor]);

    useEffect(() => {
        if (!enabled) return;
        if (
            typeof document === "undefined" ||
            document.body == null ||
            typeof MutationObserver === "undefined"
        ) {
            return;
        }

        const updateMenuState = () => {
            setIsMenuOpen(hasOpenMenu());
        };

        updateMenuState();
        const observer = new MutationObserver(updateMenuState);
        observer.observe(document.body, {
            childList: true,
            subtree: true,
        });

        return () => observer.disconnect();
    }, [enabled]);

    useEffect(() => {
        return () => {
            clearSuppressionTimeout();
        };
    }, [clearSuppressionTimeout]);

    return enabled && (isInteractionSuppressed || isMenuOpen);
};

export function AppTooltip({
    classNames,
    delay,
    closeDelay,
    placement = "bottom",
    offset,
    dense = false,
    operational,
    isDisabled,
    ...props
}: AppTooltipProps) {
    const usesOperationalPolicy = operational ?? dense;
    const isSuppressed = useTooltipInterferenceGuard(usesOperationalPolicy);
    const resolvedDelay =
        delay ?? (dense ? ui.tooltip.denseDelayMs : ui.tooltip.delayMs);
    const resolvedCloseDelay = closeDelay ?? ui.tooltip.closeDelayMs;
    const resolvedOffset =
        offset ?? (dense ? ui.tooltip.denseOffsetPx : ui.tooltip.offsetPx);

    return (
        <Tooltip
            {...props}
            isDisabled={isDisabled || isSuppressed}
            delay={resolvedDelay}
            closeDelay={resolvedCloseDelay}
            placement={placement}
            offset={resolvedOffset}
            classNames={{
                ...classNames,
                base: cn("pointer-events-none", classNames?.base),
                content: cn(
                    "pointer-events-none",
                    SURFACE.tooltip.content,
                    classNames?.content,
                ),
                arrow: cn(
                    "pointer-events-none",
                    SURFACE.tooltip.arrow,
                    classNames?.arrow,
                ),
            }}
        />
    );
}

export default AppTooltip;
