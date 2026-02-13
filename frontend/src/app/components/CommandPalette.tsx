import { AnimatePresence, motion } from "framer-motion";
import { Command } from "cmdk";
import { cn } from "@heroui/react";
import { useMemo, useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useFocusState } from "@/app/context/AppShellStateContext";
import type { FocusPart } from "@/app/context/AppShellStateContext";
import type { CommandId } from "@/app/commandCatalog";
import { Section } from "@/shared/ui/layout/Section";
import { TEXT_ROLE_EXTENDED } from "@/config/textRoles";
import {
    DETAILS_TOOLTIP_OPACITY_ANIMATION,
    STATUS_VISUAL_KEYS,
    STATUS_VISUALS,
} from "@/config/logic";
import { COMMAND_PALETTE } from "@/shared/ui/layout/glass-surface";

export type CommandActionOutcome =
    | { status: "success" }
    | { status: "canceled"; reason: "no_selection" | "operation_cancelled" }
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

const OVERLAY_FADE_ANIMATION = {
    initial: { opacity: DETAILS_TOOLTIP_OPACITY_ANIMATION.initial.opacity },
    animate: { opacity: DETAILS_TOOLTIP_OPACITY_ANIMATION.animate.opacity },
    exit: { opacity: DETAILS_TOOLTIP_OPACITY_ANIMATION.exit.opacity },
    transition: { duration: 0.2 },
} as const;

const BACKDROP_FADE_ANIMATION = {
    ...OVERLAY_FADE_ANIMATION,
    animate: { opacity: 0.7 },
} as const;

const PANEL_ANIMATION = {
    initial: {
        opacity: DETAILS_TOOLTIP_OPACITY_ANIMATION.initial.opacity,
        y: -6,
        scale: 0.98,
    },
    animate: {
        opacity: DETAILS_TOOLTIP_OPACITY_ANIMATION.animate.opacity,
        y: 0,
        scale: 1,
    },
    exit: {
        opacity: DETAILS_TOOLTIP_OPACITY_ANIMATION.exit.opacity,
        y: -6,
        scale: 0.98,
    },
    transition: { duration: 0.2 },
} as const;

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
            if (lastOutcome.reason === "no_selection") {
                return t("command_palette.result.no_selection");
            }
            return t("command_palette.result.canceled");
        }
        if (lastOutcome.status === "unsupported") {
            return t("command_palette.result.unsupported");
        }
        return t("command_palette.result.failed");
    }, [lastOutcome, t]);

    const outcomeToneClass = useMemo(() => {
        if (!lastOutcome) return "";
        const toneKey =
            lastOutcome.status === "failed"
                ? STATUS_VISUAL_KEYS.tone.DANGER
                : STATUS_VISUAL_KEYS.tone.WARNING;
        return (
            STATUS_VISUALS[toneKey]?.text ??
            STATUS_VISUALS[STATUS_VISUAL_KEYS.tone.WARNING]?.text ??
            "text-warning"
        );
    }, [lastOutcome]);

    return (
        <motion.div
            {...OVERLAY_FADE_ANIMATION}
            className={COMMAND_PALETTE.overlay}
        >
            <motion.div
                {...BACKDROP_FADE_ANIMATION}
                className={COMMAND_PALETTE.backdrop}
                onPointerDown={onClose}
            />
            <Section padding="overlay" className={COMMAND_PALETTE.section}>
                <motion.div
                    {...PANEL_ANIMATION}
                    className={COMMAND_PALETTE.panel}
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
                            className={COMMAND_PALETTE.input}
                        />
                        <Command.List className={COMMAND_PALETTE.list}>
                            {groupedActions.map(({ group, entries }) => (
                                <div
                                    key={group}
                                    className={COMMAND_PALETTE.groupWrap}
                                >
                                    <div
                                        className={
                                            TEXT_ROLE_EXTENDED.commandSection
                                        }
                                    >
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
                                                className={COMMAND_PALETTE.item}
                                            >
                                                <div
                                                    className={
                                                        COMMAND_PALETTE.itemRow
                                                    }
                                                >
                                                    <span>{action.title}</span>
                                                    {action.shortcut && (
                                                        <div
                                                            className={
                                                                COMMAND_PALETTE.shortcutWrap
                                                            }
                                                        >
                                                            {action.shortcut.map(
                                                                (key) => (
                                                                    <span
                                                                        key={
                                                                            key
                                                                        }
                                                                        className={
                                                                            COMMAND_PALETTE.shortcutKey
                                                                        }
                                                                    >
                                                                        {key}
                                                                    </span>
                                                                ),
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                                {action.description && (
                                                    <p
                                                        className={
                                                            COMMAND_PALETTE.description
                                                        }
                                                    >
                                                        {action.description}
                                                    </p>
                                                )}
                                            </Command.Item>
                                        ))}
                                    </Command.Group>
                                </div>
                            ))}
                            <Command.Empty className={COMMAND_PALETTE.empty}>
                                {t("command_palette.empty")}
                            </Command.Empty>
                        </Command.List>
                        {outcomeMessage ? (
                            <div
                                className={cn(
                                    COMMAND_PALETTE.outcome,
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
