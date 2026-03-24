import { Tooltip, cn } from "@heroui/react";
import {
    Children,
    cloneElement,
    isValidElement,
    useCallback,
    useSyncExternalStore,
    type ComponentProps,
    type ReactNode,
} from "react";
import { registry } from "@/config/logic";
import { SURFACE } from "@/shared/ui/layout/glass-surface";

type HeroTooltipProps = ComponentProps<typeof Tooltip>;
type AppTooltipProps = HeroTooltipProps & {
    dense?: boolean;
    operational?: boolean;
    native?: boolean;
};
const { ui } = registry;
const MENU_SELECTOR = "[role='menu']";

const hasOpenMenu = () =>
    typeof document !== "undefined" &&
    document.body != null &&
    document.body.querySelector(MENU_SELECTOR) !== null;

type TooltipGuardSubscriber = (isSuppressed: boolean) => void;

type TooltipGuardRuntime = {
    enabledCount: number;
    isInteractionSuppressed: boolean;
    isMenuOpen: boolean;
    subscribers: Set<TooltipGuardSubscriber>;
    timeoutId: number | null;
    cleanup: (() => void) | null;
};

const tooltipGuardRuntime: TooltipGuardRuntime = {
    enabledCount: 0,
    isInteractionSuppressed: false,
    isMenuOpen: false,
    subscribers: new Set(),
    timeoutId: null,
    cleanup: null,
};

const getTooltipGuardValue = () =>
    tooltipGuardRuntime.isInteractionSuppressed || tooltipGuardRuntime.isMenuOpen;

const emitTooltipGuard = () => {
    const nextValue = getTooltipGuardValue();
    tooltipGuardRuntime.subscribers.forEach((subscriber) => {
        try {
            subscriber(nextValue);
        } catch {
            // Keep tooltip guard fan-out resilient to subscriber failures.
        }
    });
};

const clearTooltipGuardTimeout = () => {
    if (tooltipGuardRuntime.timeoutId == null || typeof window === "undefined") {
        return;
    }
    window.clearTimeout(tooltipGuardRuntime.timeoutId);
    tooltipGuardRuntime.timeoutId = null;
};

const setTooltipMenuOpen = (isMenuOpen: boolean) => {
    if (tooltipGuardRuntime.isMenuOpen === isMenuOpen) {
        return;
    }
    tooltipGuardRuntime.isMenuOpen = isMenuOpen;
    emitTooltipGuard();
};

const suppressTooltipInteractionsFor = (durationMs: number) => {
    if (typeof window === "undefined") {
        return;
    }

    if (!tooltipGuardRuntime.isInteractionSuppressed) {
        tooltipGuardRuntime.isInteractionSuppressed = true;
        emitTooltipGuard();
    }

    clearTooltipGuardTimeout();
    tooltipGuardRuntime.timeoutId = window.setTimeout(() => {
        tooltipGuardRuntime.timeoutId = null;
        if (!tooltipGuardRuntime.isInteractionSuppressed) {
            return;
        }
        tooltipGuardRuntime.isInteractionSuppressed = false;
        emitTooltipGuard();
    }, durationMs);
};

const ensureTooltipGuardRuntime = () => {
    if (tooltipGuardRuntime.cleanup != null) {
        return;
    }
    if (
        typeof window === "undefined" ||
        typeof document === "undefined" ||
        document.body == null
    ) {
        return;
    }

    const handleWheel = () => suppressTooltipInteractionsFor(ui.tooltip.scrollSuppressionMs);
    const handleScroll = () => suppressTooltipInteractionsFor(ui.tooltip.scrollSuppressionMs);
    const handlePointerDown = () => suppressTooltipInteractionsFor(ui.tooltip.pointerSuppressionMs);
    const handleDragStart = () => suppressTooltipInteractionsFor(ui.tooltip.pointerSuppressionMs);
    const handleDragEnd = () => suppressTooltipInteractionsFor(ui.tooltip.scrollSuppressionMs);
    const handleDrop = () => suppressTooltipInteractionsFor(ui.tooltip.scrollSuppressionMs);
    const handleContextMenu = () => suppressTooltipInteractionsFor(ui.tooltip.contextMenuSuppressionMs);
    const updateMenuState = () => {
        setTooltipMenuOpen(hasOpenMenu());
    };

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

    let observer: MutationObserver | null = null;
    if (typeof MutationObserver !== "undefined") {
        observer = new MutationObserver(updateMenuState);
        observer.observe(document.body, {
            childList: true,
            subtree: true,
        });
    }
    updateMenuState();

    tooltipGuardRuntime.cleanup = () => {
        window.removeEventListener("wheel", handleWheel, true);
        window.removeEventListener("scroll", handleScroll, true);
        window.removeEventListener("pointerdown", handlePointerDown, true);
        window.removeEventListener("dragstart", handleDragStart, true);
        window.removeEventListener("dragend", handleDragEnd, true);
        window.removeEventListener("drop", handleDrop, true);
        window.removeEventListener("contextmenu", handleContextMenu, true);
        observer?.disconnect();
        observer = null;
        clearTooltipGuardTimeout();
        tooltipGuardRuntime.isInteractionSuppressed = false;
        tooltipGuardRuntime.isMenuOpen = false;
        tooltipGuardRuntime.cleanup = null;
        emitTooltipGuard();
    };
};

