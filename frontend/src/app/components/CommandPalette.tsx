import { AnimatePresence, motion } from "framer-motion";
import { Command } from "cmdk";
import { cn } from "@heroui/react";
import { useMemo, useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useFocusState } from "@/app/context/AppShellStateContext";
import type { FocusPart } from "@/app/context/AppShellStateContext";
import type { CommandId } from "@/app/commandCatalog";
import { Section } from "@/shared/ui/layout/Section";
import {
    GLASS_MODAL_SURFACE,
    MODAL_SURFACE_FRAME,
} from "@/shared/ui/layout/glass-surface";

export type CommandActionOutcome =
    | { status: "success" }
    | { status: "canceled"; reason: "no_selection" }
    | { status: "unsupported"; reason: "action_not_supported" }
    | {
          status: "failed";
          reason: "execution_failed" | "refresh_failed" | "exception";
      };

type NonSuccessCommandActionOutcome = Exclude<
    CommandActionOutcome,
    { status: "success" }
>;

export interface CommandAction {
    id: CommandId;
    group: string;
    title: string;
    description?: string;
    shortcut?: string[];
    onSelect: () => CommandActionOutcome | Promise<CommandActionOutcome>;
}

export interface CommandPaletteContext {
    activePart: FocusPart;
}

interface CommandPaletteProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    actions: CommandAction[];
    getContextActions?: (context: CommandPaletteContext) => CommandAction[];
}

const PANEL_ANIMATION = {
    initial: { opacity: 0, y: -6, scale: 0.98 },
    animate: { opacity: 1, y: 0, scale: 1 },
    exit: { opacity: 0, y: -6, scale: 0.98 },
};

interface CommandPaletteOverlayProps {
    groupedActions: Array<{ group: string; entries: CommandAction[] }>;
    onClose: () => void;
}

function CommandPaletteOverlay({
    groupedActions,
    onClose,
}: CommandPaletteOverlayProps) {
    const { t } = useTranslation();
    const [query, setQuery] = useState("");
    const [lastOutcome, setLastOutcome] =
        useState<NonSuccessCommandActionOutcome | null>(null);

    const handleSelect = async (action: CommandAction) => {
        setLastOutcome(null);
        let outcome: CommandActionOutcome;
        try {
            outcome = await action.onSelect();
        } catch {
            outcome = { status: "failed", reason: "exception" };
        }

        if (outcome.status === "success") {
            onClose();
            return;
        }

        setLastOutcome(outcome);
    };

    const outcomeMessage = useMemo(() => {
        if (!lastOutcome) return null;
        if (lastOutcome.status === "canceled") {
            return t("command_palette.result.no_selection");
        }
        if (lastOutcome.status === "unsupported") {
            return t("command_palette.result.unsupported");
        }
        return t("command_palette.result.failed");
    }, [lastOutcome, t]);

    const outcomeToneClass = useMemo(() => {
        if (!lastOutcome) return "";
        if (lastOutcome.status === "failed") {
            return "text-danger";
        }
        return "text-warning";
    }, [lastOutcome]);

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50"
        >
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.7 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-background/90 backdrop-blur-xl"
                onPointerDown={onClose}
            />
            <Section
                padding="overlay"
                className="relative h-full flex items-start justify-center"
            >
                <motion.div
                    {...PANEL_ANIMATION}
                    transition={{ duration: 0.2 }}
                    className={cn(
                        GLASS_MODAL_SURFACE,
                        MODAL_SURFACE_FRAME,
                        "relative z-10 w-full max-w-2xl",
                    )}
                >
                    <Command
                        value={query}
                        onValueChange={setQuery}
                        onKeyDown={(event) => {
                            if (event.key === "Escape") {
                                event.preventDefault();
                                onClose();
                            }
                        }}
                    >
                        <Command.Input
                            placeholder={t("command_palette.placeholder")}
                            className="rounded-none border-0 bg-transparent px-panel py-panel text-base font-semibold outline-none placeholder:text-foreground/50"
                        />
                        <Command.List className="max-h-command-palette overflow-y-auto px-panel py-panel">
                            {groupedActions.map(({ group, entries }) => (
                                <div key={group} className="pb-panel">
                                    <div className="text-scaled font-semibold uppercase tracking-0-2 text-default-500">
                                        {group}
                                    </div>
                                    <Command.Group>
                                        {entries.map((action) => (
                                            <Command.Item
                                                key={action.id}
                                                value={action.id}
                                                onSelect={() =>
                                                    void handleSelect(action)
                                                }
                                                className="glass-panel mt-tight flex cursor-pointer flex-col border border-content1/10 bg-background/80 py-panel px-panel text-left transition hover:border-foreground/40 hover:bg-background/90 focus:border-primary focus:outline-none"
                                            >
                                                <div className="flex items-center justify-between text-sm font-semibold text-foreground">
                                                    <span>{action.title}</span>
                                                    {action.shortcut && (
                                                        <div className="flex gap-tools text-scaled font-mono uppercase text-foreground/50">
                                                            {action.shortcut.map(
                                                                (key) => (
                                                                    <span
                                                                        key={
                                                                            key
                                                                        }
                                                                        className="rounded-full border border-foreground/30 px-tight py-tight"
                                                                    >
                                                                        {key}
                                                                    </span>
                                                                ),
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                                {action.description && (
                                                    <p className="text-xs text-foreground/70">
                                                        {action.description}
                                                    </p>
                                                )}
                                            </Command.Item>
                                        ))}
                                    </Command.Group>
                                </div>
                            ))}
                            <Command.Empty className="py-panel text-center text-sm text-foreground/60">
                                {t("command_palette.empty")}
                            </Command.Empty>
                        </Command.List>
                        {outcomeMessage ? (
                            <div
                                className={cn(
                                    "border-t border-default/20 px-panel py-tight text-xs font-medium",
                                    outcomeToneClass,
                                )}
                            >
                                {outcomeMessage}
                            </div>
                        ) : null}
                    </Command>
                </motion.div>
            </Section>
        </motion.div>
    );
}

export function CommandPalette({
    isOpen,
    onOpenChange,
    actions,
    getContextActions,
}: CommandPaletteProps) {
    const { t } = useTranslation();
    const { activePart, setActivePart } = useFocusState();
    const previousPartRef = useRef<FocusPart>("table");
    const previousOpenRef = useRef(isOpen);
    const contextActions = useMemo(
        () => getContextActions?.({ activePart }) ?? [],
        [getContextActions, activePart],
    );
    const allActions = useMemo(
        () => [...actions, ...contextActions],
        [actions, contextActions],
    );
    const groupedActions = useMemo(() => {
        const result = new Map<string, CommandAction[]>();
        allActions.forEach((action) => {
            const group = action.group ?? t("command_palette.group.ungrouped");
            const bucket = result.get(group) ?? [];
            bucket.push(action);
            result.set(group, bucket);
        });
        return Array.from(result.entries()).map(([group, entries]) => ({
            group,
            entries,
        }));
    }, [allActions, t]);

    useEffect(() => {
        if (!previousOpenRef.current && isOpen) {
            previousPartRef.current = activePart;
            setActivePart("command-palette");
        } else if (previousOpenRef.current && !isOpen) {
            setActivePart(previousPartRef.current);
        }
        previousOpenRef.current = isOpen;
    }, [isOpen, activePart, setActivePart]);

    const handleClose = () => {
        onOpenChange(false);
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <CommandPaletteOverlay
                    groupedActions={groupedActions}
                    onClose={handleClose}
                />
            )}
        </AnimatePresence>
    );
}
