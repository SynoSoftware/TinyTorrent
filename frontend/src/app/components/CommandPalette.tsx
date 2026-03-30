import { AnimatePresence, motion } from "framer-motion";
import { Command } from "cmdk";
import { cn } from "@heroui/react";
import { useMemo, useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useFocusState } from "@/app/context/AppShellStateContext";
import type { FocusPart } from "@/app/context/AppShellStateContext";
import type { CommandId } from "@/app/commandCatalog";
import { Section } from "@/shared/ui/layout/Section";
import { getStatusRecipeText, registry } from "@/config/logic";
import { commandPalette } from "@/shared/ui/layout/glass-surface";
import { commandReason, type TorrentCommandOutcome } from "@/app/context/AppCommandContext";
const { visuals, visualizations } = registry;

const commandActionExceptionReason = "exception" as const;

export type CommandActionOutcome =
    | TorrentCommandOutcome
    | {
          status: "failed";
          reason: typeof commandActionExceptionReason;
      };

type NonSuccessCommandActionOutcome = Exclude<CommandActionOutcome, { status: "success" }>;

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

interface CommandPaletteOverlayProps {
    groupedActions: Array<{ group: string; entries: CommandAction[] }>;
    onClose: () => void;
}

function CommandPaletteOverlay({ groupedActions, onClose }: CommandPaletteOverlayProps) {
    const { t } = useTranslation();
    const [query, setQuery] = useState("");
    const [lastOutcome, setLastOutcome] = useState<NonSuccessCommandActionOutcome | null>(null);

    const handleSelect = async (action: CommandAction) => {
        setLastOutcome(null);
        let outcome: CommandActionOutcome;
        try {
            outcome = await action.onSelect();
        } catch {
            outcome = {
                status: "failed",
                reason: commandActionExceptionReason,
            };
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
            if (lastOutcome.reason === commandReason.noSelection) {
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
            lastOutcome.status === "failed" ? visuals.status.keys.tone.danger : visuals.status.keys.tone.warning;
        return (
            getStatusRecipeText(toneKey, visuals.status.keys.tone.warning) ||
            getStatusRecipeText(visuals.status.keys.tone.muted, visuals.status.keys.tone.warning)
        );
    }, [lastOutcome]);

    return (
        <motion.div {...visualizations.surface.fade.base} className={commandPalette.overlay}>
            <motion.div
                {...visualizations.surface.fade.backdrop}
                className={commandPalette.backdrop}
                onPointerDown={onClose}
            />
            <Section padding="overlay" className={commandPalette.section}>
                <motion.div {...visualizations.surface.fade.panel} className={commandPalette.panel}>
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
                            className={commandPalette.input}
                        />
                        <Command.List className={commandPalette.list}>
                            {groupedActions.map(({ group, entries }) => (
                                <div key={group} className={commandPalette.groupWrap}>
                                    <div className={commandPalette.sectionLabel}>{group}</div>
                                    <Command.Group>
                                        {entries.map((action) => (
                                            <Command.Item
                                                key={action.id}
                                                value={action.id}
                                                onSelect={() => void handleSelect(action)}
                                                className={commandPalette.item}
                                            >
                                                <div className={commandPalette.itemRow}>
                                                    <span>{action.title}</span>
                                                    {action.shortcut && (
                                                        <div className={commandPalette.shortcutWrap}>
                                                            {action.shortcut.map((key) => (
                                                                <span key={key} className={commandPalette.shortcutKey}>
                                                                    {key}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                                {action.description && (
                                                    <p className={commandPalette.description}>{action.description}</p>
                                                )}
                                            </Command.Item>
                                        ))}
                                    </Command.Group>
                                </div>
                            ))}
                            <Command.Empty className={commandPalette.empty}>{t("command_palette.empty")}</Command.Empty>
                        </Command.List>
                        {outcomeMessage ? (
                            <div className={cn(commandPalette.outcome, outcomeToneClass)}>{outcomeMessage}</div>
                        ) : null}
                    </Command>
                </motion.div>
            </Section>
        </motion.div>
    );
}

export function CommandPalette({ isOpen, onOpenChange, actions, getContextActions }: CommandPaletteProps) {
    const { t } = useTranslation();
    const { activePart, setActivePart } = useFocusState();
    const previousPartRef = useRef<FocusPart>("table");
    const previousOpenRef = useRef(isOpen);
    const contextActions = useMemo(() => getContextActions?.({ activePart }) ?? [], [getContextActions, activePart]);
    const allActions = useMemo(() => [...actions, ...contextActions], [actions, contextActions]);
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
            {isOpen && <CommandPaletteOverlay groupedActions={groupedActions} onClose={handleClose} />}
        </AnimatePresence>
    );
}