const acquireTooltipGuard = () => {
    tooltipGuardRuntime.enabledCount += 1;
    ensureTooltipGuardRuntime();
};

const releaseTooltipGuard = () => {
    if (tooltipGuardRuntime.enabledCount === 0) {
        return;
    }
    tooltipGuardRuntime.enabledCount -= 1;
    if (tooltipGuardRuntime.enabledCount === 0) {
        tooltipGuardRuntime.cleanup?.();
    }
};

const useTooltipInterferenceGuard = (enabled: boolean) => {
    const subscribe = useCallback(
        (onStoreChange: () => void) => {
            if (!enabled) {
                return () => {};
            }

            tooltipGuardRuntime.subscribers.add(onStoreChange);
            acquireTooltipGuard();

            return () => {
                tooltipGuardRuntime.subscribers.delete(onStoreChange);
                releaseTooltipGuard();
            };
        },
        [enabled],
    );
    const getSnapshot = useCallback(
        () => (enabled ? getTooltipGuardValue() : false),
        [enabled],
    );

    return useSyncExternalStore(subscribe, getSnapshot, () => false);
};

const flattenTooltipContent = (value: ReactNode): string | null => {
    if (value == null || typeof value === "boolean") {
        return null;
    }
    if (typeof value === "string" || typeof value === "number") {
        return String(value);
    }
    if (Array.isArray(value)) {
        const flattened = value
            .map((item) => flattenTooltipContent(item))
            .filter((item): item is string => Boolean(item && item.trim().length > 0));
        return flattened.length > 0 ? flattened.join("\n") : null;
    }
    if (isValidElement<{ children?: ReactNode }>(value)) {
        return flattenTooltipContent(value.props.children);
    }
    return null;
};

const renderNativeTooltip = (
    children: ReactNode,
    content: ReactNode,
) => {
    const title = flattenTooltipContent(content);
    const normalizedChildren = Children.toArray(children);
    if (
        normalizedChildren.length === 1 &&
        isValidElement<{ title?: string; "aria-label"?: string }>(normalizedChildren[0])
    ) {
        const child = normalizedChildren[0];
        const existingTitle = child.props.title;
        const nextTitle = existingTitle ?? title ?? undefined;
        return cloneElement<{ title?: string; "aria-label"?: string }>(child, {
            title: nextTitle,
            "aria-label":
                child.props["aria-label"] ?? title ?? undefined,
        });
    }
    return (
        <span title={title ?? undefined} aria-label={title ?? undefined}>
            {children}
        </span>
    );
};

export function AppTooltip({
    classNames,
    delay,
    closeDelay,
    placement = "bottom",
    offset,
    dense = false,
    operational,
    native = false,
    isDisabled,
    content,
    children,
    ...props
}: AppTooltipProps) {
    const usesOperationalPolicy = operational ?? dense;
    const isSuppressed = useTooltipInterferenceGuard(usesOperationalPolicy);
    const resolvedDelay =
        delay ?? (dense ? ui.tooltip.denseDelayMs : ui.tooltip.delayMs);
    const resolvedCloseDelay = closeDelay ?? ui.tooltip.closeDelayMs;
    const resolvedOffset =
        offset ?? (dense ? ui.tooltip.denseOffsetPx : ui.tooltip.offsetPx);

    if (native) {
        return renderNativeTooltip(children, content);
    }

    return (
        <Tooltip
            {...props}
            content={content}
            children={children}
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
