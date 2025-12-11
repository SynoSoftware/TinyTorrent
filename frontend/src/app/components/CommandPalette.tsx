import { AnimatePresence, motion } from "framer-motion";
import { Command } from "cmdk";
import { useMemo, useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useFocusState } from "../context/FocusContext";
import type { FocusPart } from "../context/FocusContext";

export interface CommandAction {
    id: string;
    group: string;
    title: string;
    description?: string;
    shortcut?: string[];
    onSelect: () => void | Promise<void>;
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
    const [query, setQuery] = useState("");
    const contextActions = useMemo(
        () => getContextActions?.({ activePart }) ?? [],
        [getContextActions, activePart]
    );
    const allActions = useMemo(
        () => [...actions, ...contextActions],
        [actions, contextActions]
    );
    const groupedActions = useMemo(() => {
        const result = new Map<string, CommandAction[]>();
        allActions.forEach((action) => {
            const group =
                action.group ?? t("command_palette.group.ungrouped");
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

    useEffect(() => {
        if (!isOpen) {
            setQuery("");
        }
    }, [isOpen]);

    const handleClose = () => {
        onOpenChange(false);
    };

    const handleSelect = async (action: CommandAction) => {
        await action.onSelect();
        handleClose();
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-6"
                >
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 0.7 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-background/90 backdrop-blur-xl"
                        onPointerDown={handleClose}
                    />
                    <motion.div
                        {...PANEL_ANIMATION}
                        transition={{ duration: 0.2 }}
                        className="relative z-10 w-full max-w-2xl rounded-[28px] border border-content1/20 bg-content1/80 shadow-[0_30px_70px_rgba(0,0,0,0.55)] backdrop-blur-3xl"
                    >
                        <Command
                            value={query}
                            onValueChange={setQuery}
                            onKeyDown={(event) => {
                                if (event.key === "Escape") {
                                    event.preventDefault();
                                    handleClose();
                                }
                            }}
                        >
                            <Command.Input
                                placeholder={t("command_palette.placeholder")}
                                className="rounded-none border-0 bg-transparent px-6 py-4 text-base font-semibold outline-none placeholder:text-foreground/50"
                            />
                            <Command.List className="max-h-[320px] overflow-y-auto px-6 pb-4 pt-2">
                                {groupedActions.map(({ group, entries }) => (
                                    <div key={group} className="pb-4">
                                        <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-default-500">
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
                                                    className="glass-panel mt-2 flex cursor-pointer flex-col border border-content1/10 bg-background/80 py-3 px-4 text-left transition hover:border-foreground/40 hover:bg-background/90 focus:border-primary focus:outline-none"
                                                >
                                                    <div className="flex items-center justify-between text-sm font-semibold text-foreground">
                                                        <span>{action.title}</span>
                                                        {action.shortcut && (
                                                            <div className="flex gap-2 text-[10px] font-mono uppercase text-foreground/50">
                                                                {action.shortcut.map(
                                                                    (key) => (
                                                                        <span
                                                                            key={key}
                                                                            className="rounded-full border border-foreground/30 px-2 py-0.5"
                                                                        >
                                                                            {key}
                                                                        </span>
                                                                    )
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
                                <Command.Empty className="py-6 text-center text-sm text-foreground/60">
                                    {t("command_palette.empty")}
                                </Command.Empty>
                            </Command.List>
                        </Command>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
